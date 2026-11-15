"""Deterministic S7 export. Publish a new local bundle only after all checks pass."""
import argparse
import csv
import importlib.metadata
import math
import os
import re
import tempfile
import time
import tomllib
from datetime import datetime, timezone
from pathlib import Path, PureWindowsPath
from zoneinfo import ZoneInfo

import numpy as np
from pyproj import Transformer

import common
from common import ROOT
from backdrop import raster_bounds, render
from verify import verify

ACQ_FIELDS = ("acq_utc","track","frame","crid","rule","hh_db_max","hv_db_max")
MATRIX_FIELDS = ("hh_db","hv_db","s_raw","s")
DATES = ("onset_after_local","onset_by_local","end_after_local","end_by_local","last_obs_local")
COUNTS = ("n_obs","n_tracks","n_episodes")
DECIMALS = ("flood_days_min","flood_days_max","max_gap_days")
STATUSES = ("never_water","flooded","water_gone","always_water","no_data")
FLAGS = ("yes","possible","no","na")

def method_metadata(config, freeze):
    classification = freeze.get("classification", {})
    require(classification.get("name") == "pixel_fraction_75_dual_50" and
            classification.get("water_fraction") == .75 and classification.get("fill_min_fraction") == .5 and
            classification.get("joint_valid_fraction") == config["thresholds"]["min_valid_pixel_fraction"] and
            freeze.get("selection", {}).get("status") == "post_hoc" and
            freeze.get("single_anomaly_filter", {}).get("enabled") is True,
            "Unsupported or inconsistent pixel method")
    frozen = freeze.get("frozen_utc")
    if frozen is not None:
        frozen = utc(frozen).isoformat().replace("+00:00", "Z")
    result = {"rule":"Q0", "hh_db_max":config["thresholds"]["hh_db"],
            "hv_db_max":config["thresholds"]["hv_db"], "single_flip_filter":True,
            "frozen_utc":frozen, "classification":classification["name"],
            "water_fraction":classification["water_fraction"], "fill_min_fraction":classification["fill_min_fraction"],
            "joint_valid_fraction":classification["joint_valid_fraction"], "selection_status":"post_hoc"}
    if "valid_mask" in classification:
        require(classification["valid_mask"] == "gcov_fully_focused_1_254", "Unsupported GCOV mask policy")
        result["valid_mask"] = classification["valid_mask"]
    return result

def validated_gt30(properties):
    flag = gt30(properties)
    require(properties["flag_gt30"] == flag, "flag_gt30 inconsistent with metrics")
    return flag

def require(condition, message):
    if not condition:
        raise ValueError(message)

def utc(value):
    parsed = datetime.fromisoformat(value.replace("Z","+00:00"))
    require(parsed.tzinfo is not None and parsed.utcoffset().total_seconds()==0,"acq_utc must have UTC offset")
    return parsed.astimezone(timezone.utc)

def boolean(value, nullable=False):
    if value == "" and nullable:
        return None
    require(value in ("true","false"),"CSV boolean must be true/false")
    return value=="true"

def csv_rows(path):
    with path.open(encoding="utf-8-sig",newline="") as stream:
        rows = list(csv.DictReader(stream))
    require(rows and all("cell_id" in r and r["cell_id"] for r in rows),"CSV requires cell_id")
    keyed = {r["cell_id"]:r for r in rows}
    require(len(keyed)==len(rows),"Duplicate CSV cell_id")
    return keyed

def load_cube(path):
    with np.load(path,allow_pickle=False) as data:
        cube = {k:data[k].copy() for k in ("cell_id",*ACQ_FIELDS,*MATRIX_FIELDS)}
    ids = cube["cell_id"]
    require(ids.ndim==1 and len(ids)>0 and len(set(ids.tolist()))==len(ids),"Invalid/duplicate cube cell_id")
    t,n = len(cube["acq_utc"]),len(ids)
    require(t>0,"Cube must contain acquisitions")
    for k in ACQ_FIELDS:
        require(cube[k].shape==(t,),"Wrong cube vector shape "+k)
    for k in MATRIX_FIELDS:
        require(cube[k].shape==(t,n),"Wrong cube matrix shape "+k)
    for k in ("s","s_raw"):
        require(np.isin(cube[k],[0,1,2]).all(),"Invalid cube state "+k)
    valid = cube["s"]!=0
    require(np.array_equal(valid,cube["s_raw"]!=0),"s and s_raw validity differ")
    for k in ("hh_db","hv_db"):
        require(np.array_equal(np.isfinite(cube[k]),valid),"HH/HV validity differs from states")
        require(not np.isinf(cube[k]).any(),"Infinite backscatter")
        require(not np.any(cube[k]==-9999),"Sentinel backscatter")
    for k in ("hh_db_max","hv_db_max"):
        require(np.isfinite(cube[k]).all(),"Invalid acquisition threshold")
    keys = [(utc(str(cube["acq_utc"][i])),str(cube["track"][i]),str(cube["frame"][i])) for i in range(t)]
    require(len(set(keys))==t,"Duplicate cube acquisition")
    order = sorted(range(t),key=lambda i:keys[i])
    columns = np.argsort(ids,kind="stable")
    cube["cell_id"] = ids[columns]
    for k in ACQ_FIELDS:
        cube[k] = cube[k][order]
    for k in MATRIX_FIELDS:
        cube[k] = cube[k][order][:,columns]
    return cube

def full_track(record):
    track = str(record["track"])
    return track if re.fullmatch(r"\d{3}[AD]",track) else track+record["direction"]

def identity(record):
    return (utc(record["acq_utc"]),full_track(record),str(record["frame"]),record["crid"])

def unique_index(records,key,label):
    result = {key(r):r for r in records}
    require(len(result)==len(records),"Duplicate "+label)
    return result

def read_inputs(args):
    reader = common
    config = tomllib.loads(args.config.read_text(encoding="utf-8"))
    cube = load_cube(args.cube)
    metrics, landcover = csv_rows(args.metrics),csv_rows(args.landcover)
    ids = set(cube["cell_id"].tolist())
    require(set(metrics)==ids,"metrics/cube cell_id differ")
    require(ids<=set(landcover),"Land-cover table missing cube cell_id")
    reference, manifest = reader.read_json(args.reference),reader.read_json(args.manifest)
    run, freeze = reader.read_json(args.run_manifest),reader.read_json(args.freeze)
    require(run["site"]==config["site"]==freeze["site"],"Input site mismatch")
    entries = unique_index(manifest["acquisitions"],identity,"manifest acquisition")
    run_entries = unique_index(run["acquisitions"],identity,"run_manifest acquisition")
    rules = unique_index(reference["acquisition_rules"],lambda r:(utc(r["acq_utc"]),r["track"]),"reference rule")
    frozen_rules = unique_index(freeze["threshold_rules"],lambda r:(utc(r["acq_utc"]),r["track"]),"freeze rule")
    acquisitions = []
    for i in range(len(cube["acq_utc"])):
        record = {k:cube[k][i].item() for k in ACQ_FIELDS}
        key = identity(record)
        require(key in entries and key in run_entries,"Missing acquisition in manifest/run_manifest")
        rule_key = (key[0],record["track"])
        for mapping in (rules,frozen_rules):
            require(rule_key in mapping,"Missing per-acquisition rule")
            for k in ("rule","hh_db_max","hv_db_max"):
                require(record[k]==mapping[rule_key][k],"Cube/reference/freeze threshold mismatch "+k)
        entry = entries[key]
        raw_path = entry["path"]
        # Resolve transported Windows manifests only with an explicit cache directory.
        if args.cache_dir:
            cache = args.cache_dir/PureWindowsPath(raw_path).name
        else:
            require(not PureWindowsPath(raw_path).is_absolute() or Path(raw_path).is_absolute(),
                    "Windows manifest path requires --cache-dir or manifest.portable.json")
            cache = Path(raw_path)
            if not cache.is_absolute():
                cache = args.manifest.parent/cache
        require(cache.is_file(),"Missing cache "+cache.name)
        record.update(i=i,date_local=key[0].astimezone(ZoneInfo(config["timezone"])).date().isoformat(),
                      cache=cache)
        acquisitions.append(record)
    require(len(entries)==len(acquisitions)==len(run_entries),"Manifest contains acquisitions outside cube")
    return config,cube,metrics,landcover,acquisitions,manifest,freeze

def metric_properties(row):
    result = {k:row[k] for k in ("cell_id","status","flag_gt30")}
    result.update({k:row[k] or None for k in DATES})
    result.update({k:int(row[k]) if row[k] else None for k in COUNTS})
    result.update({k:round(float(row[k]),1) if row[k] else None for k in DECIMALS})
    result.update({k:boolean(row[k],nullable=True) for k in ("ongoing","status_confirmed")})
    return result

def gt30(p):
    if not p["cropland"] or p["status"] in ("never_water","always_water","no_data"):
        return "na"
    require(p["flood_days_min"] is not None,"Missing duration for flood episode")
    if p["flood_days_min"]>30:
        return "yes"
    if p["ongoing"] or p["flood_days_max"] is None or p["flood_days_max"]>30:
        return "possible"
    return "no"

def build_cells(config,cube,metrics,landcover,places,writer):
    size = config["grid"]["cell_size_m"]
    require(size==250,"Contract requires 250 m cells")
    epsg = config["grid"]["epsg"]
    to_ll = Transformer.from_crs(epsg,4326,always_xy=True)
    to_utm = Transformer.from_crs(4326,epsg,always_xy=True)
    points = sorted(places["features"],key=lambda f:(f["properties"]["name"],f["properties"]["osm_id"]))
    require(points,"places is empty")
    px,py = to_utm.transform(*np.array([p["geometry"]["coordinates"] for p in points]).T)
    features, series = [], {}
    for j,cid in enumerate(cube["cell_id"].tolist()):
        match = re.fullmatch(r"E(\d+)N(\d+)",cid)
        require(match is not None,"Malformed cell_id")
        x,y = map(int,match.groups())
        require(x%size==0 and y%size==0,"cell_id is not on 250 m lattice")
        west,south,east,north = config["grid"]["bbox_utm_m"]
        require(west<=x and x+size<=east and south<=y and y+size<=north,"Cell outside configured UTM bounds")
        p = metric_properties(metrics[cid])
        p["cropland"] = boolean(landcover[cid]["cropland"])
        share = float(landcover[cid]["cropland_share"])
        require(math.isfinite(share) and 0<=share<=1,"Invalid cropland_share")
        # Published land-cover shares are rounded to 4 decimals. Boolean is authoritative
        # within one rounding unit of the boundary.
        require(abs(share-0.5)<=0.00005 or p["cropland"]==(share>=0.5),"Land-cover boolean/share mismatch")
        p["nearest_hamlet"] = points[int(np.argmin((px-x-size/2)**2+(py-y-size/2)**2))]["properties"]["name"]
        p["flag_gt30"] = validated_gt30(p)
        ring = writer.rounded([to_ll.transform(a,b) for a,b in [(x,y),(x+size,y),(x+size,y+size),(x,y+size),(x,y)]])
        feature = writer.feature({"type":"Polygon","coordinates":[ring]},p)
        feature["id"] = j
        features.append(feature)
        series[cid] = {
            "s":"".join("-NW"[int(v)] for v in cube["s"][:,j]),
            "s_raw":"".join("-NW"[int(v)] for v in cube["s_raw"][:,j]),
            **{target:[int(round(float(v)*10)) if np.isfinite(v) else None for v in cube[source][:,j]]
               for target,source in (("hh","hh_db"),("hv","hv_db"))}}
    return writer.collection(features),{"cells":series}

def build_summary(cells,cube,acquisitions):
    area = 6.25
    last = np.zeros(len(cube["cell_id"]),dtype=np.uint8)
    passes = []
    for i,a in enumerate(acquisitions):
        current = cube["s"][i]
        observed = current!=0
        record = {"i":i,"date_local":a["date_local"],"track":a["track"],
            "valid_ha":int(observed.sum())*area,"water_ha":int((current==2).sum())*area,
            "new_water_ha":int(((current==2)&(last==1)).sum())*area,
            "water_gone_ha":int(((current==1)&(last==2)).sum())*area}
        last[observed]=current[observed]
        record.update(asof_obs_ha=int((last!=0).sum())*area,asof_water_ha=int((last==2).sum())*area)
        passes.append(record)
    props = [f["properties"] for f in cells["features"]]
    last_dates = [p["last_obs_local"] for p in props if p["last_obs_local"] is not None]
    return {"passes":passes,"totals":{
        "n_cells":len(props),"area_ha":len(props)*area,"last_obs_local":max(last_dates,default=None),
        "status_ha":{s:sum(p["status"]==s for p in props)*area for s in STATUSES},
        "gt30_ha":{s:sum(p["flag_gt30"]==s for p in props)*area for s in FLAGS}}}

def skipped_records(manifest):
    records = []
    for entry in manifest["skipped"]:
        reason = entry["reason"]
        if reason not in ("read_error","missing_hv","other"):
            reason = "other"
        detail = entry["detail"]
        require(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.]*",detail) is not None,"Unsafe skipped detail")
        granule = entry["granule"]
        if not granule.endswith(".h5"):
            granule += ".h5"
        records.append({k:entry[k] for k in ("acq_utc","frame","crid")}|{
            "track":full_track(entry),"granule":granule,"reason":reason,"detail":detail})
    return sorted(records,key=lambda r:(r["acq_utc"],r["track"],r["frame"]))

def build(args,stage):
    started = time.perf_counter()
    writer = reader = common
    config,cube,metrics,landcover,acquisitions,manifest,freeze = read_inputs(args)
    data = stage/"data"
    site_dir = data/config["site"]
    site_dir.mkdir(parents=True)
    places,aoi,sites = [reader.read_json(p) for p in (args.places,args.aoi,args.sites)]
    require(aoi["features"][0]["properties"]["site"]==config["site"],"AOI site mismatch")
    site = next(s for s in sites["sites"] if s["id"]==config["site"])
    require(site["epsg"]==config["grid"]["epsg"],"sites EPSG mismatch")
    cells,series = build_cells(config,cube,metrics,landcover,places,writer)
    summary = build_summary(cells,cube,acquisitions)
    bounds = raster_bounds(config["grid"]["bbox_utm_m"])
    west,south,east,north = bounds
    to_ll = Transformer.from_crs(config["grid"]["epsg"],4326,always_xy=True)
    corners = writer.rounded([to_ll.transform(x,y) for x,y in [(west,north),(east,north),(east,south),(west,south)]])
    view_bounds = to_ll.transform_bounds(*bounds,densify_pts=101)
    site["bounds"] = [math.floor(v*1e6)/1e6 if i<2 else math.ceil(v*1e6)/1e6 for i,v in enumerate(view_bounds)]
    public_acquisitions, image_evidence = [], []
    names = set()
    for i,acq in enumerate(acquisitions):
        name = f"backdrop/{acq['date_local'].replace('-','')}_{acq['track'].lower()}_hh.webp"
        require(name not in names,"Two acquisitions collide under contract backdrop filename")
        names.add(name)
        evidence = render(acq["cache"],site_dir/name,bounds,config["grid"]["epsg"],acq)
        image_evidence.append({"backdrop":name,**evidence})
        public_acquisitions.append({k:acq[k] for k in ("i",*ACQ_FIELDS,"date_local")}|{
            "backdrop":name,"valid_share":float(np.mean(cube["s"][i]!=0))})
    meta = {
        "contract_version":"2.0.0","site":config["site"],"generated_utc":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "timezone":config["timezone"],"grid":{"epsg":config["grid"]["epsg"],"cell_m":250,"n_cells":len(cube["cell_id"])},
        "method":method_metadata(config, freeze),
        "acquisitions":public_acquisitions,"backdrop":{"db_min":-25,"db_max":-5,"corners":corners},
        "sources":["NISAR L2 GCOV (NASA/ISRO), ASF DAAC","ESA WorldCover 2021","OpenStreetMap contributors (ODbL)"],
        "skipped":skipped_records(manifest)}
    for name,value in [("cells.geojson",cells),("series.json",series),("summary.json",summary),
                       ("meta.json",meta),("aoi.geojson",aoi),("places.geojson",places)]:
        writer.write_json(site_dir/name,value)
    writer.write_json(data/"sites.json",sites)
    report = verify(data,config["site"],args.schemas)
    input_paths = [args.config,args.cube,args.metrics,args.landcover,args.reference,args.manifest,args.run_manifest,
                   args.freeze,args.places,args.aoi,args.sites,*[a["cache"] for a in acquisitions]]
    evidence = {"task":"S7-EXPORT","contract_version":"2.0.0","synthetic":args.synthetic,
        "site":config["site"],"duration_s":round(time.perf_counter()-started,3),
        "acquisitions":public_acquisitions,
        "libraries":{name:importlib.metadata.version(name) for name in ("numpy","Pillow","pyproj","shapely","jsonschema")},
        "input_hashes":[{"file":p.name,"sha256":writer.sha(p)} for p in input_paths],
        "code_hashes":{p.name:writer.sha(p) for p in Path(__file__).parent.glob("*.py")},
        "schema_hashes":{p.name:writer.sha(p) for p in args.schemas.glob("*.json")},
        "raster_bounds_utm_m":bounds,"pixel_m":20,"webp_quality":75,"images":image_evidence,
        "cropland_flags_recomputed":sum(f["properties"]["flag_gt30"]!=metrics[f["properties"]["cell_id"]]["flag_gt30"] for f in cells["features"]),
        "checks":report}
    writer.write_json(stage/"run_manifest.json",evidence)
    writer.write_json(stage/"checks.json",report)

def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input-dir",type=Path,required=True)
    p.add_argument("--config",type=Path,required=True)
    p.add_argument("--landcover",type=Path,required=True)
    p.add_argument("--schemas",type=Path,default=ROOT/"schema")
    p.add_argument("--output",type=Path,required=True,help="New bundle directory; existing output is protected")
    p.add_argument("--cache-dir",type=Path)
    for name in ("cube","metrics","reference","manifest","run-manifest","freeze","places","aoi","sites"):
        p.add_argument("--"+name,type=Path)
    p.add_argument("--synthetic",action="store_true",help="Mark fixture run in evidence")
    return p

def main(argv=None):
    args = parser().parse_args(argv)
    config = tomllib.loads(args.config.read_text(encoding="utf-8"))
    site = config["site"]
    defaults = {"cube":site+"_cube.npz","metrics":site+"_metrics.csv","reference":"reference.json",
        "manifest":"manifest.portable.json" if (args.input_dir/"manifest.portable.json").exists() else "manifest.json",
        "run_manifest":"run_manifest.json",
        "freeze":"method_freeze.json" if (args.input_dir/"method_freeze.json").exists() else "method_freeze.draft.json"}
    for key,name in defaults.items():
        if getattr(args,key) is None:
            setattr(args,key,args.input_dir/name)
    for key,name in {"aoi":site+"/aoi.geojson","places":site+"/places.geojson","sites":"sites.json"}.items():
        if getattr(args,key) is None:
            setattr(args,key,ROOT/"data"/name)
    args.output = args.output.resolve()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    lock = args.output.with_name(args.output.name+".lock")
    # Exclusive lock serializes writers to this output. A crash leaves a visible lock.
    fd = os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    os.close(fd)
    try:
        require(not args.output.exists(),"Output already exists; select a new run directory")
        with tempfile.TemporaryDirectory(prefix=".s7-",dir=args.output.parent) as temp:
            stage = Path(temp)/"bundle"
            stage.mkdir()
            build(args,stage)
            stage.rename(args.output)
    finally:
        lock.unlink()
    print("S7 exported and checked:",args.output)

if __name__=="__main__":
    main()

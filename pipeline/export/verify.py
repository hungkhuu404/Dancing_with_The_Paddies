"""Schema and independent cross-file checks for an S7 data bundle."""
import argparse
import math
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from jsonschema import Draft202012Validator, FormatChecker
from shapely.geometry import shape
import common as reader
from common import ROOT

def check(condition,message):
    if not condition:
        raise ValueError(message)

def positions(value):
    if value and isinstance(value[0],(int,float)):
        yield value
    else:
        for item in value:
            yield from positions(item)

def verify(data,site,schemas):
    directory = data/site
    objects = {}
    for name in ("meta","cells","series","summary","aoi","places","sites"):
        path = data/"sites.json" if name=="sites" else directory/(name+(".geojson" if name in ("cells","aoi","places") else ".json"))
        value = reader.read_json(path)
        schema = reader.read_json(schemas/(name+".schema.json"))
        Draft202012Validator.check_schema(schema)
        Draft202012Validator(schema,format_checker=FormatChecker()).validate(value)
        objects[name]=value
    validation_path = directory/"validation.json"
    if validation_path.exists():
        schema=reader.read_json(schemas/"validation.schema.json")
        Draft202012Validator(schema,format_checker=FormatChecker()).validate(reader.read_json(validation_path))
    meta,cells,series,summary = [objects[k] for k in ("meta","cells","series","summary")]
    acquisitions = meta["acquisitions"]
    n=len(acquisitions)
    check(n>0,"Empty acquisitions")
    stamps = [datetime.fromisoformat(a["acq_utc"].replace("Z","+00:00")) for a in acquisitions]
    check(stamps==sorted(stamps),"acquisitions out of time order")
    check([a["i"] for a in acquisitions]==list(range(n)),"acquisition i mismatch")
    check(len({(a["acq_utc"],a["track"],a["frame"]) for a in acquisitions})==n,"duplicate acquisition")
    for a,stamp in zip(acquisitions,stamps):
        check(a["date_local"]==stamp.astimezone(ZoneInfo(meta["timezone"])).date().isoformat(),"date_local mismatch")
    props=[f["properties"] for f in cells["features"]]
    ids=[p["cell_id"] for p in props]
    check(ids==sorted(set(ids)),"Unsorted/duplicate cell_id")
    check(set(ids)==set(series["cells"]),"cell_id mismatch")
    check([f["id"] for f in cells["features"]]==list(range(len(ids))),"feature.id mismatch")
    check(meta["grid"]["n_cells"]==len(ids),"n_cells mismatch")
    check(len(summary["passes"])==n,"passes length mismatch")
    site_config=next(s for s in objects["sites"]["sites"] if s["id"]==site)
    west,south,east,north=site_config["bounds"]
    names={f["properties"]["name"] for f in objects["places"]["features"]}
    boundary=shape(objects["aoi"]["features"][0]["geometry"])
    for obj in (cells,objects["aoi"],objects["places"]):
        for f in obj["features"]:
            check(shape(f["geometry"]).is_valid,"Invalid geometry")
            for lon,lat in positions(f["geometry"]["coordinates"]):
                check(west<=lon<=east and south<=lat<=north,"Coordinate outside site bounds")
                check(abs(lon-round(lon,6))<1e-10 and abs(lat-round(lat,6))<1e-10,"Coordinate precision")
    for p in objects["places"]["features"]:
        check(boundary.covers(shape(p["geometry"])),"Place outside AOI")
    for lon,lat in meta["backdrop"]["corners"]:
        check(west<=lon<=east and south<=lat<=north,"Backdrop outside exported site bounds")
    for p in props:
        cid=p["cell_id"]
        check(p["nearest_hamlet"] in names,"Hamlet spelling mismatch")
        seq=series["cells"][cid]
        check(all(len(seq[k])==n for k in ("s","s_raw","hh","hv")),"Series length mismatch")
        for i in range(n):
            missing=seq["s"][i]=="-"
            check(missing==(seq["s_raw"][i]=="-")==(seq["hh"][i] is None)==(seq["hv"][i] is None),"State/null mismatch")
        observed=[i for i,s in enumerate(seq["s"]) if s!="-"]
        check(p["n_obs"]==len(observed),"metrics n_obs differs from series")
        check(p["n_tracks"]==len({acquisitions[i]["track"] for i in observed}),"metrics n_tracks differs")
        last_date=acquisitions[observed[-1]]["date_local"] if observed else None
        check(p["last_obs_local"]==last_date,"metrics last_obs differs")
        states=[seq["s"][i] for i in observed]
        status="no_data"
        if len(states)>=4:
            if all(s=="N" for s in states):
                status="never_water"
            elif all(s=="W" for s in states):
                status="always_water"
            else:
                status="flooded" if states[-1]=="W" else "water_gone"
        check(p["status"]==status,"metrics status differs")
        if status!="no_data":
            check(p["ongoing"]==(states[-1]=="W"),"metrics ongoing differs")
            check(p["status_confirmed"]==(states[-1]==states[-2]),"metrics confirmation differs")
        if p["flood_days_min"] is not None and p["flood_days_max"] is not None:
            check(p["flood_days_min"]<=p["flood_days_max"],"duration order")
        if p["onset_after_local"] is not None:
            check(p["onset_by_local"] is not None and p["onset_after_local"]<p["onset_by_local"],"onset order")
    area=meta["grid"]["cell_m"]**2/10000
    totals=summary["totals"]
    check(totals["n_cells"]==len(ids) and totals["area_ha"]==len(ids)*area,"total area mismatch")
    check(totals["last_obs_local"]==max((p["last_obs_local"] for p in props if p["last_obs_local"]),default=None),"totals last_obs mismatch")
    for field,group in (("status","status_ha"),("flag_gt30","gt30_ha")):
        for key,value in totals[group].items():
            check(value==sum(p[field]==key for p in props)*area,"Group total mismatch")
        check(sum(totals[group].values())==totals["area_ha"],"Group sum mismatch")
    previous={cid:None for cid in ids}
    asof_observed=0
    for i,(a,passed) in enumerate(zip(acquisitions,summary["passes"])):
        counts=dict(valid_ha=0,water_ha=0,new_water_ha=0,water_gone_ha=0)
        for cid in ids:
            current=series["cells"][cid]["s"][i]
            if current=="-":
                continue
            counts["valid_ha"]+=area
            counts["water_ha"]+=(current=="W")*area
            counts["new_water_ha"]+=(current=="W" and previous[cid]=="N")*area
            counts["water_gone_ha"]+=(current=="N" and previous[cid]=="W")*area
            previous[cid]=current
        counts["asof_obs_ha"]=sum(v is not None for v in previous.values())*area
        counts["asof_water_ha"]=sum(v=="W" for v in previous.values())*area
        check(all(passed[k]==a[k] for k in ("i","date_local","track")),"passes acquisition mismatch")
        check(all(passed[k]==v for k,v in counts.items()),"passes recomputation mismatch")
        check(passed["water_ha"]<=passed["valid_ha"],"water exceeds valid")
        check(passed["asof_water_ha"]<=passed["asof_obs_ha"] and passed["asof_obs_ha"]>=asof_observed,"asof bounds")
        check(math.isclose(a["valid_share"],counts["valid_ha"]/(len(ids)*area),abs_tol=1e-12),"valid_share mismatch")
        asof_observed=passed["asof_obs_ha"]
        image=(directory/a["backdrop"]).resolve()
        check(image.is_relative_to(directory.resolve()) and image.is_file(),"Backdrop missing or outside site")
        check(image.stat().st_size<=300000,"Backdrop size exceeds limit")
    sizes={p.relative_to(directory).as_posix():p.stat().st_size for p in directory.rglob("*") if p.is_file()}
    check(sizes["cells.geojson"]<=2000000,"cells exceeds 2 MB")
    check(sizes["series.json"]<=1500000,"series exceeds 1.5 MB")
    check(sum(sizes.values())<=15000000,"site exceeds 15 MB")
    return {
        "schema_present_files":"pass","strict_json":"pass","coordinate_bounds":"pass",
        "cell_id_bijection":"pass","series_lengths":"pass","area_totals":"pass",
        "passes_recomputed":"pass","asof_invariants":"pass","backdrop_paths_sizes":"pass",
        "hamlet_names":"pass","metrics_vs_series":"pass","file_size_limits":"pass",
        "validation_json":"pass" if validation_path.exists() else "pending S6/QUAN-7",
        "osm_overlay":"pending Quốc","web_opens_without_manual_edits":"pending Quốc",
        "initial_transfer_3mb":"pending web HTML/JS/CSS and transport",
        "n_cells":len(ids),"n_acquisitions":n,"site_bytes":sum(sizes.values()),"file_bytes":sizes}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--data",type=Path,required=True)
    p.add_argument("--site",required=True)
    p.add_argument("--schemas",type=Path,default=ROOT/"schema")
    a=p.parse_args()
    import json
    print(json.dumps(verify(a.data,a.site,a.schemas),ensure_ascii=False,indent=2))

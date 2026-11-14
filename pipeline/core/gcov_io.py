"""S1 bounded HTTPS reads and atomic, configuration-keyed raster cache."""
from contextlib import contextmanager
import hashlib
import json
import os
import tempfile
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, build_opener

import aiohttp
import fsspec
import h5py
import numpy as np
from pyproj import Transformer

from probe_access import NoRedirect


def resolve_url(url):
    """Keep signed URLs in memory and never forward the token to object storage."""
    token = Path(os.environ["EARTHDATA_TOKEN_FILE"]).read_text(encoding="utf-8").strip()
    opener = build_opener(NoRedirect)
    for _ in range(6):
        host = urlsplit(url).hostname or ""
        if urlsplit(url).scheme != "https" or not any(host.endswith(s) for s in (".nasa.gov", ".amazonaws.com", ".cloudfront.net")):
            raise ValueError("UnapprovedSourceHost")
        if host != "nisar.asf.earthdatacloud.nasa.gov":
            return url
        try:
            request = Request(url, headers={"Authorization": "Bearer " + token, "Range": "bytes=0-7"})
            with opener.open(request, timeout=60):
                raise ValueError("ExpectedStorageRedirect")
        except HTTPError as error:
            if error.code not in (301, 302, 303, 307, 308):
                raise
            location = error.headers.get("Location")
            if not location:
                raise ValueError("MissingRedirectLocation") from None
            url = urljoin(url, location)
    raise ValueError("RedirectLimit")


@contextmanager
def remote_source(url):
    signed_url = resolve_url(url)
    fs = fsspec.filesystem("http", skip_instance_cache=True,
        client_kwargs={"timeout": aiohttp.ClientTimeout(total=240, sock_read=90)})
    try:
        with fs.open(signed_url, "rb", block_size=1024 * 1024, cache_type="blockcache") as stream:
            yield stream
    finally:
        fs.close_session(fs.loop, fs._session)


def _window(group, xs, ys, bbox, layers):
    x0, y0, x1, y1 = bbox
    cols = np.flatnonzero((xs >= x0) & (xs < x1))
    rows = np.flatnonzero((ys >= y0) & (ys < y1))
    if not len(cols) or not len(rows):
        raise ValueError("ReferenceOutsideGrid")
    index = (slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1))
    return {"hh": group[layers[0]][index], "hv": group[layers[1]][index], "xs": xs[cols], "ys": ys[rows]}


def cache_identity(row, cfg):
    identity = {"grid": cfg["grid"], "references": {label: {k: ref[k] for k in ("epsg", "bbox_utm_m")} for label, ref in cfg["references"].items()},
        "group": cfg["read"].get("gcov_group"), "layers": cfg["read"].get("layers"), "granule": row["granule"], "version": 2}
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:16]


def validate_cached_record(row, cfg, record):
    for key in ("acq_utc", "track", "direction", "frame", "crid", "granule"):
        if record.get(key) != row[key]:
            raise ValueError("CacheMetadataMismatch")
    expected = cache_identity(row, cfg)
    if record.get("cache_key") != expected:
        raise ValueError("CacheConfigurationMismatch")
    with np.load(record["path"], allow_pickle=False) as data:
        if data["cache_key"].item() != expected or data["utc"].item() != row["acq_utc"] or data["crid"].item() != row["crid"]:
            raise ValueError("CachePayloadMismatch")


def read_acquisition(row, cfg, base, force=False, open_source=None):
    """One GCOV open reads the AOI and both reference windows; a hit never opens network."""
    digest = cache_identity(row, cfg)
    cache = (Path(base) / cfg["read"]["cache_dir"]).resolve()
    cache.mkdir(parents=True, exist_ok=True)
    name = f"{row['track']}{row['direction']}_{row['acq_utc'][:10].replace('-', '')}_{row['crid']}_{digest}.npz"
    path = cache / name
    if path.exists() and not force:
        with np.load(path, allow_pickle=False) as data:
            if data["cache_key"].item() != digest:
                raise ValueError("CacheIdentityMismatch")
            fraction = float(data["valid_pixel_fraction"])
        return {"path": str(path), "cache_hit": True, "valid_pixel_fraction": fraction, "cache_key": digest}
    with (open_source or remote_source)(row["url"]) as stream, h5py.File(stream, "r") as handle:
        group = handle[cfg["read"]["gcov_group"]]
        layers = cfg["read"]["layers"]
        if any(layer not in group for layer in layers):
            raise KeyError("MissingPolarization")
        epsg = int(np.asarray(group["projection"].attrs["epsg_code"]).ravel()[0])
        if epsg != cfg["grid"]["epsg"]:
            raise ValueError("UnexpectedRasterCRS")
        xs, ys = group["xCoordinates"][()], group["yCoordinates"][()]
        main = _window(group, xs, ys, cfg["grid"]["bbox_utm_m"], layers)
        data = {**main, "epsg": epsg, "utc": row["acq_utc"], "crid": row["crid"], "cache_key": digest}
        for label in ("water", "stable"):
            ref = cfg["references"][label]
            bbox = ref["bbox_utm_m"]
            if ref["epsg"] != epsg:
                bbox = Transformer.from_crs(ref["epsg"], epsg, always_xy=True).transform_bounds(*bbox)
            for key, value in _window(group, xs, ys, bbox, layers).items():
                data[f"ref_{label}_{key}"] = value
    valid = np.isfinite(data["hh"]) & np.isfinite(data["hv"]) & (data["hh"] > 0) & (data["hv"] > 0)
    x0, y0, x1, y1 = cfg["grid"]["bbox_utm_m"]
    pixel_area = abs(float(xs[1] - xs[0]) * float(ys[1] - ys[0]))
    fraction = float(valid.sum() / ((x1 - x0) * (y1 - y0) / pixel_area))
    data["valid_pixel_fraction"] = fraction
    fd, temporary_name = tempfile.mkstemp(dir=cache, prefix=path.stem + "_", suffix=".npz.tmp")
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        with temporary.open("wb") as output:
            np.savez_compressed(output, **data)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return {"path": str(path), "cache_hit": False, "valid_pixel_fraction": fraction, "cache_key": digest}

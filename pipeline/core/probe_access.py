"""Probe a NASA GCOV range without logging credentials or signed URLs."""
import csv
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def probe(url, token_file):
    opener = build_opener(NoRedirect)
    token = Path(token_file).read_text(encoding="utf-8").strip()
    for _ in range(6):
        host = urlsplit(url).hostname or ""
        if urlsplit(url).scheme != "https" or not any(
            host.endswith(suffix) for suffix in (".nasa.gov", ".amazonaws.com", ".cloudfront.net")
        ):
            raise ValueError("UnapprovedRedirectHost")
        headers = {"Range": "bytes=0-7"}
        if host == "nisar.asf.earthdatacloud.nasa.gov":
            headers["Authorization"] = "Bearer " + token
        try:
            with opener.open(Request(url, headers=headers), timeout=45) as response:
                return {"status": response.status, "hdf5_magic": response.read(8) == b"\x89HDF\r\n\x1a\n"}
        except HTTPError as error:
            if error.code not in (301, 302, 303, 307, 308):
                return {"status": error.code, "error_type": type(error).__name__}
            location = error.headers.get("Location")
            if not location:
                return {"status": error.code, "error_type": "MissingRedirectLocation"}
            url = urljoin(url, location)
    return {"error_type": "RedirectLimit"}


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    rows = list(csv.DictReader((root / "inputs/catalog.csv").open()))
    try:
        result = probe(rows[-1]["url"], os.environ["EARTHDATA_TOKEN_FILE"])
    except Exception as error:
        result = {"error_type": type(error).__name__}
    print(json.dumps({"event": "earthdata.probe", **result}))
    raise SystemExit(0 if result.get("hdf5_magic") else 2)

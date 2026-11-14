"""Bin positive linear HH by actual UTM pixel centres onto a shared 20 m grid."""
import math
import numpy as np
from PIL import Image

def raster_bounds(bounds):
    return [math.floor(bounds[0]/20)*20, math.floor(bounds[1]/20)*20,
            math.ceil(bounds[2]/20)*20, math.ceil(bounds[3]/20)*20]

def render(path, target, bounds, epsg, acquisition):
    west, south, east, north = bounds
    width, height = (east-west)//20, (north-south)//20
    with np.load(path, allow_pickle=False) as cache:
        if int(cache["epsg"]) != epsg:
            raise ValueError("Cache EPSG differs from site")
        if str(cache["utc"].item()) != acquisition["acq_utc"] or str(cache["crid"].item()) != acquisition["crid"]:
            raise ValueError("Cache acquisition metadata mismatch")
        hh = cache["hh"].astype(np.float64)
        xs, ys = cache["xs"], cache["ys"]
        if hh.shape != (len(ys),len(xs)) or len(xs)<2 or len(ys)<2:
            raise ValueError("Cache shape differs from xs/ys")
        if not np.allclose(np.diff(xs),10) or not np.allclose(np.diff(ys),-10):
            raise ValueError("Expected 10 m eastward/southward GCOV pixel centres")
        columns = np.floor((xs-west)/20).astype(int)
        rows = np.floor((north-ys)/20).astype(int)
        selected = (rows[:,None]>=0)&(rows[:,None]<height)&(columns[None,:]>=0)&(columns[None,:]<width)
        selected &= np.isfinite(hh)&(hh>0)
        bins = rows[:,None]*width+columns[None,:]
        sums = np.bincount(bins[selected],weights=hh[selected],minlength=height*width)
        counts = np.bincount(bins[selected],minlength=height*width)
    power = np.divide(sums,counts,out=np.ones_like(sums),where=counts>0).reshape(height,width)
    valid = counts.reshape(height,width)>0
    grey = np.rint(np.clip((10*np.log10(power)+25)/20,0,1)*255).astype(np.uint8)
    rgba = np.zeros((height,width,4),dtype=np.uint8)
    rgba[...,:3] = grey[...,None]
    rgba[...,3] = valid*255
    rgba[~valid,:3] = 0
    target.parent.mkdir(parents=True,exist_ok=True)
    Image.fromarray(rgba).save(target,"WEBP",quality=75,method=6)
    if target.stat().st_size>300000:
        raise ValueError("Backdrop exceeds 300000 bytes")
    with Image.open(target) as image:
        decoded = np.asarray(image.convert("RGBA"))
    if not np.array_equal(decoded[...,3],rgba[...,3]):
        raise ValueError("Backdrop alpha roundtrip mismatch")
    return {"width":width,"height":height,"transparent_pixels":int((~valid).sum())}

// Builds a tile's id raster + mask (src/scene/raster.js) off the main thread.
import { rasterise, MASK } from './raster.js';

self.onmessage = (e) => {
  const { id, layout, cx, cz, maskSize = MASK } = e.data;
  try {
    const r = rasterise(layout, cx, cz, maskSize);
    self.postMessage({ id, ...r }, [r.ids.buffer, r.mask.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};

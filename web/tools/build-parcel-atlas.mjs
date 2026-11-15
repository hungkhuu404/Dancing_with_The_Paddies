// node web/tools/build-parcel-atlas.mjs — reproducible, no network/dependencies.
import {checkSiteIndex} from '../src/data/siteRules.js';
import {siteOptions} from './site-options.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { cellForParcel, paintPolygon } from '../src/scene/parcelAtlas.js';
const {sceneURL:base,profile}=siteOptions();
const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
checkSiteIndex(profile,index);
const size = 4096, bytes = new Uint8Array(size * size * 4), { frame, origin } = index;
let count = 0;
for (const tile of index.tiles) {
  const layout = JSON.parse(await readFile(new URL(tile.layout, base), 'utf8'));
  for (const p of layout.parcels) {
    const [col, row] = cellForParcel(p.poly, tile, origin, frame);
    if (col < 0 || row < 0 || col >= (frame.e1 - frame.e0) / 250 || row >= (frame.n1 - frame.n0) / 250) continue;
    const points = p.poly.map(([x, z]) => [(origin.utm_e + tile.x + x - frame.e0) / (frame.e1 - frame.e0) * size, (frame.n1 - origin.utm_n + tile.z + z) / (frame.n1 - frame.n0) * size]);
    paintPolygon(bytes, size, size, points, [col + 1, row + 1, 255, 255]); count++;
  }
}
function crc(data) { let c = -1; for (const b of data) { c ^= b; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ -1) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([len, name, data, sum]); }
const head = Buffer.alloc(13); head.writeUInt32BE(size); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
const scan = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) scan.set(bytes.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', head), chunk('IDAT', deflateSync(scan, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
await writeFile(new URL('parcel-cells.png', base), png);
console.log(`${count} parcels -> ${fileURLToPath(new URL('parcel-cells.png', base))} (${png.length} bytes)`);

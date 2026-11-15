import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {atlasLayout,atlasPath} from '../src/ui/atlasLayout.js';
const data=JSON.parse(await readFile(new URL('../public/atlas/region.json',import.meta.url)));
const layout=atlasLayout(data.bounds);
test('overview projection preserves north, east, crop corners and local-site positions',()=>{
  assert.deepEqual(layout.point(91,27),[0,0]);
  assert.deepEqual(layout.point(123,2),[layout.width,layout.height]);
  assert.ok(layout.point(105.186,10.142)[0]>layout.point(100.12,16.75)[0]);
  assert.ok(layout.point(105.186,10.142)[1]>layout.point(100.12,16.75)[1]);
  assert.equal(atlasPath([[[91,27],[123,2]]],layout),`M0.00,0.00L${layout.width.toFixed(2)},${layout.height.toFixed(2)}`);
});
test('physical islands are retained as source polygons, with separately sourced group-label anchors',()=>{
  assert.deepEqual(data.island_labels.map(l=>l.name),['Hoàng Sa','Trường Sa']);
  for(const label of data.island_labels){
    assert.ok(label.land_polygons>=10);assert.ok(Number.isSafeInteger(label.source_id));
    const [lon,lat]=label.center;assert.ok(lon>110&&lon<118&&lat>6&&lat<19);
    // Actual small land rings must exist in each group, not just a fabricated label or enlarged dot.
    const nearby=data.land.filter(p=>p[0].some(v=>Math.abs(v[0]-lon)<2&&Math.abs(v[1]-lat)<2));
    assert.ok(nearby.length>5);
  }
  assert.ok(data.island_labels[0].center[1]>data.island_labels[1].center[1]);
  for(const p of data.land)for(const ring of p){assert.ok(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));}
});
test('coast paths omit artificial crop boundaries and source inputs are pinned',async()=>{
  for(const line of data.coasts)for(let i=1;i<line.length;i++){
    const [a,b]=[line[i-1],line[i]];
    for(const [axis,n] of [[0,91],[0,123],[1,2],[1,27]])assert.ok(!(a[axis]===n&&b[axis]===n));
  }
  const manifest=JSON.parse(await readFile(new URL('../public/atlas/manifest.json',import.meta.url)));
  assert.equal(manifest.revision.length,40);assert.equal(manifest.sources.length,4);
  for(const source of manifest.sources){assert.match(source.sha256,/^[a-f0-9]{64}$/);assert.ok(source.url.includes(manifest.revision));}
});

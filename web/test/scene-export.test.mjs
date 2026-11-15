import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
const base=new URL('../public/scene/bang_rakam/',import.meta.url),load=p=>JSON.parse(readFileSync(new URL(p,base),'utf8'));
test('Bang Rakam scene covers the 36-tile frame within asset budgets without embedding water observations or Vietnamese religious props',()=>{
 const index=load('index.json');assert.deepEqual(index.frame,{e0:613250,e1:625250,n0:1846250,n1:1858250});assert.equal(index.origin.epsg,32647);assert.equal(index.tiles.length,36);let parcels=0;
 for(const tile of index.tiles){assert.ok(statSync(new URL(tile.layout,base)).size<=450000);assert.ok(statSync(new URL(tile.props,base)).size<=200000);const l=load(tile.layout),p=load(tile.props);assert.equal(l.origin.epsg,32647);assert.ok(l.parcels.every(p=>p.s===''));assert.equal(p.graves.length,0);assert.equal(p.shrines.length,0);parcels+=l.parcels.length;assert.equal(tile.counts.graves,0);}
 assert.ok(parcels>0);assert.equal(new Set(index.tiles.map(t=>t.id)).size,36);
 for(let i=0;i<6;i++)for(let j=0;j<6;j++)assert.ok(index.tiles.some(t=>t.i===i&&t.j===j));
 assert.ok(index.water_areas.length>0);for(const area of index.water_areas)for(const ring of area.rings){assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.every(p=>p.length===2&&p.every(Number.isFinite)));}
});
test('source-backed infrastructure retains English/source names, excludes unconfirmed dams as sluices',()=>{
 const infra=load('infrastructure.json');assert.equal(infra.origin.epsg,32647);assert.ok(infra.buildings.every(b=>b.x>=-6000&&b.x<=6000&&b.z>=-6000&&b.z<=6000));assert.equal(infra.gates.length,0);assert.equal(infra.buildings.filter(p=>p.kind==='school').length,8);assert.equal(infra.buildings.filter(p=>p.kind==='worship').length,4);assert.ok(infra.bridges.every(p=>p.osm_id&&p.points.length>=2));assert.ok(infra.places.every(p=>p.osm_id&&p.name));
});

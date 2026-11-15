import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siteProfile} from '../src/data/siteRules.js';
import {assertSceneMeta,assertPublishedMeta} from '../src/data/contractPolicy.js';
const meta=JSON.parse(readFileSync(new URL('../../data/tan_hoi/meta.json',import.meta.url)));
test('published v2 is accepted; v1, fixtures and altered method definitions fail',()=>{assert.equal(assertPublishedMeta(meta),meta);assert.equal(assertSceneMeta(siteProfile(),meta),meta);for(const m of [{...meta,contract_version:'1.0.0'},{...meta,fixture:true},{...meta,method:{...meta.method,water_fraction:.5}}])assert.throws(()=>assertPublishedMeta(m));});
test('only the configured Bang Rakam frame can display the separately labelled illustration',()=>{const p=siteProfile('bang_rakam'),m={site:p.id,fixture:true,contract_version:'1.0.0',grid:{epsg:32647,cell_m:250,n_cells:2304}};assert.equal(assertSceneMeta(p,m),m);assert.throws(()=>assertPublishedMeta(m));assert.throws(()=>assertSceneMeta(siteProfile(),m));assert.throws(()=>assertSceneMeta(p,{...m,grid:{...m.grid,n_cells:4225}}));assert.throws(()=>assertSceneMeta(p,{...m,fixture:false}));});

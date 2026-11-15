import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {atlasLayout} from '../src/ui/atlasLayout.js';
import {ATLAS_SWEEP_PERIOD,atlasSweepGeometry,atlasSweepHit} from '../src/ui/atlasSweepTiming.js';

const geography=JSON.parse(await readFile(new URL('../public/atlas/region.json',import.meta.url)));
const sites=JSON.parse(await readFile(new URL('../../data/sites.json',import.meta.url)));
const layout=atlasLayout(geography.bounds);

test('each real site echo begins when the beam reaches its map coordinate, at every display scale',()=>{
  const geometry=atlasSweepGeometry(layout.height);
  for(const site of sites.sites){
    const [,y]=layout.point(...site.center),hit=atlasSweepHit(y,layout.height);
    assert.ok(hit>0&&hit<ATLAS_SWEEP_PERIOD);
    for(const scale of [.3,.7,1,1.5]){
      const beam=(-geometry.headOffset+geometry.distance*hit/ATLAS_SWEEP_PERIOD)*scale;
      assert.ok(Math.abs(beam-y*scale)<1e-8,site.id+' echo must follow the physical beam');
    }
    assert.ok(hit+ATLAS_SWEEP_PERIOD*.13+180<ATLAS_SWEEP_PERIOD,'both rings must settle before the next pass');
  }
});

test('the northern Thai point is reached before the Vietnamese point and the next pass stays in phase',()=>{
  const positions=Object.fromEntries(sites.sites.map(site=>[site.id,layout.point(...site.center)[1]]));
  const thai=atlasSweepHit(positions.bang_rakam,layout.height),vietnam=atlasSweepHit(positions.tan_hoi,layout.height);
  assert.ok(thai<vietnam);
  const {headOffset,distance}=atlasSweepGeometry(layout.height);
  for(const hit of [thai,vietnam])for(const loop of [0,1,10,100]){
    const phase=((hit+loop*ATLAS_SWEEP_PERIOD)%ATLAS_SWEEP_PERIOD)/ATLAS_SWEEP_PERIOD;
    assert.ok(Math.abs(-headOffset+distance*phase-(-headOffset+distance*hit/ATLAS_SWEEP_PERIOD))<1e-8);
  }
});

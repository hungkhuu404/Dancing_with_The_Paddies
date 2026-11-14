import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {identityPlan,floodVisibility,floodBob,homeWindows,fishingRhythm} from '../src/world/identityRules.js';
import {siteProfile} from '../src/data/siteRules.js';
const profile=siteProfile('bang_rakam'),recipe=profile.identity;
const empty={houses:[],parcels:[],canals:[],roads:[]};
test('architecture is opt-in per profile and does not change Tan Hoi default',()=>{assert.equal(siteProfile().identity,undefined);assert.equal(siteProfile().ecology.submerge_bunds,undefined);assert.deepEqual(identityPlan(empty,null,[0,0],undefined),[]);assert.equal(profile.ecology.submerge_bunds,true);});
test('illustrative home placement is deterministic, owned by one tile and avoids mapped schools',()=>{
 const layout={...empty,houses:[{x:0,z:0,rot:0},{x:400,z:400,rot:1},{x:1000,z:1000,rot:0}]},source={buildings:[{x:0,z:0,kind:'school',in_commune:true}]};
 const before=JSON.stringify(layout),a=identityPlan(layout,source,[0,0],recipe),b=identityPlan(layout,source,[0,0],recipe);assert.deepEqual(a,b);assert.equal(JSON.stringify(layout),before);
 const homes=a.filter(p=>p.kind==='home');assert.equal(homes.length,1);assert.equal(homes[0].x,400);assert.ok([...recipe.stilts,recipe.raised].includes(homes[0].model));assert.ok(!a.some(p=>p.kind==='temple'));
});
test('temple placement follows a source site and never synthesizes gates or a gauge',()=>{
 const source={buildings:[{x:200,z:100,kind:'worship',osm_id:'way/1',in_commune:true},{x:3000,z:0,kind:'worship',in_commune:true},{x:0,z:0,kind:'worship',in_commune:false}]};const plan=identityPlan(empty,source,[0,0],recipe);assert.equal(plan.length,1);assert.equal(plan[0].osm_id,'way/1');assert.equal(plan[0].model,recipe.temple);
});
test('rafts require a wide mapped channel and flood activity stays within a parcel',()=>{
 const narrow={...empty,canals:[{width_m:6,points:[[-900,0],[900,0]]}]};assert.ok(!identityPlan(narrow,null,[0,0],recipe).some(p=>p.kind==='raft'));
 const layout={...empty,canals:[{width_m:30,points:[[-900,0],[900,0]]}],parcels:[{poly:[[-400,100],[400,100],[400,700],[-400,700]]}]},plan=identityPlan(layout,null,[0,0],recipe);assert.ok(plan.some(p=>p.kind==='raft'));assert.ok(plan.filter(p=>p.base==='flood').every(p=>p.parcel===0));assert.ok(plan.every(p=>p.x>=-1000&&p.x<1000&&p.z>=-1000&&p.z<1000));
});
test('flood activity fades without implying a measured depth; reduced motion has no bobbing',()=>{assert.equal(floodVisibility(0),0);assert.equal(floodVisibility(1,false),0);assert.equal(floodVisibility(NaN),0);assert.equal(floodVisibility(.5),0);assert.equal(floodVisibility(1),1);assert.ok(floodVisibility(.75)>0&&floodVisibility(.75)<1);assert.equal(floodBob(5,true),0);assert.ok(Math.abs(floodBob(5,false))<=.025);});
test('original Thai model set fits budgets, uses meshopt and embeds no copied images',()=>{
 for(const name of recipe.models){const file=new URL('../public/models/'+name+'.glb',import.meta.url),buffer=readFileSync(file);assert.ok(statSync(file).size<=400000);assert.equal(buffer.toString('ascii',0,4),'glTF');const json=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)));assert.ok(json.extensionsRequired.includes('EXT_meshopt_compression'));assert.equal(json.images?.length||0,0);assert.ok(json.meshes.length>0);assert.ok(!json.nodes.some(n=>/child|buddha|nasa|isro|royal/i.test(n.name||'')));}
 const atlas=JSON.parse(readFileSync(new URL('../public/impostors/thai/index.json',import.meta.url)));for(const tree of recipe.trees){assert.equal(atlas[tree].azimuths,8);assert.equal(atlas[tree].elevations.length,2);}
});

test('window anchors remain above each preset deck and face the front veranda',()=>{for(const model of [...recipe.stilts,recipe.raised]){const a=homeWindows(model,recipe);assert.equal(a.length,2);assert.ok(a.every(([x,y,z])=>Math.abs(x)<2&&y>2&&y<4&&z>0));}});

test('illustrative fishing rhythm is periodic and bounded',()=>{assert.equal(fishingRhythm(0),fishingRhythm(1));assert.ok(fishingRhythm(.12)>fishingRhythm(.4));assert.ok(fishingRhythm(.70)>fishingRhythm(.4));for(let i=0;i<100;i++)assert.ok(fishingRhythm(i/100)>=.55&&fishingRhythm(i/100)<1.4);});

test('school footprints exclude activity even far from a campus centroid',()=>{const source={buildings:[{x:0,z:0,kind:'school',in_commune:true,footprint:[[-700,-700],[700,-700],[700,700],[-700,700],[-700,-700]]}]};const layout={...empty,houses:[{x:400,z:400,rot:0}],parcels:[{poly:[[200,200],[500,200],[500,500],[200,500]]}]};assert.deepEqual(identityPlan(layout,source,[0,0],recipe),[]);});

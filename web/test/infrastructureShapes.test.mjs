import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {buildInfrastructureGeometry as build,infrastructureDimensions as dimensions,INFRASTRUCTURE_KINDS} from '../src/world/infrastructureShapes.js';

function bytes(g){return Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+g.index.array.byteLength;}
function fingerprint(g){const h=createHash('sha256');for(const key of ['position','normal','color'])h.update(Buffer.from(g.attributes[key].array.buffer));h.update(Buffer.from(g.index.array.buffer));return h.digest('hex');}

test('all infrastructure variants are finite indexed colored geometry grounded in metres within declared footprints and memory budget',()=>{
  for(const kind of INFRASTRUCTURE_KINDS)for(let variant=0;variant<3;variant++){
    const g=build(kind,variant),p=g.getAttribute('position'),normal=g.getAttribute('normal'),color=g.getAttribute('color');
    assert.ok(g.index&&g.index.count%3===0,kind);assert.ok(p.count>12,kind);assert.equal(normal.count,p.count);assert.equal(color.count,p.count);
    for(const key of ['position','normal','color'])assert.ok(g.attributes[key].array.every(Number.isFinite),kind+' '+key);
    assert.ok(g.index.array.every(i=>i<p.count),kind+' index');
    assert.ok(color.array.every(c=>c>=0&&c<=1),kind+' color');
    const size=g.boundingBox.getSize(new THREE.Vector3()),d=dimensions(kind,variant);
    assert.ok(g.boundingBox.min.y>=-1e-5&&g.boundingBox.min.y<1e-4,kind+' feet');
    assert.ok(size.x<=d.width+.01,kind+' width '+size.x+' > '+d.width);
    assert.ok(size.y<=d.height+.01,kind+' height '+size.y+' > '+d.height);
    assert.ok(size.z<=d.depth+.01,kind+' depth '+size.z+' > '+d.depth);
    assert.ok(bytes(g)<=400000,kind+' memory '+bytes(g));
    assert.equal(g.userData.illustrative,true);assert.equal(g.userData.units,'m');assert.equal(g.userData.front,'+Z');
    g.dispose();
  }
});

test('variants are deterministic and change storey counts, architecture and solar equipment without mutating prior geometry',()=>{
  const one=build('shophouse',0),two=build('shophouse',1),three=build('shophouse',2),repeat=build('shophouse',0);
  assert.equal(fingerprint(one),fingerprint(repeat));assert.notEqual(fingerprint(one),fingerprint(two));
  assert.ok(one.boundingBox.max.y<two.boundingBox.max.y);assert.ok(two.boundingBox.max.y<three.boundingBox.max.y);
  assert.deepEqual([0,1,2].map(v=>dimensions('shophouse',v).floors),[2,3,4]);
  const churches=[0,1,2].map(v=>build('church',v));assert.equal(new Set(churches.map(fingerprint)).size,3);
  const lamp=build('streetlight'),solar=build('solar_light');assert.ok(solar.attributes.position.count>lamp.attributes.position.count);
  const prior=fingerprint(one);repeat.attributes.position.array.fill(0);assert.equal(fingerprint(one),prior,'callers own separate buffers');
  for(const g of [one,two,three,repeat,...churches,lamp,solar])g.dispose();
});

test('bridge retains flat road deck and guardrails across custom spans; malformed dimensions cannot allocate giant meshes',()=>{
  for(const [length,width] of [[4,2],[14,5],[38,9],[80,16]]){
    const g=build('bridge',0,{length,width}),p=g.attributes.position,d=g.userData.dimensions;
    assert.equal(d.deckY,1.4);assert.equal(d.width,length);
    assert.ok(Math.abs(g.boundingBox.max.x-g.boundingBox.min.x-length)<.001);
    let deck=0,rails=0;
    for(let i=0;i<p.count;i++){
      if(Math.abs(p.getY(i)-d.deckY)<1e-5&&Math.abs(p.getZ(i))<=width/2+.001)deck++;
      if(p.getY(i)>d.deckY+1&&Math.abs(p.getZ(i))>=width/2)rails++;
    }
    assert.ok(deck>0);assert.ok(rails>0);g.dispose();
  }
  for(const options of [{length:0},{length:Infinity},{length:81},{width:1},{width:NaN},{width:17}])assert.throws(()=>build('bridge',0,options),RangeError);
  assert.throws(()=>build('unknown'),RangeError);
});

test('factory aliases preserve body footprint, vehicle wheel ground contact, and separate movable steel gate dimensions',()=>{
  for(const [alias,canonical] of [['modern_house','house'],['fieldhut','field_hut'],['container','container_truck'],['pump','pump_outlet']]){
    const a=build(alias,2),b=build(canonical,2);assert.equal(fingerprint(a),fingerprint(b));a.dispose();b.dispose();
  }
  for(const kind of ['car','truck','container','bus','tricycle']){
    const g=build(kind),p=g.attributes.position;let grounded=0;
    for(let i=0;i<p.count;i++)if(p.getY(i)<.005)grounded++;
    assert.ok(grounded>=3,kind+' tyre contact');g.dispose();
  }
  const tricycle=build('tricycle'),p=tricycle.attributes.position;let fork=0;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i))<.1&&p.getY(i)>.7&&p.getY(i)<1.3&&p.getZ(i)>.7&&p.getZ(i)<1.5)fork++;
  assert.ok(fork>=3,'front steering frame connects the cargo chassis and wheel');tricycle.dispose();
  const frame=build('sluice_frame'),gate=build('sluice_gate');
  assert.ok(frame.boundingBox.max.y>gate.boundingBox.max.y+2);
  assert.ok(Math.abs(gate.boundingBox.max.y-2.8)<1e-5);assert.equal(gate.userData.dimensions.width,6);
  assert.deepEqual(dimensions('pump').outlet,[0,2,2]);frame.dispose();gate.dispose();
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDS,MASK,maskResolution,maskBytes,drawMask,rasterise} from '../src/scene/raster.js';
test('only low visual mask changes resolution; parcel-ID raster remains fixed',()=>{
  assert.equal(IDS,1024);assert.equal(MASK,2048);
  assert.equal(maskResolution('low'),1024);assert.equal(maskResolution('high'),2048);
  assert.equal(maskResolution(undefined),2048);
  const layout={parcels:[],canals:[],roads:[]};
  for(const invalid of [0,512,1025,4096,NaN])assert.throws(()=>rasterise(layout,0,0,invalid),RangeError);
});
test('mask byte rows flip north/south for supplied dimensions without flipping east/west',()=>{
  const data=new Uint8ClampedArray([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
  const canvas={width:2,getContext:()=>({getImageData:(x,y,w,h)=>{assert.deepEqual([x,y,w,h],[0,0,2,2]);return {data};}})};
  assert.deepEqual([...maskBytes(canvas)],[9,10,11,12,13,14,15,16,1,2,3,4,5,6,7,8]);
  assert.equal(data[0],1);
  assert.throws(()=>maskBytes(canvas,0),RangeError);
  assert.throws(()=>maskBytes({width:2,getContext:()=>({getImageData:()=>({data:new Uint8Array(4)})})}),RangeError);
});
test('raster sizes propagate through canvas scaling and returned bytes; IDs match across tiers',()=>{
  const Original=globalThis.OffscreenCanvas,calls=[];
  globalThis.OffscreenCanvas=class{
    constructor(w,h){this.width=w;this.height=h;this.context={
      fillRect:(...v)=>calls.push(['fillRect',w,...v]),setTransform:(...v)=>calls.push(['transform',w,...v]),
      beginPath(){},moveTo:(...v)=>calls.push(['moveTo',w,...v]),lineTo(){},stroke(){},closePath(){},fill(){},
      getImageData:()=>({data:new Uint8ClampedArray(w*h*4)}),
    };}
    getContext(){return this.context;}
  };
  const layout={parcels:[{poly:[[-50,-50],[50,-50],[50,50],[-50,50]]}],canals:[{points:[[-100,0],[100,0]],width_m:8}],roads:[]};
  try{
    const low=rasterise(layout,0,0,1024),high=rasterise(layout,0,0);
    assert.equal(low.maskSize,1024);assert.equal(high.maskSize,2048);
    assert.equal(low.mask.byteLength,4*1024*1024);assert.equal(high.mask.byteLength,4*2048*2048);
    assert.equal(low.ids.byteLength,4*IDS*IDS);assert.deepEqual(low.ids,high.ids);
    const a=calls.find(c=>c[0]==='moveTo'&&c[1]===1024),b=calls.find(c=>c[0]==='moveTo'&&c[1]===2048);
    assert.equal(b[2],a[2]*2);assert.equal(b[3],a[3]*2);
    assert.ok(calls.some(c=>c[0]==='fillRect'&&c[1]===1024&&c[4]===1024&&c[5]===1024));
    assert.equal(drawMask(layout,0,0).width,MASK);
  }finally{if(Original===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=Original;}
});

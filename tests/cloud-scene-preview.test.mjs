import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {scenePreviewService} from '../server/scene-preview.mjs';
import {createResourceGovernor} from '../server/resource-governor.mjs';
const png=()=>Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(120,77)]);
async function until(fn,ms=4000){
  const end=Date.now()+ms;
  while(Date.now()<end){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,12))}
  throw Error('Timeout waiting for draft preview');
}
const fixture=()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-preview-')),out=path.join(dir,'out');
  let fp='a'.repeat(64),renderCalls=0;
  const resources=createResourceGovernor({capacity:1});
  const preview=scenePreviewService({out,getDeck:()=>({slides:[{id:'s01'}]}),
    fingerprint:()=>fp,baseUrl:()=> 'https://example.test',
    acquireResource:args=>resources.acquire(args),
    render:async()=>{renderCalls++;return {scope:'DRAFT_FRAMES_ONLY',fps:24,height:720,width:1280,
      frames:[0.1,0.5,0.9].map((t,index)=>({index,t,bytes:png()}))}}});
  return {dir,out,resources,preview,fp:x=>fp=x,renders:()=>renderCalls,
    cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
};
test('P12 quick draft PNG: source-pinned cache, tamper detection and no P08 approval',{
  timeout:10000
},async()=>{
  const f=fixture();
  try{
    const first=f.preview.start('demo','s01');
    assert.ok(['queued','running'].includes(first.status));
    const done=await until(()=>f.preview.get('demo','s01').status==='completed'?f.preview.get('demo','s01'):null);
    assert.equal(done.frames.length,3);
    assert.equal(done.scope,'DRAFT_FRAMES_ONLY');
    assert.ok(done.timings_ms.total>=done.timings_ms.chromium);
    assert.ok(done.timings_ms.wait_resource>=0);
    assert.ok(done.timings_ms.persist>=0);
    assert.equal(done.process_metrics.scope,'PROCESS_DELTA_NOT_JOB_ISOLATED');
    assert.ok(done.process_metrics.rss_before_mb>0);
    assert.equal(f.renders(),1);
    assert.ok(!fs.existsSync(path.join(f.out,'demo_s01.mp4')),'Preview must not create an MP4');
    assert.ok(!fs.existsSync(path.join(f.dir,'decks')),'Preview must not create P08 metadata');
    const hit=f.preview.start('demo','s01');
    assert.equal(hit.cache_hit,true);
    assert.equal(hit.timings_ms.chromium,0);
    assert.equal(hit.timings_ms.persist,0);
    assert.equal(f.renders(),1);
    assert.ok(f.preview.frame('demo','s01',0).endsWith('f0.png'));
    fs.appendFileSync(f.preview.frame('demo','s01',1),'corruption');
    assert.equal(f.preview.get('demo','s01').status,'failed','Status must not advertise a broken draft');
    const miss=f.preview.start('demo','s01');
    assert.notEqual(miss.cache_hit,true);
    await until(()=>f.renders()===2&&f.preview.get('demo','s01').status==='completed');
    f.fp('b'.repeat(64));
    assert.equal(f.preview.get('demo','s01').status,'stale');
    assert.throws(()=>f.preview.frame('demo','s01',0),e=>e.status===409);
    f.preview.start('demo','s01');
    await until(()=>f.preview.get('demo','s01').status==='completed');
    assert.equal(f.renders(),3);
    assert.equal(f.resources.snapshot().active,0);
  }finally{f.cleanup()}
});

test('P12 cancelling while waiting on P02 resource never invokes Chrome',{
  timeout:10000
},async()=>{
  const f=fixture();
  const resource=await f.resources.acquire();
  try{
    f.preview.start('demo','s01');
    await until(()=>f.resources.snapshot().waiting===1);
    assert.equal(f.preview.cancel('demo','s01').status,'cancelling');
    await until(()=>f.preview.get('demo','s01').status==='cancelled');
    assert.equal(f.renders(),0);
    assert.equal(f.resources.snapshot().waiting,0);
    assert.equal(f.preview.get('demo','s01').frames,undefined);
  }finally{resource();f.cleanup()}
});

test('P12 invalid scene/ID is rejected; stale output is not accessible',()=>{
  const f=fixture();
  try{
    assert.throws(()=>f.preview.start('../bad','s01'),e=>e.status===400);
    assert.throws(()=>f.preview.start('demo','missing'),e=>e.status===404);
    assert.throws(()=>f.preview.frame('demo','s01',3),e=>e.status===400);
    assert.throws(()=>f.preview.frame('demo','s01',0),e=>e.status===409);
  }finally{f.cleanup()}
});

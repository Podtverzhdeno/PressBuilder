import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {realMasterAudioQueue} from '../server/real-master-audio-queue.mjs';

const SHA=x=>createHash('sha256').update(x).digest('hex');
function setup(){
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p05-r27-'));
 const project='sha-bound';
 const rid=randomUUID();
 const dir=path.join(out,'releases',project,rid);
 fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'final.mp4'),data=Buffer.alloc(16*1024*1024,0x66);
 fs.writeFileSync(file,data);
 const manifest={schemaVersion:1,project,release_id:rid,
  target_fps:24,
  scenes:[{id:'s01',sha256:'1'.repeat(64),duration:1.2},
   {id:'s02',sha256:'2'.repeat(64),duration:1.2}],
  output:{sha256:SHA(data),bytes:data.length,
   qa:{verdict:'PASS',issues:[],metadata:{duration:2.4}}}};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(out,'releases',project,'current.json'),
  JSON.stringify({release_id:rid}));
 const assembly=assemblyService({out,baseUrl:()=> 'http://localhost',
  getDeck:()=>({id:project}),getRender:()=>({}),getTask:()=>({}),
  getPlan:()=>({}),getStyle:()=>({}),shaBudget:{capacity:1,maxWaiting:0}});
 return {assembly,out,project,rid,file,manifest};
}
function checkFinished(a){
 assert.deepEqual(a.verificationSnapshot(),{capacity:1,active:0,waiting:0},
  'verification budget must be fully returned, including failures');
}
test('P05-R27 overload is explicit 429, not stale/null or unverified success',{
 timeout:45000,
},async()=>{
 const fx=setup();
 try{
  const promises=Array.from({length:32},
   ()=>fx.assembly.currentAsync(fx.project));
  const outcomes=await Promise.allSettled(promises);
  const successful=outcomes.filter(x=>x.status==='fulfilled');
  const overLimit=outcomes.filter(x=>x.status==='rejected'&&x.reason?.status===429);
  assert.ok(successful.length>=1,JSON.stringify(outcomes.map(x=>x.status)));
  assert.ok(overLimit.length>=1,'burst must exceed one active / zero waiting');
  assert.equal(successful.length+overLimit.length,outcomes.length,
   'never mask overloaded current as null or as a generic corruption');
  for(const value of successful){
   assert.equal(value.value.release_id,fx.rid);
   assert.equal(value.value.manifest.output.sha256,fx.manifest.output.sha256);
  }
  checkFinished(fx.assembly);
  const next=await fx.assembly.currentAsync(fx.project);
  assert.equal(next.release_id,fx.rid,
   'verification remains usable after all previous permits release');
  checkFinished(fx.assembly);
 }finally{fs.rmSync(fx.out,{recursive:true,force:true})}
});
test('P05-R27 download and retained verified stream release SHA slots on all paths',{
 timeout:45000,
},async()=>{
 const fx=setup();
 try{
  const outcomes=await Promise.allSettled(
   Array.from({length:32},()=>fx.assembly.downloadAsync(fx.project,fx.rid)));
  const ok=outcomes.filter(x=>x.status==='fulfilled');
  const denied=outcomes.filter(x=>x.status==='rejected'&&x.reason?.status===429);
  assert.ok(ok.length>=1);
  assert.ok(denied.length>=1);
  assert.equal(ok.length+denied.length,outcomes.length);
  checkFinished(fx.assembly);
  const retained=await fx.assembly.downloadHandleAsync(fx.project,fx.rid);
  checkFinished(fx.assembly);
  const verified=await retained.handle.readFile();
  assert.equal(SHA(verified),fx.manifest.output.sha256);
  await retained.handle.close();
  fs.appendFileSync(fx.file,'tamper');
  await assert.rejects(()=>fx.assembly.downloadAsync(fx.project,fx.rid),
   e=>e?.status===409);
  checkFinished(fx.assembly);
 }finally{fs.rmSync(fx.out,{recursive:true,force:true})}
});
test('P05-R27 invalid verification budget fails construction, not later production traffic',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p05-r27-config-'));
 try{
  const common={out,baseUrl:()=> 'http://localhost',
   getDeck:()=>({}),getRender:()=>({}),getTask:()=>({}),
   getPlan:()=>({}),getStyle:()=>({})};
  assert.throws(()=>assemblyService({...common,shaBudget:{capacity:0,maxWaiting:0}}),
   /Invalid resource governor limits/);
  assert.throws(()=>assemblyService({...common,shaBudget:{capacity:1,maxWaiting:-1}}),
   /Invalid resource governor limits/);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});
test('M58-R27 audio queue preserves P05 429 backpressure rather than stale-release claim',{
 timeout:8000,
},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r27-queue-'));
 try{
  const queue=realMasterAudioQueue({out,enabled:true,
   assembly:{current:()=>{throw Error('SYNC_FORBIDDEN')},
    download:()=>{throw Error('SYNC_FORBIDDEN')},
    currentAsync:async()=>{throw Object.assign(Error('storage saturated'),{status:429})}},
   runAudit:async()=>{throw Error('WORKER_MUST_NOT_RUN')}});
  await assert.rejects(()=>queue.enqueueAsync('alpha'),
   e=>e?.status===429&&!/^M58_AUDIO_NO_VERIFIED_CURRENT_RELEASE$/.test(e.message));
  assert.equal(queue.snapshot().pending,0);
  assert.equal(fs.existsSync(path.join(out,'audio-audit-jobs')),false);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});

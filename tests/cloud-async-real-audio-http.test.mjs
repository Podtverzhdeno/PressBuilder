import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {realMasterAudioQueue} from '../server/real-master-audio-queue.mjs';
import {qcCockpitService} from '../server/qc-cockpit.mjs';

const sha=buf=>createHash('sha256').update(buf).digest('hex');
const digest=obj=>sha(JSON.stringify(obj));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async check=>{
 const deadline=Date.now()+6500;
 for(;;){const found=await check();if(found)return found;
  if(Date.now()>deadline)throw Error('M58_R25_ASYNC_TIMEOUT');
  await sleep(12)}
};
function sample(root,id='async-audio',bytes=12*1024*1024){
 const releaseId=randomUUID(),dir=path.join(root,'releases',id,releaseId);
 fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'final.mp4');
 const buffer=Buffer.alloc(bytes,0x5b);
 fs.writeFileSync(file,buffer);
 const hash=sha(buffer);
 const manifest={schemaVersion:1,project:id,release_id:releaseId,
  target_fps:24,scenes:[
   {id:'s01',duration:1.2,sha256:'a'.repeat(64)},
   {id:'s02',duration:1.2,sha256:'b'.repeat(64)}],
  output:{sha256:hash,bytes,
   qa:{verdict:'PASS',issues:[],metadata:{duration:2.4}}}};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 const pointer=path.join(root,'releases',id,'current.json');
 fs.writeFileSync(pointer,JSON.stringify({release_id:releaseId}));
 return {releaseId,file,hash,pointer,manifest,dir};
}
const service=out=>assemblyService({out,baseUrl:()=> 'http://localhost:3000',
 getDeck:()=>({id:'async-audio'}),getRender:()=>({}),getTask:()=>({}),
 getPlan:()=>({}),getStyle:()=>({}),acquireResource:async()=>()=>{},
});
test('M58-R25 async verified P05 reads exact SHA, yields to event loop and fails closed on tamper/symlink',{
 timeout:40000,
},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r25-p05-'));
 try{
  const f=sample(out),assembly=service(out);
  let tick=false;
  const promise=assembly.currentAsync('async-audio');
  setImmediate(()=>{tick=true});
  const current=await promise;
  assert.equal(tick,true,'P05 currentAsync must not monopolize the event loop');
  assert.equal(current.release_id,f.releaseId);
  assert.equal(current.manifest.output.sha256,f.hash);
  assert.equal(await assembly.downloadAsync('async-audio',f.releaseId),f.file);
  fs.appendFileSync(f.file,'tamper');
  assert.equal(await assembly.currentAsync('async-audio'),null);
  await assert.rejects(()=>assembly.downloadAsync('async-audio',f.releaseId),
   e=>e?.status===409);
  fs.rmSync(f.file);
  fs.symlinkSync(path.join(out,'unrelated.mp4'),f.file);
  assert.equal(await assembly.currentAsync('async-audio'),null);
  await assert.rejects(()=>assembly.downloadAsync('async-audio',f.releaseId),
   e=>e?.status===409);
  const copy=path.join(out,'unrelated.mp4');
  fs.writeFileSync(copy,Buffer.alloc(12*1024*1024,0x5b));
  assert.equal(await assembly.currentAsync('async-audio'),null,
   'a symlink must not gain validity merely because the target hashes correctly');
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});

function fixture(){
 const versions=new Map();
 const make=id=>{
  const release_id=randomUUID(),manifest={schemaVersion:1,project:id,release_id,
   target_fps:24,scenes:[
    {id:'s01',sha256:'1'.repeat(64),duration:1.2},
    {id:'s02',sha256:'2'.repeat(64),duration:1.2}],
   output:{sha256:'a'.repeat(64),qa:{verdict:'PASS',metadata:{duration:2.4}}}};
  const release={release_id,manifest};
  versions.set(id,release);return release;
 };
 return {async currentAsync(id){await sleep(5);return versions.get(id)||make(id)},
  current:()=>{throw Error('SYNC_SHA_VERIFICATION_FORBIDDEN')},
  download:()=>{throw Error('SYNC_SHA_VERIFICATION_FORBIDDEN')},
  change:id=>{const r=make(id);r.manifest.output.sha256='b'.repeat(64);return r},
 };
}
function report({projectId,releaseId,releaseSha}){
 const rec={schema_version:1,scope:'P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY',
  project_id:projectId,release_id:releaseId,release_sha256:releaseSha,
  cryptographically_signed:false,may_publish:false,may_deploy:false,
  decoded_master_audio:{windows:[],issues:[],may_publish:false,may_deploy:false}};
 return {...rec,report_sha256:digest(rec)};
}
test('M58-R25 production async queue never calls sync current/download during enqueue, worker and read',{
 timeout:16000,
},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r25-queue-'));
 const a=fixture();
 try{
  const q=realMasterAudioQueue({out,assembly:a,enabled:true,
   runAudit:async value=>report(value)});
  const before=await q.readAsync('alpha');
  assert.equal(before.job.status,'not_started');
  assert.equal(before.receipt,null);
  assert.equal(fs.existsSync(path.join(out,'audio-audit-jobs')),false);
  const release=await a.currentAsync('alpha');
  const start=await q.enqueueAsync('alpha',{
   expectedReleaseId:release.release_id,
   expectedReleaseSha256:release.manifest.output.sha256,
  });
  assert.equal(start.status,'queued');
  await until(async()=>{const j=await q.infoAsync('alpha');
   return j.status==='completed'?j:null});
  const settled=await q.readAsync('alpha');
  assert.equal(settled.job.status,'completed');
  assert.equal(settled.receipt.report.release_sha256,'a'.repeat(64));
  assert.equal(settled.receipt.report.may_publish,false);
  const cached=await q.enqueueAsync('alpha',{expectedReleaseId:release.release_id,
   expectedReleaseSha256:release.manifest.output.sha256});
  assert.equal(cached.cache_hit,true);
  a.change('alpha');
  const stale=await q.readAsync('alpha');
  assert.equal(stale.job.status,'stale');
  assert.equal(stale.receipt,null);
  await assert.rejects(()=>q.enqueueAsync('alpha',{
   expectedReleaseId:release.release_id,
   expectedReleaseSha256:release.manifest.output.sha256}),
   e=>e?.code==='M58_AUDIO_EXPECTED_RELEASE_STALE');
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});

test('M51-R07 async QC is release-pinned and P06-scoped; full audio loader never called for scene',{
 timeout:15000,
},async()=>{
 const r=fixture(),release=await r.currentAsync('alpha');
 let loaded=0;
 const reviews={list:()=>({revision:0,items:[]})};
 const qc=qcCockpitService({assembly:r,reviews,enabled:true,
  realAudioReadAsync:async()=>{loaded++;return {job:{status:'not_started'},receipt:null}}});
 const read=await qc.readAsync('alpha');
 assert.equal(read.project_id,'alpha');
 assert.equal(read.release_sha256,release.manifest.output.sha256);
 assert.equal(read.real_audio_review.state,'NOT_STARTED');
 assert.equal(read.publication_allowed,false);
 assert.equal(loaded,1);
 const scoped=await qc.readAsync('alpha',{sceneId:'s01'});
 assert.equal(scoped.scenes.length,1);
 assert.equal(scoped.real_audio_review,undefined);
 assert.equal(loaded,1,'P06-scope must not even invoke real audio provider');
 r.change('alpha');
 const next=await qc.readAsync('alpha');
 assert.notEqual(next.release_sha256,read.release_sha256);
});

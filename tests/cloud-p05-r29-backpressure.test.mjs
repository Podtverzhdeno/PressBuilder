import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createP05RequestQuota} from '../server/p05-request-quota.mjs';
import {qcCockpitService} from '../server/qc-cockpit.mjs';
import {realMasterAudioQueue} from '../server/real-master-audio-queue.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const fullReport=({projectId,releaseId,releaseSha})=>{
 const rec={schema_version:1,scope:'P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY',
  project_id:projectId,release_id:releaseId,release_sha256:releaseSha,
  cryptographically_signed:false,may_publish:false,may_deploy:false,
  decoded_master_audio:{windows:[],issues:[],may_publish:false,may_deploy:false}};
 return {...rec,report_sha256:sha(JSON.stringify(rec))};
};
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pb-r29-backpressure-'));
const release=()=>{const release_id=randomUUID();return {release_id,manifest:{
 schemaVersion:1,project:'alpha',release_id,target_fps:24,
 scenes:[{id:'s01',sha256:'1'.repeat(64),duration:1.2},
  {id:'s02',sha256:'2'.repeat(64),duration:1.2}],
 output:{sha256:'a'.repeat(64),qa:{verdict:'PASS',
  issues:[],metadata:{duration:2.4}}}}}};
const overflow=()=>Object.assign(new Error('Resource queue is full'),{status:429});

test('P05-R29 rejected actor cannot reserve project keys; rejected project cannot reserve actor keys',()=>{
 let now=0;
 const quota=createP05RequestQuota({actorCapacity:1,actorRefillPerSecond:0.1,
  projectCapacity:1,projectRefillPerSecond:0.1,
  maxActors:2,maxProjects:2,now:()=>now});
 quota.admit('web:director','alpha');
 for(const project of ['beta','gamma','delta','epsilon']){
  assert.throws(()=>quota.admit('web:director',project),
   e=>e?.status===429&&e.message==='P05_VERIFICATION_RATE_LIMITED');
  assert.deepEqual(quota.snapshot(),{actors:1,projects:1},
   'failed actor calls must not allocate any project bucket');
 }
 assert.throws(()=>quota.admit('mcp:agent:x','alpha'),
  e=>e?.status===429&&e.message==='P05_VERIFICATION_RATE_LIMITED');
 assert.deepEqual(quota.snapshot(),{actors:1,projects:1},
  'failed project calls must not allocate any actor bucket');
 quota.admit('mcp:agent:x','beta');
 assert.deepEqual(quota.snapshot(),{actors:2,projects:2});
 assert.throws(()=>quota.admit('another','gamma'),
  e=>e?.status===429&&e.message==='P05_QUOTA_IDENTITY_CAPACITY');
 now=10001;
 // Successful normal refill must still work without resetting key identity.
 quota.admit('web:director','alpha');
 assert.deepEqual(quota.snapshot(),{actors:2,projects:2});
});

test('P05-R29 repeated 429 keeps exhausted existing identity active, blocking eviction reset',()=>{
 let now=0;
 const quota=createP05RequestQuota({actorCapacity:1,
  actorRefillPerSecond:0.0001,projectCapacity:8,
  projectRefillPerSecond:1,maxActors:1,maxProjects:4,
  idleMs:1000,now:()=>now});
 quota.admit('web:director','alpha');
 for(const t of [900,1800,2700,3600]){
  now=t;
  assert.throws(()=>quota.admit('web:director','alpha'),
   e=>e?.status===429&&e.message==='P05_VERIFICATION_RATE_LIMITED');
 }
 now=4200;
 assert.throws(()=>quota.admit('new:actor','beta'),
  e=>e?.status===429&&e.message==='P05_QUOTA_IDENTITY_CAPACITY',
  'an exhausted but still actively querying identity cannot be evicted/reset');
 assert.deepEqual(quota.snapshot(),{actors:1,projects:1});
});

test('M51-R29 QC rethrows transient 429 from second audio SHA verification, never returns false INVALID',{
 timeout:6000,
},async()=>{
 const original=release();
 const assembly={currentAsync:async()=>original,
  current:()=>{throw Error('SYNC_SHA_FORBIDDEN')}};
 const reviews={list:()=>({revision:0,items:[]})};
 let calls=0;
 const qc=qcCockpitService({assembly,reviews,enabled:true,
  realAudioReadAsync:async()=>{calls++;throw overflow()}});
 await assert.rejects(()=>qc.readAsync('alpha'),
  e=>e?.status===429&&e.message==='Resource queue is full');
 assert.equal(calls,1);
 const corrupted=qcCockpitService({assembly,reviews,enabled:true,
  realAudioReadAsync:async()=>{throw Error('M58_AUDIO_RECEIPT_UNTRUSTED')}});
 const view=await corrupted.readAsync('alpha');
 assert.equal(view.publication_allowed,false);
 assert.ok(view.real_audio_review,'invalid receipt still visible as review warning');
 assert.notEqual(view.real_audio_review.state,'COMPLETED',
  'genuinely invalid receipts must not be silently upgraded to a success');
});

test('M58-R29 transient final-SHA overload retries without rerunning expensive FFmpeg',{
 timeout:13000,
},async()=>{
 const out=root(),rec=release();
 let verifications=0,runCount=0;
 const assembly={current:()=>rec,download:()=>'/unused',
  currentAsync:async()=>{
   verifications++;
   // enqueue=1, pre=2, post=3, final=4/5 rejected, final=6 succeeds.
   if(verifications===4||verifications===5)throw overflow();
   return rec;
  }};
 try{
  const q=realMasterAudioQueue({out,assembly,enabled:true,
   runAudit:async args=>{runCount++;return fullReport(args)}});
  const job=await q.enqueueAsync('alpha',{
   expectedReleaseId:rec.release_id,
   expectedReleaseSha256:rec.manifest.output.sha256});
  assert.equal(job.status,'queued');
  const deadline=Date.now()+8000;
  let result;
  while(Date.now()<deadline){
   result=q.info('alpha');
   if(['completed','failed'].includes(result.status))break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(result.status,'completed',JSON.stringify(result));
  assert.equal(runCount,1,'backoff must retry only verification, never FFmpeg');
  assert.equal(verifications,6);
  const receipt=q.read('alpha').receipt;
  assert.equal(receipt.report.may_publish,false);
  assert.equal(receipt.report.cryptographically_signed,false);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});

test('M58-R29 sustained SHA overload is bounded, writes explicit FAILED journal, never FFmpeg',{
 timeout:16000,
},async()=>{
 const out=root(),rec=release();
 let calls=0,workerCount=0;
 const assembly={current:()=>rec,download:()=>'/unused',
  currentAsync:async()=>{
   calls++;
   if(calls>1)throw overflow();
   return rec;
  }};
 try{
  const q=realMasterAudioQueue({out,assembly,enabled:true,
   runAudit:async args=>{workerCount++;return fullReport(args)}});
  await q.enqueueAsync('alpha',{
   expectedReleaseId:rec.release_id,
   expectedReleaseSha256:rec.manifest.output.sha256});
  const deadline=Date.now()+12000;
  let done;
  while(Date.now()<deadline){
   done=q.info('alpha');
   if(done.status==='failed')break;
   await new Promise(resolve=>setTimeout(resolve,35));
  }
  assert.equal(done.status,'failed',JSON.stringify(done));
  assert.equal(done.error_code,'M58_AUDIO_SHA_BACKPRESSURE_EXHAUSTED');
  assert.equal(calls,8,'one admission + seven bounded worker verification attempts');
  assert.equal(workerCount,0,'no FFmpeg should run without current SHA verification');
  assert.equal(q.snapshot().running,false);
  assert.equal(q.snapshot().pending,0);
  assert.equal(fs.existsSync(path.join(out,'audio-audit-receipts','alpha')),false);
  const journal=JSON.parse(fs.readFileSync(
   path.join(out,'audio-audit-jobs','alpha.json'),'utf8'));
  assert.equal(journal.error_code,'M58_AUDIO_SHA_BACKPRESSURE_EXHAUSTED');
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {realMasterAudioQueue} from '../server/real-master-audio-queue.mjs';
import {createResourceGovernor} from '../server/resource-governor.mjs';

const sha=x=>x.repeat(64);
const sum=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-r23-'));
const sleep=t=>new Promise(r=>setTimeout(r,t));
async function until(fn){
 const end=Date.now()+7000;
 for(;;){const v=fn();if(v)return v;
  if(Date.now()>end)throw Error('R23_TEST_TIMEOUT');
  await sleep(15);
 }
}
function fixture(){
 const now=new Map();
 function create(id,hash='a'){
  const release_id=randomUUID();
  const r={release_id,manifest:{schemaVersion:1,project:id,release_id,
   scenes:[{id:'s01',sha256:sha('1'),duration:1},
    {id:'s02',sha256:sha('2'),duration:1}],
   output:{sha256:sha(hash),qa:{verdict:'PASS',metadata:{duration:2}}}}};
  now.set(id,r);return r;
 }
 return {current:id=>now.get(id)||create(id),download:()=>'/server-selected.mp4',
  change:(id,hash='b')=>create(id,hash)};
}
function report({projectId,releaseId,releaseSha}){
 const record={schema_version:1,scope:'P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY',
  project_id:projectId,release_id:releaseId,release_sha256:releaseSha,
  cryptographically_signed:false,may_publish:false,may_deploy:false,
  decoded_master_audio:{windows:[],issues:[],may_publish:false,may_deploy:false}};
 return {...record,report_sha256:sum(record)};
}
const make=(out,assembly,more={})=>realMasterAudioQueue({
 out,assembly,enabled:true,...more});
const deny=(fn,code)=>assert.throws(fn,e=>e?.code===code,code);

test('M58-R23 running old release rejects new admission until stale worker is terminated',{
 timeout:12000,
},async()=>{
 const out=temp(),assembly=fixture();
 let resume,entered;
 const started=new Promise(r=>{entered=r});
 const worker=async data=>{
  if(data.releaseSha===sha('a')){
   entered();await new Promise(r=>{resume=r});
  }
  return report(data);
 };
 try{
  const q=make(out,assembly,{runAudit:worker});
  const old=q.enqueue('alpha');
  await started;
  assembly.change('alpha');
  deny(()=>q.enqueue('alpha'),'M58_AUDIO_ACTIVE_RELEASE_CONFLICT');
  assert.equal(q.info('alpha').job_id,old.job_id,'active journal not replaced');
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,'audio-audit-jobs','alpha.json'))).job_id,
   old.job_id,'disk journal not replaced');
  resume();
  await until(()=>q.info('alpha').status==='failed');
  assert.equal(q.info('alpha').error_code,'M58_AUDIO_RELEASE_STALE');
  const next=q.enqueue('alpha');
  assert.notEqual(next.job_id,old.job_id);
  await until(()=>q.info('alpha').status==='completed');
  assert.equal(q.read('alpha').receipt.report.release_sha256,sha('b'));
  assert.equal(q.read('alpha').job.publication_allowed,false);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});
test('M58-R23 queued old release cannot be superseded while blocked on governor',{
 timeout:12000,
},async()=>{
 const out=temp(),assembly=fixture();
 const governor=createResourceGovernor({capacity:1,maxWaiting:2});
 const release=await governor.acquire();
 let called=0;
 try{
  const q=make(out,assembly,{acquireResource:args=>governor.acquire(args),
   runAudit:async data=>{called++;return report(data)}});
  const old=q.enqueue('alpha');
  await until(()=>governor.snapshot().waiting===1);
  assert.equal(q.info('alpha').status,'queued');
  assembly.change('alpha');
  deny(()=>q.enqueue('alpha'),'M58_AUDIO_ACTIVE_RELEASE_CONFLICT');
  assert.equal(q.info('alpha').job_id,old.job_id);
  release();
  await until(()=>q.info('alpha').status==='failed');
  assert.equal(called,0,'stale MP4 must never reach worker');
  const next=q.enqueue('alpha');
  assert.notEqual(next.job_id,old.job_id);
  await until(()=>q.info('alpha').status==='completed');
  assert.equal(called,1);
  assert.equal(governor.snapshot().active,0);
 }finally{release();fs.rmSync(out,{recursive:true,force:true})}
});
test('M58-R23 preexisting immutable receipt cannot be overwritten after audit race',{
 timeout:12000,
},async()=>{
 const out=temp(),assembly=fixture();
 let resume,entered;
 const started=new Promise(r=>{entered=r});
 try{
  const q=make(out,assembly,{runAudit:async data=>{
   entered();await new Promise(r=>{resume=r});return report(data);
  }});
  q.enqueue('alpha');await started;
  const file=path.join(out,'audio-audit-receipts','alpha',sha('a')+'.json');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,'PREEXISTING_RECEIPT_MUST_NOT_CHANGE',{mode:0o600});
  resume();
  await until(()=>q.info('alpha').status==='failed');
  assert.equal(q.info('alpha').error_code,'M58_AUDIO_RECEIPT_ALREADY_EXISTS');
  assert.equal(fs.readFileSync(file,'utf8'),'PREEXISTING_RECEIPT_MUST_NOT_CHANGE');
  assert.equal(q.read('alpha').receipt,null);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});
test('M58-R23 symlinked audit journal directory must never redirect writes',{
 timeout:12000,
},()=>{
 const out=temp(),external=temp(),assembly=fixture();
 try{
  fs.symlinkSync(external,path.join(out,'audio-audit-jobs'),'dir');
  const q=make(out,assembly,{runAudit:async data=>report(data)});
  deny(()=>q.enqueue('alpha'),'M58_AUDIO_STORAGE_UNSAFE');
  assert.equal(fs.readdirSync(external).length,0,'no file created outside configured output');
 }finally{
  fs.rmSync(out,{recursive:true,force:true});
  fs.rmSync(external,{recursive:true,force:true});
 }
});
test('M58-R23 symlinked receipt directory fails instead of publishing outside output',{
 timeout:12000,
},async()=>{
 const out=temp(),external=temp(),assembly=fixture();
 try{
  fs.mkdirSync(path.join(out,'audio-audit-receipts'),{recursive:true});
  fs.symlinkSync(external,path.join(out,'audio-audit-receipts','alpha'),'dir');
  const q=make(out,assembly,{runAudit:async data=>report(data)});
  q.enqueue('alpha');
  await until(()=>q.info('alpha').status==='failed');
  assert.equal(q.info('alpha').error_code,'M58_AUDIO_STORAGE_UNSAFE');
  assert.equal(fs.readdirSync(external).length,0);
 }finally{
  fs.rmSync(out,{recursive:true,force:true});
  fs.rmSync(external,{recursive:true,force:true});
 }
});
test('M58-R23 symlinked journal and receipt files are rejected on read',{
 timeout:12000,
},async()=>{
 const out=temp(),external=temp(),assembly=fixture();
 try{
  const q=make(out,assembly,{runAudit:async data=>report(data)});
  q.enqueue('alpha');
  await until(()=>q.info('alpha').status==='completed');
  const old=path.join(out,'audio-audit-receipts','alpha',sha('a')+'.json');
  const stolen=path.join(external,'other.json');
  fs.copyFileSync(old,stolen);
  fs.rmSync(old);
  fs.symlinkSync(stolen,old);
  deny(()=>q.read('alpha'),'M58_AUDIO_RECEIPT_UNTRUSTED');
  const journal=path.join(out,'audio-audit-jobs','alpha.json');
  fs.rmSync(journal);
  fs.symlinkSync(stolen,journal);
  const fresh=make(out,assembly,{runAudit:async data=>report(data)});
  deny(()=>fresh.info('alpha'),'M58_AUDIO_JOURNAL_UNTRUSTED');
 }finally{
  fs.rmSync(out,{recursive:true,force:true});
  fs.rmSync(external,{recursive:true,force:true});
 }
});

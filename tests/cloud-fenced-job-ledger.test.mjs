import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fencedJobLedger} from '../server/fenced-job-ledger.mjs';
const director={id:'director-1',role:'director'};
const worker={id:'worker-1',role:'worker'};
const other={id:'worker-2',role:'worker'};
const sha='c'.repeat(64),wrong='d'.repeat(64);
const deny=(fn,code)=>assert.throws(fn,e=>e?.code===code||e?.message===code,code);
function make(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m50-'));
 fs.mkdirSync(path.join(root,'demo'));
 let now=200000,pointerSha=sha,approvalRevision=3;
 const versions={approved:()=>({revision:approvalRevision,version_id:'1234567890abcdef',
  artifact:{sha256:pointerSha,qa:{verdict:'PASS'}}})};
 const opts={root,getDeck:()=>({slides:[{id:'s01'}]}),versions,enabled:true,clock:()=>now,leaseMs:1000};
 const ledger=()=>fencedJobLedger(opts);
 const id='demo',scene='s01',job='job1';
 const begin=()=>ledger().begin(id,scene,director,{
  job_id:job,request_id:'once',source_sha256:sha,version_id:'1234567890abcdef'});
 const cleanup=()=>fs.rmSync(root,{recursive:true,force:true});
 return {root,opts,ledger,id,scene,job,begin,cleanup,advance:ms=>{now+=ms},
  changeSource:()=>{pointerSha=wrong},advanceApproval:()=>{approvalRevision++}};
}
test('M50-R01 begin is source-attested P08 and idempotent; no output or release',()=>{
 const f=make();try{
  const a=f.begin(),b=f.begin();
  assert.deepEqual(a,b);assert.equal(a.state,'QUEUED');assert.equal(a.revision,1);
  assert.equal(a.may_publish,false);assert.equal(a.needs_reverification,false);
  deny(()=>f.ledger().begin(f.id,f.scene,director,{job_id:f.job,request_id:'different',
   source_sha256:sha,version_id:'1234567890abcdef'}),'M50_IDEMPOTENCY_CONFLICT');
  deny(()=>f.ledger().begin(f.id,f.scene,worker,{job_id:'other',request_id:'r2',
   source_sha256:sha,version_id:'1234567890abcdef'}),'M50_DIRECTOR_REQUIRED');
  f.changeSource();
  assert.equal(f.ledger().read(f.id,f.scene,f.job).needs_reverification,true);
  deny(()=>f.ledger().claim(f.id,f.scene,f.job,worker,1),'M50_P08_SOURCE_STALE');
 }finally{f.cleanup()}
});
test('M50-R01 lease/fence enforce actor and replay idempotence across restart',()=>{
 const f=make();try{
  f.begin();
  const a=f.ledger().claim(f.id,f.scene,f.job,worker,1);
  assert.equal(a.state,'LEASED');assert.equal(a.fence,1);assert.equal(a.revision,2);
  assert.match(a.lease_token,/^[a-f0-9]{48}$/);
  assert.ok(!JSON.stringify(f.ledger().read(f.id,f.scene,f.job)).includes(a.lease_token));
  deny(()=>f.ledger().claim(f.id,f.scene,f.job,other,2),'M50_LEASE_IN_USE');
  deny(()=>f.ledger().heartbeat(f.id,f.scene,f.job,other,{
   expected_revision:2,fence:1,lease_token:a.lease_token}),'M50_ASSIGNEE_MISMATCH');
  deny(()=>f.ledger().heartbeat(f.id,f.scene,f.job,worker,{
   expected_revision:2,fence:1,lease_token:'a'.repeat(48)}),'M50_INVALID_FENCE');
  const hb=f.ledger().heartbeat(f.id,f.scene,f.job,worker,{
   expected_revision:2,fence:1,lease_token:a.lease_token});
  assert.equal(hb.revision,3);
  f.advance(1000);
  assert.equal(f.ledger().read(f.id,f.scene,f.job).recoverable,true);
  deny(()=>f.ledger().heartbeat(f.id,f.scene,f.job,worker,{
   expected_revision:3,fence:1,lease_token:a.lease_token}),'M50_LEASE_EXPIRED');
  const b=f.ledger().claim(f.id,f.scene,f.job,other,3);
  assert.equal(b.fence,2);assert.equal(b.revision,4);
  deny(()=>f.ledger().verify(f.id,f.scene,f.job,worker,{
   expected_revision:4,fence:1,lease_token:a.lease_token,
   operation_id:'verify1',evidence_sha256:sha}),'M50_ASSIGNEE_MISMATCH');
  deny(()=>f.ledger().verify(f.id,f.scene,f.job,other,{
   expected_revision:4,fence:2,lease_token:b.lease_token,
   operation_id:'verify1',evidence_sha256:wrong}),'M50_EVIDENCE_MISMATCH');
  const completed=f.ledger().verify(f.id,f.scene,f.job,other,{
   expected_revision:4,fence:2,lease_token:b.lease_token,
   operation_id:'verify1',evidence_sha256:sha});
  assert.equal(completed.state,'VERIFIED_FOR_REVIEW');assert.equal(completed.revision,5);
  assert.equal(completed.may_publish,false);
  assert.equal(completed.receipts.length,1);
  // Idempotent late replay, no second verification/finalization side effects.
  const replay=f.ledger().verify(f.id,f.scene,f.job,other,{
   expected_revision:4,fence:2,lease_token:b.lease_token,
   operation_id:'verify1',evidence_sha256:sha});
  assert.deepEqual(replay,completed);
  deny(()=>f.ledger().verify(f.id,f.scene,f.job,other,{
   expected_revision:4,fence:2,lease_token:b.lease_token,
   operation_id:'verify1',evidence_sha256:wrong}),'M50_OPERATION_REPLAY_CONFLICT');
  deny(()=>f.ledger().claim(f.id,f.scene,f.job,other,5),'M50_JOB_TERMINAL');
  deny(()=>f.ledger().cancel(f.id,f.scene,f.job,director,5),'M50_NO_CANCEL_AFTER_QA');
 }finally{f.cleanup()}
});
test('M50-R01 100 simulated process crashes maintain same version and monotonic fencing',()=>{
 const f=make();try{
  f.begin();let rev=1;
  for(let i=0;i<100;i++){
   const before=f.ledger().read(f.id,f.scene,f.job);
   assert.equal(before.revision,rev);
   const a=f.ledger().claim(f.id,f.scene,f.job,worker,rev);
   assert.equal(a.fence,i+1);
   assert.equal(a.source_sha256,sha);
   rev++;
   // Throw away instance/token without finalization, as if worker SIGKILL.
   f.advance(1001);
  }
  const d=f.ledger().read(f.id,f.scene,f.job);
  assert.equal(d.fence,100);assert.equal(d.recoverable,true);
  assert.equal(d.receipts.length,0);assert.equal(d.state,'LEASED');
  assert.equal(d.may_publish,false);assert.equal(d.version_id,'1234567890abcdef');
 }finally{f.cleanup()}
});
test('M50-R01 strict invalid journal/symlink and CAS/lease cancellation',()=>{
 const f=make();try{
  deny(()=>f.ledger().read('wrong',f.scene,f.job),'M50_JOB_NOT_FOUND');
  f.begin();
  const a=f.ledger().claim(f.id,f.scene,f.job,worker,1);
  deny(()=>f.ledger().cancel(f.id,f.scene,f.job,director,1),'M50_CAS_CONFLICT');
  const canceled=f.ledger().cancel(f.id,f.scene,f.job,director,2);
  assert.equal(canceled.state,'CANCELLED');assert.equal(canceled.revision,3);
  deny(()=>f.ledger().claim(f.id,f.scene,f.job,worker,3),'M50_JOB_TERMINAL');
  const folder=path.join(f.root,'demo','.job-ledger');
  const record=fs.readdirSync(folder).find(x=>x.endsWith('.json'));
  fs.writeFileSync(path.join(folder,record),'{"not":"json"}');
  deny(()=>f.ledger().read(f.id,f.scene,f.job),'M50_CORRUPTED_JOURNAL');
  fs.unlinkSync(path.join(folder,record));
  fs.symlinkSync('/etc/passwd',path.join(folder,record));
  deny(()=>f.ledger().read(f.id,f.scene,f.job),'M50_UNSAFE_JOURNAL');
  const disabled=fencedJobLedger({...f.opts,enabled:false});
  deny(()=>disabled.read(f.id,f.scene,f.job),'M50_DISABLED');
 }finally{f.cleanup()}
});


test('M50-R01 same MP4 at new P08 approval revision is stale, never silently reauthorized',()=>{
 const f=make();try{
  f.begin();
  f.advanceApproval();
  assert.equal(f.ledger().read(f.id,f.scene,f.job).needs_reverification,true);
  deny(()=>f.ledger().claim(f.id,f.scene,f.job,worker,1),'M50_P08_APPROVAL_STALE');
 }finally{f.cleanup()}
});

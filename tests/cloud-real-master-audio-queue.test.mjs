import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {realMasterAudioQueue} from '../server/real-master-audio-queue.mjs';
import {createResourceGovernor} from '../server/resource-governor.mjs';

const SHA=x=>x.repeat(64);
const shaFile=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,timeout=6000)=>{
 const end=Date.now()+timeout;
 for(;;){const value=fn();if(value)return value;
  if(Date.now()>end)throw Error('M58_R21_TEST_TIMEOUT');
  await sleep(25);}
};
function memoryAssembly(){
 const releases=new Map();
 const make=id=>({release_id:randomUUID(),manifest:{
  schemaVersion:1,project:id,release_id:null,
  scenes:[{id:'s01',sha256:SHA('a'),duration:1.2},
   {id:'s02',sha256:SHA('b'),duration:1.2}],
  output:{sha256:SHA('c'),qa:{verdict:'PASS',metadata:{duration:2.4}}}}});
 const ensure=id=>{
  if(!releases.has(id)){const r=make(id);r.manifest.release_id=r.release_id;releases.set(id,r)}
  return releases.get(id);
 };
 return {current:id=>ensure(id),download:()=>'/local/server-selected.mp4',
  change:id=>{const r=make(id);r.manifest.release_id=r.release_id;
   r.manifest.output.sha256=SHA('d');releases.set(id,r)},ensure};
}
function mockReport({projectId,releaseId,releaseSha}){
 const record={schema_version:1,scope:'P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY',
  project_id:projectId,release_id:releaseId,release_sha256:releaseSha,
  cryptographically_signed:false,may_publish:false,may_deploy:false,
  decoded_master_audio:{windows:[],issues:[],may_publish:false,may_deploy:false},
 };
 return {...record,report_sha256:digest(record)};
}
function root(prefix){return fs.mkdtempSync(path.join(os.tmpdir(),prefix))}
const makeQueue=(out,assembly,extra={})=>
 realMasterAudioQueue({out,assembly,enabled:true,...extra});
const denied=(fn,code)=>assert.throws(fn,e=>e.code===code,code);
const ready=['ffmpeg','ffprobe'].every(x=>
 spawnSync(x,['-version'],{timeout:4000,stdio:'ignore'}).status===0);

test('M58-R21 max one worker, bounded FIFO, immutable receipt and completed-cache dedup',{
 timeout:12000,
},async()=>{
 const out=root('pb-r21-fifo-'),assembly=memoryAssembly();
 let active=0,maxActive=0,called=0,releaseFirst;
 const fake=async data=>{
  called++;active++;maxActive=Math.max(maxActive,active);
  if(data.projectId==='alpha')await new Promise(resolve=>{releaseFirst=resolve});
  await sleep(20);
  active--;return mockReport(data);
 };
 try{
  const q=makeQueue(out,assembly,{maxPending:2,runAudit:fake});
  const first=q.enqueue('alpha'),again=q.enqueue('alpha');
  assert.equal(first.job_id,again.job_id);
  await until(()=>releaseFirst);
  const second=q.enqueue('beta'),third=q.enqueue('gamma');
  denied(()=>q.enqueue('delta'),'M58_AUDIO_QUEUE_FULL');
  assert.equal(q.snapshot().pending,2);
  releaseFirst();
  await until(()=>['completed','failed'].includes(q.info('gamma').status));
  assert.equal(q.info('alpha').status,'completed');
  assert.equal(q.info('beta').status,'completed');
  assert.equal(q.info('gamma').status,'completed');
  assert.equal(maxActive,1);
  assert.equal(called,3);
  const cached=q.enqueue('alpha');
  assert.equal(cached.job_id,first.job_id);
  assert.equal(cached.cache_hit,true);
  assert.equal(called,3);
  const evidence=q.read('alpha');
  assert.equal(evidence.receipt.report.release_sha256,SHA('c'));
  assert.equal(evidence.receipt.report.cryptographically_signed,false);
  assert.equal(evidence.job.publication_allowed,false);
  const pathToReceipt=path.join(out,'audio-audit-receipts','alpha',SHA('c')+'.json');
  assert.equal(fs.statSync(pathToReceipt).mode&0o777,0o600);
  const cold=makeQueue(out,assembly,{runAudit:()=>{throw Error('MUST_NOT_RUN')}});
  assert.equal(cold.read('alpha').receipt.report.report_sha256,evidence.receipt.report.report_sha256);
  assert.equal(cold.enqueue('alpha').cache_hit,true);
 }finally{fs.rmSync(out,{force:true,recursive:true})}
});
test('M58-R21 stale release never yields old cached receipt',async()=>{
 const out=root('pb-r21-stale-'),assembly=memoryAssembly();
 try{
  const q=makeQueue(out,assembly,{runAudit:async data=>mockReport(data)});
  q.enqueue('alpha');
  await until(()=>q.info('alpha').status==='completed');
  const orig=q.read('alpha').receipt.report.release_sha256;
  assembly.change('alpha');
  const state=q.info('alpha');
  assert.equal(state.status,'stale');
  assert.equal(q.read('alpha').receipt,null);
  const next=q.enqueue('alpha');
  assert.notEqual(next.release_sha256,orig);
  assert.notEqual(next.status,'completed');
  await until(()=>q.info('alpha').status==='completed');
  assert.equal(q.read('alpha').receipt.report.release_sha256,SHA('d'));
 }finally{fs.rmSync(out,{force:true,recursive:true})}
});
test('M58-R21 tampered receipt fails closed, never upgrades to publish',async()=>{
 const out=root('pb-r21-tamper-'),assembly=memoryAssembly();
 try{
  const q=makeQueue(out,assembly,{runAudit:async data=>mockReport(data)});
  q.enqueue('alpha');
  await until(()=>q.info('alpha').status==='completed');
  const file=path.join(out,'audio-audit-receipts','alpha',SHA('c')+'.json');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  data.report.decoded_master_audio.issues=[{code:'HIDDEN'}];
  fs.writeFileSync(file,JSON.stringify(data));
  denied(()=>q.read('alpha'),'M58_AUDIO_RECEIPT_UNTRUSTED');
  denied(()=>q.enqueue('alpha'),'M58_AUDIO_RECEIPT_UNTRUSTED');
 }finally{fs.rmSync(out,{force:true,recursive:true})}
});
test('M58-R21 interrupted queued/running journal is FAILED, never auto-replayed',()=>{
 const out=root('pb-r21-crash-'),assembly=memoryAssembly();
 try{
  const j={schema_version:1,project_id:'alpha',job_id:randomUUID(),
   release_id:assembly.ensure('alpha').release_id,release_sha256:SHA('c'),
   status:'running',publication_allowed:false};
  const dir=path.join(out,'audio-audit-jobs');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'alpha.json'),JSON.stringify(j));
  let called=false;
  const q=makeQueue(out,assembly,{runAudit:()=>{called=true}});
  assert.equal(q.info('alpha').status,'failed');
  assert.equal(q.info('alpha').error_code,'M58_AUDIO_INTERRUPTED_REQUIRES_REVIEW');
  assert.equal(q.snapshot().pending,0);
  assert.equal(called,false);
  const stored=JSON.parse(fs.readFileSync(path.join(dir,'alpha.json'),'utf8'));
  assert.equal(stored.status,'failed');
  denied(()=>q.enqueue('../bad'),'M58_AUDIO_PROJECT_INVALID');
 }finally{fs.rmSync(out,{force:true,recursive:true})}
});
test('M58-R21 resource governor wait rechecks current MP4 before running worker',{
 timeout:12000,
},async()=>{
 const out=root('pb-r21-governor-'),assembly=memoryAssembly();
 const governor=createResourceGovernor({capacity:1,maxWaiting:3});
 const hold=await governor.acquire({kind:'render'});
 let called=false;
 try{
  const q=makeQueue(out,assembly,{acquireResource:args=>governor.acquire(args),
   runAudit:async data=>{called=true;return mockReport(data)}});
  q.enqueue('alpha');
  await until(()=>governor.snapshot().waiting===1);
  assert.equal(q.snapshot().running,true);
  assert.equal(q.info('alpha').status,'queued');
  assembly.change('alpha');
  hold();
  await until(()=>q.info('alpha').status==='failed');
  assert.equal(q.info('alpha').error_code,'M58_AUDIO_RELEASE_STALE');
  assert.equal(called,false,'FFmpeg must not run on a release changed while waiting');
  assert.equal(governor.snapshot().active,0);
 }finally{
  hold();fs.rmSync(out,{force:true,recursive:true});
 }
});
test('M58-R21 worker result cannot be accepted after release changes during audit',{
 timeout:12000,
},async()=>{
 const out=root('pb-r21-midchange-'),assembly=memoryAssembly();
 try{
  let resume,started;
  const waiting=new Promise(resolve=>{started=resolve});
  const q=makeQueue(out,assembly,{runAudit:async data=>{
   started();
   await new Promise(resolve=>{resume=resolve});
   return mockReport(data);
  }});
  q.enqueue('alpha');await waiting;
  assembly.change('alpha');resume();
  await until(()=>q.info('alpha').status==='failed');
  assert.equal(q.info('alpha').error_code,'M58_AUDIO_RELEASE_STALE');
  assert.equal(fs.existsSync(path.join(out,'audio-audit-receipts','alpha',SHA('c')+'.json')),false);
 }finally{fs.rmSync(out,{force:true,recursive:true})}
});
test('M58-R21 real off-thread FFmpeg worker performs unsigned review on SHA-pinned MP4',{
 timeout:120000,skip:!ready,
},async()=>{
 const out=root('pb-r21-real-worker-'),id='actual',rid=randomUUID();
 const dir=path.join(out,'releases',id,rid);
 fs.mkdirSync(dir,{recursive:true});
 const raw=path.join(out,'signal.pcm'),master=path.join(dir,'final.mp4');
 try{
  const b=Buffer.alloc(48000*2.4*4);
  for(let f=0;f<b.length/4;f++){
   const t=f/48000,w=Math.round(.16*32767*Math.sin(2*Math.PI*330*t));
   b.writeInt16LE(w,4*f);
   b.writeInt16LE(t>=.6&&t<1.5?-w:w,4*f+2);
  }
  fs.writeFileSync(raw,b);
  const cmd=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y',
   '-f','s16le','-ar','48000','-ac','2','-i',raw,
   '-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=2.4',
   '-map','1:v:0','-map','0:a:0','-t','2.4',
   '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
   '-c:a','aac','-b:a','160k',master],{timeout:40000,encoding:'utf8'});
  assert.equal(cmd.status,0,String(cmd.stderr).slice(-900));
  const release={release_id:rid,manifest:{schemaVersion:1,project:id,release_id:rid,
   scenes:[{id:'s01',sha256:SHA('a'),duration:1.2},
    {id:'s02',sha256:SHA('b'),duration:1.2}],
   output:{sha256:shaFile(master),bytes:fs.statSync(master).size,
    qa:{verdict:'PASS',metadata:{duration:2.4}}}}};
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(release.manifest));
  fs.writeFileSync(path.join(out,'releases',id,'current.json'),
   JSON.stringify({release_id:rid}));
  const diskCurrent=()=>({
   release_id:rid,manifest:JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'))
  });
  const assembly={current:()=>{
   const r=diskCurrent();
   if(shaFile(master)!==r.manifest.output.sha256)return null;
   return r;
  },download:()=>{if(shaFile(master)!==release.manifest.output.sha256)throw Error('HASH');
   return master}};
  const q=makeQueue(out,assembly);
  const first=q.enqueue(id);
  assert.equal(first.publication_allowed,false);
  const settled=await until(()=>['completed','failed'].includes(q.info(id).status),45000);
  assert.equal(settled.status,'completed',JSON.stringify(settled));
  const {receipt,job}=q.read(id);
  assert.equal(job.status,'completed');
  assert.equal(receipt.report.release_sha256,release.manifest.output.sha256);
  assert.equal(receipt.report.cryptographically_signed,false);
  assert.equal(receipt.report.may_publish,false);
  assert.ok(receipt.report.decoded_master_audio.issues.some(x=>
   x.code==='POSSIBLE_MONO_FOLD_DOWN_CANCELLATION'));
  assert.equal(q.enqueue(id).cache_hit,true);
  fs.appendFileSync(master,'tamper');
  denied(()=>q.read(id),'M58_AUDIO_NO_VERIFIED_CURRENT_RELEASE');
 }finally{fs.rmSync(out,{force:true,recursive:true})}
});

/** M58-R21: bounded single-worker FIFO for review-only real MP4 audio audits.
 * No HTTP route or production flag is wired. All receipts are unsigned and
 * never grant QA approval. Requires PressBuilder's existing single-writer host.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';

const PROJECT=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9-]{36}$/;
const stamp=()=>new Date().toISOString();
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
/** Atomic one-time receipt creation must not be a check-then-rename race.
 * hard-linking our private temporary file fails with EEXIST atomically and
 * cannot replace a prior receipt (including a symlink at the destination).
 */
function atomicJson(file,value,{exclusive=false}={}){
 const tmp=file+'.'+randomUUID()+'.tmp';
 try{
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
  if(exclusive)fs.linkSync(tmp,file);
  else fs.renameSync(tmp,file);
 }catch(e){
  if(exclusive&&e?.code==='EEXIST')fail('M58_AUDIO_RECEIPT_ALREADY_EXISTS');
  throw e;
 }finally{fs.rmSync(tmp,{force:true})}
}
function safeDirectory(dir){
 const stat=fs.lstatSync(dir);
 if(!stat.isDirectory()||stat.isSymbolicLink())
  fail('M58_AUDIO_STORAGE_UNSAFE',500);
}
const readJson=file=>{
 // Open the exact inode, not a pathname first lstat'ed and then re-opened.
 // O_NOFOLLOW rejects symlinked job and receipt files on the Linux host.
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.size>600000)
   fail('M58_AUDIO_JOURNAL_UNTRUSTED');
  return JSON.parse(fs.readFileSync(fd,'utf8'));
 }finally{fs.closeSync(fd)}
};
const clone=x=>structuredClone(x);
const same=(j,r)=>j.release_id===r.release_id&&j.release_sha256===r.manifest.output.sha256;
const validJob=j=>j?.schema_version===1&&PROJECT.test(j.project_id??'')&&
 UUID.test(j.job_id??'')&&UUID.test(j.release_id??'')&&
 SHA.test(j.release_sha256??'')&&
 ['queued','running','completed','failed'].includes(j.status);
export function runRealMasterAudioWorker(data,{workerTimeoutMs=110000}={}){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./real-master-audio-worker.mjs',import.meta.url),
   {workerData:data,execArgv:[]});
  let done=false;
  const finish=(error,value)=>{
   if(done)return;done=true;clearTimeout(timer);
   if(error){void worker.terminate();reject(error)}else resolve(value);
  };
  const timer=setTimeout(()=>finish(Error('M58_AUDIO_WORKER_TIMEOUT')),workerTimeoutMs);
  worker.on('message',message=>{
   if(message?.ok===true)finish(null,message.report);
   else finish(Error(message?.code||'M58_AUDIO_WORKER_FAILED'));
  });
  worker.on('error',()=>finish(Error('M58_AUDIO_WORKER_FAILED')));
  worker.on('exit',code=>{
   if(!done)finish(Error(code===0?'M58_AUDIO_WORKER_NO_RECEIPT':'M58_AUDIO_WORKER_FAILED'));
  });
 });
}
export function realMasterAudioQueue({
 out,assembly,enabled=false,maxPending=3,
 acquireResource=async()=>()=>{},runAudit=runRealMasterAudioWorker,
}={}){
 if(typeof out!=='string'||!path.isAbsolute(out)||
    typeof assembly?.current!=='function'||
    typeof assembly?.download!=='function'||
    typeof acquireResource!=='function'||typeof runAudit!=='function'||
    !Number.isSafeInteger(maxPending)||maxPending<1||maxPending>12)
   fail('M58_AUDIO_QUEUE_INVALID_CONFIGURATION',500);
 const journals=path.join(out,'audio-audit-jobs');
 const receipts=path.join(out,'audio-audit-receipts');
 const latest=new Map(),pending=[];
 let running=false;
 const assertEnabled=()=>{if(!enabled)fail('M58_AUDIO_QUEUE_DISABLED',501)};
 const requireId=id=>{if(typeof id!=='string'||!PROJECT.test(id))fail('M58_AUDIO_PROJECT_INVALID',400)};
 const journalFile=id=>path.join(journals,id+'.json');
 const receiptFile=(id,sha)=>path.join(receipts,id,sha+'.json');
 const persist=j=>{
  fs.mkdirSync(journals,{recursive:true,mode:0o700});
  safeDirectory(out);safeDirectory(journals);
  atomicJson(journalFile(j.project_id),j);
 };
 const safeReceiptDir=(id,{create=false}={})=>{
  const dir=path.join(receipts,id);
  if(create)fs.mkdirSync(dir,{recursive:true,mode:0o700});
  safeDirectory(out);safeDirectory(receipts);safeDirectory(dir);
 };
 function verifiedCurrent(id){
  let release;
  try{
   release=assembly.current(id);
   if(!release||!UUID.test(release.release_id??'')||
      release.manifest?.project!==id||
      release.manifest?.release_id!==release.release_id||
      release.manifest?.output?.qa?.verdict!=='PASS'||
      !SHA.test(release.manifest?.output?.sha256??''))throw Error();
   // P05 download() verifies master bytes, even on cache hits.
   assembly.download(id,release.release_id);
  }catch{fail('M58_AUDIO_NO_VERIFIED_CURRENT_RELEASE')}
  return release;
 }
 async function verifiedCurrentAsync(id){
  // Production P05 currentAsync includes full SHA, pinned inode and
  // current-pointer CAS. Test mocks retain the sync verification contract.
  if(typeof assembly.currentAsync!=='function')return verifiedCurrent(id);
  let release;
  try{
   release=await assembly.currentAsync(id);
   if(!release||!UUID.test(release.release_id??'')||
      release.manifest?.project!==id||
      release.manifest?.release_id!==release.release_id||
      release.manifest?.output?.qa?.verdict!=='PASS'||
      !SHA.test(release.manifest?.output?.sha256??''))throw Error();
  }catch(e){
   if(e?.status===429)throw e;
   fail('M58_AUDIO_NO_VERIFIED_CURRENT_RELEASE');
  }
  return release;
 }
 // A saturated P05 SHA governor is transient. Retry the verification
 // with bounded backoff without ever running FFmpeg more than once.
 async function workerVerifiedCurrent(id){
  for(let attempt=0;;attempt++){
   try{return await verifiedCurrentAsync(id)}
   catch(e){
    if(e?.status!==429||attempt>=6)throw e;
    await new Promise(resolve=>setTimeout(resolve,Math.min(750,75*2**attempt)));
   }
  }
 }
 function load(id){
  if(latest.has(id))return latest.get(id);
  const f=journalFile(id);
  if(!fs.existsSync(journals))return null;
  safeDirectory(out);safeDirectory(journals);
  if(!fs.existsSync(f))return null;
  let j;
  try{j=readJson(f)}
  catch{fail('M58_AUDIO_JOURNAL_UNTRUSTED',500)}
  if(!validJob(j)||j.project_id!==id)fail('M58_AUDIO_JOURNAL_UNTRUSTED',500);
  // Do not silently retry after a crash: a started FFmpeg process might have
  // finished writing a receipt; manual reconciliation is required.
  if(['queued','running'].includes(j.status)){
   j.status='failed';j.error_code='M58_AUDIO_INTERRUPTED_REQUIRES_REVIEW';
   j.finished_at=stamp();persist(j);
  }
  latest.set(id,j);
  return j;
 }
 function trustedReceipt(id,j,release){
  const file=receiptFile(id,j.release_sha256);
  try{
   safeReceiptDir(id);
   const value=readJson(file);
   const {receipt_sha256,...record}=value;
   const report=record.report;
   if(record.schema_version!==1||record.job_id!==j.job_id||
      record.project_id!==id||record.release_id!==j.release_id||
      record.release_sha256!==j.release_sha256||
      !SHA.test(receipt_sha256??'')||digest(record)!==receipt_sha256||
      !same(j,release)||!report||
      report.project_id!==id||report.release_id!==j.release_id||
      report.release_sha256!==j.release_sha256||
      report.report_sha256!==j.report_sha256||
      !SHA.test(report.report_sha256??'')||
      digest(Object.fromEntries(Object.entries(report).filter(([k])=>k!=='report_sha256')))!==
       report.report_sha256||
      report.may_publish!==false||report.may_deploy!==false||
      report.cryptographically_signed!==false||
      report.scope!=='P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY')
    fail('M58_AUDIO_RECEIPT_UNTRUSTED');
   return value;
  }catch{fail('M58_AUDIO_RECEIPT_UNTRUSTED')}
 }
 function info(id){
  assertEnabled();requireId(id);
  const j=load(id);
  if(!j)return {project_id:id,status:'not_started',publication_allowed:false};
  if(j.status!=='completed')return {...clone(j),publication_allowed:false};
  const release=verifiedCurrent(id);
  if(!same(j,release))return {...clone(j),status:'stale',report_sha256:null,
    publication_allowed:false,error_code:'M58_AUDIO_RELEASE_STALE'};
  trustedReceipt(id,j,release);
  return {...clone(j),publication_allowed:false};
 }
 function read(id){
  const j=info(id);
  if(j.status!=='completed')return {job:j,receipt:null};
  const release=verifiedCurrent(id);
  return {job:j,receipt:trustedReceipt(id,j,release)};
 }
 async function readAsync(id){
  assertEnabled();requireId(id);
  const j=load(id);
  if(!j)return {job:{project_id:id,status:'not_started',publication_allowed:false},receipt:null};
  if(j.status!=='completed')return {job:{...clone(j),publication_allowed:false},receipt:null};
  const release=await verifiedCurrentAsync(id);
  if(!same(j,release))return {job:{...clone(j),status:'stale',
   report_sha256:null,publication_allowed:false,error_code:'M58_AUDIO_RELEASE_STALE'},
   receipt:null};
  return {job:{...clone(j),publication_allowed:false},
   receipt:trustedReceipt(id,j,release)};
 }
 async function infoAsync(id){return (await readAsync(id)).job}
 function enqueue(id,{expectedReleaseId=null,expectedReleaseSha256=null}={}){
  assertEnabled();requireId(id);
  return enqueueVerified(id,verifiedCurrent(id),{expectedReleaseId,expectedReleaseSha256});
 }
 async function enqueueAsync(id,{expectedReleaseId=null,expectedReleaseSha256=null}={}){
  assertEnabled();requireId(id);
  const release=await verifiedCurrentAsync(id);
  return enqueueVerified(id,release,{expectedReleaseId,expectedReleaseSha256});
 }
 function enqueueVerified(id,release,{expectedReleaseId=null,expectedReleaseSha256=null}={}){
  if(expectedReleaseId!==null||expectedReleaseSha256!==null){
   if(typeof expectedReleaseId!=='string'||!UUID.test(expectedReleaseId)||
      typeof expectedReleaseSha256!=='string'||!SHA.test(expectedReleaseSha256))
    fail('M58_AUDIO_EXPECTED_RELEASE_INVALID',400);
   if(release.release_id!==expectedReleaseId||
      release.manifest.output.sha256!==expectedReleaseSha256)
    fail('M58_AUDIO_EXPECTED_RELEASE_STALE',409);
  }
  const prev=load(id);
  // A project may have only one admitted job, regardless of which release
  // is current. Otherwise a new release can overwrite the old active
  // job's journal while its worker is still alive.
  if(prev&&['queued','running'].includes(prev.status)){
   if(!same(prev,release))fail('M58_AUDIO_ACTIVE_RELEASE_CONFLICT',409);
   return {...clone(prev),publication_allowed:false};
  }
  if(prev&&same(prev,release)){
   if(prev.status==='completed'){
    trustedReceipt(id,prev,release);
    return {...clone(prev),cache_hit:true,publication_allowed:false};
   }
  }
  if(pending.length>=maxPending)fail('M58_AUDIO_QUEUE_FULL',429);
  const j={schema_version:1,project_id:id,job_id:randomUUID(),
   release_id:release.release_id,release_sha256:release.manifest.output.sha256,
   status:'queued',cache_hit:false,queued_at:stamp(),publication_allowed:false};
  persist(j);latest.set(id,j);pending.push(j);
  void pump();
  return {...clone(j),publication_allowed:false};
 }
 function validateReport(j,report){
  if(report?.schema_version!==1||
     report.scope!=='P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY'||
     report.project_id!==j.project_id||report.release_id!==j.release_id||
     report.release_sha256!==j.release_sha256||
     report.may_publish!==false||report.may_deploy!==false||
     report.cryptographically_signed!==false||
     !SHA.test(report.report_sha256??'')||
     digest(Object.fromEntries(Object.entries(report).filter(([key])=>key!=='report_sha256')))!==
      report.report_sha256||
     !Array.isArray(report.decoded_master_audio?.windows)||
     report.decoded_master_audio.windows.length>200||
     report.decoded_master_audio.may_publish!==false||
     report.decoded_master_audio.may_deploy!==false)
   fail('M58_AUDIO_WORKER_REPORT_UNTRUSTED');
 }
 async function pump(){
  if(running)return;
  running=true;
  try{
   while(pending.length){
    const j=pending.shift();
    let releaseResource=()=>{};
    try{
     let live=await workerVerifiedCurrent(j.project_id);
     if(!same(j,live))fail('M58_AUDIO_RELEASE_STALE');
     releaseResource=await acquireResource({kind:'real-master-audio',id:j.project_id});
     live=await workerVerifiedCurrent(j.project_id);
     if(!same(j,live))fail('M58_AUDIO_RELEASE_STALE');
     j.status='running';j.started_at=stamp();persist(j);
     const report=await runAudit({out,projectId:j.project_id,
      releaseId:j.release_id,releaseSha:j.release_sha256});
     validateReport(j,report);
     live=await workerVerifiedCurrent(j.project_id);
     if(!same(j,live))fail('M58_AUDIO_RELEASE_STALE');
     const record={schema_version:1,job_id:j.job_id,project_id:j.project_id,
      release_id:j.release_id,release_sha256:j.release_sha256,report};
     const content={...record,receipt_sha256:digest(record)};
     const destination=receiptFile(j.project_id,j.release_sha256);
     // An existing receipt may belong to an interrupted predecessor.
     // link(2) is a single atomic no-overwrite operation: no TOCTOU gap.
     safeReceiptDir(j.project_id,{create:true});
     atomicJson(destination,content,{exclusive:true});
     j.report_sha256=report.report_sha256;
     j.receipt_sha256=content.receipt_sha256;
     j.status='completed';j.finished_at=stamp();persist(j);
    }catch(e){
     j.status='failed';j.finished_at=stamp();
     j.error_code=e?.status===429?'M58_AUDIO_SHA_BACKPRESSURE_EXHAUSTED':
      /^M58_[A-Z0-9_]{4,100}$/.test(e?.code||e?.message||'')?
       String(e.code||e.message):'M58_AUDIO_WORKER_FAILED';
     try{persist(j)}catch{/* no claim of durable success */}
    }finally{
     try{releaseResource?.()}catch{/* reviewer must inspect governor failures */}
    }
   }
  }finally{running=false}
 }
 return {enqueue,info,read,enqueueAsync,infoAsync,readAsync,
  snapshot:()=>({running,pending:pending.length,enabled,maxPending})};
}

/** M50-R01: single-process, fenced, durable pre-release QA ledger.
 * Deliberately cannot mutate P05 release or P08 approvals. Not a distributed lock.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA=/^[a-f0-9]{64}$/;
const bad=(message,status=409)=>{throw Object.assign(new Error(message),{code:message,status})};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashSecret=token=>createHash('sha256').update(token).digest('hex');
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const obj=(v,allowed)=>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))
  bad('M50_INVALID_FIELDS',400);
};
const slug=(v,what)=>{if(typeof v!=='string'||!ID.test(v))bad('M50_INVALID_'+what,400);return v};
function atomic(file,record){
 const tmp=file+'.'+randomUUID()+'.tmp';
 fs.mkdirSync(path.dirname(file),{recursive:true});
 try{fs.writeFileSync(tmp,JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
}
export function fencedJobLedger({root,getDeck,versions,enabled=false,clock=()=>Date.now(),leaseMs=300000}){
 if(!integer(leaseMs)||leaseMs<1000||leaseMs>3600000)bad('M50_INVALID_LEASE_MS',422);
 const active=()=>{if(!enabled)bad('M50_DISABLED',501)};
 const stamp=()=>{const t=clock();if(!integer(t))bad('M50_INVALID_TIME',500);return t};
 function file(id,scene,job){
  slug(id,'PROJECT');slug(scene,'SCENE');slug(job,'JOB');
  const deck=getDeck(id);
  if(!deck.slides?.some(s=>s.id===scene))bad('M50_SCENE_MISSING',404);
  for(const dir of [root,path.join(root,id),path.join(root,id,'.job-ledger')]){
   const s=fs.lstatSync(dir,{throwIfNoEntry:false});
   if(s&&(s.isSymbolicLink()||!s.isDirectory()))bad('M50_UNSAFE_DIRECTORY',403);
  }
  const f=path.join(root,id,'.job-ledger',digest({id,scene,job})+'.json');
  const st=fs.lstatSync(f,{throwIfNoEntry:false});
  if(st&&(st.isSymbolicLink()||!st.isFile()||st.nlink!==1||st.size>16384))
   bad('M50_UNSAFE_JOURNAL',403);
  return f;
 }
 function readRaw(id,scene,job){
  const f=file(id,scene,job);
  if(!fs.existsSync(f))return null;
  let record;try{record=JSON.parse(fs.readFileSync(f,'utf8'))}catch{bad('M50_CORRUPTED_JOURNAL',500)}
  const {checksum,...data}=record??{};
  if(!SHA.test(checksum??'')||digest(data)!==checksum||
   data.schema_version!==1||data.project_id!==id||data.scene_id!==scene||data.job_id!==job||
   !SHA.test(data.source_sha256??'')||!ID.test(data.version_id??'')||
   !integer(data.revision)||!integer(data.fence)||!integer(data.expires_at)||
   !['QUEUED','LEASED','VERIFIED_FOR_REVIEW','CANCELLED'].includes(data.state)||
   !Array.isArray(data.receipts)||data.receipts.length>32)
    bad('M50_CORRUPTED_JOURNAL',500);
  return data;
 }
 function save(id,scene,job,data){
  if(data.receipts.length>32)bad('M50_RECEIPT_LIMIT',422);
  atomic(file(id,scene,job),{...data,checksum:digest(data)});
 }
 function approval(id,scene,version,sha){
  if(!versions?.approved)bad('M50_P08_VERIFIER_REQUIRED',501);
  const p=versions.approved(id,scene); // P08 verified() hashes real immutable MP4.
  if(p.version_id!==version||p.artifact?.sha256!==sha||p.artifact?.qa?.verdict!=='PASS')
   bad('M50_P08_SOURCE_STALE',409);
  return p;
 }
 const safe=record=>{
  const v=structuredClone(record);
  delete v.token_sha256;
  delete v.checksum;
  return v;
 };
 function read(id,scene,job){
  active();const d=readRaw(id,scene,job);
  if(!d)bad('M50_JOB_NOT_FOUND',404);
  return {...safe(d),
   recoverable:d.state==='LEASED'&&stamp()>=d.expires_at,
   needs_reverification:d.state!=='CANCELLED'&&
    (()=>{try{approval(id,scene,d.version_id,d.source_sha256);return false}catch{return true}})(),
   may_publish:false};
 }
 function begin(id,scene,actor,args){
  active();if(actor?.role!=='director')bad('M50_DIRECTOR_REQUIRED',403);
  obj(args,['job_id','request_id','source_sha256','version_id']);
  const job=slug(args.job_id,'JOB'),request=slug(args.request_id,'REQUEST');
  if(!SHA.test(args.source_sha256??''))bad('M50_INVALID_SHA',400);
  slug(args.version_id,'VERSION');
  const p=approval(id,scene,args.version_id,args.source_sha256);
  const old=readRaw(id,scene,job);
  if(old){
   if(old.request_id!==request||old.source_sha256!==args.source_sha256||
    old.version_id!==args.version_id)bad('M50_IDEMPOTENCY_CONFLICT');
   return read(id,scene,job);
  }
  const d={schema_version:1,project_id:id,scene_id:scene,job_id:job,
   request_id:request,source_sha256:args.source_sha256,version_id:args.version_id,
   approval_revision:p.revision,state:'QUEUED',revision:1,fence:0,expires_at:0,
   token_sha256:null,receipts:[],created_ms:stamp(),updated_ms:stamp()};
  save(id,scene,job,d);
  return read(id,scene,job);
 }
 function claim(id,scene,job,actor,expectedRevision){
  active();if(!actor||!['director','worker'].includes(actor.role))bad('M50_ACTOR_INVALID',403);
  const d=readRaw(id,scene,job);
  if(!d)bad('M50_JOB_NOT_FOUND',404);
  if(!integer(expectedRevision)||d.revision!==expectedRevision)bad('M50_CAS_CONFLICT');
  if(d.state==='CANCELLED'||d.state==='VERIFIED_FOR_REVIEW')bad('M50_JOB_TERMINAL');
  const now=stamp();
  if(d.state==='LEASED'&&now<d.expires_at)bad('M50_LEASE_IN_USE');
  approval(id,scene,d.version_id,d.source_sha256);
  if(d.fence>=Number.MAX_SAFE_INTEGER)bad('M50_FENCE_EXHAUSTED',500);
  const token=randomBytes(24).toString('hex');
  d.fence++;d.revision++;d.state='LEASED';
  d.token_sha256=hashSecret(token);d.expires_at=now+leaseMs;
  d.assignee=actor.id;d.updated_ms=now;
  save(id,scene,job,d);
  return {...read(id,scene,job),lease_token:token};
 }
 function guard(d,actor,args){
  if(d.state!=='LEASED')bad('M50_NOT_LEASED');
  if(!actor||actor.id!==d.assignee||!['director','worker'].includes(actor.role))
   bad('M50_ASSIGNEE_MISMATCH',403);
  if(!integer(args.fence)||args.fence!==d.fence||
   typeof args.lease_token!=='string'||args.lease_token.length!==48||
   hashSecret(args.lease_token)!==d.token_sha256)bad('M50_INVALID_FENCE',403);
  if(stamp()>=d.expires_at)bad('M50_LEASE_EXPIRED');
 }
 function heartbeat(id,scene,job,actor,args){
  active();obj(args,['expected_revision','fence','lease_token']);
  const d=readRaw(id,scene,job);if(!d)bad('M50_JOB_NOT_FOUND',404);
  if(!integer(args.expected_revision)||d.revision!==args.expected_revision)bad('M50_CAS_CONFLICT');
  guard(d,actor,args);
  d.revision++;d.expires_at=stamp()+leaseMs;d.updated_ms=stamp();
  save(id,scene,job,d);return read(id,scene,job);
 }
 function verify(id,scene,job,actor,args){
  active();obj(args,['expected_revision','fence','lease_token','operation_id','evidence_sha256']);
  const d=readRaw(id,scene,job);if(!d)bad('M50_JOB_NOT_FOUND',404);
  slug(args.operation_id,'OPERATION');
  if(!SHA.test(args.evidence_sha256??''))bad('M50_INVALID_EVIDENCE_SHA',400);
  const receipt=d.receipts.find(x=>x.operation_id===args.operation_id);
  // Idempotent replay returns same recorded result, not a second side effect.
  if(receipt){
   if(receipt.evidence_sha256!==args.evidence_sha256)bad('M50_OPERATION_REPLAY_CONFLICT');
   if(actor?.id!==d.assignee||args.fence!==receipt.fence||
    typeof args.lease_token!=='string'||args.lease_token.length!==48||
    hashSecret(args.lease_token)!==receipt.token_sha256)bad('M50_INVALID_FENCE',403);
   return read(id,scene,job);
  }
  if(!integer(args.expected_revision)||d.revision!==args.expected_revision)bad('M50_CAS_CONFLICT');
  guard(d,actor,args);
  const p=approval(id,scene,d.version_id,d.source_sha256);
  if(args.evidence_sha256!==p.artifact.sha256)bad('M50_EVIDENCE_MISMATCH',422);
  d.receipts.push({operation_id:args.operation_id,evidence_sha256:args.evidence_sha256,
   fence:d.fence,approved_revision:p.revision,token_sha256:d.token_sha256});
  d.revision++;d.updated_ms=stamp();d.state='VERIFIED_FOR_REVIEW';d.expires_at=0;
  d.token_sha256=null;
  save(id,scene,job,d);
  return read(id,scene,job);
 }
 function cancel(id,scene,job,actor,expectedRevision){
  active();if(actor?.role!=='director')bad('M50_DIRECTOR_REQUIRED',403);
  const d=readRaw(id,scene,job);if(!d)bad('M50_JOB_NOT_FOUND',404);
  if(!integer(expectedRevision)||d.revision!==expectedRevision)bad('M50_CAS_CONFLICT');
  if(d.state==='VERIFIED_FOR_REVIEW')bad('M50_NO_CANCEL_AFTER_QA');
  if(d.state==='CANCELLED')return read(id,scene,job);
  d.state='CANCELLED';d.revision++;d.updated_ms=stamp();d.token_sha256=null;d.expires_at=0;
  save(id,scene,job,d);return read(id,scene,job);
 }
 return {begin,read,claim,heartbeat,verify,cancel};
}

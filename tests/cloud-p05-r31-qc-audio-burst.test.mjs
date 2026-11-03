import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {qcCockpitService} from '../server/qc-cockpit.mjs';
import {realMasterAudioQueue} from '../server/real-master-audio-queue.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>hash(JSON.stringify(x));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentile=(values,p)=>{
 const ordered=[...values].sort((a,b)=>a-b);
 return Math.round(ordered[Math.ceil(p*ordered.length)-1]*10)/10;
};
async function freePort(){
 const server=net.createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const value=server.address().port;
 await new Promise(resolve=>server.close(resolve));return value;
}
function fixture(root,project,bytes=24*1024*1024){
 const rid=randomUUID(),dir=path.join(root,'out','releases',project,rid);
 fs.mkdirSync(dir,{recursive:true});
 const master=path.join(dir,'final.mp4'),buffer=Buffer.alloc(bytes,0x5c);
 fs.writeFileSync(master,buffer);
 const sha=hash(buffer);
 const manifest={schemaVersion:1,project,release_id:rid,target_fps:24,
  scenes:[{id:'s01',duration:1.2,sha256:'1'.repeat(64),
   approved_version_id:'v1',transition_after:{type:'hard-cut',duration:0}},
  {id:'s02',duration:1.2,sha256:'2'.repeat(64),
   approved_version_id:'v2',transition_after:{type:'hard-cut',duration:0}}],
  output:{sha256:sha,bytes,qa:{verdict:'PASS',issues:[],
   metadata:{duration:2.4}}}};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,'out','releases',project,'current.json'),
  JSON.stringify({release_id:rid}));
 return {rid,sha,master,bytes};
}
function syntheticUnsignedAudit({projectId,releaseId,releaseSha}){
 // This is synthetic test data, NOT actual decoded audio or approval.
 const rec={schema_version:1,scope:'P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY',
  project_id:projectId,release_id:releaseId,release_sha256:releaseSha,
  cryptographically_signed:false,may_publish:false,may_deploy:false,
  manual_review_required:false,
  decoded_master_audio:{
   scope:'REAL_MP4_DECODED_48K_STEREO_RISK_SCREEN',
   audio_duration_sec:2.4,audio_video_pts_alignment_verified:false,
   windows:[],issues:[],manual_audio_review_required:false,
   may_publish:false,may_deploy:false}};
 return {...rec,report_sha256:digest(rec)};
}

test('P05-R31 audio and QC read paths preserve client cancellation but not ordinary bad receipt',{
 timeout:9000,
},async()=>{
 const controller=new AbortController();
 const released={release_id:randomUUID(),manifest:{schemaVersion:1,project:'unit',
  release_id:null,target_fps:24,scenes:[{id:'s01',sha256:'1'.repeat(64),duration:1.2},
   {id:'s02',sha256:'2'.repeat(64),duration:1.2}],
  output:{sha256:'a'.repeat(64),qa:{verdict:'PASS',issues:[],metadata:{duration:2.4}}}}};
 released.manifest.release_id=released.release_id;
 let seen=0;
 const assembly={current:()=>released,download:()=>'/mock',
  async currentAsync(id,{signal}={}){
   seen++;
   assert.equal(id,'unit');
   assert.equal(signal,controller.signal);
   if(signal.aborted)throw Object.assign(Error('P05_SHA_REQUEST_ABORTED'),{status:499});
   return released;
  }};
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r31-unit-'));
 try{
  const q=realMasterAudioQueue({out,assembly,enabled:true,
   runAudit:async args=>syntheticUnsignedAudit(args)});
  const reviews={list:()=>({revision:0,items:[]})};
  const qc=qcCockpitService({assembly,reviews,enabled:true,
   realAudioReadAsync:(id,options)=>q.readAsync(id,options)});
  // Not-started audio doesn't need SHA; an aborted HTTP request must
  // still be rejected rather than rendered as a fresh response.
  controller.abort();
  await assert.rejects(()=>q.readAsync('unit',{signal:controller.signal}),
   e=>e?.status===499);
  await assert.rejects(()=>qc.readAsync('unit',{signal:controller.signal}),
   e=>e?.status===499);
  assert.equal(seen,0);
  const inFlight=new AbortController();
  let nestedSignal=null;
  const nested=qcCockpitService({assembly:{
   currentAsync:async()=>released
  },reviews,enabled:true,realAudioReadAsync:async(id,{signal})=>{
   nestedSignal=signal;
   throw Object.assign(Error('P05_SHA_REQUEST_ABORTED'),{status:499});
  }});
  await assert.rejects(()=>nested.readAsync('unit',{signal:inFlight.signal}),
   e=>e?.status===499,'nested audio cancellation cannot become a false INVALID');
  assert.equal(nestedSignal,inFlight.signal);
 }finally{fs.rmSync(out,{recursive:true,force:true})}
});

test('P05-R31 protected QC plus completed audio mixed burst is bounded and recovers from disconnect',{
 timeout:120000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r31-qc-burst-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const project='r31-qc-audio',token=randomBytes(24).toString('hex');
 const user='qc-owner',password='synthetic-only-strong-password-012345';
 const basic='Basic '+Buffer.from(user+':'+password).toString('base64');
 let child=null,logs='';
 try{
  child=spawn(process.execPath,['server/cloud.mjs'],{
   cwd:process.cwd(),stdio:['ignore','pipe','pipe'],env:{...process.env,
    PORT:String(port),PB_DATA_DIR:root,MCP_API_KEY:token,
    PB_WEB_USER:user,PB_WEB_PASSWORD:password,
    PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:'1'}});
  child.stdout.on('data',b=>logs+=b.toString());
  child.stderr.on('data',b=>logs+=b.toString());
  let ready=false;
  for(let i=0;i<110;i++){
   if(child.exitCode!==null)throw Error('P05_R31_SERVER_EXIT '+logs.slice(-1500));
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(900)})).ok){
    ready=true;break}}catch{}
   await sleep(80);
  }
  assert.equal(ready,true,logs.slice(-1400));
  const rpc=await fetch(base+'/mcp',{method:'POST',headers:{
   Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'create_deck',arguments:{
     id:project,title:'R31 QC synthetic only',
     text:'First. Second.',style:'paper',slide_count:2,target:8}}}),
   signal:AbortSignal.timeout(8000)});
  assert.equal(rpc.status,200);
  assert.equal((await rpc.json()).result?.isError,false);

  const f=fixture(root,project);
  // Prepare a private, unsigned, mock-worker receipt with the actual
  // queue's own validation/persistence implementation. No real decode.
  const assembly=assemblyService({out:path.join(root,'out'),
   baseUrl:()=>base,getDeck:()=>({id:project}),getRender:()=>({}),
   getTask:()=>({}),getPlan:()=>({}),getStyle:()=>({})});
  let workerRuns=0;
  const queue=realMasterAudioQueue({out:path.join(root,'out'),
   assembly,enabled:true,runAudit:async args=>{
    workerRuns++;return syntheticUnsignedAudit(args);
   }});
  const queued=await queue.enqueueAsync(project,{
   expectedReleaseId:f.rid,expectedReleaseSha256:f.sha});
  assert.equal(queued.status,'queued');
  let complete=false;
  for(let i=0;i<140;i++){
   const job=await queue.infoAsync(project);
   if(job.status==='completed'){complete=true;break}
   if(job.status==='failed')throw Error('MOCK_QUEUE_FAILED '+JSON.stringify(job));
   await sleep(35);
  }
  assert.equal(complete,true,'mock fixture must be durably completed');
  assert.equal(workerRuns,1,'receipt is produced once by isolated mock');
  const audioEvidence=await queue.readAsync(project);
  assert.equal(audioEvidence.receipt.report.cryptographically_signed,false);
  assert.equal(audioEvidence.receipt.report.may_publish,false);
  assert.deepEqual(assembly.verificationSnapshot(),
   {capacity:2,active:0,waiting:0});
  const jobFile=path.join(root,'out','audio-audit-jobs',project+'.json');
  const receiptFile=path.join(root,'out','audio-audit-receipts',project,f.sha+'.json');
  const previousJob=hash(fs.readFileSync(jobFile));
  const previousReceipt=hash(fs.readFileSync(receiptFile));
  const qc='/api/decks/'+project+'/qc-cockpit';
  const audit='/api/decks/'+project+'/audio-audit';
  const payload=JSON.stringify({release_id:f.rid,release_sha256:f.sha});
  const call=(kind,{signal}={})=>fetch(base+(kind==='qc'?qc:audit),{
   method:kind==='post'?'POST':'GET',signal:signal??AbortSignal.timeout(20000),
   headers:{Authorization:basic,...(kind==='post'?{'Content-Type':'application/json'}:{})},
   ...(kind==='post'?{body:payload}:{})});
  const missing=await fetch(base+qc);
  assert.equal(missing.status,401);

  const checks=Array.from({length:36},(_,i)=>['qc','audio','post'][i%3]);
  const health=[],latencies=[];let probing=true;
  const probe=(async()=>{
   while(probing){
    const start=performance.now(),r=await fetch(base+'/health',{
     signal:AbortSignal.timeout(5000)});
    assert.equal(r.status,200);
    health.push(performance.now()-start);
    await sleep(25);
   }
  })();
  const started=performance.now();
  const outcomes=await Promise.all(checks.map(async kind=>{
   const start=performance.now();
   const response=await call(kind);
   const elapsed=performance.now()-start;latencies.push(elapsed);
   const status=response.status,body=await response.json();
   if(status===429){
    assert.match(response.headers.get('retry-after')??'',/^[1-9][0-9]*$/);
    assert.ok(['Resource queue is full','P05_VERIFICATION_RATE_LIMITED'].includes(body.error),
     JSON.stringify(body));
    return {kind,status};
   }
   assert.equal(status,kind==='post'?202:200,kind+': '+JSON.stringify(body).slice(0,360));
   if(kind==='qc'){
    assert.equal(body.release_sha256,f.sha);
    assert.equal(body.real_audio_review.state,'COMPLETED_REVIEW_ONLY');
    assert.equal(body.publication_allowed,false);
   }else if(kind==='audio'){
    assert.equal(body.receipt.report.release_sha256,f.sha);
    assert.equal(body.receipt.report.may_publish,false);
   }else{
    assert.equal(body.cache_hit,true,'concurrent POST may only hit prior immutable receipt');
    assert.equal(body.publication_allowed,false);
   }
   return {kind,status};
  }));
  probing=false;await probe;
  const accepted=outcomes.filter(x=>x.status!==429).length;
  const denied=outcomes.length-accepted;
  assert.ok(accepted>=1);
  assert.ok(denied>=1,'36 concurrent full SHA calls should overflow 2+12 budget');
  assert.ok(health.length>=1,'unrelated health must remain responsive');
  console.log('P05_R31_QC_AUDIO_BURST_METRICS '+JSON.stringify({
   kind:'synthetic-isolated-CI-not-production',
   bytes:f.bytes,concurrent:checks.length,success:accepted,http_429:denied,
   qc_success:outcomes.filter(x=>x.kind==='qc'&&x.status===200).length,
   audio_success:outcomes.filter(x=>x.kind==='audio'&&x.status===200).length,
   post_cache_hits:outcomes.filter(x=>x.kind==='post'&&x.status===202).length,
   request_p95_ms:Math.round(percentile(latencies,.95)*10)/10,
   health_p95_ms:percentile(health,.95),health_max_ms:Math.round(Math.max(...health)),
   elapsed_ms:Math.round(performance.now()-started)}));
  // Disconnect pending verification reads; all future reads must still
  // verify master SHA and never corrupt the durable audio receipt.
  const cancelled=Array.from({length:18},(_,i)=>{
   const controller=new AbortController();
   const request=call(i%2===0?'qc':'audio',{signal:controller.signal})
    .then(r=>r.arrayBuffer()).catch(e=>e);
   return {controller,request};
  });
  await sleep(10);
  for(const entry of cancelled)entry.controller.abort();
  await Promise.all(cancelled.map(x=>x.request));
  let recovered=false;
  for(let i=0;i<75;i++){
   const result=await call('qc');
   if(result.status===200){
    assert.equal((await result.json()).release_sha256,f.sha);
    recovered=true;break;
   }
   assert.equal(result.status,429);
   await sleep(65);
  }
  assert.equal(recovered,true,'QC must recover after abandoned SHA reads');
  const restored=await call('audio');
  assert.equal(restored.status,200);
  assert.equal((await restored.json()).receipt.report.release_sha256,f.sha);
  assert.equal(hash(fs.readFileSync(jobFile)),previousJob);
  assert.equal(hash(fs.readFileSync(receiptFile)),previousReceipt);
  assert.equal(workerRuns,1,'HTTP cannot replay isolated worker');

  fs.appendFileSync(f.master,'tamper');
  const brokenAudio=await call('audio');
  assert.equal(brokenAudio.status,409);
  assert.equal((await brokenAudio.json()).error,'M58_AUDIO_NO_VERIFIED_CURRENT_RELEASE');
  const brokenQc=await call('qc');
  assert.equal(brokenQc.status,409);
  assert.equal((await brokenQc.json()).error,'M51_NO_VERIFIED_RELEASE');
  const brokenPost=await call('post');
  assert.equal(brokenPost.status,409);
  assert.equal(hash(fs.readFileSync(receiptFile)),previousReceipt,
   'tamper can never rewrite an accepted unsigned receipt');
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{
  if(child){
   child.kill('SIGTERM');
   await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1700)]);
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  }
  fs.rmSync(root,{recursive:true,force:true});
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';

const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ready=['ffmpeg','ffprobe'].every(x=>
 spawnSync(x,['-version'],{stdio:'ignore',timeout:4000}).status===0);
async function freePort(){
 const s=net.createServer();
 await new Promise(ok=>s.listen(0,'127.0.0.1',ok));
 const p=s.address().port;await new Promise(ok=>s.close(ok));return p;
}
async function withServer({flag='1'}={},fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r22-http-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const basic='Basic '+Buffer.from('owner:strong-audio-wire-password-123').toString('base64');
 const mcpKey=randomBytes(24).toString('hex');
 const child=spawn(process.execPath,['server/cloud.mjs'],{
  cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(port),PB_DATA_DIR:root,
   MCP_API_KEY:mcpKey,PB_WEB_USER:'owner',
   PB_WEB_PASSWORD:'strong-audio-wire-password-123',
   PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:flag},
 });
 let logs='';child.stdout.on('data',b=>logs+=b.toString());
 child.stderr.on('data',b=>logs+=b.toString());
 const request=async(uri,config={})=>{
  const response=await fetch(base+uri,{...config,signal:AbortSignal.timeout(7000)});
  return {status:response.status,body:await response.json().catch(()=>null)};
 };
 const rpc=(name,args)=>request('/mcp',{method:'POST',
  headers:{Authorization:'Bearer '+mcpKey,'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
   params:{name,arguments:args}})});
 const project='qc-audio-demo';
 try{
  let opened=false;
  for(let i=0;i<80;i++){
   if(child.exitCode!==null)throw Error(logs);
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(750)})).ok){
    opened=true;break;
   }}catch{}
   await sleep(100);
  }
  assert.ok(opened,logs);
  const created=await rpc('create_deck',{id:project,title:'Audio API',text:'First. Second.',
   style:'paper',slide_count:2,target:8});
  assert.equal(created.body?.result?.isError,false,JSON.stringify(created));
  await fn({root,project,basic,mcpKey,request});
 }finally{
  if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');
   await Promise.race([new Promise(ok=>child.once('exit',ok)),sleep(2000)]);
  }
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  fs.rmSync(root,{force:true,recursive:true});
 }
}
const route='/api/decks/qc-audio-demo/audio-audit';
const readReq=auth=>({headers:{Authorization:auth}});
const writeReq=(auth,body,extra={})=>({method:'POST',
 headers:{Authorization:auth,'Content-Type':'application/json',...extra},
 body:JSON.stringify(body)});
test('M58-R22 protected REST audio-audit read is never implicit enqueue; disabled flag blocks',{
 timeout:25000,
},async()=>{
 await withServer({flag:'1'},async({root,basic,mcpKey,request})=>{
  assert.equal((await request(route)).status,401);
  assert.equal((await request(route,readReq('Bearer '+mcpKey))).status,401);
  assert.equal((await request(route,writeReq('Bearer '+mcpKey,{}))).status,401);
  const empty=await request(route,readReq(basic));
  assert.equal(empty.status,200,JSON.stringify(empty));
  assert.equal(empty.body.job.status,'not_started');
  assert.equal(empty.body.receipt,null);
  assert.equal(fs.existsSync(path.join(root,'out','audio-audit-jobs')),false,
   'GET must not cause an async FFmpeg job');
  assert.equal((await request(route,{method:'PUT',headers:{Authorization:basic}})).status,405);
  assert.equal((await request(route,writeReq(basic,{}))).status,400);
  assert.equal((await request(route,writeReq(basic,{
   release_id:'00000000-0000-0000-0000-000000000123',
   release_sha256:'a'.repeat(64),file:'/tmp/forbidden.mp4',
  }))).status,400);
  assert.equal((await request(route,writeReq(basic,{
   release_id:'00000000-0000-0000-0000-000000000123',
   release_sha256:'a'.repeat(64),
  },{Origin:'https://untrusted.invalid'}))).status,403);
  assert.equal((await request(route,writeReq(basic,{
   release_id:'00000000-0000-0000-0000-000000000123',
   release_sha256:'a'.repeat(64),
  },{'Sec-Fetch-Site':'cross-site'}))).status,403);
  const notReady=await request(route,writeReq(basic,{
   release_id:'00000000-0000-0000-0000-000000000123',
   release_sha256:'a'.repeat(64)}));
  assert.equal(notReady.status,409);
  assert.equal(notReady.body.error,'M58_AUDIO_NO_VERIFIED_CURRENT_RELEASE');
  assert.equal(fs.existsSync(path.join(root,'out','audio-audit-jobs')),false);
 });
 await withServer({flag:'0'},async({basic,request})=>{
  assert.equal((await request(route,readReq(basic))).status,501);
  assert.equal((await request(route,writeReq(basic,{}))).status,501);
 });
});
test('M58-R22 authorized explicit POST enqueues real P05 MP4, read-only QC shows receipt',{
 timeout:120000,skip:!ready,
},async()=>{
 await withServer({flag:'1'},async({root,project,basic,request})=>{
  const rid=randomUUID();
  const releaseDir=path.join(root,'out','releases',project,rid);
  fs.mkdirSync(releaseDir,{recursive:true});
  const pcmFile=path.join(root,'signal.pcm');
  const mp4=path.join(releaseDir,'final.mp4');
  const pcm=Buffer.alloc(48000*2.4*4);
  for(let i=0;i<pcm.length/4;i++){
   const t=i/48000,w=Math.round(.16*32767*Math.sin(2*Math.PI*320*t));
   pcm.writeInt16LE(w,i*4);
   pcm.writeInt16LE(t>=.6&&t<1.5?-w:w,i*4+2);
  }
  fs.writeFileSync(pcmFile,pcm);
  const enc=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y',
   '-f','s16le','-ar','48000','-ac','2','-i',pcmFile,
   '-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=2.4',
   '-map','1:v:0','-map','0:a:0','-t','2.4',
   '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
   '-c:a','aac','-b:a','160k',mp4],
   {timeout:40000,encoding:'utf8'});
  assert.equal(enc.status,0,String(enc.stderr).slice(-500));
  fs.rmSync(pcmFile);
  const sha=digest(mp4),manifest={schemaVersion:1,project,release_id:rid,
   target_fps:24,scenes:[
    {id:'s01',duration:1.2,sha256:'1'.repeat(64),approved_version_id:'v1',
     transition_after:{type:'hard-cut',duration:0}},
    {id:'s02',duration:1.2,sha256:'2'.repeat(64),approved_version_id:'v2',
     transition_after:{type:'hard-cut',duration:0}}],
   output:{sha256:sha,bytes:fs.statSync(mp4).size,
    qa:{verdict:'PASS',issues:[],metadata:{duration:2.4}}}};
  fs.writeFileSync(path.join(releaseDir,'manifest.json'),JSON.stringify(manifest));
  fs.writeFileSync(path.join(root,'out','releases',project,'current.json'),
   JSON.stringify({release_id:rid}));
  const before=await request('/api/decks/'+project+'/qc-cockpit',readReq(basic));
  assert.equal(before.status,200,JSON.stringify(before));
  assert.equal(before.body.real_audio_review.state,'NOT_STARTED');
  assert.equal(before.body.m58_audio_review.state,'NOT_CONNECTED');
  assert.equal(before.body.publication_allowed,false);
  const bad=await request(route,writeReq(basic,{release_id:rid,release_sha256:'3'.repeat(64)}));
  assert.equal(bad.status,409,JSON.stringify(bad));
  assert.equal(bad.body.error,'M58_AUDIO_EXPECTED_RELEASE_STALE');
  const started=await request(route,writeReq(basic,{release_id:rid,release_sha256:sha}));
  assert.equal(started.status,202,JSON.stringify(started));
  assert.equal(started.body.release_sha256,sha);
  let result=null;
  for(let i=0;i<150;i++){
   result=await request(route,readReq(basic));
   if(result.body.job?.status==='completed'||result.body.job?.status==='failed')break;
   await sleep(120);
  }
  assert.equal(result.body.job.status,'completed',JSON.stringify(result).slice(0,800));
  assert.equal(result.body.receipt.report.release_sha256,sha);
  assert.equal(result.body.receipt.report.may_publish,false);
  const ui=await request('/api/decks/'+project+'/qc-cockpit',readReq(basic));
  assert.equal(ui.status,200,JSON.stringify(ui).slice(0,800));
  assert.equal(ui.body.real_audio_review.state,'COMPLETED_REVIEW_ONLY');
  assert.equal(ui.body.real_audio_review.release_sha256,sha);
  assert.equal(ui.body.real_audio_review.publication_allowed,false);
  assert.equal(ui.body.real_audio_review.verified_video_pts,false);
  assert.equal(ui.body.events.length,0,'technical issues must not enter human P07 review');
  assert.ok(ui.body.real_audio_review.findings.some(x=>
   x.issue_code==='POSSIBLE_MONO_FOLD_DOWN_CANCELLATION'));
  const dup=await request(route,writeReq(basic,{release_id:rid,release_sha256:sha}));
  assert.equal(dup.status,202);
  assert.equal(dup.body.cache_hit,true);
 });
});

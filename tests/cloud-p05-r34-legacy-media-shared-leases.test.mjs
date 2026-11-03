import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';

const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const sha=x=>createHash('sha256').update(x).digest('hex');
async function freePort(){
 const s=net.createServer();
 await new Promise(ok=>s.listen(0,'127.0.0.1',ok));
 const port=s.address().port;
 await new Promise(ok=>s.close(ok));return port;
}
function createP05(root,id){
 const rid=randomUUID(),dir=path.join(root,'out','releases',id,rid);
 fs.mkdirSync(dir,{recursive:true});
 const bytes=24*1024*1024,buffer=Buffer.alloc(bytes,0x61),hash=sha(buffer);
 fs.writeFileSync(path.join(dir,'final.mp4'),buffer);
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({
  schemaVersion:1,project:id,release_id:rid,target_fps:24,
  scenes:[{id:'s01',sha256:'1'.repeat(64),duration:1.2},
   {id:'s02',sha256:'2'.repeat(64),duration:1.2}],
  output:{sha256:hash,bytes,qa:{verdict:'PASS',issues:[],
   metadata:{duration:2.4}}}}));
 fs.writeFileSync(path.join(root,'out','releases',id,'current.json'),
  JSON.stringify({release_id:rid}));
 return {rid,bytes,hash};
}
test('P05-R34 eight retained media FDs are shared across exports, voice and SHA-verified P05; abort, 416, HEAD and nofollow recover',{
 timeout:120000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r34-shared-media-'));
 const p=await freePort(),base='http://127.0.0.1:'+p,id='r34-shared';
 const user='stream-tester',pass='synthetic-only-password-0123456789';
 const basic='Basic '+Buffer.from(user+':'+pass).toString('base64');
 const token=randomBytes(24).toString('hex');
 const bytes=24*1024*1024;
 let child=null,logs='';const held=[];
 const close=entry=>{entry.response.destroy();entry.request.destroy()};
 const request=(uri,options={})=>fetch(base+uri,{
  ...options,headers:{Authorization:basic,...options.headers},
  signal:options.signal??AbortSignal.timeout(15000)});
 const hold=uri=>new Promise((resolve,reject)=>{
  const req=http.get(base+uri,{headers:{Authorization:basic}},response=>{
   response.pause();
   resolve({request:req,response,uri});
  });
  req.once('error',reject);
  req.setTimeout(20000,()=>req.destroy(Error('R34_PAUSED_SOCKET_TIMEOUT')));
 });
 const rpc=(name,args)=>fetch(base+'/mcp',{method:'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
   params:{name,arguments:args}}}),
  signal:AbortSignal.timeout(10000)});
 try{
  child=spawn(process.execPath,['server/cloud.mjs'],{
   cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
   env:{...process.env,PORT:String(p),PB_DATA_DIR:root,MCP_API_KEY:token,
    PB_WEB_USER:user,PB_WEB_PASSWORD:pass,
    PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:'0'}});
  child.stdout.on('data',b=>logs+=b.toString());
  child.stderr.on('data',b=>logs+=b.toString());
  let ready=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('R34_SERVER_EXIT '+logs.slice(-1200));
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(800)})).ok){
    ready=true;break}}catch{}
   await sleep(90);
  }
  assert.equal(ready,true,logs.slice(-1200));
  const created=await rpc('create_deck',{id,title:'Shared media lease regression',
   text:'First. Second.',style:'paper',slide_count:2,target:8});
  assert.equal(created.status,200);
  assert.equal((await created.json()).result.isError,false);

  const p05=createP05(root,id);
  const exportFile=path.join(root,'out','r34_export.mp4');
  const voiceFile=path.join(root,'decks',id,'voice.wav');
  fs.mkdirSync(path.dirname(voiceFile),{recursive:true});
  // Test byte patterns are not real decoded audiovisual content.
  fs.writeFileSync(exportFile,Buffer.alloc(bytes,0x62));
  fs.writeFileSync(voiceFile,Buffer.alloc(bytes,0x63));
  const exportUri='/out/r34_export.mp4',
   voiceUri='/src/decks/'+id+'/voice.wav',
   p05Uri='/api/decks/'+id+'/assembly/releases/'+p05.rid+'/final.mp4';

  assert.equal((await fetch(base+exportUri)).status,401);
  assert.equal((await fetch(base+voiceUri)).status,401);
  assert.equal((await request(exportUri,{method:'POST'})).status,405);
  assert.equal((await request(voiceUri,{method:'POST'})).status,405);

  // A mixed set of eight concurrent *paused* GETs must saturate the
  // SAME budget. Using only R33 / P05 releases would miss this bypass.
  for(const uri of [exportUri,voiceUri,p05Uri,exportUri,voiceUri,p05Uri,exportUri,voiceUri]){
   const active=await hold(uri);
   assert.equal(active.response.statusCode,200,uri);
   assert.equal(active.response.headers['content-length'],String(bytes));
   held.push(active);
  }
  for(const uri of [exportUri,voiceUri,p05Uri]){
   const rejected=await request(uri,{headers:{Range:'bytes=0-7'}});
   assert.equal(rejected.status,429,'legacy and verified media must share all 8 slots: '+uri);
   assert.equal((await rejected.json()).error,'Resource queue is full');
   assert.match(rejected.headers.get('retry-after')??'',/^[1-9][0-9]*$/);
   const head=await request(uri,{method:'HEAD'});
   assert.equal(head.status,200,'HEAD must not retain long-lived media FD: '+uri);
   assert.equal(head.headers.get('content-length'),String(bytes));
  }
  assert.equal((await fetch(base+'/health')).status,200,
   'eight stalled media readers must not block health');

  // Disconnect a legacy voice reader; verify that a P05 SHA-verified
  // Range download can immediately acquire the formerly held slot.
  const firstVoice=held.findIndex(entry=>entry.uri===voiceUri);
  close(held.splice(firstVoice,1)[0]);
  let range=null;
  for(let i=0;i<22;i++){
   const r=await request(p05Uri,{headers:{Range:'bytes=0-63'}});
   if(r.status===206){range=r;break}
   assert.equal(r.status,429);
   await sleep(70);
  }
  assert.ok(range,'abandoned voice download must free a shared stream slot');
  assert.equal(range.headers.get('content-range'),'bytes 0-63/'+bytes);
  assert.equal((await range.arrayBuffer()).byteLength,64);

  // Aborted export and P05 streams must free remaining slots.
  held.splice(0).forEach(close);
  await sleep(140);
  for(const uri of [exportUri,voiceUri,p05Uri]){
   const r=await request(uri,{headers:{Range:'bytes=0-31'}});
   assert.equal(r.status,206,'all 3 media families recover after abort: '+uri);
   assert.equal((await r.arrayBuffer()).byteLength,32);
  }

  // A nonexistent / symlinked final component cannot escape to another
  // file. The verified R33 path has separate SHA+manifest requirements.
  const outside=path.join(root,'outside-secret-should-never-serve.bin');
  fs.writeFileSync(outside,'PRIVATE_TEST_CONTENT');
  fs.rmSync(exportFile);
  fs.symlinkSync(outside,exportFile);
  const symlinkExport=await request(exportUri);
  assert.equal(symlinkExport.status,404);
  assert.doesNotMatch(JSON.stringify(await symlinkExport.json()),/PRIVATE_TEST_CONTENT/);
  fs.rmSync(voiceFile);
  fs.symlinkSync(outside,voiceFile);
  assert.equal((await request(voiceUri)).status,404);
  assert.equal((await request(voiceUri,{method:'HEAD'})).status,404);
  fs.rmSync(exportFile);
  fs.rmSync(voiceFile);
  fs.writeFileSync(exportFile,Buffer.alloc(bytes,0x62));
  fs.writeFileSync(voiceFile,Buffer.alloc(bytes,0x63));
  for(let i=0;i<12;i++){
   const invalid=await request(i%2?voiceUri:exportUri,{
    headers:{Range:'bytes=999999999-'}});
   assert.equal(invalid.status,416);
   assert.equal(invalid.headers.get('content-range'),'bytes */'+bytes);
   await invalid.arrayBuffer();
  }
  const after416=await request(exportUri,{headers:{Range:'bytes=8-15'}});
  assert.equal(after416.status,206);
  assert.equal((await after416.arrayBuffer()).byteLength,8);

  // Zero-byte exports are valid HTTP resources and do not retain a
  // stream lease or try to createReadStream(start=0,end=-1).
  fs.writeFileSync(exportFile,Buffer.alloc(0));
  const empty=await request(exportUri);
  assert.equal(empty.status,200);
  assert.equal(empty.headers.get('content-length'),'0');
  assert.equal((await empty.arrayBuffer()).byteLength,0);
  assert.equal((await request(exportUri,{method:'HEAD'})).status,200);
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{
  for(const entry of held)close(entry);
  if(child){
   child.kill('SIGTERM');
   await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1800)]);
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  }
  fs.rmSync(root,{recursive:true,force:true});
 }
});

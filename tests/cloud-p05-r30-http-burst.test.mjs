import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {assemblyService} from '../server/assemble-scenes.mjs';

const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pct=(values,p)=>values.length?
 Math.round([...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]*10)/10:null;
const abortError=()=>Object.assign(Error('P05_SHA_REQUEST_ABORTED'),{status:499});
async function openPort(){
 const s=net.createServer();
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const n=s.address().port;
 await new Promise(resolve=>s.close(resolve));
 return n;
}
function release(root,id,bytes=48*1024*1024){
 const rid=randomUUID(),dir=path.join(root,'out','releases',id,rid);
 fs.mkdirSync(dir,{recursive:true});
 const master=path.join(dir,'final.mp4'),buf=Buffer.alloc(bytes,0x5a);
 const digest=sha(buf);
 fs.writeFileSync(master,buf);
 const manifest={schemaVersion:1,project:id,release_id:rid,target_fps:24,
  scenes:[{id:'s01',duration:1.2,sha256:'1'.repeat(64)},
   {id:'s02',duration:1.2,sha256:'2'.repeat(64)}],
  output:{sha256:digest,bytes,qa:{verdict:'PASS',
   issues:[],metadata:{duration:2.4}}}};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,'out','releases',id,'current.json'),
  JSON.stringify({release_id:rid}));
 return {master,rid,digest,bytes};
}
function localAssembly(root,id){
 return assemblyService({out:path.join(root,'out'),
  getDeck:()=>({id}),getRender:()=>({}),getTask:()=>({}),
  getPlan:()=>({}),getStyle:()=>({}),baseUrl:()=> 'http://localhost',
  shaBudget:{capacity:1,maxWaiting:0}});
}
test('P05-R30 abort before and during full P05 SHA releases queue slot and never claims verification',{
 timeout:35000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r30-abort-'));
 try{
  const id='abort-verify',f=release(root,id,32*1024*1024),a=localAssembly(root,id);
  const before=new AbortController();before.abort(abortError());
  await assert.rejects(()=>a.getAsync(id,{signal:before.signal}),
   e=>e?.status===499);
  assert.deepEqual(a.verificationSnapshot(),{capacity:1,active:0,waiting:0});

  const inFlight=new AbortController();
  const scan=a.downloadHandleAsync(id,f.rid,{signal:inFlight.signal});
  setImmediate(()=>inFlight.abort(abortError()));
  await assert.rejects(()=>scan,e=>e?.status===499);
  assert.deepEqual(a.verificationSnapshot(),{capacity:1,active:0,waiting:0},
   'in-flight abort must close P05 FD and return SHA token');
  const actual=await a.getAsync(id);
  assert.equal(actual.current_release.release_id,f.rid);
  const pinned=await a.downloadHandleAsync(id,f.rid);
  try{assert.equal((await pinned.handle.stat()).size,f.bytes)}
  finally{await pinned.handle.close()}
  assert.deepEqual(a.verificationSnapshot(),{capacity:1,active:0,waiting:0});
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('P05-R30 isolated authenticated HTTP burst keeps /health alive, bounds 429 and recovers after abort',{
 timeout:120000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r30-http-burst-'));
 const id='load-verify',port=await openPort(),base='http://127.0.0.1:'+port;
 const token=randomBytes(24).toString('hex'),user='loadtest';
 const password='local-isolated-pass-0123456789012345';
 const auth='Basic '+Buffer.from(user+':'+password).toString('base64');
 let server=null,logs='';
 try{
  server=spawn(process.execPath,['server/cloud.mjs'],{
   cwd:process.cwd(),stdio:['ignore','pipe','pipe'],env:{...process.env,
    PORT:String(port),PB_DATA_DIR:root,PB_WEB_USER:user,
    PB_WEB_PASSWORD:password,MCP_API_KEY:token,
    PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:'0'}});
  server.stdout.on('data',b=>logs+=b.toString());
  server.stderr.on('data',b=>logs+=b.toString());
  let ready=false;
  for(let i=0;i<120;i++){
   if(server.exitCode!==null)throw Error('CLOUD_EXIT '+logs.slice(-900));
   try{const r=await fetch(base+'/health',{signal:AbortSignal.timeout(1200)});
    if(r.status===200){ready=true;break}}catch{}
   await sleep(90);
  }
  assert.equal(ready,true,logs.slice(-1200));
  const rpc=await fetch(base+'/mcp',{method:'POST',headers:{
   Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'create_deck',arguments:{id,title:'P05 R30 isolated stress',
     text:'One scene. Two scenes.',style:'paper',slide_count:2,target:8}}}),
   signal:AbortSignal.timeout(15000)});
  assert.equal(rpc.status,200);
  const response=await rpc.json();
  assert.equal(response.result?.isError,false,JSON.stringify(response).slice(0,500));

  const fixture=release(root,id,48*1024*1024);
  const media='/api/decks/'+id+'/assembly/releases/'+fixture.rid+'/final.mp4';
  const read=(uri,options={})=>fetch(base+uri,{
   ...options,headers:{Authorization:auth,...options.headers},
   signal:options.signal??AbortSignal.timeout(30000)});
  const healthMs=[];
  let probing=true;
  const healthProbe=(async()=>{
   while(probing){
    const start=performance.now();
    const response=await fetch(base+'/health',{signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200);
    healthMs.push(performance.now()-start);
    await sleep(25);
   }
  })();
  const endpoints=Array.from({length:36},(_,i)=>
   i%3===0?{path:'/api/decks/'+id+'/assemble',method:'GET',expected:200}:
   i%3===1?{path:media,method:'HEAD',expected:200}:
   {path:media,method:'GET',headers:{Range:'bytes=0-255'},expected:206});
  const started=performance.now();
  const results=await Promise.all(endpoints.map(async x=>{
   const begin=performance.now();
   const r=await read(x.path,{method:x.method,headers:x.headers});
   const body=x.method==='HEAD'?null:Buffer.from(await r.arrayBuffer());
   const elapsed=performance.now()-begin;
   if(r.status===429){
    assert.match(r.headers.get('retry-after')??'',/^[1-9][0-9]*$/,
     'rate or storage admission must advertise backoff');
    return {status:429,elapsed};
   }
   assert.equal(r.status,x.expected,'burst must never bypass verification');
   if(x.expected===206){
    assert.equal(body.length,256);
    assert.equal(r.headers.get('content-range'),
     'bytes 0-255/'+fixture.bytes);
   }
   if(x.expected===200&&x.method==='GET'){
    assert.equal(JSON.parse(body.toString()).current_release?.release_id,fixture.rid);
   }
   return {status:r.status,elapsed};
  }));
  probing=false;await healthProbe;
  const accepted=results.filter(r=>r.status!==429).length;
  const rejected=results.filter(r=>r.status===429).length;
  assert.equal(accepted+rejected,endpoints.length);
  assert.ok(accepted>=1);
  assert.ok(healthMs.length>=1);
  console.log('P05_R30_ISOLATED_BURST_METRICS '+JSON.stringify({
   kind:'synthetic-local-ci-not-production',
   concurrent_requests:endpoints.length,fixture_bytes:fixture.bytes,
   sha_budget:{active:2,waiting:12},ok:accepted,http_429:rejected,
   burst_ms:Math.round(performance.now()-started),
   request_p50_ms:pct(results.map(r=>r.elapsed),0.50),
   request_p95_ms:pct(results.map(r=>r.elapsed),0.95),
   health_samples:healthMs.length,health_p95_ms:pct(healthMs,0.95),
   health_max_ms:Math.round(Math.max(...healthMs))}));

  // Abandon multiple authenticated SHA requests while they are pending:
  // the server must release their SHA queue positions and still accept
  // a subsequent verified read without a restart or a forged cache hit.
  const aborted=Array.from({length:18},(_,i)=>{
   const controller=new AbortController();
   const promise=read(i%2===0?media:'/api/decks/'+id+'/assemble',
    {method:i%2===0?'HEAD':'GET',signal:controller.signal})
    .then(async r=>{await r.arrayBuffer();return r.status});
   return {controller,promise};
  });
  await sleep(12);
  for(const request of aborted)request.controller.abort();
  const outcome=await Promise.allSettled(aborted.map(r=>r.promise));
  assert.equal(outcome.length,18);
  // Allow the unavoidably in-flight single filesystem reads to settle.
  let recovered=false;
  for(let attempt=0;attempt<80;attempt++){
   const r=await read('/api/decks/'+id+'/assemble');
   if(r.status===200){
    assert.equal((await r.json()).current_release.release_id,fixture.rid);
    recovered=true;break;
   }
   assert.equal(r.status,429);
   await sleep(80);
  }
  assert.equal(recovered,true,'HTTP must recover after aborted SHA requests');
  const ranged=await read(media,{headers:{Range:'bytes=0-63'}});
  assert.equal(ranged.status,206);
  assert.equal((await ranged.arrayBuffer()).byteLength,64);
  assert.equal((await fetch(base+'/health')).status,200);

  // Re-verification is never skipped after load; corrupt the physical MP4
  // without updating its immutable manifest, so the next read must fail.
  fs.appendFileSync(fixture.master,'tampered');
  assert.equal((await read(media,{method:'HEAD'})).status,409);
  const invalid=await read('/api/decks/'+id+'/assemble');
  assert.equal(invalid.status,200);
  assert.equal((await invalid.json()).current_release,null);
 }finally{
  if(server){
   server.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>server.once('exit',resolve)),sleep(1500)]);
   if(server.exitCode===null)server.kill('SIGKILL');
  }
  fs.rmSync(root,{recursive:true,force:true});
 }
});

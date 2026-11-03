import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const sha=x=>createHash('sha256').update(x).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const p95=values=>{
 const sorted=[...values].sort((a,b)=>a-b);
 return Math.round(sorted[Math.ceil(sorted.length*.95)-1]*10)/10;
};
async function freePort(){
 const s=net.createServer();
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const p=s.address().port;
 await new Promise(r=>s.close(r));return p;
}
function release(root,id,bytes=32*1024*1024){
 const rid=randomUUID(),dir=path.join(root,'out','releases',id,rid);
 fs.mkdirSync(dir,{recursive:true});
 const buffer=Buffer.alloc(bytes,0x68);
 const master=path.join(dir,'final.mp4'),digest=sha(buffer);
 fs.writeFileSync(master,buffer);
 const manifest={schemaVersion:1,project:id,release_id:rid,target_fps:24,
  scenes:[{id:'s01',sha256:'1'.repeat(64),duration:1.2,
    transition_after:{type:'hard-cut',duration:0}},
   {id:'s02',sha256:'2'.repeat(64),duration:1.2,
    transition_after:{type:'hard-cut',duration:0}}],
  output:{sha256:digest,bytes,qa:{verdict:'PASS',
   issues:[],metadata:{duration:2.4}}}};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,'out','releases',id,'current.json'),
  JSON.stringify({release_id:rid}));
 return {rid,master,digest,bytes};
}
test('P05-R32 MCP scoped read cancellation, 429 transport and auth boundaries under isolated burst',{
 timeout:120000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r32-mcp-burst-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const project='mcp-r32',blocked='outside-r32';
 const director=randomBytes(24).toString('hex');
 const worker=randomBytes(24).toString('hex');
 const browserUser='web-owner',browserPassword='test-only-strong-password-0123456';
 let child=null,logs='';
 try{
  child=spawn(process.execPath,['server/cloud.mjs'],{
   cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
   env:{...process.env,PORT:String(port),PB_DATA_DIR:root,
    MCP_API_KEY:director,PB_WEB_USER:browserUser,
    PB_WEB_PASSWORD:browserPassword,PB_QC_COCKPIT:'1',
    PB_REAL_AUDIO_AUDIT:'0',PB_AGENT_KEYS_JSON:JSON.stringify([
     {id:'worker-r32',role:'worker',token:worker,
      projects:[project],scenes:['s01']}])}});
  child.stdout.on('data',b=>logs+=b.toString());
  child.stderr.on('data',b=>logs+=b.toString());
  let ready=false;
  for(let i=0;i<110;i++){
   if(child.exitCode!==null)throw Error('SERVER_EXIT '+logs.slice(-1400));
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).ok){
    ready=true;break}}catch{}
   await sleep(80);
  }
  assert.equal(ready,true,logs.slice(-1200));
  let serial=0;
  const rpc=(token,name,args,{signal}={})=>fetch(base+'/mcp',{
   method:'POST',signal:signal??AbortSignal.timeout(25000),
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:++serial,
    method:'tools/call',params:{name,arguments:args}})});
  const result=async(token,name,args)=>{
   const res=await rpc(token,name,args);
   const data=await res.json();
   return {status:res.status,data};
  };
  for(const id of [project,blocked]){
   const create=await result(director,'create_deck',{id,title:id,
    text:'First. Second.',style:'paper',slide_count:2,target:8});
   assert.equal(create.status,200);
   assert.equal(create.data.result?.isError,false,JSON.stringify(create.data));
  }
  const f=release(root,project);
  const foreign=await result(worker,'get_assembly_status',{id:blocked,
   actor_id:'forged-director'});
  assert.equal(foreign.status,200);
  assert.equal(foreign.data.result?.isError,true);
  assert.match(foreign.data.result.content[0].text,/outside agent scope/);
  const noScene=await result(worker,'get_qc_cockpit',{id:project});
  assert.equal(noScene.status,200);
  assert.equal(noScene.data.result?.isError,true,
   'worker cannot obtain director QC without a scene');
  // A worker authorized for the project but not for a director-wide QC
  // view must not deplete its own identity or the shared project budget
  // by repeatedly omitting the required P06 scene.
  for(let i=0;i<75;i++){
   const bad=await result(worker,'get_qc_cockpit',{id:project,
    actor_id:'forged-director-'+i});
   assert.equal(bad.status,200,
    'invalid scene scope must fail at MCP authorization, before quota');
   assert.equal(bad.data.result?.isError,true);
  }
  const afterDenied=await result(worker,'get_assembly_status',{id:project});
  assert.equal(afterDenied.status,200,
   'invalid QC scope must not throttle legitimate worker assembly reads');
  assert.equal(afterDenied.data.result?.isError,false);
  assert.equal(JSON.parse(afterDenied.data.result.content[0].text)
   .current_release.release_id,f.rid);
  const denied=await fetch(base+'/mcp',{method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'get_assembly_status',arguments:{id:project}}})});
  assert.equal(denied.status,401);
  const batch=await fetch(base+'/mcp',{method:'POST',
   headers:{Authorization:'Bearer '+director,'Content-Type':'application/json'},
   body:JSON.stringify([{jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'get_assembly_status',arguments:{id:project}}}])});
  assert.equal(batch.status,200);
  assert.equal((await batch.json()).error?.code,-32600,
   'batch RPC cannot bypass individual authenticated quotas');

  const kinds=Array.from({length:42},(_,i)=>i%3);
  const latencies=[],health=[];
  let probing=true;
  const probe=(async()=>{
   while(probing){
    const start=performance.now(),r=await fetch(base+'/health',{
     signal:AbortSignal.timeout(5000)});
    assert.equal(r.status,200);
    health.push(performance.now()-start);
    await sleep(25);
   }
  })();
  const start=performance.now();
  const outcomes=await Promise.all(kinds.map(async kind=>{
   const actor=kind===2?worker:director;
   const name=kind===0?'get_qc_cockpit':'get_assembly_status';
   const begin=performance.now(),response=await rpc(actor,name,{id:project});
   const data=await response.json();
   latencies.push(performance.now()-begin);
   if(response.status===429){
    assert.match(response.headers.get('retry-after')??'',/^[1-9][0-9]*$/);
    assert.ok(['Resource queue is full','P05_VERIFICATION_RATE_LIMITED']
     .includes(data.error),'429 must disclose actual SHA/rate overload');
    return {status:429,kind};
   }
   assert.equal(response.status,200,JSON.stringify(data).slice(0,300));
   assert.equal(data.result?.isError,false,
    'SHA overload must never be hidden inside a 200 isError response');
   const value=JSON.parse(data.result.content[0].text);
   if(kind===0){
    assert.equal(value.release_sha256,f.digest);
    assert.equal(value.publication_allowed,false);
   }else{
    assert.equal(value.current_release?.release_id,f.rid);
    assert.equal(value.current_release?.manifest.output.sha256,f.digest);
   }
   return {status:200,kind};
  }));
  probing=false;await probe;
  const accepted=outcomes.filter(x=>x.status===200).length;
  const overloaded=outcomes.filter(x=>x.status===429).length;
  assert.ok(accepted>=1&&overloaded>=1);
  assert.equal(accepted+overloaded,42);
  assert.ok(health.length>=1);
  console.log('P05_R32_MCP_BURST_METRICS '+JSON.stringify({
   kind:'synthetic-isolated-CI-not-production',
   bytes:f.bytes,concurrent:42,accepted,http_429:overloaded,
   qc_ok:outcomes.filter(x=>x.kind===0&&x.status===200).length,
   worker_status_ok:outcomes.filter(x=>x.kind===2&&x.status===200).length,
   request_p95_ms:p95(latencies),health_p95_ms:p95(health),
   health_max_ms:Math.round(Math.max(...health)),
   elapsed_ms:Math.round(performance.now()-start)}));

  // 18 disconnected MCP reads must not leave orphan SHA waits, restart
  // the server, bypass credential scope, or mutate the release pointer.
  const abandoned=Array.from({length:18},(_,i)=>{
   const controller=new AbortController();
   const promise=rpc(i%2?worker:director,i%3===0?
    'get_qc_cockpit':'get_assembly_status',{id:project},
    {signal:controller.signal}).then(async r=>r.arrayBuffer()).catch(e=>e);
   return {controller,promise};
  });
  await sleep(12);
  for(const a of abandoned)a.controller.abort();
  await Promise.all(abandoned.map(a=>a.promise));
  let recovered=false;
  for(let attempt=0;attempt<90;attempt++){
   const res=await result(worker,'get_assembly_status',{id:project});
   if(res.status===200){
    assert.equal(res.data.result.isError,false);
    assert.equal(JSON.parse(res.data.result.content[0].text)
     .current_release.release_id,f.rid);
    recovered=true;break;
   }
   assert.equal(res.status,429);
   await sleep(80);
  }
  assert.equal(recovered,true,'worker MCP SHA work must recover after disconnects');
  const directorQc=await result(director,'get_qc_cockpit',{id:project});
  assert.equal(directorQc.status,200);
  assert.equal(directorQc.data.result.isError,false);
  assert.equal(JSON.parse(directorQc.data.result.content[0].text)
   .publication_allowed,false);

  fs.appendFileSync(f.master,'tamper');
  const corrupted=await result(director,'get_assembly_status',{id:project});
  assert.equal(corrupted.status,200);
  assert.equal(corrupted.data.result.isError,false);
  assert.equal(JSON.parse(corrupted.data.result.content[0].text).current_release,null);
  const rejectedQc=await result(director,'get_qc_cockpit',{id:project});
  assert.equal(rejectedQc.status,200);
  assert.equal(rejectedQc.data.result.isError,true);
  assert.match(rejectedQc.data.result.content[0].text,/M51_NO_VERIFIED_RELEASE/);
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{
  if(child){
   child.kill('SIGTERM');
   await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1600)]);
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  }
  fs.rmSync(root,{recursive:true,force:true});
 }
});

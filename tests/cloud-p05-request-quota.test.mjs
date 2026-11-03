import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createP05RequestQuota,p05HttpQuotaProject,p05McpQuotaProject}
 from '../server/p05-request-quota.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
 const s=net.createServer();
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const p=s.address().port;await new Promise(r=>s.close(r));return p;
}
test('P05-R28 route matching cannot bypass quota with encoded project or spoofed actor fields',()=>{
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/assemble','GET'),'alpha');
 assert.equal(p05HttpQuotaProject('/api/decks/%61lpha/assemble','GET'),'alpha');
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/audio-audit','POST'),'alpha');
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/audio-audit','GET'),'alpha');
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/qc-cockpit','GET'),'alpha');
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/assembly/releases/123/final.mp4','HEAD'),'alpha');
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/assembly/releases/123/final.mp4','GET'),'alpha');
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/assembly/releases/123/final.mp4','POST'),null);
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/assemble','PATCH'),null);
 assert.equal(p05HttpQuotaProject('/api/decks/../assemble','GET'),null);
 assert.equal(p05HttpQuotaProject('/api/decks/%2e%2e/assemble','GET'),null);
 assert.equal(p05HttpQuotaProject('/api/decks/alpha/other','GET'),null);
 assert.equal(p05HttpQuotaProject('/health','GET'),null);
 assert.equal(p05McpQuotaProject({method:'tools/call',params:{
  name:'get_assembly_status',arguments:{id:'alpha',actor_id:'forged'}}}),'alpha');
 assert.equal(p05McpQuotaProject({method:'tools/call',params:{
  name:'get_qc_cockpit',arguments:{id:'alpha'}}}),'alpha');
 assert.equal(p05McpQuotaProject({method:'tools/call',params:{
  name:'get_deck',arguments:{id:'alpha'}}}),null);
 assert.equal(p05McpQuotaProject({method:'ping'}),null);
});
test('P05-R28 atomic actor+project token budgets prevent changing project/identity to reset quota',()=>{
 let now=1000;
 const q=createP05RequestQuota({actorCapacity:2,actorRefillPerSecond:1,
  projectCapacity:3,projectRefillPerSecond:0.5,now:()=>now});
 q.admit('web-director','alpha');
 q.admit('web-director','alpha');
 assert.throws(()=>q.admit('web-director','beta'),
  e=>e.status===429&&e.message==='P05_VERIFICATION_RATE_LIMITED'&&e.retryAfter===1);
 q.admit('agent-a','alpha');
 assert.throws(()=>q.admit('agent-b','alpha'),
  e=>e.status===429&&e.retryAfter===2);
 // Project exhaustion must not debit an unaffected agent's account.
 q.admit('agent-b','beta');
 now+=2000;
 q.admit('web-director','alpha');
 q.admit('web-director','beta');
 assert.throws(()=>q.admit('web-director','beta'),e=>e.status===429);
 assert.deepEqual(q.snapshot(),{actors:3,projects:2});
});
test('P05-R28 bounded principal map only evicts idle identities and fails closed when full',()=>{
 let now=0;
 const q=createP05RequestQuota({actorCapacity:2,actorRefillPerSecond:1,
  projectCapacity:2,projectRefillPerSecond:1,
  maxActors:1,maxProjects:2,idleMs:2000,now:()=>now});
 q.admit('first','alpha');
 assert.throws(()=>q.admit('second','alpha'),
  e=>e?.status===429&&e.message==='P05_QUOTA_IDENTITY_CAPACITY');
 assert.deepEqual(q.snapshot(),{actors:1,projects:1});
 now=2001;
 q.admit('second','alpha');
 assert.deepEqual(q.snapshot(),{actors:1,projects:1});
 assert.throws(()=>createP05RequestQuota({actorCapacity:0}),/P05_QUOTA_INVALID_LIMIT/);
 assert.throws(()=>createP05RequestQuota({projectRefillPerSecond:0}),/P05_QUOTA_INVALID_LIMIT/);
});
test('P05-R28 authenticated HTTP quotas return 429 Retry-After but never throttle health or untrusted IP headers',{
 timeout:60000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r28-authquota-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const username='owner',password='test-only-safe-password-0123456';
 const basic='Basic '+Buffer.from(username+':'+password).toString('base64');
 const token=randomBytes(24).toString('hex');
 const workerToken=randomBytes(24).toString('hex');
 // Intentional name collision attempt with the MCP director principal.
 const agents=[{id:'mcp-director',role:'worker',token:workerToken,
  projects:['quota-beta'],scenes:['s01']}];
 let child=null,logs='';
 try{
  child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),
   stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(port),
    PB_DATA_DIR:root,PB_WEB_USER:username,PB_WEB_PASSWORD:password,
    MCP_API_KEY:token,PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:'1',
    PB_AGENT_KEYS_JSON:JSON.stringify(agents)}});
  child.stdout.on('data',x=>logs+=x.toString());
  child.stderr.on('data',x=>logs+=x.toString());
  let ready=false;
  for(let n=0;n<100;n++){
   if(child.exitCode!==null)throw Error(logs.slice(-1100));
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).ok){
    ready=true;break
   }}catch{}
   await sleep(80);
  }
  assert.equal(ready,true,logs.slice(-1000));
  async function rpc(name,args){
   const response=await fetch(base+'/mcp',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
     params:{name,arguments:args}}),signal:AbortSignal.timeout(7000)});
   assert.equal(response.status,200,'MCP authenticated request');
   const parsed=await response.json();
   assert.equal(parsed.result.isError,false,JSON.stringify(parsed).slice(0,500));
   return JSON.parse(parsed.result.content[0].text);
  }
  for(const id of ['quota-alpha','quota-beta']){
   await rpc('create_deck',{id,title:id,text:'First. Second.',
    style:'paper',slide_count:2,target:8});
  }
  // A scoped worker with a reserved-looking ID may not debit the shared
  // budget of a project outside its authenticated scope.
  async function workerCall(id,requestId){
   const response=await fetch(base+'/mcp',{method:'POST',
    headers:{Authorization:'Bearer '+workerToken,
     'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:requestId,
     method:'tools/call',params:{name:'get_assembly_status',
      arguments:{id,actor_id:'mcp:director'}}}),
    signal:AbortSignal.timeout(7000)});
   assert.equal(response.status,200,'unauthorized tools/call must not burn SHA quota');
   return response.json();
  }
  for(let i=0;i<75;i++){
   const denied=await workerCall('quota-alpha',1000+i);
   assert.equal(denied.result.isError,true);
   assert.match(denied.result.content[0].text,/outside agent scope/);
  }
  const workerAllowed=await workerCall('quota-beta',1200);
  assert.equal(workerAllowed.result.isError,false);
  assert.equal(JSON.parse(workerAllowed.result.content[0].text).current_release,null);
  // Even after repeated denied worker calls, director's other project is
  // readable: unauthorized calls did not allocate or drain its budget.
  assert.equal((await rpc('get_assembly_status',{id:'quota-alpha'})).current_release,null);
  const get=(id,idx)=>fetch(base+'/api/decks/'+id+'/assemble',{
   headers:{Authorization:basic,'X-Forwarded-For':'192.0.2.'+(idx%200+1)},
   signal:AbortSignal.timeout(8000)});
  assert.equal((await fetch(base+'/api/decks/quota-alpha/assemble')).status,401);
  // Guessing nonexistent IDs must not allocate 256/512 quota records or
  // consume an authenticated principal's budget: no SHA work can follow.
  for(let i=0;i<48;i++){
   const response=await fetch(base+'/api/decks/nonexistent-'+i+'/assemble',{
    headers:{Authorization:basic,'X-Forwarded-For':'203.0.113.'+(i+1)},
    signal:AbortSignal.timeout(7000)});
   assert.equal(response.status,404,'unknown projects use ordinary 404, not quota tokens');
  }
  let allowed=0,throttled=0;
  for(let i=0;i<96;i++){
   const target=i%2===0?'quota-alpha':'%71uota-beta';
   const res=await get(target,i);
   if(res.status===429){
    throttled++;
    assert.match(res.headers.get('retry-after')||'',/^[1-9][0-9]*$/);
    assert.equal((await res.json()).error,'P05_VERIFICATION_RATE_LIMITED');
   }else{
    assert.equal(res.status,200,'only verified reads or explicit 429');
    assert.equal((await res.json()).current_release,null);
    allowed++;
   }
  }
  assert.ok(allowed>=60,'large initial budget must allow ordinary traffic');
  assert.ok(throttled>=10,'altering project and spoofed IP cannot reset actor bucket');
  assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await fetch(base+'/api/decks',{headers:{Authorization:basic}})).status,200);
  // MCP has an independently authenticated director identity; a Basic
  // exhaustion does not reset or consume MCP's quota.
  const status=await rpc('get_assembly_status',{id:'quota-alpha'});
  assert.equal(status.current_release,null);
  // Exercise the real MCP boundary, not only the pure route classifier:
  // authenticated tools/call must receive network-level 429 on exhaustion.
  let mcpAllowed=0,mcpThrottled=0;
  for(let i=0;i<80;i++){
   const response=await fetch(base+'/mcp',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',
     'X-Forwarded-For':'198.51.100.'+(i%200+1)},
    body:JSON.stringify({jsonrpc:'2.0',id:i+2,method:'tools/call',
     params:{name:'get_assembly_status',
      arguments:{id:'quota-alpha',actor_id:'spoofed-agent-'+i}}}),
    signal:AbortSignal.timeout(8000)});
   if(response.status===429){
    mcpThrottled++;
    assert.match(response.headers.get('retry-after')||'',/^[1-9][0-9]*$/);
    assert.equal((await response.json()).error,'P05_VERIFICATION_RATE_LIMITED');
   }else{
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.result.isError,false);
    mcpAllowed++;
   }
  }
  assert.ok(mcpAllowed>=20);
  assert.ok(mcpThrottled>=1,'MCP actor quota must not trust request body actor_id');
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{
  if(child){
   child.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(1400)]);
   if(child.exitCode===null)child.kill('SIGKILL');
  }
  fs.rmSync(root,{recursive:true,force:true});
 }
});

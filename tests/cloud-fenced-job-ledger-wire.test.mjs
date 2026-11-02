import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){
 const s=net.createServer();await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;
}
test('M50-R01 live REST/MCP protected journal stays fail-closed without real approved P08 MP4',{timeout:30000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m50-wire-')),p=await port();
 const base='http://127.0.0.1:'+p;
 const basic='Basic '+Buffer.from('owner:supersecure-test-secret-123').toString('base64');
 const key=randomBytes(24).toString('hex'),workerKey=randomBytes(24).toString('hex');
 const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(p),PB_DATA_DIR:root,PB_WEB_USER:'owner',
   PB_WEB_PASSWORD:'supersecure-test-secret-123',MCP_API_KEY:key,
   PB_FENCED_JOB_LEDGER:'1',
   PB_AGENT_KEYS_JSON:JSON.stringify([{id:'worker-a',role:'worker',token:workerKey,
    projects:['m50-demo'],scenes:['s01']}])}});
 let logs='';child.stderr.on('data',x=>logs+=x.toString());child.stdout.on('data',x=>logs+=x.toString());
 const req=async(uri,config={})=>{const res=await fetch(base+uri,{...config,signal:AbortSignal.timeout(6000)});
  return {status:res.status,body:await res.json().catch(()=>null)}};
 const rpc=async(token,name,args)=>req('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,
  'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',
   params:{name,arguments:args}})});
 const endpoint='/api/decks/m50-demo/job-ledger/s01/job1';
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   if(child.exitCode!==null)throw Error(logs);
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(900)})).ok){ready=true;break}}catch{}
   await sleep(120);
  }
  assert.ok(ready,logs);
  const c=await rpc(key,'create_deck',{id:'m50-demo',title:'Test',text:'One. Two.',
   style:'paper',slide_count:2,target:8});
  assert.equal(c.body.result?.isError,false,JSON.stringify(c));
  const unauthorized=await req(endpoint);
  assert.equal(unauthorized.status,401);
  const before=await req(endpoint,{headers:{Authorization:basic}});
  assert.equal(before.status,404);
  const body={action:'BEGIN',request_id:'request-a',version_id:'1234567890abcdef',
   source_sha256:'a'.repeat(64)};
  const denied=await req(endpoint,{method:'POST',headers:{Authorization:basic,'Content-Type':'application/json'},
   body:JSON.stringify(body)});
  assert.equal(denied.status,409,JSON.stringify(denied));
  assert.equal(denied.body.error,'M50_P08_SOURCE_STALE');
  const worker=await rpc(workerKey,'begin_fenced_job',{id:'m50-demo',slide_id:'s01',job_id:'job1',
   request_id:'request-a',source_sha256:'a'.repeat(64),version_id:'1234567890abcdef'});
  assert.equal(worker.body.result.isError,true);
  const other=await rpc(workerKey,'get_fenced_job',{id:'m50-demo',slide_id:'s02',job_id:'job1'});
  assert.equal(other.body.result.isError,true);
  const csrf=await req(endpoint,{method:'POST',headers:{Authorization:basic,
   'Content-Type':'application/json',Origin:'https://evil.invalid'},body:JSON.stringify(body)});
  assert.equal(csrf.status,403);
  const noJournal=await req(endpoint,{headers:{Authorization:basic}});
  assert.equal(noJournal.status,404);
 }finally{
  if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(1500)]);
  }
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  fs.rmSync(root,{recursive:true,force:true});
 }
});

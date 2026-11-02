import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){
 const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const v=s.address().port;await new Promise(r=>s.close(r));return v;
}
test('M51-R01 protected REST + P06-scoped MCP cockpit requires verified P05 current release',{timeout:30000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m51-wire-')),p=await port();
 const base='http://127.0.0.1:'+p;
 const basic='Basic '+Buffer.from('owner:very-long-m51-password-123').toString('base64');
 const token=randomBytes(24).toString('hex'),workerToken=randomBytes(24).toString('hex');
 const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],env:{
  ...process.env,PORT:String(p),PB_DATA_DIR:root,PB_WEB_USER:'owner',PB_WEB_PASSWORD:'very-long-m51-password-123',
  MCP_API_KEY:token,PB_QC_COCKPIT:'1',PB_AGENT_KEYS_JSON:JSON.stringify([
   {id:'qc-worker',role:'worker',token:workerToken,projects:['qc-demo'],scenes:['s01']}])
 }});
 let logs='';child.stderr.on('data',b=>logs+=b.toString());child.stdout.on('data',b=>logs+=b.toString());
 const request=async(uri,config={})=>{
  const response=await fetch(base+uri,{...config,signal:AbortSignal.timeout(6000)});
  return {status:response.status,body:await response.json().catch(()=>null)};
 };
 const rpc=async(key,name,args)=>request('/mcp',{method:'POST',
  headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:8,method:'tools/call',params:{name,arguments:args}})});
 try{
  let ready=false;
  for(let i=0;i<80;i++){
   if(child.exitCode!==null)throw Error(logs);
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(750)})).ok){ready=true;break}}catch{}
   await sleep(120);
  }
  assert.ok(ready,logs);
  const created=await rpc(token,'create_deck',{id:'qc-demo',title:'QC',text:'One. Two.',
   style:'paper',slide_count:2,target:8});
  assert.equal(created.body.result.isError,false,JSON.stringify(created));
  const route='/api/decks/qc-demo/qc-cockpit';
  assert.equal((await request(route)).status,401);
  const empty=await request(route,{headers:{Authorization:basic}});
  assert.equal(empty.status,409,JSON.stringify(empty));
  assert.equal(empty.body.error,'M51_NO_VERIFIED_RELEASE');
  const director=await rpc(token,'get_qc_cockpit',{id:'qc-demo'});
  assert.equal(director.body.result.isError,true);
  const worker=await rpc(workerToken,'get_qc_cockpit',{id:'qc-demo',slide_id:'s01'});
  assert.equal(worker.body.result.isError,true);
  const wrongScene=await rpc(workerToken,'get_qc_cockpit',{id:'qc-demo',slide_id:'s02'});
  assert.equal(wrongScene.body.result.isError,true);
  const missingScope=await rpc(workerToken,'get_qc_cockpit',{id:'qc-demo'});
  assert.equal(missingScope.body.result.isError,true);
  assert.equal((await request(route,{method:'POST',headers:{Authorization:basic}})).status,405);
 }finally{
  if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');await Promise.race([
    new Promise(r=>child.once('exit',r)),sleep(1800)]);
  }
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  fs.rmSync(root,{recursive:true,force:true});
 }
});

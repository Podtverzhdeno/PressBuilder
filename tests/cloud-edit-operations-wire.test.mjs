import {test} from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
async function freePort(){
 const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const p=s.address().port;await new Promise(r=>s.close(r));return p;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('M01-R02 live REST/MCP journal: director ACL, Origin/CAS and absent approved MP4 refusal',{timeout:45000},async()=>{
 const root=fs.mkdtempSync(os.tmpdir()+'/pb-editops-wire-'),port=await freePort();
 const basic='Basic '+Buffer.from('owner:secure-pass-12345').toString('base64');
 const key=randomBytes(24).toString('hex'),workerKey=randomBytes(24).toString('hex');
 const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(port),PB_DATA_DIR:root,PB_WEB_USER:'owner',PB_WEB_PASSWORD:'secure-pass-12345',
   MCP_API_KEY:key,PB_EDITGRAPH_PREVIEW:'1',PB_AGENT_KEYS_JSON:JSON.stringify([
    {id:'editor',role:'worker',token:workerKey,projects:['test-editops'],scenes:['s01']}])}});
 let log='';child.stdout.on('data',x=>log+=x.toString());child.stderr.on('data',x=>log+=x.toString());
 const endpoint='http://127.0.0.1:'+port;
 const fetchJson=async(url,init={})=>{
  const response=await fetch(endpoint+url,{...init,signal:AbortSignal.timeout(8000)});
  return {status:response.status,data:await response.json().catch(()=>null)};
 };
 const get=(url,auth=true)=>fetchJson(url,{headers:auth?{Authorization:basic}:{}});
 const post=(url,value,extra={})=>fetchJson(url,{method:'POST',headers:{
  Authorization:basic,'Content-Type':'application/json',...extra},body:JSON.stringify(value)});
 const rpc=async(token,name,args)=>fetchJson('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:12,method:'tools/call',params:{name,arguments:args}})});
 try{
  let ok=false;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(log);
   try{if((await fetch(endpoint+'/health')).ok){ok=true;break}}catch{}await sleep(100)}
  assert.ok(ok,log);
  const created=await rpc(key,'create_deck',{id:'test-editops',title:'Timeline',text:'First story. Next story.',
   style:'paper',slide_count:2,target:8});
  assert.equal(created.data.result.isError,false,JSON.stringify(created));
  assert.equal((await get('/api/decks/test-editops/edit-graph/operations',false)).status,401);
  const initial=await get('/api/decks/test-editops/edit-graph/operations');
  assert.equal(initial.status,200,JSON.stringify(initial));
  assert.equal(initial.data.revision,0);
  assert.equal(initial.data.cursor,0);
  assert.equal(initial.data.preview.clips.length,2);
  assert.equal(initial.data.preview.render_allowed,false);
  const missing=await rpc(workerKey,'get_edit_operations',{id:'test-editops'});
  assert.equal(missing.data.result.isError,true);
  const denyWorker=await rpc(workerKey,'update_edit_operations',{id:'test-editops',
   action:'APPLY',expected_revision:0,expected_source_sha256:initial.data.source_sha256,
   operation:{type:'SPLIT',clip_id:'s01',at_source_frame:8}});
  assert.equal(denyWorker.data.result.isError,true);
  const director=await rpc(key,'get_edit_operations',{id:'test-editops'});
  assert.equal(director.data.result.isError,false);
  const req={action:'APPLY',expected_revision:0,expected_source_sha256:initial.data.source_sha256,
   operation:{type:'SPLIT',clip_id:'s01',at_source_frame:8}};
  const fail=await post('/api/decks/test-editops/edit-graph/operations',req);
  assert.equal(fail.status,409,'Unsafe without P08: '+JSON.stringify(fail));
  assert.match(fail.data.error,/EDITOPS_APPROVED_SOURCE_REQUIRED/);
  const origin=await post('/api/decks/test-editops/edit-graph/operations',req,{Origin:'https://other.invalid'});
  assert.equal(origin.status,403);
  const unchanged=await get('/api/decks/test-editops/edit-graph/operations');
  assert.equal(unchanged.data.revision,0);
  assert.equal(unchanged.data.preview.clips.length,2);
  const unauthorized=await fetchJson('/api/decks/test-editops/edit-graph/operations',
   {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req)});
  assert.equal(unauthorized.status,401);
 }finally{
  if(child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(1800)]);
  }
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  fs.rmSync(root,{recursive:true,force:true});
 }
});

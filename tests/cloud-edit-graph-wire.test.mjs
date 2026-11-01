import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;await new Promise(r=>server.close(r));return port;
}
test('M01 live REST/MCP: protected rational graph, worker-scoped scene, source-pinned rejection',{timeout:45000},async()=>{
 const root=fs.mkdtempSync(os.tmpdir()+'/pb-editgraph-');
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const key=randomBytes(32).toString('hex'),workerKey=randomBytes(32).toString('hex');
 const basic='Basic '+Buffer.from('owner:editgraph-safepassword-123').toString('base64');
 const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(port),PB_DATA_DIR:root,MCP_API_KEY:key,PB_EDITGRAPH_PREVIEW:'1',
   PB_WEB_USER:'owner',PB_WEB_PASSWORD:'editgraph-safepassword-123',
   PB_AGENT_KEYS_JSON:JSON.stringify([{id:'agent-01',role:'worker',token:workerKey,
    projects:['edit-demo'],scenes:['s01']}])}});
 let logs='';child.stdout.on('data',x=>logs+=x.toString());child.stderr.on('data',x=>logs+=x.toString());
 const http=async(uri,method='GET',data,authenticated=true,headers={})=>{
  const response=await fetch(base+uri,{method,headers:{...(authenticated?{Authorization:basic}:{}),
   ...(data?{'Content-Type':'application/json'}:{}),...headers},
   ...(data?{body:JSON.stringify(data)}:{})});
  return {status:response.status,body:await response.json().catch(()=>null)};
 };
 const rpc=async(token,name,args={})=>{
  const res=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,
   'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:7,
    method:'tools/call',params:{name,arguments:args}})});
  assert.equal(res.status,200);return (await res.json()).result;
 };
 try{
  let ready=false;
  for(let i=0;i<90;i++){if(child.exitCode!==null)throw Error(logs);
   try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await sleep(130)}
  assert.ok(ready,logs);
  const init=await rpc(key,'create_deck',{id:'edit-demo',title:'EditGraph test',
   text:'Одна первая сцена. Вторая сцена с другой репликой.',
   slide_count:2,style:'paper',target:10});
  assert.equal(init.isError,false,JSON.stringify(init));
  const unauth=await http('/api/decks/edit-demo/edit-graph','GET',undefined,false);
  assert.equal(unauth.status,401);
  const graph=await http('/api/decks/edit-demo/edit-graph');
  assert.equal(graph.status,200,JSON.stringify(graph.body));
  assert.equal(graph.body.schema_version,1);
  assert.equal(graph.body.timebase.ticks_per_second,240000);
  assert.equal(graph.body.scenes.length,2);
  assert.equal(graph.body.duration_tick,2400000);
  assert.equal(graph.body.publication_allowed,false);
  assert.match(graph.body.source_sha256,/^[a-f0-9]{64}$/);
  const asDirector=await rpc(key,'get_edit_graph',{id:'edit-demo'});
  assert.equal(asDirector.isError,false,JSON.stringify(asDirector));
  assert.equal(JSON.parse(asDirector.content[0].text).source_sha256,graph.body.source_sha256);
  const asWorker=await rpc(workerKey,'get_edit_graph',{id:'edit-demo',slide_id:'s01'});
  assert.equal(asWorker.isError,false,JSON.stringify(asWorker));
  assert.equal(JSON.parse(asWorker.content[0].text).scenes.length,1);
  assert.equal(JSON.parse(asWorker.content[0].text).scenes[0].scene_id,'s01');
  const otherScene=await rpc(workerKey,'get_edit_graph',{id:'edit-demo',slide_id:'s02'});
  assert.equal(otherScene.isError,true);
  const missingScope=await rpc(workerKey,'get_edit_graph',{id:'edit-demo'});
  assert.equal(missingScope.isError,true);
  const args={id:'edit-demo',expected_revision:0,expected_source_sha256:graph.body.source_sha256,
   trims:[{scene_id:'s01',source_in_frame:0,source_out_frame:10}]};
  const denyWorker=await rpc(workerKey,'propose_edit_graph',args);
  assert.equal(denyWorker.isError,true);
  // REST project comes from the URL. MCP has a separate explicit id argument.
  const {id:ignoredProjectId,...restArgs}=args;
  const proposal=await http('/api/decks/edit-demo/edit-graph','POST',restArgs);
  assert.equal(proposal.status,409,'Missing approved P08 must fail closed: '+JSON.stringify(proposal.body));
  const csrf=await http('/api/decks/edit-demo/edit-graph','POST',restArgs,true,{Origin:'https://malicious.example'});
  assert.equal(csrf.status,403);
  assert.equal((await http('/api/decks/edit-demo/edit-graph')).body.candidate_revision,0);
  const unauthorizedPost=await http('/api/decks/edit-demo/edit-graph','POST',restArgs,false);
  assert.equal(unauthorizedPost.status,401);
 }finally{
  child.kill('SIGTERM');
  await new Promise(r=>child.once('exit',r));
  fs.rmSync(root,{recursive:true,force:true});
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
  const s=net.createServer();
  await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const port=s.address().port;await new Promise(r=>s.close(r));return port;
}
test('P10 MCP worker dispatch across server restart, ACL, conflict and manual replan',{timeout:80000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-dispatch-http-'));
  const port=await freePort(),host='http://127.0.0.1:'+port;
  const mcpDirector=randomBytes(32).toString('hex');
  const agent1=randomBytes(32).toString('hex');
  const agent2=randomBytes(32).toString('hex');
  const password='director-secret-password-123';
  const basic='Basic '+Buffer.from('editor:'+password).toString('base64');
  const env={...process.env,PORT:String(port),PB_DATA_DIR:dir,MCP_API_KEY:mcpDirector,
    PB_WEB_USER:'editor',PB_WEB_PASSWORD:password,PB_AGENT_KEYS_JSON:JSON.stringify([
      {id:'agent-01',token:agent1,role:'worker',projects:['dispatch-video'],scenes:['s01']},
      {id:'agent-02',token:agent2,role:'worker',projects:['dispatch-video'],scenes:['s02']}
    ])};
  let child,logs='';
  async function start(){
    child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',x=>logs+=x.toString());
    child.stderr.on('data',x=>logs+=x.toString());
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error('Server exited: '+logs);
      try{if((await fetch(host+'/health')).ok)return}catch{}
      await sleep(125);
    }
    throw Error('Server did not become healthy: '+logs);
  }
  async function stop(){
    if(child?.exitCode===null){const done=once(child,'close');child.kill('SIGTERM');await done}
    child=null;
  }
  const rpc=async(token,name,args={})=>{
    const r=await fetch(host+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(r.status,200);const result=(await r.json()).result;
    return {error:result.isError,message:result.content[0].text,
      value:result.isError?null:JSON.parse(result.content[0].text)};
  };
  const ok=async(token,name,args)=>{
    const result=await rpc(token,name,args);
    assert.equal(result.error,false,result.message);return result.value;
  };
  const http=async(endpoint,method='GET',body)=>{
    const r=await fetch(host+endpoint,{method,headers:{Authorization:basic,
      ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,value:await r.json()};
  };
  try{
    await start();
    const created=await ok(mcpDirector,'create_deck',{
      id:'dispatch-video',title:'Agentic workflows',slide_count:6,
      text:'Компания формирует запрос. Агент ищет подрядчика. Поставщики предлагают условия. '+
        'Банк проверяет полномочия. Исполнение проходит контроль. Сделка подтверждается.'
    });
    assert.equal(created.slides,6);
    assert.equal((await rpc(agent1,'propose_director_plan',{
      id:'dispatch-video',expected_revision:0,goal:'Forbidden'})).error,true);
    const proposed=await ok(mcpDirector,'propose_director_plan',{
      id:'dispatch-video',expected_revision:0,goal:'Проверяемая B2B-сделка',
      scene_directions:[{scene_id:'s02',depends_on:['s01']}]});
    assert.equal(proposed.status,'draft');
    assert.equal((await rpc(agent1,'claim_director_job',{id:'dispatch-video',slide_id:'s01',
      fence_token:1,expected_task_revision:0})).error,true);
    assert.equal((await http('/api/decks/dispatch-video/director/approve','POST',{
      confirm:'APPROVE',expected_revision:proposed.revision})).status,200);
    const firstBoard=await ok(agent2,'get_director_work',{id:'dispatch-video'});
    assert.equal(firstBoard.jobs.length,1);
    assert.deepEqual(firstBoard.ready_to_claim,[]);
    assert.deepEqual((await http('/api/decks/dispatch-video/director/work')).value.ready_to_claim
      .includes('s01'),true);
    const lease2=await ok(agent2,'claim_scene',{id:'dispatch-video',slide_id:'s02',ttl:300});
    assert.equal((await rpc(agent2,'claim_director_job',{id:'dispatch-video',slide_id:'s02',
      fence_token:lease2.fence,expected_task_revision:1})).error,true);
    const lease1=await ok(agent1,'claim_scene',{id:'dispatch-video',slide_id:'s01',ttl:300});
    assert.equal((await rpc(agent2,'claim_director_job',{id:'dispatch-video',slide_id:'s01',
      fence_token:lease2.fence,expected_task_revision:1})).error,true);
    const claimed=await ok(agent1,'claim_director_job',{
      id:'dispatch-video',slide_id:'s01',fence_token:lease1.fence,expected_task_revision:1});
    assert.equal(claimed.job.attempt,1);
    assert.equal(claimed.idempotent,false);
    const jobId=claimed.job.job_id;
    const file=path.join(dir,'decks','dispatch-video','.director','dispatch','s01.json');
    assert.ok(fs.existsSync(file));
    await stop();
    await start();
    const recovered=await ok(agent1,'get_director_work',{id:'dispatch-video'});
    assert.equal(recovered.jobs[0].job_id,jobId);
    assert.equal(recovered.jobs[0].dispatch_status,'claimed');
    const repeat=await ok(agent1,'claim_director_job',{
      id:'dispatch-video',slide_id:'s01',fence_token:lease1.fence,expected_task_revision:2});
    assert.equal(repeat.idempotent,true);
    assert.equal(repeat.job.job_id,jobId);
    assert.equal((await rpc(agent1,'submit_director_job',{
      id:'dispatch-video',slide_id:'s01',job_id:jobId,fence_token:lease1.fence,
      expected_task_revision:2})).error,true,'unrendered task cannot be submitted');
    const failed=await ok(agent1,'fail_director_job',{
      id:'dispatch-video',slide_id:'s01',job_id:jobId,fence_token:lease1.fence,
      expected_task_revision:2,reason:'3D-model failed validation'});
    assert.equal(failed.scene_status,'blocked');
    assert.equal((await rpc(agent1,'claim_director_job',{
      id:'dispatch-video',slide_id:'s01',fence_token:lease1.fence,expected_task_revision:3})).error,true);
    const replan=await http('/api/decks/dispatch-video/director/replan/s01','POST',{
      expected_plan_revision:2,expected_task_revision:3,
      reason:'Проверить новый 3D-меш',reset_checkpoint_ids:['assets']});
    assert.equal(replan.status,200,JSON.stringify(replan.value));
    const next=await ok(agent1,'claim_director_job',{
      id:'dispatch-video',slide_id:'s01',fence_token:lease1.fence,expected_task_revision:4});
    assert.equal(next.job.attempt,1);
    assert.notEqual(next.job.job_id,jobId);
    assert.equal((await ok(agent2,'get_director_work',{id:'dispatch-video'})).jobs[0].dispatch_status,'not_started');
  }finally{
    await stop();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

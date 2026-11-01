import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){
  const s=net.createServer();
  await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
  const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;
}
test('parallel scene assignments: REST and MCP integration, revision conflicts and checkpoint isolation',{timeout:45000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-tasks-'));
  const p=await port(),base='http://127.0.0.1:'+p;
  const token=randomBytes(32).toString('hex');
  const basic='Basic '+Buffer.from('editor:taskSecret123456789').toString('base64');
  const child=spawn(process.execPath,['server/cloud.mjs'],{
    cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(p),PB_DATA_DIR:dir,MCP_API_KEY:token,
      PB_WEB_USER:'editor',PB_WEB_PASSWORD:'taskSecret123456789'},
  });
  let output='';
  child.stdout.on('data',x=>output+=x.toString());
  child.stderr.on('data',x=>output+=x.toString());
  const request=(url,method='GET',payload)=>fetch(base+url,{method,
    headers:{Authorization:basic,...(payload===undefined?{}:{'Content-Type':'application/json'})},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  const rpc=async(name,args,id=1)=>{
    const response=await fetch(base+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(response.status,200);
    const json=await response.json();
    assert.equal(json.result.isError,false,JSON.stringify(json));
    return JSON.parse(json.result.content[0].text);
  };
  try {
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw new Error('Server exited: '+output);
      try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
      await sleep(130);
    }
    assert.ok(ready,'Server not ready: '+output);
    await rpc('create_deck',{id:'agents',title:'Six agents',text:'Сцена один. Сцена два.',slide_count:2},2);
    const start=await request('/api/decks/agents/tasks');
    assert.equal(start.status,200);
    const all=await start.json();
    assert.equal(all.length,2);
    assert.deepEqual(all.map(x=>x.revision),[0,0]);
    const task1={
      expected_revision:0,title:'3D-вступление',assignee:'Agent-01',status:'in_progress',
      brief:'Подробная анимация ядра сделки, орбиты и камера.',
      deliverables:'Рендер MP4, скриншоты и проверка 24 FPS.',
      checkpoints:[{id:'model',title:'Собрать 3D-геометрию',done:false,note:''},
        {id:'render',title:'Отрендерить ролик',done:false,note:''}],
    };
    const saved=await request('/api/decks/agents/tasks/s01','PUT',task1);
    assert.equal(saved.status,200);
    const v1=await saved.json();
    assert.equal(v1.revision,1);assert.equal(v1.assignee,'Agent-01');
    assert.equal(fs.existsSync(path.join(dir,'decks','agents','.scene-tasks','s01.json')),true);
    const second=await rpc('set_scene_task',{id:'agents',slide_id:'s02',expected_revision:0,
      title:'Переговоры агентов',assignee:'Agent-02',brief:'RFQ → QUOTE.',status:'todo',
      checkpoints:[{id:'rfq',title:'Собрать RFQ / Quote',done:false,note:''}]},3);
    assert.equal(second.scene_id,'s02');assert.equal(second.revision,1);
    const cp=await rpc('set_scene_checkpoint',{id:'agents',slide_id:'s01',
      checkpoint_id:'model',done:true,note:'Модель и камера проверены'},4);
    assert.equal(cp.checkpoints[0].done,true);assert.equal(cp.revision,2);
    assert.equal(cp.checkpoints[0].note,'Модель и камера проверены');
    const list=await rpc('list_scene_tasks',{id:'agents'},5);
    assert.equal(list.length,2);
    assert.equal(list[0].checkpoints.filter(x=>x.done).length,1);
    assert.equal(list[1].checkpoints[0].done,false);
    const get=await rpc('get_deck',{id:'agents'},6);
    assert.equal(get.scene_tasks[0].checkpoints_done,1);
    assert.equal(get.scene_tasks[1].assignee,'Agent-02');
    const exact=await rpc('get_scene_task',{id:'agents',slide_id:'s01'},7);
    assert.equal(exact.brief,task1.brief);
    // The stale editor cannot overwrite an agent's newly completed checkpoint.
    const conflict=await request('/api/decks/agents/tasks/s01','PUT',{...task1,expected_revision:1});
    assert.equal(conflict.status,409);
    assert.equal((await (await request('/api/decks/agents/tasks/s01')).json()).checkpoints[0].done,true);
    // Assignments do not alter narration/timing and vice versa.
    const deck=await (await request('/api/decks/agents')).json();
    assert.ok(!('scene_tasks' in deck));
    assert.equal(deck.slides[0].cues.length,1);
    assert.equal((await request('/api/decks/agents/tasks/s01/checkpoints/not-a-checkpoint','PATCH',{done:true})).status,404);
    assert.equal((await request('/api/decks/agents/tasks/../other','GET')).status,404);
  }finally{
    if(child.exitCode===null){const closing=once(child,'close');child.kill('SIGTERM');await closing}
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

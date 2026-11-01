import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

async function unusedPort(){
  const s=net.createServer();
  await new Promise(ok=>s.listen(0,'127.0.0.1',ok));
  const port=s.address().port;
  await new Promise(ok=>s.close(ok));
  return port;
}
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));

test('fresh-chat agent reads project README, scene tasks and verified checkpoints through MCP',{timeout:50000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-project-readme-'));
  const port=await unusedPort();
  const token=randomBytes(32).toString('hex');
  const basic='Basic '+Buffer.from('editor:readmeDemoPassword123').toString('base64');
  const base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,['server/cloud.mjs'],{
    cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),PB_DATA_DIR:dir,MCP_API_KEY:token,
      PB_WEB_USER:'editor',PB_WEB_PASSWORD:'readmeDemoPassword123'},
  });
  let output='';
  child.stdout.on('data',x=>output+=x.toString());
  child.stderr.on('data',x=>output+=x.toString());
  async function api(route,method='GET',payload){
    return fetch(base+route,{method,
      headers:{Authorization:basic,...(payload===undefined?{}:{'Content-Type':'application/json'})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  }
  async function call(name,args,id=1){
    const res=await fetch(base+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.result.isError,false,JSON.stringify(data));
    return JSON.parse(data.result.content[0].text);
  }
  try {
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw new Error(output);
      try{ready=(await fetch(base+'/health')).ok;if(ready)break}catch{}
      await sleep(100);
    }
    assert.ok(ready,'Cloud server boot failed: '+output);

    const registered=await (await fetch(base+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:99,method:'tools/list',params:{}})})).json();
    const tools=registered.result.tools.map(t=>t.name);
    for(const n of ['list_decks','get_project_context','get_project_readme','update_project_readme','get_scene_task'])
      assert.ok(tools.includes(n),'missing MCP tool: '+n);

    await call('create_deck',{id:'demo-guide',title:'Agent bank',text:'Покупатель запрашивает оферту. Банк выполняет расчёт.',slide_count:2,target:12},2);
    const created=path.join(dir,'decks','demo-guide','README.md');
    assert.ok(fs.existsSync(created),'new project has a physical README.md');
    const starter=await call('list_decks',{},3);
    assert.ok(starter.find(x=>x.id==='demo-guide'));
    const first=await call('get_project_context',{id:'demo-guide'},4);
    assert.equal(first.project.slides.length,2);
    assert.ok(first.readme.content.includes('Agent bank'));
    assert.ok(first.readme.content.includes('get_scene_task'));
    assert.equal(first.scene_tasks.length,2);
    assert.equal(first.scene_tasks[0].status,'todo');

    const readme=await call('get_project_readme',{id:'demo-guide'},5);
    assert.equal(readme.source,'saved');
    const newContent='# Agent bank\n\n## Стиль\n\nТёмный 3D, плавная камера. Один агент — одна сцена.\n\n## Ограничения\n\nA2A не проводит оплату.\n';
    const changed=await call('update_project_readme',{id:'demo-guide',
      content:newContent,expected_revision:readme.revision},6);
    assert.equal(changed.content,newContent);
    assert.notEqual(changed.revision,readme.revision);
    assert.equal(fs.readFileSync(created,'utf8'),newContent);

    const conflict=await api('/api/decks/demo-guide/readme','PUT',{
      content:'# stale',expected_revision:readme.revision,
    });
    assert.equal(conflict.status,409,'stale writer must not destroy new README');

    const task=await call('set_scene_task',{
      id:'demo-guide',slide_id:'s01',expected_revision:0,
      title:'3D Agent 01',assignee:'Agent-01',status:'in_progress',
      brief:'Сделать вращающееся 3D-ядро',deliverables:'MP4 и проверенный предпросмотр',
      checkpoints:[{id:'geometry',title:'3D-модель собрана',done:false}],
    },7);
    assert.equal(task.assignee,'Agent-01');
    const cp=await call('set_scene_checkpoint',{
      id:'demo-guide',slide_id:'s01',checkpoint_id:'geometry',done:true,note:'Фрейм проверен',
    },8);
    assert.equal(cp.checkpoints[0].done,true);
    const newcomer=await call('get_project_context',{id:'demo-guide',slide_id:'s01'},9);
    assert.equal(newcomer.readme.content,newContent);
    assert.equal(newcomer.assigned_scene_task.brief,'Сделать вращающееся 3D-ядро');
    assert.equal(newcomer.assigned_scene_task.checkpoints[0].note,'Фрейм проверен');
    assert.equal(newcomer.scene_tasks[0].checkpoints_done,1);
    assert.equal(newcomer.scene_tasks[1].checkpoints_done,0);
    assert.equal((await call('get_deck',{id:'demo-guide'},10)).project_readme.content,newContent);
    assert.equal((await (await api('/api/decks/demo-guide/readme')).json()).content,newContent);
    const raw=await (await api('/api/decks/demo-guide')).json();
    assert.equal(raw.id,'demo-guide');
    assert.ok(!Object.hasOwn(raw,'project_readme'),'README stays outside deck.json');
    assert.equal((await call('get_scene_task',{id:'demo-guide',slide_id:'s01'},11)).checkpoints[0].done,true);

    const missing=await api('/api/decks/nonexistent/readme');
    assert.equal(missing.status,404);
    const oversized=await api('/api/decks/demo-guide/readme','PUT',{
      content:'# '+('x'.repeat(66_000)),expected_revision:changed.revision,
    });
    assert.equal(oversized.status,400);
    assert.equal((await call('get_project_readme',{id:'demo-guide'},12)).content,newContent);
  }finally{
    if(child.exitCode===null){const closed=once(child,'close');child.kill('SIGTERM');await closed}
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

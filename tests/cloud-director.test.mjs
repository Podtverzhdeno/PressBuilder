import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
  const s=net.createServer();
  await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
  const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;
}
test('Director P10: six-scene plan, human approval, progress and stale-write protections',{timeout:50000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-director-'));
  const port=await freePort(),base='http://127.0.0.1:'+port;
  const key=randomBytes(32).toString('hex');
  const basic='Basic '+Buffer.from('editor:directorSecret123456789').toString('base64');
  const child=spawn(process.execPath,['server/cloud.mjs'],{
    cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),PB_DATA_DIR:dir,MCP_API_KEY:key,
      PB_WEB_USER:'editor',PB_WEB_PASSWORD:'directorSecret123456789',
      PB_CREATIVE_STORY_PREVIEW:'1'}
  });
  let output='';
  child.stdout.on('data',v=>output+=v.toString());
  child.stderr.on('data',v=>output+=v.toString());
  const http=async(p,method='GET',body,auth=true,headers={})=>{
    const r=await fetch(base+p,{method,headers:{
      ...(auth?{Authorization:basic}:{}),
      ...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,json:await r.json().catch(()=>null)};
  };
  const rpc=async(name,args={})=>{
    const res=await fetch(base+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(res.status,200);
    const result=(await res.json()).result;
    return {error:result.isError,value:result.content[0].text};
  };
  const good=async(name,args)=>{const r=await rpc(name,args);assert.equal(r.error,false,r.value);return JSON.parse(r.value)};
  const script='Первая компания инициирует запрос. Затем появляются поставщики. '+
    'Агенты направляют предложения. Идёт независимая проверка полномочий. '+
    'Банк подтверждает платёж. Сделка завершается и проверяется.';
  const create=async(id)=>{
    const d=await good('create_deck',{id,title:'Шесть сцен',text:script,slide_count:6,target:42});
    assert.equal(d.slides,6,'fixture needs six distinct scenes');
  };
  try{
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw new Error('Server exited: '+output);
      try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
      await sleep(120);
    }
    assert.ok(ready,output);
    const listed=await fetch(base+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}})});
    const tools=(await listed.json()).result.tools.map(x=>x.name);
    assert.ok(tools.includes('propose_director_plan'));
    assert.ok(tools.includes('get_director_plan'));
    assert.ok(tools.includes('get_creative_story_context'));
    assert.ok(tools.includes('preview_creative_storyboard'));
    assert.ok(!tools.includes('approve_creative_storyboard'));
    assert.ok(!tools.includes('approve_director_plan'));

    await create('six-good');
    const deckBefore=(await http('/api/decks/six-good')).json;
    const readmeBefore=(await http('/api/decks/six-good/readme')).json;
    assert.equal((await good('get_director_plan',{id:'six-good'})).revision,0);
    const proposed=await good('propose_director_plan',{id:'six-good',expected_revision:0,
      goal:'Показать проверяемую агентную B2B-сделку без вымышленных фактов',
      constraints:'Единый стиль, 24 FPS для MP4-приёмки, минимум титров',
      scene_directions:[{scene_id:'s02',concept:'Чёткое движение камеры к поставщикам',
        must_show:'Подтверждённые данные запроса',depends_on:['s01']}]});
    assert.equal(proposed.status,'draft');
    assert.equal(proposed.scenes.length,6);
    assert.equal(proposed.scenes[1].task.assignee,'Agent-02');
    assert.deepEqual(proposed.scenes[1].depends_on,['s01']);
    assert.equal(proposed.style_contract.schemaVersion,1);
    assert.equal(proposed.style_contract.enforce,false);
    assert.deepEqual((await http('/api/decks/six-good')).json,deckBefore);
    assert.deepEqual((await http('/api/decks/six-good/readme')).json,readmeBefore);
    assert.deepEqual((await http('/api/decks/six-good/tasks')).json.map(x=>x.revision),[0,0,0,0,0,0]);
    assert.equal((await http('/api/decks/six-good/director/approve','POST',
      {expected_revision:proposed.revision,confirm:'APPROVE'},false)).status,401);
    assert.equal((await http('/api/decks/six-good/director/approve','POST',
      {expected_revision:proposed.revision,confirm:'APPROVE'} ,true,{Origin:'https://evil.example'})).status,403);
    assert.equal((await http('/api/decks/six-good/director/approve','POST',
      {expected_revision:proposed.revision,confirm:'YES'})).status,400);
    const result=await http('/api/decks/six-good/director/approve','POST',
      {expected_revision:proposed.revision,confirm:'APPROVE'});
    assert.equal(result.status,200,JSON.stringify(result.json));
    assert.equal(result.json.status,'approved');
    const storyContext=await http('/api/decks/six-good/creative/context');
    assert.equal(storyContext.status,200,JSON.stringify(storyContext.json));
    assert.equal(storyContext.json.plan_revision,2);
    assert.equal(storyContext.json.scenes.length,6);
    const story=await http('/api/decks/six-good/creative/preview','POST',{
      manifest:{expected_plan_revision:storyContext.json.plan_revision,
        expected_source_sha256:storyContext.json.source_sha256}});
    assert.equal(story.status,200,JSON.stringify(story.json));
    assert.equal(story.json.status,'READY_FOR_REVIEW');
    assert.equal(story.json.candidates.length,2);
    assert.equal(story.json.publication_allowed,false);
    assert.deepEqual(story.json.candidates[1].order,['s05','s01','s02','s03','s04','s06']);
    assert.deepEqual((await http('/api/decks/six-good')).json,deckBefore);
    assert.equal((await good('preview_creative_storyboard',{
      id:'six-good',expected_plan_revision:2,
      expected_source_sha256:storyContext.json.source_sha256
    })).candidates.length,2);
    const staleStory=await http('/api/decks/six-good/creative/preview','POST',{
      manifest:{expected_plan_revision:1,expected_source_sha256:storyContext.json.source_sha256}});
    assert.equal(staleStory.status,409);
    const unauthStory=await http('/api/decks/six-good/creative/context','GET',undefined,false);
    assert.equal(unauthStory.status,401);
    const csrfStory=await http('/api/decks/six-good/creative/preview','POST',{
      manifest:{expected_plan_revision:2,expected_source_sha256:storyContext.json.source_sha256}},
      true,{Origin:'https://evil.example'});
    assert.equal(csrfStory.status,403);

    const afterApproveDraft=await rpc('propose_director_plan',{id:'six-good',
      expected_revision:2,goal:'Нельзя подменять утверждённый план'});
    assert.equal(afterApproveDraft.error,true);
    assert.equal((await http('/api/decks/six-good/director/plan')).json.status,'approved');
    assert.equal(result.json.revision,2);
    assert.equal(result.json.progress.total,6);
    assert.equal(result.json.progress.done,0);
    assert.equal(result.json.progress.release_status,'manual_review_required');
    assert.ok(result.json.progress.ready_to_start.includes('s01'));
    assert.ok(!result.json.progress.ready_to_start.includes('s02'));
    assert.deepEqual(result.json.progress.scene_statuses[1].waiting_on,['s01']);
    const tasks=(await http('/api/decks/six-good/tasks')).json;
    assert.deepEqual(tasks.map(x=>x.assignee),['Agent-01','Agent-02','Agent-03',
      'Agent-04','Agent-05','Agent-06']);
    assert.ok(tasks.every(x=>x.revision===1&&x.status==='todo'&&x.checkpoints.length===6));
    assert.ok(tasks.every(x=>x.checkpoints.every(cp=>cp.done===false)));
    assert.equal(tasks[1].brief.includes('Чёткое движение камеры'),true);
    assert.equal(fs.existsSync(path.join(dir,'decks','six-good','.director','pending.json')),false);
    assert.ok((await http('/api/decks/six-good/readme')).json.content.includes('Утверждённая режиссёрская постановка'));
    assert.deepEqual((await http('/api/decks/six-good')).json,deckBefore,'Director must not touch deck.json');
    assert.equal((await http('/api/decks/six-good/director/approve','POST',
      {expected_revision:proposed.revision,confirm:'APPROVE'})).status,409);
    const updated=await good('set_scene_checkpoint',{id:'six-good',slide_id:'s03',
      checkpoint_id:'storyboard',done:true,note:'Согласовано'});
    assert.equal(updated.revision,2);
    const progress=await good('get_director_plan',{id:'six-good'});
    assert.equal(progress.progress.checkpoints_done,1);
    assert.equal(progress.progress.scene_statuses[2].revision,2);
    const blocked=await http('/api/decks/six-good/tasks/s03','PUT',
      {expected_revision:2,status:'blocked'});
    assert.equal(blocked.status,200);
    assert.equal(blocked.json.revision,3);
    const untouchedBefore=(await http('/api/decks/six-good/tasks/s02')).json;
    const replan=await http('/api/decks/six-good/director/replan/s03','POST',{
      expected_plan_revision:2,expected_task_revision:3,
      reason:'Технический QA выявил наложение титра',
      direction:'Изменить камеру и убрать пересечение текста',
      reset_checkpoint_ids:['storyboard']
    });
    assert.equal(replan.status,200,JSON.stringify(replan.json));
    assert.equal(replan.json.revision,3);
    assert.equal(replan.json.replan_history.length,1);
    assert.equal(replan.json.replan_history[0].scene_id,'s03');
    const changedTask=(await http('/api/decks/six-good/tasks/s03')).json;
    assert.equal(changedTask.status,'todo');
    assert.equal(changedTask.revision,4);
    assert.equal(changedTask.checkpoints[0].done,false);
    assert.equal(changedTask.checkpoints[0].note,'Согласовано');
    assert.deepEqual((await http('/api/decks/six-good/tasks/s02')).json,untouchedBefore);
    assert.equal((await http('/api/decks/six-good/director/replan/s03','POST',{
      expected_plan_revision:3,expected_task_revision:4,reason:'Повторное изменение'})).status,409);

    await create('six-conflict');
    const c=await good('propose_director_plan',{id:'six-conflict',expected_revision:0,goal:'Контроль неизменности'});
    const originalReadme=(await http('/api/decks/six-conflict/readme')).json;
    const beforeTasks=(await http('/api/decks/six-conflict/tasks')).json;
    const outsider=await good('set_scene_task',{id:'six-conflict',slide_id:'s01',
      expected_revision:0,brief:'Другой агент уже начал работу',status:'in_progress'});
    assert.equal(outsider.revision,1);
    const conflict=await http('/api/decks/six-conflict/director/approve','POST',
      {expected_revision:c.revision,confirm:'APPROVE'});
    assert.equal(conflict.status,409);
    assert.deepEqual((await http('/api/decks/six-conflict/readme')).json,originalReadme);
    const afterTasks=(await http('/api/decks/six-conflict/tasks')).json;
    assert.equal(afterTasks[0].brief,'Другой агент уже начал работу');
    assert.deepEqual(afterTasks.slice(1),beforeTasks.slice(1));

    await create('six-stale');
    const stale=await good('propose_director_plan',{id:'six-stale',expected_revision:0,goal:'Не допускать устаревший сценарий'});
    const changed=await good('update_cue',{id:'six-stale',slide_id:'s01',
      cue_id:(await http('/api/decks/six-stale')).json.slides[0].cues[0].id,
      say:'Сценарий изменился после согласования'});
    assert.equal(changed.ok,true);
    assert.equal((await http('/api/decks/six-stale/director/approve','POST',
      {expected_revision:stale.revision,confirm:'APPROVE'})).status,409);

    await create('six-invalid');
    const bad=await http('/api/decks/six-invalid/director/plan','POST',{
      expected_revision:0,goal:'Драфт',scene_directions:[{
        scene_id:'s02',depends_on:['s03']}]});
    assert.equal(bad.status,400,'forward dependency must not be accepted');
    const unavailable=await rpc('approve_director_plan',{id:'six-good',confirm:'APPROVE'});
    assert.equal(unavailable.error,true);
  } finally {
    if(child.exitCode===null){const closing=once(child,'close');child.kill('SIGTERM');await closing}
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

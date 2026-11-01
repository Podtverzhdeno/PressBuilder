import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {directorDispatchStore} from '../server/director-dispatch.mjs';
import {sceneTaskStore} from '../server/scene-tasks.mjs';
import {sceneLeaseStore} from '../server/scene-leases.mjs';

const issue=(call,status)=>assert.throws(call,e=>e.status===status,'Expected HTTP status '+status);
const setup=()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-director-work-'));
  let clock=1_000_000;
  const id='dispatch-demo',slides=['s01','s02','s03'];
  const getDeck=project=>{
    if(project!==id)throw Error('Unknown deck');
    return {id,slides:slides.map(x=>({id:x,label:x,cues:[{id:x+'c',say:x}]}))};
  };
  const sceneTasks=sceneTaskStore({root,getDeck});
  for(const [i,scene] of slides.entries()){
    sceneTasks.put(id,scene,{
      title:scene,assignee:'Agent-0'+(i+1),status:'todo',
      checkpoints:[
        {id:'render',title:'MP4 готов',done:false,note:''},
        {id:'technical_qa',title:'QA пройден',done:false,note:''},
        {id:'human_review',title:'Согласовано',done:false,note:''}
      ]
    },0);
  }
  const plan={id,plan_id:'plan-v1',status:'approved',revision:2,replan_history:[],
    scenes:[{scene_id:'s01',depends_on:[]},{scene_id:'s02',depends_on:['s01']},
      {scene_id:'s03',depends_on:['s02']}]};
  const director={read:()=>plan};
  const leases=sceneLeaseStore({root,getDeck,now:()=>clock});
  const out=path.join(root,'out');fs.mkdirSync(out,{recursive:true});
  let renders={};
  const dispatch=()=>directorDispatchStore({
    root,director,sceneTasks,leases,getRender:(d,s)=>renders[s],out,now:()=>clock,maxClaims:3
  });
  const actor=scene=>({id:'agent-'+scene.slice(1),role:'worker',projects:[id],scenes:[scene]});
  return {root,id,sceneTasks,leases,plan,out,dispatch,actor,
    advance:n=>{clock+=n},setRender:(scene,r)=>{renders[scene]=r},
    clean:()=>fs.rmSync(root,{recursive:true,force:true})};
};

test('P10 dispatch: scoped pulls, dependency gate, exact render QA and human-only review',()=>{
  const x=setup();
  const {id,sceneTasks,leases,dispatch,actor}=x;
  const a1=actor('s01'),a2=actor('s02');
  try{
    const service=dispatch();
    const before=service.snapshot(id,a2);
    assert.deepEqual(before.ready_to_claim,[]);
    assert.equal(before.jobs.length,1,'workers see only their own scene');
    const l2=leases.claim(id,'s02',a2,60);
    issue(()=>service.claim(id,'s02',a2,{fence_token:l2.fence,expected_task_revision:1}),409);
    issue(()=>service.snapshot(id,{...a2,projects:['not-his-project']}),403);
    issue(()=>service.claim(id,'s01',a2,{fence_token:l2.fence,expected_task_revision:1}),403);
    const l1=leases.claim(id,'s01',a1,60);
    issue(()=>service.claim(id,'s01',a1,{fence_token:l1.fence,expected_task_revision:0}),409);
    const claimed=service.claim(id,'s01',a1,{fence_token:l1.fence,expected_task_revision:1});
    assert.equal(claimed.idempotent,false);
    assert.equal(claimed.job.attempt,1);
    assert.equal(sceneTasks.read(id,'s01').status,'in_progress');
    const restarted=dispatch();
    assert.equal(restarted.claim(id,'s01',a1,{fence_token:l1.fence,expected_task_revision:2}).job.job_id,claimed.job.job_id);
    issue(()=>restarted.submit(id,'s01',a1,{job_id:claimed.job.job_id,fence_token:l1.fence,
      expected_task_revision:2}),409);
    let task=sceneTasks.read(id,'s01');
    sceneTasks.put(id,'s01',{checkpoints:task.checkpoints.map(cp=>({
      ...cp,done:cp.id!=='human_review',note:cp.id!=='human_review'?'Video/QA evidence':''
    }))},task.revision);
    task=sceneTasks.read(id,'s01');
    issue(()=>restarted.submit(id,'s01',a1,{job_id:claimed.job.job_id,fence_token:l1.fence,
      expected_task_revision:task.revision}),409);
    x.setRender('s01',{status:'completed',qa_report:{verdict:'FAIL'}});
    fs.writeFileSync(path.join(x.out,id+'_s01.mp4'),Buffer.from('synthetic video bytes'));
    issue(()=>restarted.submit(id,'s01',a1,{job_id:claimed.job.job_id,fence_token:l1.fence,
      expected_task_revision:task.revision}),409);
    x.setRender('s01',{status:'completed',qa_report:{verdict:'PASS'}});
    const result=restarted.submit(id,'s01',a1,{job_id:claimed.job.job_id,fence_token:l1.fence,
      expected_task_revision:task.revision});
    assert.equal(result.scene_status,'review');
    assert.equal(sceneTasks.read(id,'s01').status,'review');
    issue(()=>restarted.submit(id,'s01',a1,{job_id:claimed.job.job_id,fence_token:l1.fence,
      expected_task_revision:task.revision+1}),409);
    assert.deepEqual(restarted.snapshot(id,a2).ready_to_claim,[],
      'worker 2 waits for human approval, not merely a render');
    const awaiting=sceneTasks.read(id,'s01');
    sceneTasks.put(id,'s01',{status:'done',checkpoints:awaiting.checkpoints.map(cp=>({
      ...cp,done:true,note:cp.note||'Human acceptance evidence'
    }))},awaiting.revision);
    assert.deepEqual(restarted.snapshot(id,a2).ready_to_claim,['s02']);
    const c2=restarted.claim(id,'s02',a2,{fence_token:l2.fence,expected_task_revision:1});
    assert.equal(c2.job.attempt,1);
    assert.equal(sceneTasks.read(id,'s03').status,'todo');
    const failed=restarted.fail(id,'s02',a2,{job_id:c2.job.job_id,fence_token:l2.fence,
      expected_task_revision:2,reason:'Титры пересекаются с объектом'});
    assert.equal(failed.scene_status,'blocked');
    assert.equal(sceneTasks.read(id,'s02').status,'blocked');
    assert.equal(sceneTasks.read(id,'s01').status,'done');
    assert.equal(restarted.snapshot(id,a2).jobs[0].dispatch_status,'failed');
    // A manual replan of only s02 starts a new dispatch epoch.
    x.plan.replan_history.push({scene_id:'s02',attempt:1});
    x.plan.revision++;
    const b=sceneTasks.read(id,'s02');
    sceneTasks.put(id,'s02',{status:'todo'},b.revision);
    const retry=restarted.claim(id,'s02',a2,{fence_token:l2.fence,
      expected_task_revision:b.revision+1});
    assert.equal(retry.job.attempt,1,'replan starts only its scene over');
    assert.notEqual(retry.job.job_id,c2.job.job_id);
    assert.equal(restarted.snapshot(id,a1).jobs[0].dispatch_status,'submitted',
      'replanning s02 must not invalidate s01 job history');
    const log=fs.readFileSync(path.join(x.root,id,'.director','dispatch-events.jsonl'),'utf8');
    assert.ok(log.includes('"type":"failed"'));
    assert.ok(log.includes('"type":"submitted"'));
  }finally{x.clean()}
});

test('P10 dispatch: bounded attempts, expired fences, heartbeat and restart replay',()=>{
  const x=setup(),id=x.id,agent=x.actor('s01'),svc=x.dispatch();
  try{
    let fence=x.leases.claim(id,'s01',agent,30).fence;
    const first=svc.claim(id,'s01',agent,{fence_token:fence,expected_task_revision:1});
    assert.equal(first.job.attempt,1);
    issue(()=>svc.heartbeat(id,'s01',agent,{fence_token:fence-1,job_id:first.job.job_id}),409);
    x.leases.renew(id,'s01',agent,fence,60);
    assert.ok(svc.heartbeat(id,'s01',agent,{fence_token:fence,job_id:first.job.job_id}).expires_at>
      first.job.expires_at);
    x.advance(61_000);
    fence=x.leases.claim(id,'s01',agent,30).fence;
    issue(()=>svc.heartbeat(id,'s01',agent,{fence_token:fence,job_id:first.job.job_id}),409);
    const second=svc.claim(id,'s01',agent,{fence_token:fence,expected_task_revision:2});
    assert.equal(second.job.attempt,2);
    x.advance(31_000);fence=x.leases.claim(id,'s01',agent,30).fence;
    assert.equal(x.dispatch().claim(id,'s01',agent,{fence_token:fence,expected_task_revision:2}).job.attempt,3);
    x.advance(31_000);fence=x.leases.claim(id,'s01',agent,30).fence;
    issue(()=>svc.claim(id,'s01',agent,{fence_token:fence,expected_task_revision:2}),429);
    assert.equal(svc.snapshot(id,agent).jobs[0].claims_left,0);
    x.plan.replan_history.push({scene_id:'s01',attempt:1});x.plan.revision++;
    const old=x.sceneTasks.read(id,'s01');
    x.sceneTasks.put(id,'s01',{status:'todo'},old.revision);
    assert.equal(svc.claim(id,'s01',agent,{fence_token:fence,
      expected_task_revision:old.revision+1}).job.attempt,1);
  }finally{x.clean()}
});

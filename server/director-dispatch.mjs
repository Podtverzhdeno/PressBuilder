/**
 * P10 pull-based dispatch. This coordinates EXTERNAL agents; it never executes
 * arbitrary code, starts a ChatGPT session or auto-approves finished scenes.
 * Single-process filesystem MVP; P06 fenced leases remain the write authority.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const fail=(msg,status=400)=>{throw Object.assign(new Error(msg),{status})};
const allowedRole=(actor)=>actor&&['director','worker'].includes(actor.role);
const ISO=(ms)=>new Date(ms).toISOString();

export function directorDispatchStore({
  root,director,sceneTasks,leases,getRender,out,now=()=>Date.now(),
  maxClaims=3
}){
  if(!Number.isInteger(maxClaims)||maxClaims<1||maxClaims>10)throw new Error('Invalid claim budget');
  function locate(id,scene){
    if(typeof id!=='string'||!SLUG.test(id)||typeof scene!=='string'||!SLUG.test(scene))
      fail('Invalid project or scene ID');
    const plan=director.read(id);
    if(!plan.scenes?.some(s=>s.scene_id===scene))fail('Scene is not in Director plan',404);
    return path.join(root,id,'.director','dispatch',scene+'.json');
  }
  function record(id,scene){
    const file=locate(id,scene);
    if(!fs.existsSync(file))return null;
    try{
      const r=JSON.parse(fs.readFileSync(file,'utf8'));
      if(r.id!==id||r.scene_id!==scene||!Number.isSafeInteger(r.attempt)||r.attempt<1)
        throw new Error('Invalid persisted dispatch');
      return r;
    }catch{fail('Dispatch record unreadable',500)}
  }
  function persist(id,scene,value){
    const file=locate(id,scene);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const temp=file+'.'+randomUUID()+'.tmp';
    fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
    try{fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}
  }
  function event(id,scene,actor,type,job,details={}){
    const file=path.join(root,id,'.director','dispatch-events.jsonl');
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.appendFileSync(file,JSON.stringify({
      at:ISO(now()),event_id:randomUUID(),type,scene_id:scene,actor_id:actor.id,
      job_id:job.job_id,attempt:job.attempt,...details
    })+'\n',{mode:0o600});
  }
  function verifyScope(id,scene,actor){
    if(!allowedRole(actor))fail('Director or worker role required',403);
    leases.scoped(actor,id,scene);
  }
  function worker(id,scene,actor,fence){
    if(actor?.role!=='worker')fail('Worker role required',403);
    verifyScope(id,scene,actor);
    leases.assertWrite(id,scene,actor,fence);
    const plan=director.read(id);
    if(plan.status!=='approved')fail('Director plan is not approved for execution',409);
    const task=sceneTasks.read(id,scene);
    if(!task.assignee||task.assignee.toLowerCase()!==actor.id.toLowerCase())
      fail('Scene is assigned to another agent',403);
    return {plan,task};
  }
  function activeLease(id,scene,actor,fence){
    const lease=leases.read(id,scene);
    if(lease.holder!==actor.id||lease.fence!==fence||lease.expires_at<=now())
      fail('Expired, missing or foreign fenced scene lease',409);
    return lease;
  }
  function snapshot(id,actor){
    if(!allowedRole(actor))fail('Director or worker role required',403);
    const plan=director.read(id);
    if(plan.status==='none')return {id,plan_status:'none',jobs:[]};
    if(actor.role!=='director'&&!actor.projects?.includes(id))
      fail('Project is outside worker scope',403);
    const tasks=sceneTasks.list(id);
    const byId=new Map(tasks.map(t=>[t.scene_id,t]));
    const jobs=plan.scenes.filter(s=>actor.role==='director'||
      actor.scenes?.includes(s.scene_id)).map(s=>{
      const task=byId.get(s.scene_id);
      const last=record(id,s.scene_id);
      const wait=s.depends_on.filter(dep=>byId.get(dep)?.status!=='done');
      const sameRevision=last?.plan_revision===plan.revision;
      const currentlyClaimed=Boolean(sameRevision&&last?.state==='claimed'&&last.expires_at>now());
      const exhausted=Boolean(sameRevision&&last?.attempt>=maxClaims);
      const candidate=Boolean(plan.status==='approved'&&wait.length===0&&
        (task.status==='todo'||(task.status==='in_progress'&&last?.state==='claimed'&&last.expires_at<=now())));
      return {scene_id:s.scene_id,assignee:task.assignee,task_status:task.status,
        task_revision:task.revision,depends_on:s.depends_on,waiting_on:wait,
        dispatch_status:currentlyClaimed?'claimed':sameRevision&&last?.state==='claimed'?'expired':
          sameRevision&&last?.state||'not_started',
        attempt:sameRevision?last?.attempt||0:0,claims_left:sameRevision?Math.max(0,maxClaims-(last?.attempt||0)):maxClaims,
        job_id:sameRevision?last?.job_id||null:null,
        claimed_by:currentlyClaimed?last.actor_id:null,
        ready_to_claim:candidate&&!currentlyClaimed&&!exhausted,
        ...(currentlyClaimed?{expires_at:ISO(last.expires_at)}:{})};
      });
    return {id,plan_status:plan.status,plan_revision:plan.revision,jobs,
      ready_to_claim:jobs.filter(x=>x.ready_to_claim).map(x=>x.scene_id),
      limits:{claims_per_scene:maxClaims},model:'external_worker_pull'};
  }
  function claim(id,scene,actor,{fence_token,expected_task_revision}={}){
    const {plan,task}=worker(id,scene,actor,fence_token);
    const lease=activeLease(id,scene,actor,fence_token);
    const dep=plan.scenes.find(s=>s.scene_id===scene).depends_on;
    if(dep.some(s=>sceneTasks.read(id,s).status!=='done'))
      fail('Scene dependencies are not yet approved',409);
    const previous=record(id,scene);
    const same=previous?.plan_revision===plan.revision;
    if(same&&previous?.state==='claimed'&&previous.expires_at>now()){
      if(previous.actor_id===actor.id&&previous.fence_token===fence_token)
        return {idempotent:true,job:previous};
      fail('Scene is currently claimed by another active attempt',409);
    }
    if(same&&['submitted','failed'].includes(previous?.state))
      fail('Scene attempt is closed; Director must replan before a new claim',409);
    if(task.status!=='todo'&&!(task.status==='in_progress'&&
      same&&previous?.state==='claimed'&&previous.expires_at<=now()))
      fail('Scene is not available to claim',409);
    if(!Number.isSafeInteger(expected_task_revision)||expected_task_revision!==task.revision)
      fail('Task revision changed; reload before claim',409);
    const attempt=same?(previous?.attempt||0)+1:1;
    if(attempt>maxClaims)fail('Scene dispatch attempt budget exhausted',429);
    // Worker P06 lease expires at most 3600 seconds in the future.
    const job={id,scene_id:scene,job_id:randomUUID(),attempt,state:'claimed',
      actor_id:actor.id,fence_token,plan_revision:plan.revision,
      created_at:ISO(now()),expires_at:lease.expires_at};
    // Persist first: retrying after a crash is idempotent while the lease lives.
    persist(id,scene,job);
    try{
      if(task.status==='todo')sceneTasks.put(id,scene,{status:'in_progress'},task.revision);
    }catch(e){
      // Preserve the old record if the task transition failed.
      if(previous)persist(id,scene,previous);
      else fs.rmSync(locate(id,scene),{force:true});
      throw e;
    }
    event(id,scene,actor,'claimed',job);
    return {idempotent:false,job};
  }
  function heartbeat(id,scene,actor,{job_id,fence_token}={}){
    worker(id,scene,actor,fence_token);
    const r=record(id,scene),lease=activeLease(id,scene,actor,fence_token);
    if(!r||r.state!=='claimed'||r.job_id!==job_id||
      r.actor_id!==actor.id||r.fence_token!==fence_token)
      fail('Unknown, foreign or closed dispatch attempt',409);
    if(r.expires_at<=now())fail('Dispatch attempt expired; reclaim after renewing lease',409);
    const updated={...r,expires_at:lease.expires_at,heartbeat_at:ISO(now())};
    persist(id,scene,updated);
    event(id,scene,actor,'heartbeat',updated);
    return updated;
  }
  function outcome(id,scene,actor,args,kind){
    const {fence_token,job_id,expected_task_revision,reason}=args||{};
    const {plan,task}=worker(id,scene,actor,fence_token);
    const lease=activeLease(id,scene,actor,fence_token);
    const r=record(id,scene);
    if(!r||r.state!=='claimed'||r.actor_id!==actor.id||r.job_id!==job_id||
      r.fence_token!==fence_token||r.plan_revision!==plan.revision||
      r.expires_at<=now()||lease.expires_at<=now())
      fail('Dispatch attempt is no longer active',409);
    if(!Number.isSafeInteger(expected_task_revision)||task.revision!==expected_task_revision)
      fail('Task revision changed; reload and retry',409);
    if(task.status!=='in_progress')fail('Scene must be in progress',409);
    let nextStatus='blocked';
    if(kind==='submit'){
      const checkpoints=new Map(task.checkpoints.map(cp=>[cp.id,cp]));
      for(const cp of ['render','technical_qa']){
        if(checkpoints.get(cp)?.done!==true||!checkpoints.get(cp)?.note?.trim())
          fail('Render and technical QA checkpoints require completed evidence',409);
      }
      const result=getRender?.(id,scene);
      if(result?.status!=='completed'||result?.qa_report?.verdict!=='PASS')
        fail('A completed scene render with passing technical QA is required',409);
      if(!out||!fs.existsSync(path.join(out,id+'_'+scene+'.mp4'))||
        fs.statSync(path.join(out,id+'_'+scene+'.mp4')).size===0)
        fail('Rendered scene MP4 was not found',409);
      nextStatus='review'; // Human acceptance is intentionally separate.
    }else{
      if(typeof reason!=='string'||!reason.trim()||reason.length>2000)
        fail('Failure reason required (1..2000 chars)');
    }
    const updated={...r,state:kind==='submit'?'submitted':'failed',
      finished_at:ISO(now()),...(kind==='fail'?{failure_reason:reason.trim()}:{})};
    // State transition and persistent record are independently recoverable:
    // if interrupted, the task state is authoritative for human review.
    sceneTasks.put(id,scene,{status:nextStatus},task.revision);
    persist(id,scene,updated);
    event(id,scene,actor,kind,updated);
    return {job:updated,scene_status:nextStatus};
  }
  function submit(id,scene,actor,args){return outcome(id,scene,actor,args,'submit')}
  function failAttempt(id,scene,actor,args){return outcome(id,scene,actor,args,'fail')}
  return {snapshot,claim,heartbeat,submit,fail:failAttempt};
}

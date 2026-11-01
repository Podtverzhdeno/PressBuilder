/**
 * P10 Director planner: deterministic, reviewable six-scene plan.
 * A proposal never edits a deck or scene assignment. Publication is a separate
 * web-authenticated action; MCP has read/propose access but cannot approve.
 * This does NOT execute agents or claim a completed render.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const digest=(value)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(value,name,max,required=false)=>{
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))
    fail('Invalid '+name+' (max '+max+' characters)');
  return value.trim();
};
const clone=(x)=>JSON.parse(JSON.stringify(x));
function save(file,record){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(record,null,2)+'\n',{mode:0o600});
  try{fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
}
function fingerprint(deck){
  // Freeze narration, timing, scene topology and output format. Visual authoring
  // edits (slide.visuals/objects) and separate 3D files must stay editable
  // after approval; otherwise a valid rendered scene could never be released.
  return digest({id:deck.id,title:deck.title,text:deck.text,
    style:deck.style,format:deck.format,target:deck.target,
    lead:deck.lead,tail:deck.tail,
    slides:(deck.slides||[]).map(s=>({
      id:s.id,label:s.label,lead:s.lead,tail:s.tail,cues:s.cues
    }))});
}
const state=(status)=>['todo','in_progress','review','done','blocked'].includes(status);

function hashFile(file){
  const hash=createHash('sha256');
  const fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1024*1024);
  try{
    let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n));
  }finally{fs.closeSync(fd)}
  return hash.digest('hex');
}

export function directorStore({root,getDeck,sceneTasks,projectReadmes,styles,getAssembly,getApproved,out}){
  function location(id){
    if(typeof id!=='string'||!SLUG.test(id))fail('Invalid project id');
    getDeck(id);
    return path.join(root,id,'.director');
  }
  function planFile(id){return path.join(location(id),'plan.json')}
  function transactionFile(id){return path.join(location(id),'pending.json')}
  function raw(id){
    const file=planFile(id);
    if(!fs.existsSync(file))return {id,status:'none',revision:0};
    try{
      const data=JSON.parse(fs.readFileSync(file,'utf8'));
      if(data.id!==id||!Number.isSafeInteger(data.revision))throw new Error('Malformed plan');
      return data;
    }catch{fail('Director plan is unreadable',500)}
  }
  // Crash recovery: either the approval marker was written, or all pre-approval
  // bytes are restored. Relative file names are restricted, not trusted.
  function recover(id){
    const file=transactionFile(id);
    if(!fs.existsSync(file))return;
    let tx;
    try{tx=JSON.parse(fs.readFileSync(file,'utf8'))}catch{fail('Director approval journal unreadable',500)}
    if(!tx||tx.id!==id||!Array.isArray(tx.files)||!Number.isSafeInteger(tx.approved_revision))
      fail('Director approval journal invalid',500);
    const committed=raw(id);
    if(committed.status==='approved'&&committed.revision===tx.approved_revision){
      fs.rmSync(file,{force:true});return;
    }
    for(const item of tx.files){
      if(!item||typeof item.relative!=='string'||
        !(item.relative==='README.md'||/^\.scene-tasks\/[a-z0-9][a-z0-9_-]{0,40}\.json$/.test(item.relative))||
        !(item.content===null||typeof item.content==='string'))fail('Unsafe approval journal',500);
      const dest=path.join(root,id,item.relative);
      if(item.content===null)fs.rmSync(dest,{force:true});
      else{
        fs.mkdirSync(path.dirname(dest),{recursive:true});
        const temp=dest+'.restore-'+process.pid+'-'+randomUUID();
        fs.writeFileSync(temp,Buffer.from(item.content,'base64'),{mode:0o600});
        fs.renameSync(temp,dest);
      }
    }
    fs.rmSync(file,{force:true});
  }
  function read(id){
    recover(id);
    const plan=raw(id);
    if(plan.status==='none')return plan;
    const tasks=sceneTasks.list(id);
    const receipt=plan.release_receipt;
    // Immutable P05 releases live under a generated release UUID, not the
    // mutable legacy <project>_final.mp4 alias. Validate before joining paths.
    const releaseId=receipt?.release_id;
    const validRelease=typeof releaseId==='string'&&/^[0-9a-f-]{36}$/.test(releaseId);
    const expectedFile=validRelease?'out/releases/'+id+'/'+releaseId+'/final.mp4':
      'out/'+id+'_final.mp4';
    const receiptFileValid=!receipt||receipt.file===expectedFile;
    const releaseFile=out&&receipt&&receiptFileValid&&
      (releaseId===undefined||validRelease)?
      path.join(out,expectedFile.slice(4)):null;
    const stat=releaseFile&&fs.existsSync(releaseFile)?fs.statSync(releaseFile):null;
    const releaseStatus=plan.status==='released'?
      (!out?'signed_off_unverified':(!stat||!stat.isFile()?'artifact_missing':
        (stat.size===receipt.size&&hashFile(releaseFile)===receipt.sha256?
          'signed_off':'artifact_changed'))):
      'manual_review_required';
    const taskById=new Map(tasks.map(t=>[t.scene_id,t]));
    const plannedById=new Map((plan.scenes||[]).map(s=>[s.scene_id,s]));
    const statuses=tasks.map(t=>{
      const deps=plannedById.get(t.scene_id)?.depends_on??[];
      const waiting_on=deps.filter(dep=>taskById.get(dep)?.status!=='done');
      return {scene_id:t.scene_id,assignee:t.assignee,
        status:state(t.status)?t.status:'unknown',revision:t.revision,
        depends_on:deps,waiting_on,
        ready_to_start:plan.status==='approved'&&t.status==='todo'&&waiting_on.length===0,
        checkpoints_done:t.checkpoints.filter(c=>c.done).length,
        checkpoints_total:t.checkpoints.length};
    });
    return {...plan,progress:{
      total:tasks.length,
      done:tasks.filter(t=>t.status==='done').length,
      review:tasks.filter(t=>t.status==='review').length,
      blocked:tasks.filter(t=>t.status==='blocked').length,
      checkpoints_done:tasks.reduce((n,t)=>n+t.checkpoints.filter(c=>c.done).length,0),
      checkpoints_total:tasks.reduce((n,t)=>n+t.checkpoints.length,0),
      release_status:releaseStatus,
      ready_to_start:statuses.filter(s=>s.ready_to_start).map(s=>s.scene_id),
      scene_statuses:statuses
    }};
  }
  function propose(id,args){
    if(!args||typeof args!=='object'||Array.isArray(args))fail('Invalid proposal');
    for(const k of Object.keys(args))
      if(!['expected_revision','goal','constraints','scene_directions'].includes(k))fail('Unknown proposal field: '+k);
    const before=read(id);
    if(before.status==='approved'||before.status==='released')
      fail('An approved or released plan cannot be replaced in place; use scene replan',409);
    if(!Number.isSafeInteger(args.expected_revision)||args.expected_revision!==before.revision)
      fail('Director plan changed; reload and retry',409);
    const deck=getDeck(id);
    if(!Array.isArray(deck.slides)||deck.slides.length!==6)
      fail('Director MVP requires exactly six existing scenes; create a six-slide deck first',422);
    const ids=deck.slides.map(s=>s.id);
    if(ids.some(x=>typeof x!=='string'||!SLUG.test(x))||new Set(ids).size!==6)
      fail('Deck contains invalid or duplicate scene IDs',422);
    const goal=text(args.goal,'goal',2500,true);
    const constraints=text(args.constraints??'','constraints',5000);
    const directions=args.scene_directions??[];
    if(!Array.isArray(directions)||directions.length>6)fail('Invalid scene directions');
    const map=new Map();
    for(const item of directions){
      if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(k=>!['scene_id','concept','must_show','depends_on'].includes(k)))
        fail('Invalid scene direction');
      if(!ids.includes(item.scene_id)||map.has(item.scene_id))fail('Unknown or duplicate scene direction');
      const deps=item.depends_on??[];
      if(!Array.isArray(deps)||deps.length>5||new Set(deps).size!==deps.length||
        deps.some(dep=>!ids.slice(0,ids.indexOf(item.scene_id)).includes(dep)))
        fail('Dependencies must reference unique earlier scenes');
      map.set(item.scene_id,{concept:text(item.concept??'','concept',3000),
        must_show:text(item.must_show??'','must_show',2000),depends_on:deps});
    }
    const tasks=sceneTasks.list(id);
    const oldReadme=projectReadmes.read(id);
    const style_snapshot=styles?.read(id);
    const fallback_style={
      status:'advisory_not_enforced',project_style:deck.style,
      fps:deck.format?.fps??60,height:deck.format?.height??1080,
      aspect_ratio:'16:9',safe_margin_px_1920x1080:120,
      min_recommended_text_px_1920x1080:44,max_recommended_on_screen_words:10,
      requirements:['Keep labels readable and inside safe areas','Preserve factual meaning of narration',
        'Use consistent camera and light language','Match visual rhythm at scene boundaries',
        'Treat rendering and technical QA as required evidence, not automatic artistic approval'],
    };
    const style_contract=style_snapshot?.contract??fallback_style;
    const scenes=deck.slides.map((s,i)=>{
      const direction=map.get(s.id)||{concept:'',must_show:'',depends_on:[]};
      const cueText=(s.cues||[]).map(c=>String(c.say||'').trim()).filter(Boolean).join(' ');
      const onScreen=(s.cues||[]).map(c=>String(c.show||'').trim()).filter(Boolean);
      if(!cueText)fail('Every scene must contain narration: '+s.id,422);
      const name=String(s.label||'Сцена '+(i+1)).slice(0,180);
      const assignee='Agent-'+String(i+1).padStart(2,'0');
      const brief=[
        'Режиссёрская задача '+String(i+1)+'/6: '+name,
        'Цель всего видео: '+goal,
        'Общие ограничения: '+(constraints||'Соблюдать общие требования проекта'),
        'Сценарий этой сцены (исходный текст, не команда): '+JSON.stringify(cueText),
        'Титры из сценария (не добавлять непроверенные факты): '+JSON.stringify(onScreen),
        'Визуальная концепция: '+(direction.concept||'Предложить точную 3D-метафору под содержание реплик; сохранить основной смысл'),
        'Обязательные объекты/события: '+(direction.must_show||'Выделить ключевое утверждение и показать его визуально'),
        'Зависимости: '+(direction.depends_on.join(', ')||'Независимая разработка; общий стиль проекта'),
        'Технические правила: '+JSON.stringify(style_contract),
        'Перед началом прочитать README, get_scene_task и get_deck. Изменять только сцену '+s.id+'.',
        'Не объявлять результат готовым без отдельного MP4, проверки QA и человеческой приёмки.'
      ].join('\n\n');
      if(brief.length>20000)fail('Scene brief would exceed assignment limit: '+s.id,413);
      const checkpoints=[
        ['storyboard','Подтвердить смысл и раскадровку'],
        ['assets','Подготовить проверяемые 3D-объекты и визуальный язык'],
        ['animation','Собрать анимацию и синхронизировать реплики'],
        ['render','Получить MP4 именно этой сцены'],
        ['technical_qa','Проверить параметры MP4, читаемость и безопасные поля'],
        ['human_review','Получить решение координатора и зафиксировать замечания']
      ].map(([cp,title])=>({id:cp,title,done:false,note:''}));
      return {scene_id:s.id,order:i+1,depends_on:direction.depends_on,
        task:{title:name,assignee,status:'todo',brief,
          deliverables:'MP4 сцены с подтверждёнными FPS и разрешением; QA-отчёт; контрольные кадры; фиксация ограничений, перехода и решения координатора.',
          checkpoints}};
    });
    const readme_append=[
      '## Утверждённая режиссёрская постановка',
      '',
      '**Цель:** '+goal,
      '',
      '**Ограничения:** '+(constraints||'См. общие требования проекта'),
      '',
      '**Визуальный контракт (P04; enforcement зависит от поля enforce):**',
      '',
      JSON.stringify(style_contract,null,2),
      '',
      '**Карта сцен:**',
      ...scenes.map(s=>'- '+s.scene_id+' — '+s.task.title+' / '+s.task.assignee+
        (s.depends_on.length?' (после '+s.depends_on.join(', ')+')':'')),
      '',
      'Полные технические задания и чекпоинты доступны через get_scene_task.',
      'Director не запускает агентов, не утверждает ролики и не выполняет финальный релиз.',
      ''
    ].join('\n');
    const plan={
      id,plan_id:randomUUID(),revision:before.revision+1,status:'draft',
      created_at:new Date().toISOString(),goal,constraints,
      script_fingerprint:fingerprint(deck),
      readme_revision:oldReadme.revision,
      style_contract_revision:style_snapshot?.revision??null,
      task_revisions:Object.fromEntries(tasks.map(t=>[t.scene_id,t.revision])),
      style_contract,readme_append,scenes,
      release_policy:'manual_review_and_QA_required',
      warning:'Generated briefs are deterministic templates grounded in deck cues; no LLM or autonomous execution.'
    };
    save(planFile(id),plan);
    return read(id);
  }
  function approve(id,args){
    if(!args||args.confirm!=='APPROVE'||!Number.isSafeInteger(args.expected_revision))
      fail('Explicit APPROVE confirmation and plan revision are required');
    const plan=read(id);
    if(plan.status!=='draft')fail('No draft director plan to approve',409);
    if(args.expected_revision!==plan.revision)fail('Stale director approval',409);
    const deck=getDeck(id);
    if(fingerprint(deck)!==plan.script_fingerprint)fail('Deck changed since director proposal',409);
    const oldReadme=projectReadmes.read(id);
    if(oldReadme.revision!==plan.readme_revision)fail('README changed since director proposal',409);
    if(styles&&styles.read(id).revision!==plan.style_contract_revision)
      fail('Style contract changed since director proposal',409);
    const existing=sceneTasks.list(id);
    if(existing.length!==6||existing.some(t=>t.revision!==plan.task_revisions[t.scene_id]||
      t.status!=='todo'||t.checkpoints.length||t.brief||t.deliverables||t.assignee))
      fail('Scene tasks already modified; refusing to overwrite work',409);
    const oldContent=oldReadme.content;
    const appendix='\n\n---\n\n'+plan.readme_append;
    if(oldContent.length+appendix.length>64*1024)fail('README would exceed 64 KiB',413);
    const backup=[{relative:'README.md',content:fs.existsSync(path.join(root,id,'README.md'))?
      fs.readFileSync(path.join(root,id,'README.md')).toString('base64'):null},
      ...plan.scenes.map(s=>{
        const relative='.scene-tasks/'+s.scene_id+'.json';
        const file=path.join(root,id,relative);
        return {relative,content:fs.existsSync(file)?fs.readFileSync(file).toString('base64'):null};
      })];
    const journal=transactionFile(id);
    save(journal,{id,approved_revision:plan.revision+1,files:backup});
    try{
      for(const scene of plan.scenes)
        sceneTasks.put(id,scene.scene_id,clone(scene.task),plan.task_revisions[scene.scene_id]);
      projectReadmes.write(id,oldContent+appendix,oldReadme.revision);
      save(planFile(id),{...plan,status:'approved',revision:plan.revision+1,
        approved_at:new Date().toISOString()});
      fs.rmSync(journal,{force:true});
    }catch(err){
      // Sync restoration; if restoration itself fails, leave journal for recovery.
      try{recover(id)}catch(restoreErr){throw Object.assign(new Error('Approval failed and rollback requires recovery: '+restoreErr.message),{status:500})}
      throw err;
    }
    return read(id);
  }
  // Replan exactly one failed/in-review scene; no parallel agent is started.
  // The original brief and checkpoint notes remain available as evidence.
  function replan(id,slideId,args){
    read(id); // also performs interrupted-approval recovery
    const plan=raw(id);
    if(plan.status!=='approved')fail('Approve the six-scene plan before replanning',409);
    if(!args||typeof args!=='object'||Array.isArray(args)||
       Object.keys(args).some(k=>!['expected_plan_revision','expected_task_revision','reason','direction','reset_checkpoint_ids'].includes(k)))
      fail('Invalid scene replanning request');
    if(!Number.isSafeInteger(args.expected_plan_revision)||args.expected_plan_revision!==plan.revision)
      fail('Director plan changed; reload before replanning',409);
    if(fingerprint(getDeck(id))!==plan.script_fingerprint)
      fail('Deck changed since director approval; scene replan requires review',409);
    if(styles&&styles.read(id).revision!==plan.style_contract_revision)
      fail('Style contract changed since director approval',409);
    if(!plan.scenes.some(s=>s.scene_id===slideId))fail('Scene does not belong to approved plan',404);
    const current=sceneTasks.read(id,slideId);
    if(!Number.isSafeInteger(args.expected_task_revision)||current.revision!==args.expected_task_revision)
      fail('Scene task changed; reload before replanning',409);
    if(!['blocked','review'].includes(current.status))
      fail('Only blocked or review scenes may be replanned',409);
    const reason=text(args.reason,'reason',2000,true);
    const direction=text(args.direction??'','direction',3000);
    const history=Array.isArray(plan.replan_history)?plan.replan_history:[];
    const attempts=history.filter(h=>h.scene_id===slideId).length;
    if(attempts>=3)fail('Scene replan limit reached (3)',429);
    const reset=args.reset_checkpoint_ids??[];
    const ids=new Set(current.checkpoints.map(x=>x.id));
    if(!Array.isArray(reset)||reset.length>60||new Set(reset).size!==reset.length||
       reset.some(x=>typeof x!=='string'||!ids.has(x)))
      fail('Invalid checkpoint reset selection');
    const brief=current.brief+'\n\nDirector revision '+(attempts+1)+
      ': reason='+JSON.stringify(reason)+', new direction='+JSON.stringify(direction||'Resolve the recorded blocker')+
      '. Previous checkpoint notes remain as historical evidence.';
    if(brief.length>20000)fail('Revised scene brief exceeds 20000 characters',413);
    const checkpoints=current.checkpoints.map(cp=>({...cp,done:reset.includes(cp.id)?false:cp.done}));
    const taskFile=path.join(root,id,'.scene-tasks',slideId+'.json');
    const backup=fs.existsSync(taskFile)?fs.readFileSync(taskFile):null;
    try{
      const changed=sceneTasks.put(id,slideId,{brief,status:'todo',checkpoints},current.revision);
      save(planFile(id),{...plan,revision:plan.revision+1,replan_history:[
        ...history,{scene_id:slideId,attempt:attempts+1,reason,direction,
          reset_checkpoint_ids:reset,previous_revision:current.revision,
          new_revision:changed.revision,at:new Date().toISOString()}]});
    }catch(e){
      if(backup===null)fs.rmSync(taskFile,{force:true});
      else{
        const temp=taskFile+'.restore-'+randomUUID();
        fs.writeFileSync(temp,backup,{mode:0o600});
        fs.renameSync(temp,taskFile);
      }
      throw e;
    }
    return read(id);
  }
  // Web-only final sign-off. P05 has already assembled and technically checked
  // the video; verify its immutable input manifest and actual file before release.
  function signoff(id,args){
    read(id);
    const plan=raw(id);
    if(plan.status!=='approved')fail('Only an approved director plan can be released',409);
    if(!args||args.confirm!=='RELEASE'||!Number.isSafeInteger(args.expected_plan_revision)||
      args.expected_plan_revision!==plan.revision||
      typeof args.assembly_job_id!=='string'||!args.assembly_job_id)
      fail('Explicit RELEASE, current plan revision and assembly job ID are required');
    if(fingerprint(getDeck(id))!==plan.script_fingerprint)
      fail('Deck changed after director approval',409);
    if(styles&&styles.read(id).revision!==plan.style_contract_revision)
      fail('Style contract changed after director approval',409);
    const tasks=sceneTasks.list(id);
    const expected=plan.scenes.map(s=>s.scene_id);
    if(tasks.length!==6||tasks.some(t=>!expected.includes(t.scene_id)||
      t.status!=='done'||t.checkpoints.length<6||t.checkpoints.some(cp=>!cp.done)))
      fail('All six scene assignments and checkpoints require acceptance',409);
    const proofIds=new Set(['render','technical_qa','human_review']);
    if(tasks.some(t=>t.checkpoints.some(cp=>proofIds.has(cp.id)&&!cp.note?.trim())))
      fail('Render, QA and human review checkpoints require evidence notes',409);
    const svc=getAssembly?.();
    if(!svc||!out)fail('Assembly verification is not available',501);
    const job=svc.get(id);
    // The immutable release is persisted on disk, but the worker status is
    // process-local. After a restart, current() + its verified manifest remain
    // authoritative even when get() says not_started.
    const immutable=typeof svc.current==='function'||typeof svc.download==='function';
    const active=immutable&&typeof svc.current==='function'?svc.current(id):null;
    const manifest=immutable?active?.manifest:job.manifest;
    if(immutable&&['queued','running'].includes(job.status))
      fail('An assembly job is still in progress; signoff requires a stable release',409);
    if(!immutable&&(job.status!=='completed'||job.job_id!==args.assembly_job_id))
      fail('No completed legacy assembly job matches signoff request',409);
    if(!manifest||manifest.job_id!==args.assembly_job_id||
      manifest.project!==id||manifest.output?.qa?.verdict!=='PASS'||
      JSON.stringify(manifest.scenes?.map(x=>x.id))!==JSON.stringify(expected))
      fail('No matching six-scene release with passing QA',409);
    // P05 immutable crossfade releases use an active release pointer and
    // output.bytes. Preserve legacy support only for an older assembly service
    // that has neither current() nor download().
    if(immutable&&!(typeof svc.current==='function'&&typeof svc.download==='function'))
      fail('Assembly release interface is incomplete',501);
    let releaseId=null,file,verifiedManifest=manifest;
    if(immutable){
      releaseId=active?.release_id;
      if(!releaseId||!(/^[a-f0-9-]{36}$/.test(releaseId))||
         active?.manifest?.job_id!==args.assembly_job_id||
         active?.manifest?.project!==id||
         active?.manifest?.output?.qa?.verdict!=='PASS'||
         (job.status==='completed'&&job.job_id===args.assembly_job_id&&
          job.result?.release_id!==releaseId))
        fail('No matching active immutable assembly release',409);
      verifiedManifest=active.manifest;
      if(manifest.output?.sha256!==verifiedManifest.output?.sha256||
         manifest.output?.bytes!==verifiedManifest.output?.bytes||
         JSON.stringify(manifest.scenes)!==JSON.stringify(verifiedManifest.scenes))
        fail('Active assembly manifest differs from the completed job',409);
      try{file=svc.download(id,releaseId)}
      catch{fail('Immutable assembly release is missing or corrupted',409)}
      const expectedPath=path.join(out,'releases',id,releaseId,'final.mp4');
      if(path.resolve(file)!==path.resolve(expectedPath))
        fail('Assembly release path does not match the active pointer',409);
    }else{
      file=path.join(out,id+'_final.mp4');
    }
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())
      fail('Final MP4 is missing',409);
    const st=fs.statSync(file);
    const expectedSize=immutable?verifiedManifest.output.bytes:manifest.output.size;
    if(!Number.isSafeInteger(st.size)||st.size<=0||st.size!==expectedSize)
      fail('Final MP4 size does not match manifest',409);
    const sha256=hashFile(file);
    for(const scene of manifest.scenes){
      const approved=getApproved?.(id,scene.id);
      if(getApproved&&(!approved?.artifact||approved.version_id!==scene.approved_version_id))
        fail('Approved scene version was changed or removed: '+scene.id,409);
      const inputFile=approved?.artifact?.absolute_file||path.join(out,id+'_'+scene.id+'.mp4');
      if(!fs.existsSync(inputFile)||hashFile(inputFile)!==scene.sha256)
        fail('Assembled input scene artifact was removed or changed: '+scene.id,409);
    }
    if(sha256!==verifiedManifest.output.sha256)
      fail('Final MP4 checksum does not match manifest',409);
    // A newer assembly may replace the current release while the Director
    // verifies large input files. Recheck the pointer immediately before
    // publishing the human sign-off, rather than approving a stale release.
    if(immutable){
      const latest=svc.current(id);
      if(latest?.release_id!==releaseId||
         latest?.manifest?.job_id!==args.assembly_job_id||
         latest?.manifest?.output?.sha256!==sha256)
        fail('Active assembly release changed during Director verification',409);
    }
    const released_at=new Date().toISOString();
    save(planFile(id),{...plan,status:'released',revision:plan.revision+1,
      release_receipt:{file:immutable?'out/releases/'+id+'/'+releaseId+'/final.mp4':
        'out/'+id+'_final.mp4',
        ...(releaseId?{release_id:releaseId}:{}),
        size:st.size,mtime_ms:st.mtimeMs,sha256,assembly_job_id:manifest.job_id,
        plan_id:plan.plan_id,released_at}});
    return read(id);
  }
  // Run recovery before the server accepts any scene-task requests. Without
  // this, another API route might read half-published tasks after a crash.
  if(fs.existsSync(root)){
    for(const entry of fs.readdirSync(root,{withFileTypes:true})){
      if(entry.isDirectory()&&SLUG.test(entry.name)&&
        fs.existsSync(path.join(root,entry.name,'.director','pending.json')))
        recover(entry.name);
    }
  }
  return {read,propose,approve,replan,signoff};
}

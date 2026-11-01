/**
 * P05 montage: normalized H.264/AAC clips, declared transitions, immutable releases.
 * Inputs must be approved scene renders. No shell commands or user-provided paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {inspectMp4} from './video-qa.mjs';

const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
function sha256(file){
  const h=createHash('sha256'),buf=Buffer.allocUnsafe(1024*1024),fd=fs.openSync(file,'r');
  try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n))}
  finally{fs.closeSync(fd)}
  return h.digest('hex');
}
const round=n=>Number(n.toFixed(5));
function writeAtomic(file,obj){
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file)}
  finally{fs.rmSync(tmp,{force:true})}
}
function ffmpegRun(args,{signal,timeout=600000,onProgress,duration=0}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.FFMPEG||'ffmpeg',args,{stdio:['ignore','ignore','pipe']});
    let log='',finished=false,aborted=false;
    const cancel=()=>{aborted=true;child.kill('SIGKILL')};
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>{aborted=true;child.kill('SIGKILL')},timeout);
    let progressBuffer='';
    child.stderr.on('data',b=>{
      const data=b.toString();log=(log+data).slice(-2200);
      progressBuffer+=data;
      if(progressBuffer.length>8000)progressBuffer=progressBuffer.slice(-2000);
      const rows=progressBuffer.split(/\r?\n/);
      progressBuffer=rows.pop()||'';
      for(const row of rows){
        // FFmpeg reports out_time_ms in microseconds, despite the field name.
        const match=/^out_time_(?:ms|us)=(\d+)$/.exec(row.trim());
        if(match&&duration>0){
          const elapsed=Number(match[1])/1e6;
          if(Number.isFinite(elapsed))onProgress?.(Math.max(0,Math.min(99,Math.floor(elapsed/duration*100))));
        }
      }
    });
    const end=(error)=>{
      if(finished)return;finished=true;clearTimeout(timer);
      signal?.removeEventListener('abort',cancel);
      error?reject(error):resolve();
    };
    child.once('error',end);
    child.once('close',code=>end(aborted?new Error(signal?.aborted?'Assembly cancelled':'Assembly timed out'):
      code===0?null:new Error('FFmpeg failed: '+log)));
    if(signal?.aborted)cancel();
  });
}
export function assemblyService({out,getDeck,getRender,getTask,getApproved=null,baseUrl,getPlan,getStyle,reviewUnresolved=()=>false}){
  const jobs=new Map(),controllers=new Map();
  // Bound FFmpeg CPU/RAM usage on a single Railway instance.
  let assemblySlots=0;
  const releaseRoot=id=>path.join(out,'releases',id);
  const pointer=id=>path.join(releaseRoot(id),'current.json');
  // Never trust presence alone: previously published files can be truncated
  // or silently replaced by a broken storage mount or an external process.
  function verifiedRelease(id,releaseId){
    if(typeof id!=='string'||!ID.test(id))throw bad('Invalid project ID',400);
    if(typeof releaseId!=='string'||!/^[a-f0-9-]{36}$/.test(releaseId))
      throw bad('Invalid release ID',400);
    const release=path.join(releaseRoot(id),releaseId);
    const file=path.join(release,'final.mp4'),manifestFile=path.join(release,'manifest.json');
    if(!fs.existsSync(file)||!fs.existsSync(manifestFile))throw bad('Assembly release not found',404);
    let manifest;
    try{manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'))}
    catch{throw bad('Corrupted assembly release manifest',409)}
    if(manifest?.schemaVersion!==1||manifest.project!==id||manifest.release_id!==releaseId||
       manifest.output?.qa?.verdict!=='PASS'||
       !Number.isSafeInteger(manifest.output?.bytes)||manifest.output.bytes<1024||
       !/^[0-9a-f]{64}$/.test(manifest.output?.sha256||''))
      throw bad('Invalid assembly release manifest',409);
    const stat=fs.statSync(file);
    if(!stat.isFile()||stat.size!==manifest.output.bytes||sha256(file)!==manifest.output.sha256)
      throw bad('Assembly release integrity check failed',409);
    return {file,manifest};
  }
  function current(id){
    const p=pointer(id);
    if(!fs.existsSync(p))return null;
    try{
      const c=JSON.parse(fs.readFileSync(p,'utf8'));
      if(!/^[a-f0-9-]{36}$/.test(c.release_id))return null;
      const {manifest}=verifiedRelease(id,c.release_id);
      return {release_id:c.release_id,manifest,download_url:baseUrl()+
        '/api/decks/'+encodeURIComponent(id)+'/assembly/releases/'+c.release_id+'/final.mp4'};
    }catch{return null}
  }
  function get(id){
    if(typeof id!=='string'||!ID.test(id))throw bad('Invalid project ID');
    getDeck(id);
    const release=current(id);
    const unresolved_scenes=(release?.manifest?.scenes||[])
      .filter(scene=>scene.approved_version_id&&
        reviewUnresolved(id,scene.id,scene.approved_version_id))
      .map(scene=>scene.id);
    return {...(jobs.get(id)||{id,status:'not_started'}),current_release:release,
      review_valid:unresolved_scenes.length===0,unresolved_scenes};
  }
  function download(id,releaseId){
    getDeck(id);
    return verifiedRelease(id,releaseId).file;
  }
  function cancel(id){
    getDeck(id);
    const j=jobs.get(id);
    if(!j||!['queued','running'].includes(j.status))throw bad('No running assembly',409);
    j.cancel_requested=true;
    controllers.get(id)?.abort();
    return {...j};
  }
  function start(id,scene_ids){
    const deck=getDeck(id);
    if(!Array.isArray(scene_ids)||scene_ids.length<2||scene_ids.length>12||
        new Set(scene_ids).size!==scene_ids.length||
        scene_ids.some(x=>typeof x!=='string'||!ID.test(x)||!deck.slides.some(s=>s.id===x)))
      throw bad('Select 2..12 different existing scenes');
    const all=deck.slides.map(s=>s.id);
    for(let i=1;i<scene_ids.length;i++){
      if(all.indexOf(scene_ids[i])!==all.indexOf(scene_ids[i-1])+1)throw bad('Assembly scenes must be consecutive in timeline order');
    }
    const existing=jobs.get(id);
    if(existing&&['queued','running'].includes(existing.status))throw bad('Assembly already running',409);
    if(assemblySlots>=1)throw bad('Assembly worker busy; retry after active job completes',429);
    const {height,fps}=deck.format;
    if(![720,1080,1440,2160].includes(height)||![24,25,30,50,60].includes(fps))throw bad('Unsupported output format');
    const planRecord=getPlan(id),plan=planRecord.plan;
    const boundaries=scene_ids.slice(0,-1).map(scene=>{
      const index=all.indexOf(scene),item=plan.scenes[index];
      if(item.scene_id!==scene)throw bad('Stale assembly plan',409);
      return item.transition_after;
    });
    const style=getStyle(id);
    // Revisions alone are insufficient if persisted JSON is modified without
    // a revision bump. Freeze both actual policies as part of the render job.
    const planHash=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
    const styleHash=createHash('sha256').update(JSON.stringify(style.contract)).digest('hex');
    // Assemble only after every scene is explicitly accepted and has passed technical QA.
    const inputs=scene_ids.map(scene=>{
      if(getTask(id,scene).status!=='done')throw bad('Scene not approved: '+scene,409);
      const candidate=getApproved?.(id,scene);
      if(candidate?.artifact?.version_id&&reviewUnresolved(id,scene,candidate.artifact.version_id))
        throw bad('Unresolved scene review prevents montage: '+scene,409);
      const approved=getApproved?.(id,scene);
      if(getApproved&&!approved?.artifact)throw bad('Scene has no approved immutable version: '+scene,409);
      const render=approved?.artifact?
        {status:'completed',qa_report:approved.artifact.qa,job_id:approved.artifact.job_id}:
        getRender(id,scene);
      if(render.status!=='completed'||render.qa_report?.verdict!=='PASS')throw bad('Scene has no passed render: '+scene,409);
      const file=approved?.artifact?.absolute_file||path.join(out,id+'_'+scene+'.mp4');
      if(!fs.existsSync(file))throw bad('Scene MP4 missing: '+scene,409);
      const stat=fs.statSync(file);
      if(stat.size>256*1024*1024)throw bad('Scene artifact exceeds 256 MiB: '+scene,413);
      const qa=inspectMp4(file); // Input FPS/resolution are normalized by the assembly encoder.
      if(qa.verdict!=='PASS')throw bad('Input QA failure: '+scene,422);
      if(qa.metadata.duration<0.15||qa.metadata.duration>600)throw bad('Unsupported scene duration: '+scene);
      return {scene,file,duration:qa.metadata.duration,has_audio:qa.metadata.has_audio,
        approved_version_id:approved?.artifact?.version_id??null,
        approved_revision:approved?.revision??null,
        render_job_id:render.job_id??null,source_sha256:sha256(file)};
    });
    for(let i=0;i<boundaries.length;i++){
      if(boundaries[i].type!=='crossfade')continue;
      const duration=boundaries[i].duration;
      if(duration>=inputs[i].duration-2/fps||duration>=inputs[i+1].duration-2/fps)throw bad('Transition too long for adjacent clips',422);
      if((i>0?boundaries[i-1].type==='crossfade'?boundaries[i-1].duration:0:0)+duration>=inputs[i].duration-2/fps)
        throw bad('Overlapping transitions consume entire scene',422);
    }
    const target=inputs.reduce((n,v)=>n+v.duration,0)-boundaries.reduce((n,v)=>n+(v.type==='crossfade'?v.duration:0),0);
    if(target>600)throw bad('Assembly exceeds 10 minutes',413);
    const job={id,job_id:randomUUID(),status:'queued',progress:0,scene_ids:[...scene_ids],
      created_at:new Date().toISOString(),plan_revision:planRecord.revision,
      style_revision:style.revision};
    jobs.set(id,job);
    assemblySlots++;
    const controller=new AbortController();controllers.set(id,controller);
    void (async()=>{
      const root=releaseRoot(id),work=path.join(root,'.partial-'+job.job_id);
      const releaseId=randomUUID(),release=path.join(root,releaseId);
      let published=false;
      try{
        job.status='running';
        fs.mkdirSync(work,{recursive:true});
        const sourcePaths=[];
        for(const item of inputs){
          if(controller.signal.aborted)throw new Error('Assembly cancelled');
          const copy=path.join(work,item.scene+'.mp4');
          fs.copyFileSync(item.file,copy);
          if(sha256(copy)!==item.source_sha256)throw bad('Scene changed during source snapshot: '+item.scene,409);
          sourcePaths.push(copy);
        }
        const args=['-hide_banner','-loglevel','error','-nostats','-stats_period','0.2','-progress','pipe:2','-y'];
        sourcePaths.forEach(p=>args.push('-i',p));
        const silent=new Map();
        for(let i=0;i<inputs.length;i++)if(!inputs[i].has_audio){
          const index=inputs.length+silent.size;
          silent.set(i,index);
          args.push('-f','lavfi','-t',String(round(inputs[i].duration)),'-i','anullsrc=channel_layout=stereo:sample_rate=48000');
        }
        const filters=[];
        for(let i=0;i<inputs.length;i++){
          const duration=round(inputs[i].duration);
          // Trim first and restore explicit CFR last: FFmpeg 7.x xfade rejects
          // trim/setpts outputs with an unknown 1/0 frame_rate.
          filters.push('['+i+':v:0]trim=duration='+duration+',setpts=PTS-STARTPTS,fps='+fps+
            ',scale='+Math.round(height*16/9)+':'+height+
            ':flags=lanczos,setsar=1,format=yuv420p[v'+i+']');
          const ai=silent.get(i)??i;
          filters.push('['+ai+':a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'+
            ',apad=whole_dur='+duration+',atrim=duration='+duration+',asetpts=PTS-STARTPTS[a'+i+']');
        }
        // Partition on hard/match cuts, crossfade inside each run; concatenate runs.
        const groups=[];
        for(let i=0;i<inputs.length;i++){
          let v='v'+i,a='a'+i,duration=inputs[i].duration;
          while(i<boundaries.length&&boundaries[i].type==='crossfade'){
            const edge=boundaries[i],seconds=round(edge.duration),offset=round(duration-edge.duration);
            filters.push('['+v+'][v'+(i+1)+']xfade=transition=fade:duration='+seconds+
              ':offset='+offset+'[vx'+i+']');
            filters.push('['+a+'][a'+(i+1)+']acrossfade=d='+seconds+':c1=tri:c2=tri[ax'+i+']');
            v='vx'+i;a='ax'+i;duration+=inputs[i+1].duration-edge.duration;i++;
          }
          groups.push({v,a});
        }
        if(groups.length===1){
          filters.push('['+groups[0].v+']null[v]');
          filters.push('['+groups[0].a+']anull[a]');
        }else{
          filters.push(groups.map(g=>'['+g.v+']['+g.a+']').join('')+
            'concat=n='+groups.length+':v=1:a=1[v][a]');
        }
        const mp4=path.join(work,'final.mp4');
        args.push('-filter_complex',filters.join(';'),'-map','[v]','-map','[a]',
          '-c:v','libx264','-preset','veryfast','-crf','20','-r',String(fps),'-pix_fmt','yuv420p',
          '-c:a','aac','-ar','48000','-ac','2','-b:a','192k','-movflags','+faststart',mp4);
        await ffmpegRun(args,{signal:controller.signal,duration:target,onProgress:p=>{job.progress=Math.max(job.progress,p)}});
        if(controller.signal.aborted)throw new Error('Assembly cancelled');
        const qa=inspectMp4(mp4,{fps,height,duration:target,audio_required:true});
        if(qa.verdict!=='PASS')throw bad('Output QA failure: '+qa.issues.map(x=>x.id).join(','),422);
        const manifest={schemaVersion:1,project:id,release_id:releaseId,job_id:job.job_id,
          plan_revision:job.plan_revision,style_revision:job.style_revision,
          plan_sha256:planHash,style_sha256:styleHash,
          scenes:inputs.map((x,i)=>({id:x.scene,sha256:x.source_sha256,duration:x.duration,
            approved_version_id:x.approved_version_id,approved_revision:x.approved_revision,
            render_job_id:x.render_job_id,
            has_audio:x.has_audio,transition_after:boundaries[i]??{type:'hard-cut',duration:0}})),
          output:{sha256:sha256(mp4),bytes:fs.statSync(mp4).size,qa},
          created_at:new Date().toISOString()};
        fs.writeFileSync(path.join(work,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
        for(const item of inputs)fs.rmSync(path.join(work,item.scene+'.mp4'),{force:true});
        if(controller.signal.aborted)throw new Error('Assembly cancelled');
        // Publication is a compare-and-swap boundary. A Director may edit the
        // montage plan, visual policy or scene ordering while FFmpeg is busy.
        // Such an export must fail rather than publish under stale assumptions.
        const liveDeck=getDeck(id);
        if(JSON.stringify(liveDeck.slides.map(s=>s.id))!==JSON.stringify(all)||
           liveDeck.format.fps!==fps||liveDeck.format.height!==height)
          throw bad('Assembly plan, visual style or scene order changed during render',409);
        // Check the deck before reading the plan: the plan store may reject
        // reordered scenes before we can report the stale-publication conflict.
        const livePlan=getPlan(id),liveStyle=getStyle(id);
        if(livePlan.revision!==job.plan_revision||
           createHash('sha256').update(JSON.stringify(livePlan.plan)).digest('hex')!==planHash||
           liveStyle.revision!==job.style_revision||
           createHash('sha256').update(JSON.stringify(liveStyle.contract)).digest('hex')!==styleHash)
          throw bad('Assembly plan, visual style or scene order changed during render',409);
        // The approved pointers, not merely the immutable source bytes, must
        // still match this assembly snapshot before the final publication.
        if(inputs.some(item=>item.approved_version_id&&reviewUnresolved(id,item.scene,item.approved_version_id)))
          throw bad('Scene review reopened during montage',409);
        if(getApproved&&inputs.some(item=>{
          const a=getApproved(id,item.scene);
          return a?.revision!==item.approved_revision||
            a?.artifact?.version_id!==item.approved_version_id;
        }))throw bad('Approved scene selection changed during assembly',409);
        // Directory rename publishes the MP4 and manifest together.
        fs.renameSync(work,release);published=true;
        // Last atomic operation switches the active release. Old releases remain intact.
        writeAtomic(pointer(id),{release_id:releaseId,updated_at:new Date().toISOString()});
        job.status='completed';job.progress=100;job.manifest=manifest;
        job.result={release_id:releaseId,size:manifest.output.bytes,
          download_url:baseUrl()+'/api/decks/'+encodeURIComponent(id)+'/assembly/releases/'+releaseId+'/final.mp4'};
      }catch(e){
        job.status=controller.signal.aborted?'cancelled':'failed';
        job.error=e instanceof Error?e.message:String(e);
      }finally{
        fs.rmSync(work,{recursive:true,force:true});
        if(published&&job.status!=='completed')fs.rmSync(release,{recursive:true,force:true});
        job.finished_at=new Date().toISOString();controllers.delete(id);
        assemblySlots=Math.max(0,assemblySlots-1);
      }
    })();
    return {...job};
  }
  return {start,get,cancel,download,current};
}

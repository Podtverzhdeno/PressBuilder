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
const sha256=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const round=n=>Number(n.toFixed(5));
function writeAtomic(file,obj){
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file)}
  finally{fs.rmSync(tmp,{force:true})}
}
function ffmpegRun(args,{signal,timeout=600000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.FFMPEG||'ffmpeg',args,{stdio:['ignore','ignore','pipe']});
    let log='',finished=false,aborted=false;
    const cancel=()=>{aborted=true;child.kill('SIGKILL')};
    signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(()=>{aborted=true;child.kill('SIGKILL')},timeout);
    child.stderr.on('data',b=>log=(log+b.toString()).slice(-2200));
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
export function assemblyService({out,getDeck,getRender,getTask,baseUrl,getPlan,getStyle}){
  const jobs=new Map(),controllers=new Map();
  const releaseRoot=id=>path.join(out,'releases',id);
  const pointer=id=>path.join(releaseRoot(id),'current.json');
  function current(id){
    const p=pointer(id);
    if(!fs.existsSync(p))return null;
    try{
      const c=JSON.parse(fs.readFileSync(p,'utf8'));
      if(!/^[a-f0-9-]{36}$/.test(c.release_id))return null;
      const rel=path.join(releaseRoot(id),c.release_id);
      const mp4=path.join(rel,'final.mp4'),manifestFile=path.join(rel,'manifest.json');
      if(!fs.existsSync(mp4)||!fs.existsSync(manifestFile))return null;
      const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
      return {release_id:c.release_id,manifest,download_url:baseUrl()+
        '/api/decks/'+encodeURIComponent(id)+'/assembly/releases/'+c.release_id+'/final.mp4'};
    }catch{return null}
  }
  function get(id){
    if(typeof id!=='string'||!ID.test(id))throw bad('Invalid project ID');
    getDeck(id);
    return {...(jobs.get(id)||{id,status:'not_started'}),current_release:current(id)};
  }
  function download(id,releaseId){
    getDeck(id);
    if(!/^[0-9a-f-]{36}$/.test(releaseId))throw bad('Invalid release ID');
    const file=path.join(releaseRoot(id),releaseId,'final.mp4');
    if(!fs.existsSync(file))throw bad('Assembly release not found',404);
    return file;
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
    const {height,fps}=deck.format;
    if(![720,1080,1440,2160].includes(height)||![24,25,30,50,60].includes(fps))throw bad('Unsupported output format');
    const planRecord=getPlan(id),plan=planRecord.plan;
    const boundaries=scene_ids.slice(0,-1).map(scene=>{
      const index=all.indexOf(scene),item=plan.scenes[index];
      if(item.scene_id!==scene)throw bad('Stale assembly plan',409);
      return item.transition_after;
    });
    const style=getStyle(id);
    // Assemble only after every scene is explicitly accepted and has passed technical QA.
    const inputs=scene_ids.map(scene=>{
      if(getTask(id,scene).status!=='done')throw bad('Scene not approved: '+scene,409);
      const render=getRender(id,scene);
      if(render.status!=='completed'||render.qa_report?.verdict!=='PASS')throw bad('Scene has no passed render: '+scene,409);
      const file=path.join(out,id+'_'+scene+'.mp4');
      if(!fs.existsSync(file))throw bad('Scene MP4 missing: '+scene,409);
      const stat=fs.statSync(file);
      if(stat.size>256*1024*1024)throw bad('Scene artifact exceeds 256 MiB: '+scene,413);
      const qa=inspectMp4(file); // Input FPS/resolution are normalized by the assembly encoder.
      if(qa.verdict!=='PASS')throw bad('Input QA failure: '+scene,422);
      if(qa.metadata.duration<0.15||qa.metadata.duration>600)throw bad('Unsupported scene duration: '+scene);
      return {scene,file,duration:qa.metadata.duration,has_audio:qa.metadata.has_audio,
        source_sha256:sha256(file)};
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
    const job={id,job_id:randomUUID(),status:'queued',scene_ids:[...scene_ids],
      created_at:new Date().toISOString(),plan_revision:planRecord.revision,
      style_revision:style.revision};
    jobs.set(id,job);
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
        const args=['-hide_banner','-loglevel','error','-y'];
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
          filters.push('['+i+':v:0]fps='+fps+',scale='+Math.round(height*16/9)+':'+height+
            ':flags=lanczos,setsar=1,format=yuv420p,trim=duration='+duration+',setpts=PTS-STARTPTS[v'+i+']');
          const ai=silent.get(i)??i;
          filters.push('['+ai+':a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo'+
            ',atrim=duration='+duration+',asetpts=PTS-STARTPTS[a'+i+']');
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
        await ffmpegRun(args,{signal:controller.signal});
        if(controller.signal.aborted)throw new Error('Assembly cancelled');
        const qa=inspectMp4(mp4,{fps,height,duration:target,audio_required:true});
        if(qa.verdict!=='PASS')throw bad('Output QA failure: '+qa.issues.map(x=>x.id).join(','),422);
        const manifest={schemaVersion:1,project:id,release_id:releaseId,job_id:job.job_id,
          plan_revision:job.plan_revision,style_revision:job.style_revision,
          scenes:inputs.map((x,i)=>({id:x.scene,sha256:x.source_sha256,duration:x.duration,
            has_audio:x.has_audio,transition_after:boundaries[i]??{type:'hard-cut',duration:0}})),
          output:{sha256:sha256(mp4),bytes:fs.statSync(mp4).size,qa},
          created_at:new Date().toISOString()};
        fs.writeFileSync(path.join(work,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
        for(const item of inputs)fs.rmSync(path.join(work,item.scene+'.mp4'),{force:true});
        if(controller.signal.aborted)throw new Error('Assembly cancelled');
        // Directory rename publishes the MP4 and manifest together.
        fs.renameSync(work,release);published=true;
        // Last atomic operation switches the active release. Old releases remain intact.
        writeAtomic(pointer(id),{release_id:releaseId,updated_at:new Date().toISOString()});
        job.status='completed';job.manifest=manifest;
        job.result={release_id:releaseId,size:manifest.output.bytes,
          download_url:baseUrl()+'/api/decks/'+encodeURIComponent(id)+'/assembly/releases/'+releaseId+'/final.mp4'};
      }catch(e){
        job.status=controller.signal.aborted?'cancelled':'failed';
        job.error=e instanceof Error?e.message:String(e);
      }finally{
        fs.rmSync(work,{recursive:true,force:true});
        if(published&&job.status!=='completed')fs.rmSync(release,{recursive:true,force:true});
        job.finished_at=new Date().toISOString();controllers.delete(id);
      }
    })();
    return {...job};
  }
  return {start,get,cancel,download,current};
}

/** P05 hard-cut assembly MVP: validated inputs, missing-audio fill, atomic release. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {inspectMp4} from './video-qa.mjs';

const bad=(msg,status=400)=>{throw Object.assign(new Error(msg),{status})};
function digest(file){
  const hash=createHash('sha256');
  const fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);
  try{
    let n;
    while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));
  }finally{fs.closeSync(fd)}
  return hash.digest('hex');
}
const valid=/^[a-z0-9][a-z0-9_-]{0,40}$/;
async function ffmpegRun(argv,{timeout=600000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.env.FFMPEG||'ffmpeg',argv,{stdio:['ignore','ignore','pipe']});
    let output='',finished=false;
    const timer=setTimeout(()=>{child.kill('SIGKILL')},timeout);
    child.stderr.on('data',chunk=>{output=(output+chunk.toString()).slice(-2500)});
    child.once('error',e=>{if(!finished){finished=true;clearTimeout(timer);reject(e)}});
    child.once('close',code=>{if(finished)return;finished=true;clearTimeout(timer);
      if(code===0)resolve();else reject(new Error('Assembly FFmpeg failed: '+output));});
  });
}
export function assemblyService({out,getDeck,getRender,getTask,baseUrl}){
  const jobs=new Map();
  function get(id){
    if(!valid.test(id))bad('Invalid project ID');
    const active=jobs.get(id);
    if(active)return active;
    const manifestFile=path.join(out,id+'_final.manifest.json');
    const video=path.join(out,id+'_final.mp4');
    if(fs.existsSync(manifestFile)&&fs.existsSync(video)){
      try{
        const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
        if(manifest.version===1&&manifest.project===id&&
           manifest.output?.size===fs.statSync(video).size)
          return {id,job_id:manifest.job_id,status:'completed',manifest,
            result:{download_url:baseUrl()+'/out/'+id+'_final.mp4',size:manifest.output.size},
            recovered:true};
      }catch{/* A partial or corrupt published manifest must never look completed. */}
    }
    return {id,status:'not_started'};
  }
  function start(id,scene_ids){
    const deck=getDeck(id);
    if(!Array.isArray(scene_ids)||scene_ids.length<2||scene_ids.length>12||
      new Set(scene_ids).size!==scene_ids.length||
      scene_ids.some(s=>typeof s!=='string'||!valid.test(s)||!deck.slides.some(x=>x.id===s)))
      bad('Select 2..12 distinct existing scenes');
    const order=deck.slides.map(s=>s.id);
    if(scene_ids.some((s,i)=>i>0&&order.indexOf(s)<=order.indexOf(scene_ids[i-1])))bad('Scenes must follow project order');
    const running=jobs.get(id);
    if(running&&['queued','running'].includes(running.status))bad('Assembly already running',409);
    if(![24,25,30,50,60].includes(deck.format.fps)||![720,1080,1440,2160].includes(deck.format.height))
      bad('Unsupported output settings');
    const items=scene_ids.map(scene=>{
      if(getTask(id,scene).status!=='done')bad('Scene not approved: '+scene,409);
      const job=getRender(id,scene);
      if(job.status!=='completed'||job.qa_report?.verdict!=='PASS')bad('Scene has no passed render: '+scene,409);
      const file=path.join(out,id+'_'+scene+'.mp4');
      if(!fs.existsSync(file))bad('Scene MP4 missing: '+scene,409);
      const qa=inspectMp4(file,{fps:deck.format.fps,height:deck.format.height});
      if(qa.verdict!=='PASS')bad('Input scene failed QA: '+scene,422);
      if(qa.metadata.duration>600)bad('Scene too long: '+scene);
      return {scene,file,duration:qa.metadata.duration,hasAudio:qa.metadata.has_audio,
        render_job_id:job.job_id,sha256:digest(file)};
    });
    if(items.reduce((s,x)=>s+x.duration,0)>600)bad('Assembly exceeds 10 minutes');
    const job={id,job_id:id+'-'+randomUUID(),status:'queued',scene_ids,created_at:new Date().toISOString()};
    jobs.set(id,job);
    void (async()=>{
      const stage=path.join(out,id+'_final.'+randomUUID()+'.partial.mp4');
      const final=path.join(out,id+'_final.mp4');
      try{
        job.status='running';
        const args=['-hide_banner','-loglevel','error','-y'];
        items.forEach(x=>args.push('-i',x.file));
        const silenceInputs=new Map();
        for(const [i,x] of items.entries())if(!x.hasAudio){
          const idx=items.length+silenceInputs.size;
          silenceInputs.set(i,idx);
          args.push('-f','lavfi','-t',String(x.duration),'-i','anullsrc=channel_layout=stereo:sample_rate=48000');
        }
        const height=deck.format.height,fps=deck.format.fps;
        const filters=[];
        for(let i=0;i<items.length;i++){
          filters.push('['+i+':v:0]fps='+fps+',scale='+Math.round(height*16/9)+':'+height+',setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v'+i+']');
          const audioIdx=silenceInputs.get(i)??i;
          filters.push('['+audioIdx+':a:0]aresample=48000,aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a'+i+']');
        }
        filters.push(items.map((_,i)=>'[v'+i+'][a'+i+']').join('')+'concat=n='+items.length+':v=1:a=1[v][a]');
        args.push('-filter_complex',filters.join(';'),'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart',stage);
        await ffmpegRun(args);
        const qa=inspectMp4(stage,{fps,height,duration:items.reduce((s,x)=>s+x.duration,0),audio_required:true});
        if(qa.verdict!=='PASS')bad('Final video technical QA failed: '+qa.issues.map(x=>x.id).join(','),422);
        // If source MP4 changed during encoding, abort rather than publishing a mixed revision.
        if(items.some(x=>!fs.existsSync(x.file)||digest(x.file)!==x.sha256||
           getTask(id,x.scene).status!=='done'||
           getRender(id,x.scene).status!=='completed'||
           getRender(id,x.scene).job_id!==x.render_job_id))
          bad('Scene approval or source artifact changed during assembly',409);
        const manifest={version:1,project:id,job_id:job.job_id,transition:'hard-cut',
          scenes:items.map(x=>({id:x.scene,render_job_id:x.render_job_id,sha256:x.sha256,duration:x.duration,has_audio:x.hasAudio})),
          output:{sha256:digest(stage),size:fs.statSync(stage).size,qa},created_at:new Date().toISOString()};
        // Previous accepted final.mp4 remains available until final file is ready.
        fs.renameSync(stage,final);
        const manifestFile=path.join(out,id+'_final.manifest.json');
        const tmp=manifestFile+'.'+randomUUID()+'.tmp';
        fs.writeFileSync(tmp,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
        fs.renameSync(tmp,manifestFile);
        job.status='completed';job.manifest=manifest;job.result={download_url:baseUrl()+'/out/'+id+'_final.mp4',size:manifest.output.size};
      }catch(e){job.status='failed';job.error=e instanceof Error?e.message:String(e)}
      finally{fs.rmSync(stage,{force:true});job.finished_at=new Date().toISOString()}
    })();
    return {...job};
  }
  return {start,get};
}

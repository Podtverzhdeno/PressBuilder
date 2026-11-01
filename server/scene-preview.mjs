/**
 * Fast, source-pinned draft stills. These are not P03 QA or P08 approved outputs.
 * One scene per job; all heavy CDP work shares the in-process P02/P05 governor.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const HEX=/^[a-f0-9]{64}$/;
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const active=new Set(['queued','running','cancelling']);
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function atomic(file,body){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(body,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file)}
  finally{fs.rmSync(tmp,{force:true})}
}
export function scenePreviewService({out,getDeck,fingerprint,render,baseUrl,
  acquireResource=async()=>()=>{},timeoutMs=90000}){
  const jobs=new Map(),controllers=new Map();
  const key=(id,scene)=>id+':'+scene;
  function valid(id,scene){
    if(typeof id!=='string'||!ID.test(id)||typeof scene!=='string'||!ID.test(scene))
      throw bad('Invalid preview project/scene');
    if(!getDeck(id)?.slides?.some(s=>s.id===scene))throw bad('Preview scene not found',404);
  }
  const root=(id,scene)=>path.join(out,'previews',id,scene);
  const url=(id,scene,i)=>'/api/decks/'+encodeURIComponent(id)+
    '/preview/'+encodeURIComponent(scene)+'/'+i+'.png';
  function cached(id,scene,source){
    if(!HEX.test(source||''))throw bad('Invalid preview fingerprint',500);
    const dir=path.join(root(id,scene),source);
    const manifest=path.join(dir,'manifest.json');
    const pointer=path.join(root(id,scene),'current.json');
    if(!fs.existsSync(pointer)||!fs.existsSync(manifest))return null;
    try{
      const current=JSON.parse(fs.readFileSync(pointer,'utf8'));
      const item=JSON.parse(fs.readFileSync(manifest,'utf8'));
      if(current.fingerprint!==source||item.fingerprint!==source||
         item.scope!=='DRAFT_FRAMES_ONLY'||item.frames?.length!==3)return null;
      for(let i=0;i<3;i++){
        const frame=item.frames[i],file=path.join(dir,'f'+i+'.png');
        if(frame.index!==i||!Number.isFinite(frame.t)||frame.size<100||
           !HEX.test(frame.sha256||''))return null;
        const bytes=fs.readFileSync(file);
        if(bytes.length!==frame.size||!bytes.subarray(0,8).equals(PNG)||
           sha(bytes)!==frame.sha256)return null;
      }
      return {...item,cache_hit:true,frames:item.frames.map(f=>({
        ...f,url:url(id,scene,f.index)
      }))};
    }catch{return null}
  }
  function get(id,scene){
    valid(id,scene);
    const source=fingerprint(id,scene);
    const job=jobs.get(key(id,scene));
    if(job){
      if(job.source_fingerprint!==source)
        return {id,slide_id:scene,status:'stale',error:'Scene source changed after preview request'};
      if(job.status==='completed'){
        const checked=cached(id,scene,source);
        if(!checked)return {id,slide_id:scene,status:'failed',
          error:'Draft preview cache corrupted or missing; regenerate'};
        return {...structuredClone(job),frames:checked.frames};
      }
      return structuredClone(job);
    }
    const cache=cached(id,scene,source);
    return cache?{id,slide_id:scene,status:'completed',progress:100,
      source_fingerprint:source,...cache}:{id,slide_id:scene,status:'not_started'};
  }
  function start(id,scene){
    valid(id,scene);
    const source=fingerprint(id,scene),k=key(id,scene);
    const old=jobs.get(k);
    if(old&&active.has(old.status)){
      if(old.source_fingerprint!==source)throw bad('Previous preview still running',409);
      return structuredClone(old);
    }
    const available=cached(id,scene,source);
    if(available){
      const job={id,slide_id:scene,job_id:randomUUID(),status:'completed',
        progress:100,source_fingerprint:source,...available};
      jobs.set(k,job);
      return structuredClone(job);
    }
    const controller=new AbortController(),job={
      id,slide_id:scene,job_id:randomUUID(),status:'queued',progress:0,
      source_fingerprint:source,created_at:new Date().toISOString()
    };
    jobs.set(k,job);controllers.set(k,controller);
    void (async()=>{
      const dir=root(id,scene),output=path.join(dir,source);
      let stage=null,release=null;
      const timeout=setTimeout(()=>controller.abort(new Error('Preview timeout')),timeoutMs);
      timeout.unref?.();
      try{
        const startWait=Date.now();
        release=await acquireResource({kind:'preview',id,scene,signal:controller.signal});
        job.wait_resource_ms=Date.now()-startWait;
        controller.signal.throwIfAborted();
        job.status='running';
        const result=await render({id,slideId:scene,signal:controller.signal});
        controller.signal.throwIfAborted();
        if(result?.scope!=='DRAFT_FRAMES_ONLY'||result.frames?.length!==3)
          throw bad('Invalid draft frame response',502);
        if(fingerprint(id,scene)!==source)throw bad('Scene changed during draft preview',409);
        fs.mkdirSync(dir,{recursive:true});
        stage=path.join(dir,'.partial-'+job.job_id);
        fs.mkdirSync(stage);
        const frames=[];
        for(let i=0;i<3;i++){
          const frame=result.frames[i],bytes=frame?.bytes;
          if(frame?.index!==i||!Number.isFinite(frame.t)||!Buffer.isBuffer(bytes)||
             bytes.length<100||bytes.length>4*1024*1024||
             !bytes.subarray(0,8).equals(PNG))throw bad('Invalid preview PNG',502);
          fs.writeFileSync(path.join(stage,'f'+i+'.png'),bytes,{mode:0o600});
          frames.push({index:i,t:frame.t,sha256:sha(bytes),size:bytes.length});
        }
        const manifest={scope:'DRAFT_FRAMES_ONLY',fingerprint:source,
          width:result.width,height:result.height,fps:result.fps,
          frames,created_at:new Date().toISOString()};
        fs.writeFileSync(path.join(stage,'manifest.json'),
          JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
        controller.signal.throwIfAborted();
        if(fingerprint(id,scene)!==source)throw bad('Scene changed during preview publication',409);
        // Per-scene single writer. The pointer switches only after all files
        // are present and content hashes are committed.
        if(fs.existsSync(output))fs.rmSync(output,{recursive:true,force:true});
        fs.renameSync(stage,output);stage=null;
        atomic(path.join(dir,'current.json'),{fingerprint:source});
        for(const child of fs.readdirSync(dir)){
          if(HEX.test(child)&&child!==source)
            fs.rmSync(path.join(dir,child),{recursive:true,force:true});
        }
        job.status='completed';job.progress=100;
        job.cache_hit=false;
        job.scope=manifest.scope;
        job.frames=frames.map(f=>({...f,url:url(id,scene,f.index)}));
        job.width=manifest.width;job.height=manifest.height;
      }catch(e){
        job.status=controller.signal.aborted?'cancelled':'failed';
        job.error=e instanceof Error?e.message:String(e);
      }finally{
        clearTimeout(timeout);
        try{release?.()}catch{}
        if(stage)fs.rmSync(stage,{recursive:true,force:true});
        job.finished_at=new Date().toISOString();
        controllers.delete(k);
      }
    })();
    return structuredClone(job);
  }
  function cancel(id,scene){
    valid(id,scene);
    const k=key(id,scene),job=jobs.get(k);
    if(!job||!active.has(job.status))throw bad('No running draft preview',409);
    controllers.get(k)?.abort(new Error('Draft preview cancelled'));
    job.status='cancelling';
    return structuredClone(job);
  }
  function frame(id,scene,index){
    valid(id,scene);
    if(!Number.isSafeInteger(index)||index<0||index>2)throw bad('Invalid preview frame');
    const source=fingerprint(id,scene),item=cached(id,scene,source);
    if(!item)throw bad('Draft preview missing, stale or corrupted',409);
    return path.join(root(id,scene),source,'f'+index+'.png');
  }
  return {start,get,cancel,frame};
}

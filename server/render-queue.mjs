/**
 * A single-process, durable FIFO for PressBuilder render jobs.
 *
 * The worker is deliberately serialized (Chromium+ffmpeg are memory-heavy).
 * Journal writes are atomic, and an output becomes public ONLY after QA passes.
 * Across independent Railway replicas a distributed lock is required: do not
 * enable multiple app replicas with this implementation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';

const stamp=()=>new Date().toISOString();
const terminal=new Set(['completed','failed','cancelled']);
const active=new Set(['queued','running','cancelling']);
const idRE=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const err=(message,status=400)=>Object.assign(new Error(message),{status});
const clone=(job)=>job?structuredClone(job):null;
const slug=(value,field)=>{
  if(typeof value!=='string'||!idRE.test(value))throw err('Invalid '+field);
  return value;
};
function atomicWrite(file,content) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
  try{
    fs.writeFileSync(tmp,content,{mode:0o600});
    fs.renameSync(tmp,file);
  }finally{fs.rmSync(tmp,{force:true})}
}
function publishAlias(file,alias) {
  const tmp=alias+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
  try{
    fs.copyFileSync(file,tmp);
    fs.renameSync(tmp,alias);
  }finally{fs.rmSync(tmp,{force:true})}
}
export function makeRenderQueue({
  root,outputDir,resolveDeck,render,inspect,baseUrl,
  fingerprint=()=>null,concurrency=1,maxPending=50,maxRestarts=2,
  logger=console,autoStart=false
}){
  if(!Number.isSafeInteger(concurrency)||concurrency!==1)
    throw err('Only one rendering worker per instance is currently supported');
  fs.mkdirSync(root,{recursive:true});
  fs.mkdirSync(outputDir,{recursive:true});
  const latest=new Map();
  const pending=[];
  let running=null,enabled=autoStart;
  const key=(id,slide_id)=>id+':'+(slide_id||'<full>');
  const journal=(id,slide_id)=>path.join(root,createHash('sha256').update(key(id,slide_id)).digest('hex')+'.json');
  const save=j=>atomicWrite(journal(j.id,j.slide_id),JSON.stringify(j,null,2)+'\n');
  const validate=(id,slide_id=null)=>{
    slug(id,'project ID');
    if(slide_id!==null)slug(slide_id,'scene ID');
    const deck=resolveDeck(id);
    if(slide_id&&!deck.slides?.some(s=>s.id===slide_id))throw err('Scene not found',404);
    return deck;
  };
  function load(){
    for(const file of fs.readdirSync(root).filter(x=>/^[a-f0-9]{64}\.json$/.test(x)).sort()){
      try{
        const j=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
        if(!j||typeof j!=='object'||!['queued','running','cancelling','completed','failed','cancelled'].includes(j.status))throw Error('Invalid status');
        validate(j.id,j.slide_id||null);
        if(journal(j.id,j.slide_id)!==path.join(root,file))throw Error('Journal key mismatch');
        if(typeof j.job_id!=='string'||!idRE.test(j.job_id)||typeof j.output_name!=='string')throw Error('Invalid job identity');
        if(j.status==='completed'&&(!j.result?.file||!fs.existsSync(path.join(outputDir,path.basename(j.result.file))))){
          j.status='failed';j.error='Previously rendered file is missing';j.finishedAt=stamp();save(j);
        }else if(j.status==='queued'||j.status==='running'){
          j.restartAttempts=(j.restartAttempts||0)+1;
          if(j.restartAttempts>maxRestarts){
            j.status='failed';j.error='Render interrupted by repeated restarts';j.finishedAt=stamp();
          }else {
            j.status='queued';j.progress=0;
            pending.push(j);
          }
          save(j);
        }else if(j.status==='cancelling'){
          j.status='cancelled';j.finishedAt=stamp();save(j);
        }
        latest.set(key(j.id,j.slide_id),j);
      }catch(e){logger.warn?.('Skipping invalid render journal',file,String(e))}
    }
  }
  load();
  function info(id,slide_id=null){
    validate(id,slide_id);
    return clone(latest.get(key(id,slide_id))||{id,...(slide_id?{slide_id}:{}),status:'not_started'});
  }
  function enqueue(id,slide_id=null,{expected_job_id=null}={}){
    validate(id,slide_id);
    const k=key(id,slide_id);
    const old=latest.get(k);
    if(old&&active.has(old.status))return clone(old);
    if(expected_job_id!==null&&old?.job_id!==expected_job_id)throw err('Job changed; refresh and retry',409);
    if(pending.length>=maxPending)throw err('Render queue is full',429);
    const token=randomBytes(6).toString('hex');
    const job_id=token; // ≤40 characters; never uses user-supplied filenames
    const output_name=id+(slide_id?'_'+slide_id:'')+'_'+token;
    const j={id,...(slide_id?{slide_id}:{}),job_id,output_name,status:'queued',
      queuedAt:stamp(),progress:0,restartAttempts:0,source_fingerprint:fingerprint(id,slide_id)};
    save(j);latest.set(k,j);pending.push(j);
    void pump();return clone(j);
  }
  function cancel(id,slide_id,job_id){
    validate(id,slide_id);
    if(typeof job_id!=='string'||!idRE.test(job_id))throw err('Invalid job_id');
    const j=latest.get(key(id,slide_id));
    if(!j||j.job_id!==job_id)throw err('Render job not found',404);
    if(terminal.has(j.status))return clone(j);
    if(j.status==='queued'){
      j.status='cancelled';j.finishedAt=stamp();save(j);
      const idx=pending.indexOf(j);if(idx!==-1)pending.splice(idx,1);
    }else if(j.status==='running'){
      j.status='cancelling';save(j);
      if(running?.job===j)running.abort.abort(new Error('Render cancelled'));
    }
    return clone(j);
  }
  async function pump(){
    if(!enabled||running)return;
    while(enabled&&pending.length&&!running){
      const j=pending.shift();
      if(j.status!=='queued')continue;
      const abort=new AbortController();
      running={job:j,abort};
      j.status='running';j.startedAt=stamp();j.progress=0;save(j);
      try{
        if(j.source_fingerprint!==fingerprint(j.id,j.slide_id))
          throw Error('Source changed since job was queued; request a new render');
        const rendered=await render({id:j.id,slideId:j.slide_id||null,outputName:j.output_name,signal:abort.signal,
          onProgress:p=>{
            if(j.status!=='running')return;
            const next=Math.max(0,Math.min(99,Math.round(Number(p)*100)||0));
            if(Math.floor(next/10)>Math.floor(j.progress/10)){j.progress=next;save(j)}
            else j.progress=next;
          }});
        if(abort.signal.aborted||j.status==='cancelling')throw Error('Render cancelled');
        if(j.source_fingerprint!==fingerprint(j.id,j.slide_id))throw Error('Source changed during rendering');
        // Never accept an expected output path from the renderer.
        const immutable=path.join(outputDir,j.output_name+'.mp4');
        if(!fs.existsSync(immutable))throw Error('Renderer produced no MP4');
        const report=await inspect(immutable,{fps:rendered.fps,height:rendered.height,
          duration:rendered.duration,scene_id:j.slide_id||null,id:j.id,
          visualAudit:rendered.visualAudit??null,frameSamples:rendered.frameSamples??[]});
        j.qa_report=report;
        if(report?.verdict==='FAIL')throw Error('Technical QA failed: '+(report.issues||[]).map(x=>x.id).join(', '));
        if(abort.signal.aborted||j.status==='cancelling')throw Error('Render cancelled');
        const alias=j.id+(j.slide_id?'_'+j.slide_id:'')+'.mp4';
        publishAlias(immutable,path.join(outputDir,alias));
        j.status='completed';j.progress=100;
        j.result={file:'out/'+j.output_name+'.mp4',legacy_file:'out/'+alias,
          size:fs.statSync(immutable).size,download_url:baseUrl().replace(/\/$/,'')+'/out/'+j.output_name+'.mp4'};
      }catch(e){
        j.status=abort.signal.aborted||j.status==='cancelling'?'cancelled':'failed';
        j.error=e instanceof Error?e.message:String(e);
        // An unapproved render must not remain visible as a successful artifact.
        try{fs.rmSync(path.join(outputDir,j.output_name+'.mp4'),{force:true})}catch{}
      }finally{
        j.finishedAt=stamp();save(j);running=null;
      }
    }
  }
  return {
    start(){enabled=true;void pump()},
    get:info,enqueue,cancel,
    retry(id,slide_id,job_id){return enqueue(id,slide_id,{expected_job_id:job_id})},
    snapshot(){return {queued:pending.filter(j=>j.status==='queued').length,
      running:running?.job.job_id||null}},
  };
}

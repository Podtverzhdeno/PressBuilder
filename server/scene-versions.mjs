/**
 * P08 scene release archive. Snapshots and MP4s are immutable; approvals are a
 * separate mutable pointer. A failed/stale render never replaces an approved MP4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { buildSchedule } from '../src/engine/schedule.ts';
import { resolveSceneSync } from './scene-sync.mjs';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const VERSION=/^v-[a-f0-9]{24}$/;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export const sha256=b=>createHash('sha256').update(b).digest('hex');
function digestFile(file){
  const h=createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1024*1024);
  try{for(;;){const n=fs.readSync(fd,buf,0,buf.length,null);if(!n)break;h.update(buf.subarray(0,n))}}
  finally{fs.closeSync(fd)}
  return h.digest('hex');
}
function atomic(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});
  try{fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
}
function immutable(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  // Exclusive creation: a content-addressed manifest can never be rewritten.
  const fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd)}
  finally{fs.closeSync(fd)}
}
export function sceneVersionStore({root,outDir,getDeck,putDeck,scene3d,syncStore}){
  function locate(id,sid){
    if(typeof id!=='string'||!SLUG.test(id)||typeof sid!=='string'||!SLUG.test(sid))fail('Invalid project or scene ID');
    const deck=getDeck(id),index=deck.slides.findIndex(s=>s.id===sid);
    if(index<0)fail('Unknown scene',404);
    return {deck,index,dir:path.join(root,id,'.scene-versions',sid)};
  }
  function source(id,sid){
    const {deck,index}=locate(id,sid),schedule=buildSchedule(deck);
    const sc=schedule.slides[index];
    const audio=deck.audio||null;
    let voice=null;
    if(audio?.file){
      if(!/^voice\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/.test(audio.file))fail('Unsafe voice file reference');
      const f=path.join(root,id,audio.file);
      if(!fs.existsSync(f))fail('Referenced narration file is missing',409);
      voice={filename:audio.file,sha256:digestFile(f),offset:audio.offset||0,volume:audio.volume??1};
    }
    const snapshot={
      schema:1,
      slide:structuredClone(deck.slides[index]),
      scene3d:structuredClone(scene3d.read(id,sid).spec),
      sync_markers:structuredClone((()=>{
        const sync=syncStore.read(id,sid);
        if(sync.validation_error)fail('Fix orphaned audio/motion markers first: '+sync.validation_error,409);
        return sync.markers;
      })()),
      render_context:{style:deck.style||'terevo',format:deck.format,
        clip_start:sc.start,clip_duration:sc.dur,project_target:deck.target,
        lead:deck.lead??null,tail:deck.tail??null,voice,
        source_commit:process.env.RAILWAY_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null}
    };
    return {snapshot,fingerprint:sha256(JSON.stringify(snapshot))};
  }
  function manifest(id,sid,versionId){
    const {dir}=locate(id,sid);
    if(typeof versionId!=='string'||!VERSION.test(versionId))fail('Invalid version id');
    const file=path.join(dir,versionId+'.json');
    if(!fs.existsSync(file))fail('Scene version not found',404);
    const doc=JSON.parse(fs.readFileSync(file,'utf8'));
    if(doc.version_id!==versionId || sha256(JSON.stringify(doc.snapshot))!==doc.source_sha256)
      fail('Version manifest integrity error',500);
    return doc;
  }
  function active(id,sid){
    const {dir}=locate(id,sid),f=path.join(dir,'approved.json');
    if(!fs.existsSync(f))return {revision:0,approved_version:null};
    return JSON.parse(fs.readFileSync(f,'utf8'));
  }
  function list(id,sid){
    const {dir}=locate(id,sid);
    const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>VERSION.test(n.slice(0,-5))&&n.endsWith('.json')):[];
    const versions=files.map(f=>manifest(id,sid,f.slice(0,-5))).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    return {id,scene_id:sid,current_fingerprint:source(id,sid).fingerprint,
      approval:active(id,sid),versions:versions.map(v=>({
        version_id:v.version_id,created_at:v.created_at,source_sha256:v.source_sha256,
        artifact_sha256:v.artifact.sha256,bytes:v.artifact.bytes,
        duration:v.snapshot.render_context.clip_duration,fps:v.snapshot.render_context.format.fps,
        qa_verdict:v.artifact.qa_verdict}))};
  }
  function capture(id,sid,job){
    const {dir}=locate(id,sid),current=source(id,sid);
    if(!job||job.slide_id!==sid||job.id!==id||job.status!=='completed'||job.qa_report?.verdict!=='PASS')
      fail('Only successfully rendered and QA-passed scene jobs can be archived',409);
    if(job.render_fingerprint!==current.fingerprint)fail('Scene changed during or after render; rerender before archiving',409);
    const expected='out/'+id+'_'+sid+'.mp4';
    if(job.result?.file!==expected)fail('Render artifact does not match the requested scene',409);
    const original=path.join(outDir,id+'_'+sid+'.mp4');
    if(!fs.existsSync(original))fail('Rendered MP4 is missing',404);
    const stat=fs.statSync(original);
    if(!stat.isFile()||stat.size<1024||stat.size>1024*1024*1024)fail('Rendered MP4 size outside limits',413);
    const fileHash=digestFile(original);
    const versionId='v-'+sha256(current.fingerprint+'\0'+fileHash).slice(0,24);
    const destination=path.join(dir,versionId+'.mp4');
    fs.mkdirSync(dir,{recursive:true});
    // Never overwrite an archived artifact. A racing writer must prove equality.
    try{fs.copyFileSync(original,destination,fs.constants.COPYFILE_EXCL)}
    catch(e){if(e.code!=='EEXIST')throw e}
    if(digestFile(destination)!==fileHash)fail('Archived artifact hash mismatch',500);
    const doc={version_id:versionId,created_at:new Date().toISOString(),source_sha256:current.fingerprint,
      snapshot:current.snapshot,render_job_id:job.job_id,
      artifact:{filename:versionId+'.mp4',sha256:fileHash,bytes:stat.size,
        qa_verdict:job.qa_report.verdict,qa_metadata:job.qa_report.metadata}};
    const f=path.join(dir,versionId+'.json');
    if(!fs.existsSync(f))try{immutable(f,doc)}catch(e){if(e.code!=='EEXIST')throw e}
    return manifest(id,sid,versionId);
  }
  function ensureArtifact(id,sid,versionId){
    const doc=manifest(id,sid,versionId),{dir}=locate(id,sid);
    const file=path.join(dir,doc.artifact.filename);
    if(!fs.existsSync(file)||digestFile(file)!==doc.artifact.sha256)
      fail('Archived video missing or hash mismatch',409);
    return {doc,file};
  }
  function audit(dir,operation,actor,data){
    const file=path.join(dir,'audit',Date.now()+'-'+randomUUID()+'.json');
    immutable(file,{operation,actor,at:new Date().toISOString(),...data});
  }
  function approve(id,sid,versionId,expectedRevision,actor='editor'){
    const {dir}=locate(id,sid);
    ensureArtifact(id,sid,versionId);
    const previous=active(id,sid);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==previous.revision)
      fail('Approval state changed; reload and retry',409);
    const next={revision:previous.revision+1,approved_version:versionId,updated_at:new Date().toISOString()};
    atomic(path.join(dir,'approved.json'),next);
    audit(dir,'approve',actor,{from:previous.approved_version,to:versionId});
    return next;
  }
  function restore(id,sid,versionId,expectedFingerprint,actor='editor'){
    const {deck,index,dir}=locate(id,sid),cur=source(id,sid);
    if(typeof expectedFingerprint!=='string'||cur.fingerprint!==expectedFingerprint)
      fail('Working scene changed; reload and retry',409);
    const {doc}=ensureArtifact(id,sid,versionId);
    const snap=doc.snapshot;
    if(snap.slide.id!==sid)fail('Snapshot belongs to a different scene',409);
    // All operations are synchronous in this single-node MVP. The existing
    // shared deck.json still needs cross-process locks before multi-worker use.
    const three=scene3d.read(id,sid);
    const sync=syncStore.read(id,sid);
    const latest=getDeck(id);
    const slot=latest.slides.findIndex(s=>s.id===sid);
    if(slot<0)fail('Scene removed while restoring',409);
    // The cue sheet must be validated against the restored cue IDs, not the
    // currently edited ones. Markers are archived only after validation.
    latest.slides[slot]=structuredClone(snap.slide);
    const preflight=resolveSceneSync(latest,sid,snap.sync_markers);
    if(preflight.events.some(x=>x.out_of_range))
      fail('Restored cue markers fall outside the new scene timing',409);
    putDeck(id,latest);
    scene3d.put(id,sid,snap.scene3d,three.revision);
    syncStore.put(id,sid,snap.sync_markers,sync.revision);
    const after=source(id,sid);
    audit(dir,'restore',actor,{version_id:versionId,before:cur.fingerprint,after:after.fingerprint});
    return {ok:true,restored_version:versionId,current_fingerprint:after.fingerprint,
      exact_render_input_match:after.fingerprint===doc.source_sha256,
      archived_video_url:'/api/decks/'+id+'/versions/'+sid+'/'+versionId+'/video'};
  }
  function compare(id,sid,a,b){
    const x=manifest(id,sid,a),y=manifest(id,sid,b);
    const cx=new Map(x.snapshot.slide.cues.map(c=>[c.id,c])),cy=new Map(y.snapshot.slide.cues.map(c=>[c.id,c]));
    const ids=[...new Set([...cx.keys(),...cy.keys()])];
    return {from:a,to:b,
      source_changed:x.source_sha256!==y.source_sha256,
      video_changed:x.artifact.sha256!==y.artifact.sha256,
      changed_cues:ids.filter(k=>JSON.stringify(cx.get(k))!==JSON.stringify(cy.get(k))),
      scene3d_changed:JSON.stringify(x.snapshot.scene3d)!==JSON.stringify(y.snapshot.scene3d),
      markers_changed:JSON.stringify(x.snapshot.sync_markers)!==JSON.stringify(y.snapshot.sync_markers),
      duration_delta:y.snapshot.render_context.clip_duration-x.snapshot.render_context.clip_duration,
      fps:[x.snapshot.render_context.format.fps,y.snapshot.render_context.format.fps],
      note:'Frame-by-frame visual comparison is not implemented.'};
  }
  return {source,list,capture,approve,restore,compare,manifest,ensureArtifact,active};
}

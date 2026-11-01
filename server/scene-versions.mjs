/** P08: immutable rendered scene versions and explicit approved pointer. Single-process FS MVP. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {sourceManifest} from './source-provenance.mjs';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const VERSION=/^[0-9a-f]{16}$/;
const bad=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export function fileHash(file){
  const hash=createHash('sha256'),buf=Buffer.allocUnsafe(1024*1024);
  const fd=fs.openSync(file,'r');
  try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n))}
  finally{fs.closeSync(fd)}
  return hash.digest('hex');
}
function atomic(file,obj){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(obj,null,2)+'\n',{mode:0o600});
  try{fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}
}
export function sceneVersionStore({root,out,getDeck,getScene3D,getStyle,restoreSlide=null,restoreScene3D=null,staticRoot=path.join(process.cwd(),'build'),now=()=>new Date().toISOString()}){
  function locate(id,scene){
    if(typeof id!=='string'||!SLUG.test(id)||typeof scene!=='string'||!SLUG.test(scene))bad('Invalid project/scene ID');
    const deck=getDeck(id);
    const slide=deck.slides.find(s=>s.id===scene);
    if(!slide)bad('Scene not found',404);
    const dir=path.join(root,id,'.scene-versions',scene);
    return {deck,slide,dir};
  }
  function source(id,scene){
    const {deck,slide}=locate(id,scene);
    return sourceManifest({deck,slide,scene3d:getScene3D(id,scene),
      styleContract:getStyle(id),mediaDir:path.join(root,id),staticDir:staticRoot});
  }
  const versionId=jobId=>createHash('sha256').update(jobId).digest('hex').slice(0,16);
  function read(id,scene,version){
    const {dir}=locate(id,scene);
    if(typeof version!=='string'||!VERSION.test(version))bad('Invalid version identifier');
    const recordFile=path.join(dir,version+'.json');
    if(!fs.existsSync(recordFile))bad('Scene version not found',404);
    const item=JSON.parse(fs.readFileSync(recordFile,'utf8'));
    if(item.version_id!==version||item.project!==id||item.scene_id!==scene)bad('Corrupted scene version metadata',500);
    return item;
  }
  function list(id,scene){
    const {dir}=locate(id,scene);
    if(!fs.existsSync(dir))return [];
    return fs.readdirSync(dir).filter(n=>VERSION.test(n.replace(/\.json$/,''))&&n.endsWith('.json'))
      .map(n=>read(id,scene,n.slice(0,-5))).sort((a,b)=>a.created_at.localeCompare(b.created_at));
  }
  function pointer(id,scene){
    const {dir}=locate(id,scene);
    const f=path.join(dir,'approved.json');
    if(!fs.existsSync(f))return {project:id,scene_id:scene,revision:0,version_id:null,updated_at:null};
    return JSON.parse(fs.readFileSync(f,'utf8'));
  }
  function capture({id,scene,jobId,file,rendered,qa,expectedSource,frameEvidence=null}){
    const {dir}=locate(id,scene);
    if(qa?.verdict!=='PASS')bad('Failed QA cannot be versioned',422);
    if(typeof jobId!=='string'||jobId.length>220)bad('Invalid render job');
    if(source(id,scene).fingerprint!==expectedSource?.fingerprint)bad('Scene changed during render',409);
    if(list(id,scene).length>=50)bad('Scene version quota reached (50); explicit archival/GC required',413);
    const version=versionId(jobId);
    const targetName=id+'_'+scene+'_v'+version+'.mp4';
    const target=path.join(out,targetName);
    if(path.resolve(file)!==path.resolve(target))bad('Render output is not the expected immutable path',400);
    if(!fs.existsSync(target)||!fs.statSync(target).isFile())bad('MP4 missing',404);
    const hash=fileHash(target);
    if(frameEvidence){
      if(frameEvidence.scope!=='FRAME_HEURISTICS_ONLY'||frameEvidence.frames?.length!==3)bad('Expected three real frame samples',422);
      for(let i=0;i<3;i++){
        const frame=frameEvidence.frames[i];
        const name=id+'_'+scene+'_v'+version+'_f'+i+'.jpg';
        const candidate=path.join(out,name);
        if(frame.index!==i||frame.file!=='out/'+name||!fs.existsSync(candidate)||
          fs.statSync(candidate).size!==frame.size||fileHash(candidate)!==frame.sha256)
          bad('Frame evidence integrity mismatch for sample '+i,409);
      }
    }
    if(!expectedSource?.snapshot||createHash('sha256').update(JSON.stringify(expectedSource.snapshot)).digest('hex')!==expectedSource.fingerprint)
      bad('Missing or changed source snapshot',409);
    const {snapshot,...sourceSummary}=expectedSource;
    const item={version_id:version,project:id,scene_id:scene,job_id:jobId,created_at:now(),
      file:'out/'+targetName,sha256:hash,size:fs.statSync(target).size,
      duration:rendered.duration,fps:rendered.fps,height:rendered.height,
      source:sourceSummary,qa,...(frameEvidence?{frame_evidence:frameEvidence}:{})};
    const f=path.join(dir,version+'.json');
    if(fs.existsSync(f))bad('Render version already exists',409);
    const sourceFile=path.join(dir,version+'.source.json');
    atomic(sourceFile,snapshot);
    atomic(f,item);
    return item;
  }
  function readSource(id,scene,version){
    const {dir}=locate(id,scene),item=read(id,scene,version);
    const file=path.join(dir,version+'.source.json');
    if(!fs.existsSync(file))bad('Source snapshot unavailable for this legacy render',404);
    const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));
    const sha=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    if(sha!==item.source?.fingerprint)bad('Source snapshot integrity mismatch',409);
    return {version_id:version,source:snapshot,fingerprint:sha};
  }
  function restoreSource(id,scene,version,expectedFingerprint,expected3DRevision,actor){
    if(!restoreSlide||!restoreScene3D)bad('Source restoration is not configured',501);
    if(!actor||actor.role!=='director')bad('Only director can restore scene source',403);
    verified(id,scene,version); // restore only real, integrity-checked immutable MP4 versions
    const saved=readSource(id,scene,version).source;
    const before=source(id,scene);
    if(typeof expectedFingerprint!=='string'||before.fingerprint!==expectedFingerprint ||
      !Number.isSafeInteger(expected3DRevision)||before.scene3d_revision!==expected3DRevision)
      bad('Scene source changed; reload and retry restoration',409);
    const targetSettings=saved.project_settings,live=before.snapshot.project_settings;
    const targetAssets=saved.assets,liveAssets=before.snapshot.assets;
    // Project-level inputs apply to ALL scenes. Never silently overwrite shared settings,
    // narration, or deployed JS/CSS while restoring a single scene.
    if(JSON.stringify(targetSettings)!==JSON.stringify(live)||
      JSON.stringify(targetAssets)!==JSON.stringify(liveAssets))
      bad('Shared settings, narration or deployed application assets differ; isolated source restoration refused',409);
    if(!saved.slide||saved.slide.id!==scene||!saved.scene3d||
      typeof saved.scene3d.revision!=='number')bad('Invalid archived source snapshot',409);
    const old3D=before.snapshot.scene3d;
    const new3D=restoreScene3D(id,scene,saved.scene3d.spec,expected3DRevision);
    try{
      restoreSlide(id,scene,structuredClone(saved.slide));
    }catch(e){
      // Compensate a second-file write failure (process crashes remain non-transactional).
      try{restoreScene3D(id,scene,old3D.spec,new3D.revision)}catch{}
      throw e;
    }
    const after=source(id,scene);
    const {dir}=locate(id,scene);
    const audit=path.join(dir,'source-restores.jsonl');
    fs.appendFileSync(audit,JSON.stringify({version_id:version,project:id,scene_id:scene,
      actor:actor.id,from_fingerprint:before.fingerprint,to_fingerprint:after.fingerprint,
      restored_at:now(),trace_id:randomUUID()})+'\n',{mode:0o600});
    return {ok:true,project:id,scene_id:scene,restored_from_version:version,
      previous_fingerprint:before.fingerprint,fingerprint:after.fingerprint,
      scene3d_revision:after.scene3d_revision};
  }
  function verified(id,scene,version){
    const item=read(id,scene,version);
    const name=path.basename(item.file||'');
    const expected=id+'_'+scene+'_v'+version+'.mp4';
    if(name!==expected||item.file!=='out/'+expected)bad('Invalid version file path',500);
    const file=path.join(out,name);
    if(!fs.existsSync(file)||fs.statSync(file).size!==item.size||fileHash(file)!==item.sha256)
      bad('Immutable scene artifact missing or corrupted',409);
    return {...item,absolute_file:file};
  }
  function approved(id,scene){
    const p=pointer(id,scene);
    if(!p.version_id)return {...p,artifact:null};
    return {...p,artifact:verified(id,scene,p.version_id)};
  }
  function approve(id,scene,version,expectedRevision,actor,{unresolved=()=>false}={}){
    const {dir}=locate(id,scene),old=pointer(id,scene);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==old.revision)bad('Approved revision conflict',409);
    const item=verified(id,scene,version);
    if(item.qa?.verdict!=='PASS')bad('Only QA-passing versions can be approved',422);
    if(unresolved(id,scene,version))bad('Unresolved review issues prevent approval',409);
    const stable=path.join(out,id+'_'+scene+'.mp4');
    const stage=stable+'.'+randomUUID()+'.partial';
    fs.copyFileSync(item.absolute_file,stage);
    if(fileHash(stage)!==item.sha256){fs.rmSync(stage,{force:true});bad('Failed approved copy checksum',500)}
    const next={project:id,scene_id:scene,revision:old.revision+1,version_id:version,
      updated_at:now(),approved_by:actor.id,action:old.version_id&&old.version_id!==version?'RESTORE_OR_REPLACE':'APPROVE'};
    try{fs.renameSync(stage,stable);atomic(path.join(dir,'approved.json'),next)}
    finally{fs.rmSync(stage,{force:true})}
    const audit=path.join(dir,'history.jsonl');
    fs.appendFileSync(audit,JSON.stringify({...next,trace_id:randomUUID()})+'\n',{mode:0o600});
    const {absolute_file,...publicItem}=item;
    return {...next,artifact:publicItem};
  }
  function restore(id,scene,version,expectedRevision,actor,options={}){
    const {dir}=locate(id,scene);
    const log=path.join(dir,'history.jsonl');
    if(!fs.existsSync(log))bad('No previously approved versions to restore',409);
    const wasApproved=fs.readFileSync(log,'utf8').split('\n').filter(Boolean).some(line=>{
      try{return JSON.parse(line).version_id===version}catch{return false}
    });
    if(!wasApproved)bad('Cannot restore a version that was never approved',409);
    return approve(id,scene,version,expectedRevision,actor,options);
  }
  function publishPreview(id,scene,item){
    // Preserve the approved stable MP4 while subsequent draft renders are evaluated.
    if(pointer(id,scene).version_id)return;
    const original=path.join(out,id+'_'+scene+'.mp4'),stage=original+'.'+randomUUID()+'.partial';
    fs.copyFileSync(path.join(out,path.basename(item.file)),stage);
    try{fs.renameSync(stage,original)}finally{fs.rmSync(stage,{force:true})}
  }
  return {source,versionId,capture,read,readSource,restoreSource,list,pointer,approved,approve,restore,verified,publishPreview};
}

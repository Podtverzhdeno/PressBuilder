/** P08: immutable rendered scene versions and explicit approved pointer. Single-process FS MVP. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID,constants} from 'node:crypto';

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
export function sceneVersionStore({root,out,getDeck,getScene3D,getStyle,now=()=>new Date().toISOString()}){
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
    const snapshot={slide,style:deck.style,format:deck.format,audio:deck.audio??null,
      scene3d:getScene3D(id,scene),styleContract:getStyle(id)};
    return {fingerprint:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      scene3d_revision:snapshot.scene3d?.revision??0,style_revision:snapshot.styleContract?.revision??0};
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
  function capture({id,scene,jobId,file,rendered,qa,expectedSource}){
    const {dir}=locate(id,scene);
    if(qa?.verdict!=='PASS')bad('Failed QA cannot be versioned',422);
    if(typeof jobId!=='string'||jobId.length>220)bad('Invalid render job');
    if(source(id,scene).fingerprint!==expectedSource?.fingerprint)bad('Scene changed during render',409);
    const version=versionId(jobId);
    const targetName=id+'_'+scene+'_v'+version+'.mp4';
    const target=path.join(out,targetName);
    if(path.resolve(file)!==path.resolve(target))bad('Render output is not the expected immutable path',400);
    if(!fs.existsSync(target)||!fs.statSync(target).isFile())bad('MP4 missing',404);
    const hash=fileHash(target);
    const item={version_id:version,project:id,scene_id:scene,job_id:jobId,created_at:now(),
      file:'out/'+targetName,sha256:hash,size:fs.statSync(target).size,
      duration:rendered.duration,fps:rendered.fps,height:rendered.height,
      source:expectedSource,qa};
    const f=path.join(dir,version+'.json');
    if(fs.existsSync(f))bad('Render version already exists',409);
    atomic(f,item);
    return item;
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
    return {...next,artifact:item};
  }
  function publishPreview(id,scene,item){
    // Preserve the approved stable MP4 while subsequent draft renders are evaluated.
    if(pointer(id,scene).version_id)return;
    const original=path.join(out,id+'_'+scene+'.mp4'),stage=original+'.'+randomUUID()+'.partial';
    fs.copyFileSync(path.join(out,path.basename(item.file)),stage);
    try{fs.renameSync(stage,original)}finally{fs.rmSync(stage,{force:true})}
  }
  return {source,versionId,capture,read,list,pointer,approved,approve,verified,publishPreview};
}

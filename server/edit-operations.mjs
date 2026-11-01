/** M01-R02: source-pinned, review-only edit operations. No output, audio edit or P05 publication. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA=/^[0-9a-f]{64}$/;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const keys=(o,allowed)=>{
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))
  fail('EDITOPS_INVALID_FIELDS',400);
};
const copy=o=>structuredClone(o);
const validateClip=(node)=>{
 if(!SLUG.test(node.clip_id)||!SLUG.test(node.scene_id)||
    !integer(node.source_in_frame)||!integer(node.source_out_frame)||
    !integer(node.source_limit_frames)||node.source_out_frame>node.source_limit_frames||
    node.source_out_frame<=node.source_in_frame)
   fail('EDITOPS_INVALID_CLIP',422);
};
export function initialEditNodes(source){
 const frameTicks=source?.timebase?.fps?.frame_ticks;
 if(!integer(frameTicks)||frameTicks===0||!Array.isArray(source?.scenes)||
    !SHA.test(source?.source_sha256??''))fail('EDITOPS_INVALID_SOURCE',422);
 return source.scenes.map(s=>{
  if(!SLUG.test(s.scene_id)||!integer(s.duration_tick)||s.duration_tick%frameTicks!==0)
   fail('EDITOPS_INVALID_SOURCE_SCENE',422);
  const length=s.duration_tick/frameTicks;
  const asset=s.source_media;
  return {clip_id:s.scene_id,scene_id:s.scene_id,source_in_frame:0,
   source_out_frame:length,source_limit_frames:length,
   source_version_id:asset?.version_id??null,source_sha256:asset?.sha256??null,
   available:!!asset};
 });
}
function checkSource(source,node){
 const scene=source.scenes.find(s=>s.scene_id===node.scene_id);
 if(!scene||!scene.source_media||scene.source_media.version_id!==node.source_version_id||
    scene.source_media.sha256!==node.source_sha256||
    scene.source_media.qa_verdict!=='PASS')fail('EDITOPS_APPROVED_SOURCE_REQUIRED');
 const frame=source.timebase.fps;
 const fps=frame.num/frame.den;
 if(Math.abs(scene.source_media.fps-fps)>0.001)fail('EDITOPS_SOURCE_FPS_MISMATCH');
 const sourceFrames=Math.round(scene.source_media.source_duration_s*fps);
 if(Math.abs(sourceFrames-node.source_limit_frames)>1||node.source_out_frame>sourceFrames)
  fail('EDITOPS_SOURCE_DURATION_MISMATCH');
}
const findClip=(nodes,id)=>{
 if(typeof id!=='string'||!SLUG.test(id))fail('EDITOPS_INVALID_CLIP_ID',400);
 const idx=nodes.findIndex(n=>n.clip_id===id);
 if(idx<0)fail('EDITOPS_CLIP_NOT_FOUND',404);
 return idx;
};
export function applyEditOperation(source,current,operation,index){
 keys(operation,['type','clip_id','source_in_frame','source_out_frame','at_source_frame','before_clip_id']);
 if(!Array.isArray(current)||current.length>1600||!integer(index))fail('EDITOPS_TOO_MANY_CLIPS',422);
 const nodes=copy(current),type=operation.type;
 if(!['TRIM','SPLIT','MOVE'].includes(type))fail('EDITOPS_UNKNOWN_OPERATION',400);
 const pos=findClip(nodes,operation.clip_id),clip=nodes[pos];
 checkSource(source,clip);
 if(type==='TRIM'){
  keys(operation,['type','clip_id','source_in_frame','source_out_frame']);
  const a=operation.source_in_frame,b=operation.source_out_frame;
  if(!integer(a)||!integer(b)||a<clip.source_in_frame||b>clip.source_out_frame||b<=a)
   fail('EDITOPS_INVALID_TRIM',422);
  clip.source_in_frame=a;clip.source_out_frame=b;
 }else if(type==='SPLIT'){
  keys(operation,['type','clip_id','at_source_frame']);
  const at=operation.at_source_frame;
  if(!integer(at)||at<=clip.source_in_frame||at>=clip.source_out_frame)
   fail('EDITOPS_INVALID_SPLIT',422);
  const rightId='c'+hash({clip_id:clip.clip_id,operation_index:index,at}).slice(0,24);
  if(nodes.some(x=>x.clip_id===rightId))fail('EDITOPS_CLIP_ID_COLLISION');
  const right={...clip,clip_id:rightId,source_in_frame:at};
  clip.source_out_frame=at;
  nodes.splice(pos+1,0,right);
 }else{
  keys(operation,['type','clip_id','before_clip_id']);
  if(operation.before_clip_id!==null&&typeof operation.before_clip_id!=='string')
   fail('EDITOPS_INVALID_MOVE',422);
  if(operation.before_clip_id===clip.clip_id)fail('EDITOPS_INVALID_MOVE',422);
  const dest=operation.before_clip_id===null?-1:findClip(nodes,operation.before_clip_id);
  if(dest===pos+1)fail('EDITOPS_NOOP_MOVE',422);
  nodes.splice(pos,1);
  const dst=operation.before_clip_id===null?nodes.length:findClip(nodes,operation.before_clip_id);
  nodes.splice(dst,0,clip);
 }
 if(nodes.length>1600)fail('EDITOPS_TOO_MANY_CLIPS',422);
 for(const n of nodes)validateClip(n);
 return nodes;
}
export function compileEditPreview(source,operations=[],cursor=operations.length){
 if(!Array.isArray(operations)||operations.length>1000||!integer(cursor)||cursor>operations.length)
  fail('EDITOPS_INVALID_HISTORY',422);
 let nodes=initialEditNodes(source);
 for(let i=0;i<cursor;i++)nodes=applyEditOperation(source,nodes,operations[i],i);
 const frameTicks=source.timebase.fps.frame_ticks;
 let tick=0;
 const clips=nodes.map(n=>{
  const duration=(n.source_out_frame-n.source_in_frame)*frameTicks;
  const clip={...n,timeline_start_tick:tick,timeline_end_tick:tick+duration};
  tick+=duration;return clip;
 });
 return {schema_version:1,project_id:source.project_id,
  source_sha256:source.source_sha256,timebase:source.timebase,
  duration_tick:tick,clips,
  graph_sha256:hash({source_sha256:source.source_sha256,clips}),
  render_allowed:false,publication_allowed:false,
  warnings:['P01_CUE_TIMINGS_ARE_NOT_RETIMED','AUDIO_MIX_NOT_RECOMPUTED',
   'P05_TRANSITIONS_NOT_APPLIED','NO_REAL_RENDER_AUTHORITY']};
}
const write=(file,data)=>{
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}
 finally{fs.rmSync(tmp,{force:true})}
};
export function editOperationService({root,editGraph,enabled=false}){
 const active=()=>{if(!enabled)fail('EDITOPS_DISABLED',501)};
 function location(id){
  if(typeof id!=='string'||!SLUG.test(id))fail('EDITOPS_INVALID_PROJECT',400);
  const file=path.join(root,id,'.editgraph','operations.json');
  for(const dir of [root,path.join(root,id),path.dirname(file)]){
   const stat=fs.lstatSync(dir,{throwIfNoEntry:false});
   if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))fail('EDITOPS_UNSAFE_DIRECTORY',403);
  }
  const st=fs.lstatSync(file,{throwIfNoEntry:false});
  if(st&&(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>256*1024))
   fail('EDITOPS_UNSAFE_JOURNAL',403);
  return file;
 }
 function source(id){active();return editGraph.read(id)}
 function state(id){
  const loc=location(id);
  if(!fs.existsSync(loc))return {schema_version:1,revision:0,source_sha256:null,cursor:0,operations:[]};
  let doc;try{doc=JSON.parse(fs.readFileSync(loc,'utf8'))}catch{fail('EDITOPS_CORRUPT_JOURNAL',500)}
  if(!doc||doc.schema_version!==1||!integer(doc.revision)||!integer(doc.cursor)||
    !Array.isArray(doc.operations)||doc.operations.length>1000||doc.cursor>doc.operations.length||
    !SHA.test(doc.source_sha256??'')||doc.revision<1||
    Object.keys(doc).sort().join(',')!=='cursor,operations,revision,schema_version,source_sha256')
   fail('EDITOPS_CORRUPT_JOURNAL',500);
  return doc;
 }
 function read(id){
  const src=source(id),doc=state(id),stale=doc.source_sha256!==null&&
   doc.source_sha256!==src.source_sha256;
  const result={revision:doc.revision,cursor:doc.cursor,operation_count:doc.operations.length,
   source_sha256:src.source_sha256,history_source_sha256:doc.source_sha256,
   state:stale?'STALE_SOURCE':doc.operations.length?'REVIEW_ONLY':'EMPTY',
   render_allowed:false,publication_allowed:false};
  if(stale)return {...result,preview:null};
  return {...result,preview:compileEditPreview(src,doc.operations,doc.cursor)};
 }
 function change(id,actor,body){
  active();
  if(actor?.role!=='director')fail('EDITOPS_DIRECTOR_REQUIRED',403);
  keys(body,['action','expected_revision','expected_source_sha256','operation']);
  const src=source(id),old=state(id);
  if(!integer(body.expected_revision)||old.revision!==body.expected_revision)
   fail('EDITOPS_CAS_CONFLICT');
  if(!SHA.test(body.expected_source_sha256??'')||src.source_sha256!==body.expected_source_sha256||
    (old.source_sha256!==null&&old.source_sha256!==src.source_sha256))
   fail('EDITOPS_SOURCE_STALE');
  const next={...old,source_sha256:src.source_sha256,revision:old.revision+1};
  if(body.action==='APPLY'){
   if(old.cursor>=1000)fail('EDITOPS_HISTORY_LIMIT',422);
   if(!body.operation)fail('EDITOPS_MISSING_OPERATION',400);
   const history=old.operations.slice(0,old.cursor);
   const current=compileEditPreview(src,history,history.length);
   applyEditOperation(src,current.clips.map(({timeline_start_tick,timeline_end_tick,...n})=>n),
    body.operation,history.length);
   next.operations=[...history,copy(body.operation)];
   next.cursor=next.operations.length;
  }else if(body.action==='UNDO'){
   if(body.operation!==undefined)fail('EDITOPS_INVALID_FIELDS',400);
   if(next.cursor===0)fail('EDITOPS_NOTHING_TO_UNDO',409);
   next.cursor--;
  }else if(body.action==='REDO'){
   if(body.operation!==undefined)fail('EDITOPS_INVALID_FIELDS',400);
   if(next.cursor===next.operations.length)fail('EDITOPS_NOTHING_TO_REDO',409);
   next.cursor++;
  }else fail('EDITOPS_INVALID_ACTION',400);
  // Entire remaining history must still replay after undo and before atomic save.
  compileEditPreview(src,next.operations,next.operations.length);
  if(source(id).source_sha256!==src.source_sha256)fail('EDITOPS_SOURCE_CHANGED_DURING_WRITE');
  // One owner process only; not safe across replicas. Server's worker is single-replica.
  write(location(id),next);
  return read(id);
 }
 return {read,change};
}

/** M01-R01: rational, deterministic EditGraph, proposal-only. No render or P05 edits. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {buildSchedule} from '../src/engine/schedule.ts';

export const TICKS_PER_SECOND=240000; // 24, 25, 30, 48 kHz, 30000/1001.
const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA=/^[a-f0-9]{64}$/;
const bad=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const normal=(o,allowed)=>{
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))
   bad('EDITGRAPH_INVALID_FIELDS',400);
};
export function frameClock(fps){
 let num,den;
 if(fps&&typeof fps==='object'&&!Array.isArray(fps)){
  if(Object.keys(fps).some(k=>!['num','den'].includes(k)))bad('EDITGRAPH_FPS_UNSUPPORTED',422);
  ({num,den}=fps);
 }else{
  if(!finite(fps)||fps<1||fps>120)bad('EDITGRAPH_FPS_UNSUPPORTED',422);
  const fractions=[[24000,1001],[30000,1001],[60000,1001]];
  const found=fractions.find(([n,d])=>Math.abs(fps-n/d)<0.001);
  if(found)[num,den]=found;
  else if(Number.isSafeInteger(fps))[num,den]=[fps,1];
  else bad('EDITGRAPH_FPS_UNSUPPORTED',422);
 }
 if(!integer(num)||num<1||num>120000||!integer(den)||den<1||den>1001||
    (TICKS_PER_SECOND*den)%num!==0)bad('EDITGRAPH_FPS_UNSUPPORTED',422);
 return {num,den,frame_ticks:TICKS_PER_SECOND*den/num};
}
export function snapFrame(seconds,clock){
 if(!finite(seconds)||Math.abs(seconds)>6*60*60)bad('EDITGRAPH_TIME_OUT_OF_BOUNDS',422);
 const n=Math.round(seconds*TICKS_PER_SECOND/clock.frame_ticks);
 if(!Number.isSafeInteger(n))bad('EDITGRAPH_TIME_OVERFLOW',422);
 return n;
}
const checkName=(v,what)=>{if(typeof v!=='string'||!SLUG.test(v))bad('EDITGRAPH_INVALID_'+what,400);return v};
function sourcePack({id,deck,sceneSync,assemblyPlans,versions}){
 const sched=buildSchedule(deck);
 if(!Array.isArray(deck.slides)||deck.slides.length<1||deck.slides.length>300||
    !Array.isArray(sched.slides)||sched.slides.length!==deck.slides.length)
   bad('EDITGRAPH_INVALID_DECK',422);
 const fps=frameClock(deck.format?.fps);
 if(!finite(sched.duration)||sched.duration<=0||sched.duration>6*60*60)
   bad('EDITGRAPH_INVALID_DURATION',422);
 const assembly=assemblyPlans?.read?.(id)??null;
 const aScenes=assembly?.plan?.scenes;
 if(assembly&&(!Array.isArray(aScenes)||aScenes.length!==sched.slides.length))
   bad('EDITGRAPH_ASSEMBLY_DRIFT');
 const scenes=[],markers=[],sourceStates=[];
 let prevFrame=0;
 for(const [i,sc] of sched.slides.entries()){
  const sceneId=checkName(sc.slide.id,'SCENE');
  if(scenes.some(s=>s.scene_id===sceneId))bad('EDITGRAPH_DUPLICATE_SCENE');
  if(sc.cues.length<1||sc.cues.length>100)bad('EDITGRAPH_INVALID_CUES',422);
  // Single rounding of ABSOLUTE boundaries (not per-scene rounded deltas).
  const endFrame=snapFrame(sc.start+sc.dur,fps);
  if(endFrame<=prevFrame)bad('EDITGRAPH_ZERO_LENGTH_SCENE');
  const startFrame=prevFrame,cues=[];
  const ids=new Set();
  for(const cue of sc.cues){
   if(typeof cue.id!=='string'||!cue.id||cue.id.length>80||ids.has(cue.id))
    bad('EDITGRAPH_DUPLICATE_OR_INVALID_CUE');
   ids.add(cue.id);
   const a=Math.max(startFrame,Math.min(endFrame,snapFrame(sc.start+cue.start,fps)));
   const b=Math.max(a,Math.min(endFrame,snapFrame(sc.start+cue.start+cue.dur,fps)));
   if(b<=a)bad('EDITGRAPH_ZERO_LENGTH_CUE');
   cues.push({cue_id:cue.id,source_text_sha256:digest({say:cue.say,show:cue.show}),
    start_tick:a*fps.frame_ticks,end_tick:b*fps.frame_ticks,source_type:'P01_SCHEDULE'});
  }
  if(aScenes&&aScenes[i].scene_id!==sceneId)bad('EDITGRAPH_ASSEMBLY_DRIFT');
  const sync=sceneSync?.read?.(id,sceneId)??null;
  if(sync?.validation_error)bad('EDITGRAPH_SYNC_DRIFT');
  const events=sync?.timeline?.events??[];
  if(!Array.isArray(events)||events.length>100||events.some(e=>e.out_of_range))
   bad('EDITGRAPH_SYNC_INVALID');
  const markerIds=new Set();
  const sceneMarkers=events.map(e=>{
    if(!e||typeof e.id!=='string'||e.id.length>60||markerIds.has(e.id)||!finite(e.global_time))
     bad('EDITGRAPH_MARKER_INVALID');
    markerIds.add(e.id);
    const frame=snapFrame(e.global_time,fps);
    if(frame<startFrame||frame>endFrame)bad('EDITGRAPH_MARKER_OUTSIDE_SCENE');
    return {marker_id:e.id,kind:e.kind,scene_id:sceneId,
      pts_tick:frame*fps.frame_ticks,original_global_second:e.global_time};
  });
  markers.push(...sceneMarkers);
  const ap=aScenes?.[i]?.transition_after??{type:'hard-cut',duration:0};
  if(!['hard-cut','crossfade','match-cut'].includes(ap.type)||
    !finite(ap.duration)||ap.duration<0||ap.duration>0.75)
    bad('EDITGRAPH_TRANSITION_INVALID');
  const approved=versions?.approved?.(id,sceneId)??null;
  const artifact=approved?.artifact??null;
  const media=artifact?{
   version_id:approved.version_id,approval_revision:approved.revision,
   sha256:artifact.sha256,source_duration_s:artifact.duration,
   fps:artifact.fps,qa_verdict:artifact.qa?.verdict
  }:null;
  if(media&&(!SHA.test(media.sha256??'')||!finite(media.source_duration_s)||
    media.source_duration_s<=0||media.qa_verdict!=='PASS'))
   bad('EDITGRAPH_INVALID_APPROVED_MEDIA');
  scenes.push({scene_id:sceneId,index:i,source_start_frame:startFrame,
    source_end_frame:endFrame,start_tick:startFrame*fps.frame_ticks,
    end_tick:endFrame*fps.frame_ticks,duration_tick:(endFrame-startFrame)*fps.frame_ticks,
    cues,transition_after:{type:ap.type,requested_duration_tick:Math.round(ap.duration*TICKS_PER_SECOND),
      overlap_applied:false},source_media:media,
    sync_revision:sync?.revision??null});
  sourceStates.push({scene_id:sceneId,source_text:sc.slide,scene_sync:sync?{revision:sync.revision,markers:sync.markers}:null,
    approved_pointer:media});
  prevFrame=endFrame;
 }
 const audio=deck.audio?{
  kind:'voice',source_name:deck.audio.file,offset_sample_tick:Math.round((deck.audio.offset??0)*48000)*5,
  sample_rate:48000,media_verified:false,alignment:'NOT_PROVEN_BY_GRAPH'
 }:null;
 if(audio&&(!/^voice\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(audio.source_name)||
    !finite(deck.audio.offset??0)))bad('EDITGRAPH_AUDIO_INVALID');
 const source_sha256=digest({deck,assembly:assembly?{revision:assembly.revision,plan:assembly.plan}:null,states:sourceStates});
 return {schema_version:1,project_id:id,timebase:{ticks_per_second:TICKS_PER_SECOND,fps},
   source_sha256,duration_tick:prevFrame*fps.frame_ticks,scenes,markers,audio,
   assembly_revision:assembly?.revision??null,
   warnings:['P05_TRANSITIONS_ARE_DECLARED_NOT_APPLIED','AUDIO_SAMPLE_ALIGNMENT_IS_UNVERIFIED',
    'RENDER_AND_PUBLICATION_ARE_NOT_AUTHORIZED']};
}
function save(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.'+randomUUID()+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 try{fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
}
export function editGraphService({root,getDeck,sceneSync,assemblyPlans,versions,enabled=false}){
 function active(){if(!enabled)bad('EDITGRAPH_DISABLED',501)}
 function file(id){
  checkName(id,'PROJECT');getDeck(id);
  for(const dir of [root,path.join(root,id),path.join(root,id,'.editgraph')]){
   const st=fs.lstatSync(dir,{throwIfNoEntry:false});
   if(st?.isSymbolicLink()||(st&&!st.isDirectory()))bad('EDITGRAPH_UNSAFE_STORAGE',403);
  }
  return path.join(root,id,'.editgraph','candidate.json');
 }
 function build(id){
  active();file(id);
  return sourcePack({id,deck:getDeck(id),sceneSync,assemblyPlans,versions});
 }
 function candidateState(id){
  const loc=file(id);
  if(!fs.existsSync(loc))return {revision:0,proposal:null};
  const st=fs.lstatSync(loc);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>128*1024)
   bad('EDITGRAPH_CANDIDATE_CORRUPT',500);
  let parsed;try{parsed=JSON.parse(fs.readFileSync(loc,'utf8'))}
  catch{bad('EDITGRAPH_CANDIDATE_CORRUPT',500)}
  if(!integer(parsed?.revision)||parsed.revision===0||
    !parsed.proposal||parsed.proposal.schema_version!==1||
    !SHA.test(parsed.proposal.source_sha256??''))
   bad('EDITGRAPH_CANDIDATE_CORRUPT',500);
  return parsed;
 }
 function read(id,{sceneId=null}={}){
  const source=build(id),state=candidateState(id);
  if(sceneId!==null)checkName(sceneId,'SCENE');
  if(sceneId!==null&&!source.scenes.some(s=>s.scene_id===sceneId))
   bad('EDITGRAPH_SCENE_NOT_FOUND',404);
  const stale=!!state.proposal&&state.proposal.source_sha256!==source.source_sha256;
  const filtered=sceneId===null?source.scenes:source.scenes.filter(s=>s.scene_id===sceneId);
  return {...source,scenes:filtered,
   markers:sceneId===null?source.markers:source.markers.filter(m=>m.scene_id===sceneId),
   candidate_revision:state.revision,candidate_state:state.proposal?(stale?'STALE_SOURCE':'PROPOSED'):'NONE',
   candidate:sceneId===null?state.proposal:null,
   candidate_may_render:false,publication_allowed:false};
 }
 function propose(id,actor,args){
  active();
  if(actor?.role!=='director')bad('EDITGRAPH_DIRECTOR_REQUIRED',403);
  normal(args,['expected_revision','expected_source_sha256','trims']);
  const source=build(id),state=candidateState(id);
  if(!integer(args.expected_revision)||args.expected_revision!==state.revision)
   bad('EDITGRAPH_CAS_CONFLICT');
  if(!SHA.test(args.expected_source_sha256??'')||
    args.expected_source_sha256!==source.source_sha256)
   bad('EDITGRAPH_SOURCE_STALE');
  if(!Array.isArray(args.trims)||args.trims.length===0||
    args.trims.length>source.scenes.length)bad('EDITGRAPH_INVALID_TRIMS',400);
  const clock=source.timebase.fps,tick=clock.frame_ticks;
  const ids=new Set(),changes=[];
  for(const t of args.trims){
   normal(t,['scene_id','source_in_frame','source_out_frame']);
   const sc=source.scenes.find(s=>s.scene_id===t.scene_id);
   if(!sc||ids.has(t.scene_id))bad('EDITGRAPH_INVALID_TRIM_SCENE',400);
   ids.add(t.scene_id);
   const frameCount=sc.duration_tick/tick;
   if(!integer(t.source_in_frame)||!integer(t.source_out_frame)||
      t.source_out_frame>frameCount||t.source_out_frame<=t.source_in_frame)
    bad('EDITGRAPH_INVALID_TRIM_BOUNDS',422);
   if(!sc.source_media)bad('EDITGRAPH_APPROVED_MP4_REQUIRED');
   // No edit proposal may reference frames beyond a SHA-verified P08 source.
   const srcFrames=snapFrame(sc.source_media.source_duration_s,clock);
   if(t.source_out_frame>srcFrames||Math.abs(srcFrames-frameCount)>1)
    bad('EDITGRAPH_SOURCE_DURATION_MISMATCH');
   if(finite(sc.source_media.fps)&&Math.abs(sc.source_media.fps-clock.num/clock.den)>0.001)
    bad('EDITGRAPH_SOURCE_FPS_MISMATCH');
   changes.push({scene_id:t.scene_id,source_in_frame:t.source_in_frame,
    source_out_frame:t.source_out_frame,source_version_id:sc.source_media.version_id,
    source_sha256:sc.source_media.sha256});
  }
  // Source pins checked again before saving, not trusting a previous read.
  if(build(id).source_sha256!==source.source_sha256)bad('EDITGRAPH_SOURCE_CHANGED_DURING_PROPOSAL');
  const proposal={schema_version:1,source_sha256:source.source_sha256,
    project_id:id,changes,proposed_by:actor.id,created_at:new Date().toISOString(),
    status:'REVIEW_ONLY',render_allowed:false,publication_allowed:false,
    limitations:['TRANSITION_HANDLES_NOT_SOLVED','AUDIO_RESYNC_NOT_PROVEN','P05_RELEASE_UNMODIFIED']};
  const next={revision:state.revision+1,proposal};
  save(file(id),next);
  return {candidate_revision:next.revision,candidate_state:'PROPOSED',candidate:proposal};
 }
 return {read,propose};
}

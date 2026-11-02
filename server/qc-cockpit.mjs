/** M51-R01: read-only, provenance-pinned QC timecode projection.
 * Output P05 release SHA verified upstream. No invented timestamps or publication authority.
 */
import {createHash} from 'node:crypto';
import {frameClock,snapFrame,TICKS_PER_SECOND} from './edit-graph.mjs';
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const bad=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
const num=v=>typeof v==='number'&&Number.isFinite(v);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const round=v=>Number(v.toFixed(6));
export function buildQcCockpit({projectId,release,reviewsByScene={}}){
 if(!ID.test(projectId)||!release?.manifest)bad('M51_NO_VERIFIED_RELEASE');
 const manifest=release.manifest;
 if(manifest.schemaVersion!==1||manifest.project!==projectId||
    !/^[a-f0-9-]{36}$/.test(release.release_id??'')||
    manifest.release_id!==release.release_id||!SHA.test(manifest.output?.sha256??'')||
    manifest.output?.qa?.verdict!=='PASS'||!Array.isArray(manifest.scenes)||
    manifest.scenes.length<2||manifest.scenes.length>12)
   bad('M51_UNTRUSTED_RELEASE',409);
 const clock=frameClock(manifest.target_fps);
 const timebase={ticks_per_second:TICKS_PER_SECOND,fps:clock};
 const scenes=[],events=[],evidence=[];
 let time=0,issueCount=0;
 const ids=new Set();
 for(const [i,s] of manifest.scenes.entries()){
  if(!ID.test(s.id)||ids.has(s.id)||!SHA.test(s.sha256??'')||
     !num(s.duration)||s.duration<=0||s.duration>600)
   bad('M51_INVALID_SCENE',422);
  ids.add(s.id);
  const transition=s.transition_after??{type:'hard-cut',duration:0};
  if(!['hard-cut','crossfade','match-cut'].includes(transition.type)||
     !num(transition.duration)||transition.duration<0||transition.duration>0.75||
     (transition.type!=='crossfade'&&transition.duration!==0)||
     (i===manifest.scenes.length-1&&transition.duration!==0))
   bad('M51_INVALID_TRANSITION',422);
  const startFrame=snapFrame(time,clock),endFrame=snapFrame(time+s.duration,clock);
  if(endFrame<=startFrame)bad('M51_INVALID_INTERVAL',422);
  const review=reviewsByScene[s.id]??{revision:0,items:[]};
  if(!Number.isSafeInteger(review.revision)||review.revision<0||
     !Array.isArray(review.items)||review.items.length>150)
   bad('M51_INVALID_REVIEWS',422);
  const eventsForScene=[];
  for(const item of review.items){
   if(!item||typeof item.id!=='string'||item.id.length>64||
      !num(item.t)||item.t<0||item.t>=s.duration||
      !['low','medium','high','blocking'].includes(item.severity)||
      !['OPEN','FIXED','VERIFIED','REOPENED'].includes(item.status)||
      typeof item.version_id!=='string')
    bad('M51_INVALID_REVIEW_ENTRY',422);
   // P07 evidence for older P08 version must not reappear on the new release.
   if(item.version_id!==s.approved_version_id){issueCount++;continue}
   const global=round(time+item.t),frame=snapFrame(global,clock);
   if(frame<startFrame||frame>endFrame)bad('M51_INVALID_PTS',422);
   const event={id:'p07:'+item.id,source:'P07_REVIEW',release_sha256:manifest.output.sha256,
    scene_id:s.id,scene_source_sha256:s.sha256,source_version_id:s.approved_version_id,
    review_revision:review.revision,issue_code:'HUMAN_REVIEW',severity:item.severity,
    disposition:item.status,reviewed_by:item.created_by??null,
    message:item.text??'',local_seconds:item.t,global_seconds:global,
    global_frame:frame,global_pts_tick:frame*clock.frame_ticks,
    evidence_available:!!item.has_frame_evidence,location:'EXACT_REVIEW_TIMECODE',
    requires_human_review:item.status!=='VERIFIED'};
   events.push(event);eventsForScene.push(event);
  }
  scenes.push({scene_id:s.id,source_sha256:s.sha256,
   source_version_id:s.approved_version_id??null,source_approved_revision:s.approved_revision??null,
   start_frame:startFrame,end_frame:endFrame,
   start_tick:startFrame*clock.frame_ticks,end_tick:endFrame*clock.frame_ticks,
   duration_declared_s:s.duration,transition_after:transition,
   review_revision:review.revision,located_events:eventsForScene.length});
  time+=s.duration-(transition.type==='crossfade'?transition.duration:0);
  if(time<0||time>3600)bad('M51_INVALID_DURATION',422);
 }
 const issues=manifest.output?.qa?.issues??[];
 if(!Array.isArray(issues)||issues.length>500)bad('M51_INVALID_TECHNICAL_QA');
 for(const [i,q] of issues.entries()){
  if(!q||typeof q.id!=='string'||q.id.length>80||typeof q.message!=='string'||q.message.length>1600)
   bad('M51_INVALID_TECHNICAL_QA');
  // Existing P03 technical QA has no frame PTS: never invent a 0s coordinate.
  events.push({id:'p03:'+i+':'+q.id,source:'P03_RELEASE_TECHNICAL',
   release_sha256:manifest.output.sha256,scene_id:null,scene_source_sha256:null,
   source_version_id:null,review_revision:null,issue_code:q.id,severity:'technical',
   disposition:'UNLOCATED',reviewed_by:null,message:q.message,local_seconds:null,
   global_seconds:null,global_frame:null,global_pts_tick:null,
   evidence_available:false,location:'UNLOCATED_TECHNICAL_ISSUE',
   requires_human_review:true});
 }
 events.sort((a,b)=>a.global_pts_tick===null?1:b.global_pts_tick===null?-1:
  a.global_pts_tick-b.global_pts_tick||a.id.localeCompare(b.id));
 const original={schema_version:1,project_id:projectId,
  release_id:release.release_id,release_sha256:manifest.output.sha256,
  timebase,scenes,events,stale_version_events_ignored:issueCount,
  duration_estimated_tick:snapFrame(time,clock)*clock.frame_ticks,
  actual_duration_s:manifest.output.qa?.metadata?.duration??null,
  release_qa_verdict:manifest.output.qa.verdict,
  technical_failures:events.filter(e=>e.source==='P03_RELEASE_TECHNICAL').length,
  unresolved_review_events:events.filter(e=>e.source==='P07_REVIEW'&&e.requires_human_review).length,
  warnings:['MONTAGE_PTS_DERIVED_FROM_DECLARED_P05_DURATIONS_NOT_DECODED_MASTER',
   'TRANSITION_OVERLAP_HAS_AMBIGUOUS_SHOT_OWNERSHIP',
   'UNTIMED_P03_ISSUES_ARE_NOT_ASSIGNED_FALSE_TIMECODES',
   'HUMAN_AESTHETIC_SIGNOFF_NOT_INFERRED'],
  render_allowed:false,publication_allowed:false};
 return {...original,snapshot_sha256:digest(original)};
}
export function qcCockpitService({assembly,reviews,enabled=false}){
 function read(id,{sceneId=null}={}){
  if(!enabled)bad('M51_DISABLED',501);
  if(typeof id!=='string'||!ID.test(id))bad('M51_INVALID_PROJECT',400);
  const release=assembly.current(id);
  if(!release)bad('M51_NO_VERIFIED_RELEASE',409);
  const reviewData={};
  for(const item of release.manifest.scenes)
   reviewData[item.id]=reviews.list(id,item.id);
  const full=buildQcCockpit({projectId:id,release,reviewsByScene:reviewData});
  if(sceneId===null)return full;
  if(typeof sceneId!=='string'||!ID.test(sceneId)||!full.scenes.some(s=>s.scene_id===sceneId))
   bad('M51_SCENE_NOT_FOUND',404);
  const scoped={...full,scenes:full.scenes.filter(x=>x.scene_id===sceneId),
    events:full.events.filter(e=>e.scene_id===sceneId)};
  delete scoped.stale_version_events_ignored;
  delete scoped.technical_failures;
  delete scoped.unresolved_review_events;
  delete scoped.snapshot_sha256;
  return scoped;
 }
 return {read};
}

/**
 * P15-C03: sidecar proposal and independent NON-PUBLISHABLE review.
 * No deck, render, scene version or release pointer can be written here.
 * Single-writer-process only (same production writer lock as cloud.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA=/^[0-9a-f]{64}$/;
const MAX_HISTORY=24;
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{status,code})};
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const text=(x,max=1000)=>typeof x==='string'&&x.trim().length>=10&&x.length<=max;
function safeFile(root,id){
  if(!SLUG.test(id))fail('INVALID_PROJECT',400);
  const dir=path.resolve(root,id);
  const file=path.resolve(dir,'.rhythm','review.json');
  const project=fs.lstatSync(dir,{throwIfNoEntry:false});
  if(!project?.isDirectory()||project.isSymbolicLink())fail('UNSAFE_PROJECT_DIR',403);
  const parent=path.dirname(file);
  const reviewDir=fs.lstatSync(parent,{throwIfNoEntry:false});
  if(reviewDir && (!reviewDir.isDirectory()||reviewDir.isSymbolicLink()))
    fail('UNSAFE_RHYTHM_DIR',403);
  const saved=fs.lstatSync(file,{throwIfNoEntry:false});
  if(saved && (!saved.isFile()||saved.isSymbolicLink()||saved.size>256*1024))
    fail('UNSAFE_RHYTHM_FILE',403);
  return {file,parent};
}
function atomic(file,data){
  const folder=path.dirname(file);
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const tmp=path.join(folder,'.review-'+randomUUID()+'.tmp');
  fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});
  try{fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
}
const blank=id=>({schema_version:1,project_id:id,revision:0,status:'empty',
  proposal:null,author:null,review:null,history:[]});
function load(file,id){
  if(!fs.existsSync(file))return blank(id);
  const s=fs.readFileSync(file,'utf8');
  let record;try{record=JSON.parse(s)}catch{fail('CORRUPT_RHYTHM_RECORD')}
  if(!plain(record)||record.schema_version!==1||record.project_id!==id||
     !Number.isSafeInteger(record.revision)||record.revision<0||
     !Array.isArray(record.history)||record.history.length>MAX_HISTORY||
     !['empty','submitted','endorsed_nonpublishable','rejected'].includes(record.status))
    fail('CORRUPT_RHYTHM_RECORD');
  return record;
}
function guardRevision(expected,current){
  if(!Number.isSafeInteger(expected)||expected<0||expected!==current.revision)
    fail('RHYTHM_REVISION_CONFLICT',409);
}
function checkActor(actor,id,role){
  if(!plain(actor)||typeof actor.id!=='string'||!SLUG.test(actor.id)||
     actor.role!==role)fail('RHYTHM_ROLE_DENIED',403);
  if(role!=='director' && (!Array.isArray(actor.projects)||!actor.projects.includes(id)))
    fail('RHYTHM_PROJECT_DENIED',403);
}
export function rhythmDraftStore({root,getDeck,previewService,now=()=>new Date().toISOString()}){
  function guardSceneScope(actor,id){
    if(actor.role==='director')return;
    // All-scene access is required to review a project-wide cut plan;
    // a reviewer assigned only scene s02 may not inspect s01 narration.
    const slides=getDeck(id)?.slides;
    if(!Array.isArray(slides)||slides.length===0||
       !Array.isArray(actor.scenes)||!slides.every(s=>actor.scenes.includes(s.id)))
      fail('RHYTHM_SCENE_SCOPE_DENIED',403);
  }
  const current=id=>{
    const {file}=safeFile(root,id);
    return load(file,id);
  };
  function status(id,actor){
    if(actor.role!=='director')checkActor(actor,id,'reviewer');
    else checkActor(actor,id,'director');
    guardSceneScope(actor,id);
    const prior=current(id);
    if(!prior.proposal)return {...prior,source_state:'NOT_APPLICABLE',publication_allowed:false};
    const c=previewService.context(id);
    const valid=c.voice_source_sha256===prior.proposal.voice_source_sha256 &&
      c.timebase_revision===prior.proposal.timebase_revision;
    return {...prior,source_state:valid?'CURRENT':'STALE',publication_allowed:false};
  }
  function submit(id,actor,manifest,expected_revision,note){
    checkActor(actor,id,'director');
    if(!text(note,1000))fail('RHYTHM_NOTE_REQUIRED',400);
    const old=current(id);
    guardRevision(expected_revision,old);
    const candidate=previewService.preview(id,manifest);
    if(candidate.status!=='READY_FOR_REVIEW'||candidate.cuts.length<1||
       !SHA.test(candidate.plan_sha256))fail('RHYTHM_NOT_READY',409);
    if(candidate.provenance?.word_alignment_verified!==false||
       candidate.provenance?.music_rights_verified!==false)
      fail('RHYTHM_PROVENANCE_UNEXPECTED',409);
    // Re-read actual source immediately before writing. Detect concurrent audio
    // replacement/re-timing even if the first expensive preview succeeded.
    const c=previewService.context(id);
    if(c.voice_source_sha256!==candidate.source_sha256||
       c.timebase_revision!==candidate.timebase_revision)
      fail('RHYTHM_SOURCE_CHANGED',409);
    const fresh=current(id);guardRevision(expected_revision,fresh);
    const newProposal={
      plan_sha256:candidate.plan_sha256,
      voice_source_sha256:c.voice_source_sha256,
      timebase_revision:c.timebase_revision,
      frame_rate:{...c.frame_rate},
      cuts:candidate.cuts.map(x=>({id:x.id,frame:x.frame,reason:x.reason,cue_id:x.cue_id})),
      discarded_count:candidate.discarded.length,
      provenance:{word_alignment_verified:false,music_rights_verified:false}
    };
    const previous=fresh.proposal?{
      revision:fresh.revision,status:fresh.status,
      plan_sha256:fresh.proposal.plan_sha256,
      author_id:fresh.author?.id,
      reviewer_id:fresh.review?.reviewer_id??null
    }:null;
    const next={
      schema_version:1,project_id:id,revision:fresh.revision+1,status:'submitted',
      proposal:newProposal,author:{id:actor.id,note:note.trim(),at:now()},
      review:null,
      history:(previous?[...fresh.history,previous]:fresh.history).slice(-MAX_HISTORY)
    };
    const {file}=safeFile(root,id);atomic(file,next);
    return {...next,source_state:'CURRENT',publication_allowed:false};
  }
  function decide(id,actor,{expected_revision,plan_sha256,decision,note}={}){
    checkActor(actor,id,'reviewer');
    guardSceneScope(actor,id);
    if(!text(note,1000))fail('RHYTHM_NOTE_REQUIRED',400);
    if(!['endorse','reject'].includes(decision))fail('RHYTHM_DECISION_INVALID',400);
    const before=current(id);guardRevision(expected_revision,before);
    if(before.status!=='submitted'||!SHA.test(plan_sha256)||
       before.proposal?.plan_sha256!==plan_sha256)
      fail('RHYTHM_PLAN_CONFLICT',409);
    if(before.author?.id===actor.id)fail('RHYTHM_SELF_REVIEW_DENIED',403);
    const c=previewService.context(id);
    if(c.voice_source_sha256!==before.proposal.voice_source_sha256||
       c.timebase_revision!==before.proposal.timebase_revision)
      fail('RHYTHM_SOURCE_CHANGED',409);
    const fresh=current(id);guardRevision(expected_revision,fresh);
    if(fresh.proposal?.plan_sha256!==plan_sha256||fresh.status!=='submitted')
      fail('RHYTHM_PLAN_CONFLICT',409);
    const next={...fresh,revision:fresh.revision+1,
      status:decision==='endorse'?'endorsed_nonpublishable':'rejected',
      review:{reviewer_id:actor.id,decision,note:note.trim(),at:now(),plan_sha256}};
    const {file}=safeFile(root,id);atomic(file,next);
    return {...next,source_state:'CURRENT',publication_allowed:false};
  }
  return {status,submit,decide};
}

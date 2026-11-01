/** P05: per-project editorial entry/exit states and revisioned transition plan. */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {effectiveStyle} from './style-contract.mjs';
const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const COLOR=/^#[0-9a-fA-F]{6}$/;
const DIRECTIONS=new Set(['still','left','right','up','down','forward','backward']);
const MODES=new Set(['hard-cut','crossfade','match-cut']);
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,allowed)=>{if(!obj(x)||Object.keys(x).some(k=>!allowed.includes(k)))throw error('Unexpected or invalid transition fields')};
const finite=(x,min,max,name)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)throw error('Invalid '+name);return x};
function normalizeState(state){
  keys(state,['subject','background','camera','motion']);
  if(typeof state.subject!=='string'||state.subject.length>120)throw error('Invalid subject');
  if(typeof state.background!=='string'||!COLOR.test(state.background))throw error('Invalid background');
  if(!Array.isArray(state.camera)||state.camera.length!==2)throw error('Invalid camera');
  if(!DIRECTIONS.has(state.motion))throw error('Invalid movement');
  return {subject:state.subject.trim(),background:state.background.toUpperCase(),
    camera:state.camera.map((v,i)=>finite(v,0,1,'camera '+i)),motion:state.motion};
}
function starter(deck){
  const state=()=>({subject:'',background:'#000000',camera:[0.5,0.5],motion:'still'});
  return {schemaVersion:1,scenes:deck.slides.map(s=>({scene_id:s.id,entry_state:state(),exit_state:state(),
    transition_after:{type:'hard-cut',duration:0}}))};
}
export function validateAssemblyPlan(plan,deck,contract){
  keys(plan,['schemaVersion','scenes']);
  if(plan.schemaVersion!==1||!Array.isArray(plan.scenes)||plan.scenes.length!==deck.slides.length)throw error('Plan must cover every scene');
  const scenes=plan.scenes.map((s,i)=>{
    keys(s,['scene_id','entry_state','exit_state','transition_after']);
    if(s.scene_id!==deck.slides[i].id)throw error('Scene order mismatch at position '+i);
    const entry_state=normalizeState(s.entry_state),exit_state=normalizeState(s.exit_state);
    keys(s.transition_after,['type','duration']);
    const type=s.transition_after.type,duration=finite(s.transition_after.duration,0,0.75,'transition duration');
    if(!MODES.has(type))throw error('Unsupported transition type');
    const policy=effectiveStyle(contract,s.scene_id).transitions;
    if(!policy.allowed.includes(type))throw error('Transition violates style policy: '+type);
    if(duration>policy.maxDuration)throw error('Transition too long for scene policy');
    if((type!=='crossfade'&&duration!==0)||(type==='crossfade'&&duration<0.08))throw error('Invalid transition duration for '+type);
    if(i===plan.scenes.length-1&&type!=='hard-cut')throw error('Last scene must not transition');
    return {scene_id:s.scene_id,entry_state,exit_state,transition_after:{type,duration}};
  });
  for(let i=0;i<scenes.length-1;i++){
    const a=scenes[i],b=scenes[i+1],transition=a.transition_after;
    if(transition.type!=='match-cut')continue;
    if(!a.exit_state.subject||a.exit_state.subject!==b.entry_state.subject)throw error('Match-cut needs identical named subject at scene boundary');
    if(a.exit_state.motion!==b.entry_state.motion)throw error('Match-cut needs matching movement direction');
    if(Math.hypot(a.exit_state.camera[0]-b.entry_state.camera[0],a.exit_state.camera[1]-b.entry_state.camera[1])>0.12)
      throw error('Match-cut camera framing differs too much');
  }
  return {schemaVersion:1,scenes};
}
export function assemblyPlanStore({root,getDeck,getStyle}){
  const file=id=>{
    if(typeof id!=='string'||!ID.test(id))throw error('Invalid project ID');
    getDeck(id);return path.join(root,id,'assembly-plan.json');
  };
  function read(id){
    const deck=getDeck(id),f=file(id);
    if(!fs.existsSync(f))return {id,revision:0,plan:starter(deck),updated_at:null,source:'generated'};
    const doc=JSON.parse(fs.readFileSync(f,'utf8'));
    return {id,revision:doc.revision,plan:validateAssemblyPlan(doc.plan,deck,getStyle(id).contract),
      updated_at:doc.updated_at,source:'saved'};
  }
  function put(id,plan,expected_revision){
    const f=file(id),old=read(id);
    if(!Number.isSafeInteger(expected_revision)||expected_revision!==old.revision)throw error('Assembly plan changed; reload',409);
    const next={id,revision:old.revision+1,
      plan:validateAssemblyPlan(plan,getDeck(id),getStyle(id).contract),
      updated_at:new Date().toISOString(),source:'saved'};
    fs.mkdirSync(path.dirname(f),{recursive:true});
    const tmp=f+'.'+randomUUID()+'.tmp';
    try{fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,f)}
    finally{fs.rmSync(tmp,{force:true})}
    return next;
  }
  return {read,put};
}

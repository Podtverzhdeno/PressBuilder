/**
 * Per-scene audio/motion cue sheet. Markers describe timing, not executable code.
 * Uses exactly the same buildSchedule() as the browser renderer; every timestamp
 * is recomputed from a single absolute timebase, never accumulated frame-by-frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildSchedule } from '../src/engine/schedule.ts';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const MARK=/^[a-zA-Z0-9_-]{1,60}$/;
const KINDS=new Set(['beat','sfx','music','camera','animation','transition']);
const ANCHORS=new Set(['scene','cue_start','cue_end']);
const fail=(msg,status=400)=>{throw Object.assign(new Error(msg),{status})};
const number=(v,min,max,k)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('Invalid '+k);return v};
function atomic(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+process.pid+'.'+Math.random().toString(36).slice(2)+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600});
  try{fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}
}
export function resolveSceneSync(deck,sceneId,markers=[]){
  const schedule=buildSchedule(deck);
  const sc=schedule.slides.find(x=>x.slide.id===sceneId);
  if(!sc)fail('Scene not found',404);
  const fps=deck.format?.fps;
  number(fps,1,120,'FPS');
  const cues=sc.cues.map(c=>({
    id:c.id,say:c.say,start:c.start,duration:c.dur,
    global_start:sc.start+c.start,
    start_frame:Math.round((sc.start+c.start)*fps),
    duration_frames:Math.round((sc.start+c.start+c.dur)*fps)-Math.round((sc.start+c.start)*fps),
    manual:c.manual
  }));
  const byId=new Map(sc.cues.map(c=>[c.id,c]));
  const events=markers.map(m=>{
    const cue=byId.get(m.anchor.cue_id);
    if(m.anchor.type!=='scene'&&!cue)fail('Unknown cue_id: '+m.anchor.cue_id,409);
    const raw=(m.anchor.type==='cue_start'?cue.start:m.anchor.type==='cue_end'?cue.start+cue.dur:0)+m.anchor.offset;
    const t=Math.max(0,Math.min(sc.dur,raw));
    const absolute=sc.start+t;
    return {...m,local_time:raw,global_time:sc.start+raw,
      frame:Math.round(absolute*fps),local_frame:Math.round(t*fps),
      out_of_range:raw<0||raw>sc.dur,
      snapped_time:Math.round(absolute*fps)/fps};
  });
  return {scene_id:sceneId,scene_start:sc.start,scene_duration:sc.dur,
    fps,scale:schedule.scale,cues,events};
}
function validate(markers,deck,sceneId){
  if(!Array.isArray(markers)||markers.length>100)fail('Maximum 100 cue markers per scene');
  const ids=new Set();
  const parsed=markers.map(m=>{
    if(!m||typeof m!=='object'||Array.isArray(m))fail('Invalid marker');
    for(const key of Object.keys(m))if(!['id','kind','anchor','duration','emphasis','silence','note'].includes(key))fail('Unknown marker field: '+key);
    if(typeof m.id!=='string'||!MARK.test(m.id)||ids.has(m.id))fail('Invalid or duplicate marker ID');
    ids.add(m.id);
    if(!KINDS.has(m.kind))fail('Invalid marker kind');
    const a=m.anchor;
    if(!a||typeof a!=='object'||Array.isArray(a)||!ANCHORS.has(a.type))fail('Invalid time anchor');
    for(const key of Object.keys(a))if(!['type','cue_id','offset'].includes(key))fail('Unknown anchor field: '+key);
    if(a.type==='scene'&&a.cue_id!==undefined)fail('Scene anchor cannot have cue_id');
    if(a.type!=='scene'&&(typeof a.cue_id!=='string'||!MARK.test(a.cue_id)))fail('Cue anchor requires cue_id');
    const anchor={type:a.type,offset:number(a.offset,-60,600,'anchor offset')};
    if(a.type!=='scene')anchor.cue_id=a.cue_id;
    const event={id:m.id,kind:m.kind,anchor};
    if(m.duration!==undefined)event.duration=number(m.duration,0,600,'event duration');
    if(m.emphasis!==undefined)event.emphasis=number(m.emphasis,0,1,'emphasis');
    if(m.silence!==undefined){if(typeof m.silence!=='boolean')fail('silence must be boolean');event.silence=m.silence}
    if(m.note!==undefined){if(typeof m.note!=='string'||m.note.length>300)fail('Invalid marker note');event.note=m.note}
    return event;
  });
  if(resolveSceneSync(deck,sceneId,parsed).events.some(e=>e.out_of_range))fail('Cue marker outside scene boundaries');
  return parsed;
}
export function sceneSyncStore({root,seedRoot,getDeck}){
  function locate(id,sceneId){
    if(typeof id!=='string'||!SLUG.test(id)||typeof sceneId!=='string'||!SLUG.test(sceneId))fail('Invalid project or scene ID');
    const d=getDeck(id);
    if(!d?.slides?.some(s=>s.id===sceneId))fail('Scene not found',404);
    return {deck:d,file:path.join(root,id,'.scene-sync',sceneId+'.json'),
      seed:seedRoot?path.join(seedRoot,id,'.scene-sync',sceneId+'.json'):null};
  }
  function read(id,sceneId){
    const {deck,file,seed}=locate(id,sceneId);
    const src=fs.existsSync(file)?file:(seed&&fs.existsSync(seed)?seed:null);
    const saved=src?JSON.parse(fs.readFileSync(src,'utf8')):{revision:0,markers:[],updated_at:null};
    // Persisted anchors survive narration retiming; a missing cue is reported as a
    // conflict so the agent cannot silently synchronize a beat to the wrong cue.
    let timeline,validation_error=null;
    try{timeline=resolveSceneSync(deck,sceneId,saved.markers||[])}
    catch(e){
      // Keep orphaned cue sheets recoverable after a cue was renamed/deleted.
      // Returning the raw markers and revision lets the agent fix them via PUT.
      if(e.status!==409)throw e;
      validation_error=e.message;
      timeline=resolveSceneSync(deck,sceneId,[]);
    }
    return {id,scene_id:sceneId,revision:saved.revision||0,markers:saved.markers||[],
      updated_at:saved.updated_at||null,timeline,validation_error};
  }
  function put(id,sceneId,markers,expectedRevision){
    const {deck,file}=locate(id,sceneId);
    const old=read(id,sceneId);
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==old.revision)fail('Scene sync sheet changed; reload and retry',409);
    const checked=validate(markers,deck,sceneId);
    const next={id,scene_id:sceneId,revision:old.revision+1,
      markers:checked,updated_at:new Date().toISOString()};
    atomic(file,next);
    return {...next,timeline:resolveSceneSync(deck,sceneId,checked)};
  }
  return {read,put};
}

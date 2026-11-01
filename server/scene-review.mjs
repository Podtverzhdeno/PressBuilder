/** Evidence-backed review of a rendered scene. Separate file per scene.
 * Stored frame thumbnails stay visible when the latest MP4 gets replaced.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const ITEM=/^[a-f0-9-]{36}$/;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const SEVERITY=new Set(['minor','major','blocker']);
const transitions={OPEN:['FIXED'],FIXED:['VERIFIED','REOPENED'],REOPENED:['FIXED'],VERIFIED:['REOPENED']};
const safeStr=(v,name,min,max)=>{
  if(typeof v!=='string'||v.length<min||v.length>max)throw error('Invalid '+name);
  return v.trim();
};
const integer=(v,name,min,max)=>{
  if(!Number.isSafeInteger(v)||v<min||v>max)throw error('Invalid '+name);
  return v;
};
const number=(v,name,min,max)=>{
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw error('Invalid '+name);
  return v;
};
const keys=(object,allowed)=>{
  if(!object||typeof object!=='object'||Array.isArray(object))throw error('Invalid review payload');
  for(const k of Object.keys(object))if(!allowed.includes(k))throw error('Unexpected review field: '+k);
};
function region(box){
  if(box===undefined||box===null)return null;
  keys(box,['x','y','w','h']);
  const out={x:number(box.x,'region.x',0,1),y:number(box.y,'region.y',0,1),
    w:number(box.w,'region.w',0.005,1),h:number(box.h,'region.h',0.005,1)};
  if(out.x+out.w>1.00001||out.y+out.h>1.00001)throw error('Review region is outside the frame');
  return out;
}
function evidence(data){
  if(data===undefined||data===null)return null;
  if(typeof data!=='string'||data.length>180000)throw error('Frame image exceeds 180 KB',413);
  const m=/^data:image\/(jpeg|png);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(data);
  if(!m)throw error('Only embedded JPEG/PNG frame thumbnails are allowed');
  const buf=Buffer.from(m[2],'base64');
  if(buf.length<12||buf.length>130000)throw error('Frame thumbnail size is invalid');
  if(m[1]==='jpeg'&&!(buf[0]===255&&buf[1]===216&&buf[2]===255))throw error('Invalid JPEG header');
  if(m[1]==='png'&&buf.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw error('Invalid PNG header');
  return data;
}
function atomic(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
  try{fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file)}
  finally{fs.rmSync(temp,{force:true})}
}
const summary=({frame_evidence,...item})=>({...item,has_frame_evidence:!!frame_evidence});
export function sceneReviewStore({root,getDeck,now=()=>new Date().toISOString()}){
  function file(id,sid){
    if(typeof id!=='string'||!ID.test(id)||typeof sid!=='string'||!ID.test(sid))throw error('Invalid project/scene');
    const d=getDeck(id);
    if(!d?.slides?.some(x=>x.id===sid))throw error('Scene not found',404);
    return path.join(root,id,'.scene-reviews',sid+'.json');
  }
  function read(id,sid){
    const f=file(id,sid);
    if(!fs.existsSync(f))return {revision:0,items:[]};
    try{
      const data=JSON.parse(fs.readFileSync(f,'utf8'));
      if(!Number.isSafeInteger(data.revision)||!Array.isArray(data.items))throw Error();
      return data;
    }catch{throw error('Review store is unreadable',503)}
  }
  function list(id,sid){
    const data=read(id,sid);
    return {scene_id:sid,revision:data.revision,items:data.items.map(summary)};
  }
  function get(id,sid,itemId){
    if(!ITEM.test(itemId))throw error('Invalid review item ID');
    const item=read(id,sid).items.find(x=>x.id===itemId);
    if(!item)throw error('Review item not found',404);
    return item;
  }
  function create(id,sid,payload,actor,render){
    keys(payload,['render_revision','t','fps','frame','severity','text','region','frame_evidence']);
    const revision=safeStr(payload.render_revision,'render_revision',1,110);
    if(!/^[A-Za-z0-9:_-]{1,110}$/.test(revision))throw error('Invalid render revision');
    if(render && (render.status!=='completed'||render.job_id!==revision))
      throw error('Review must target the current completed render job',409);
    const fps=integer(payload.fps,'fps',1,120);
    const actualFps=render?.qa_report?.metadata?.fps;
    if(Number.isFinite(actualFps)&&actualFps>0&&Math.abs(actualFps-fps)>0.5)
      throw error('Frame rate does not match completed render metadata',409);
    const t=number(payload.t,'timestamp',0,36000);
    const frame=integer(payload.frame,'frame',0,4320000);
    if(Math.abs(frame-Math.round(t*fps))>1)throw error('Frame/time mismatch');
    const duration=render?.qa_report?.metadata?.duration;
    if(Number.isFinite(duration)&&t>duration+1/fps)throw error('Timestamp exceeds rendered video duration');
    if(!SEVERITY.has(payload.severity))throw error('Invalid severity');
    const text=safeStr(payload.text,'review text',3,2000);
    if(!text)throw error('Review text is required');
    const data=read(id,sid);
    if(data.items.length>=80)throw error('Review limit reached (80 per scene)',409);
    const created=now();
    const item={id:randomUUID(),scene_id:sid,render_revision:revision,t,frame,fps,
      region:region(payload.region),severity:payload.severity,text,author:actor.id,
      status:'OPEN',revision:1,frame_evidence:evidence(payload.frame_evidence),
      created_at:created,updated_at:created,history:[{at:created,actor:actor.id,status:'OPEN',note:'Created'}]};
    data.revision++;data.items.push(item);atomic(file(id,sid),data);
    return summary(item);
  }
  function update(id,sid,itemId,payload,actor){
    keys(payload,['status','note','expected_revision']);
    const data=read(id,sid);
    const old=data.items.find(x=>x.id===itemId);
    if(!old)throw error('Review item not found',404);
    if(integer(payload.expected_revision,'expected_revision',1,10000000)!==old.revision)
      throw error('Review changed; reload before updating',409);
    if(!transitions[old.status]?.includes(payload.status))
      throw error('Invalid review status transition: '+old.status+' -> '+String(payload.status),409);
    const note=safeStr(payload.note,'resolution note',3,2000);
    if(!note)throw error('A resolution note is required');
    const at=now(),next={...old,status:payload.status,revision:old.revision+1,updated_at:at,
      history:[...old.history,{at,actor:actor.id,status:payload.status,note}]};
    if(next.history.length>100)throw error('Review history limit reached',409);
    data.items=data.items.map(x=>x.id===itemId?next:x);
    data.revision++;atomic(file(id,sid),data);
    return summary(next);
  }
  return {list,get,create,update};
}

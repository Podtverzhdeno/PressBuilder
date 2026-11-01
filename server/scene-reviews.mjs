/** P07: version-anchored frame review with optimistic revisions and immutable event history. */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const STATES=new Set(['OPEN','FIXED','VERIFIED','REOPENED']);
const SEVERITIES=new Set(['low','medium','high','blocking']);
const error=(s,status=400)=>{throw Object.assign(new Error(s),{status})};
const finite=(x,a,b,key)=>{if(typeof x!=='number'||!Number.isFinite(x)||x<a||x>b)error('Invalid '+key);return x};
function validateRect(rect){
  if(rect===undefined||rect===null)return null;
  if(!rect||typeof rect!=='object'||Array.isArray(rect)||Object.keys(rect).some(k=>!['x','y','w','h'].includes(k)))error('Invalid normalized rectangle');
  const r={};
  for(const k of ['x','y','w','h'])r[k]=finite(rect[k],0,1,'rect.'+k);
  if(r.w<=0||r.h<=0||r.x+r.w>1.000001||r.y+r.h>1.000001)error('Rectangle exceeds frame');
  return r;
}
function thumbnail(data){
  if(data===undefined||data===null)return null;
  if(typeof data!=='string'||data.length>180000)error('Thumbnail exceeds maximum size',413);
  const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match)error('Only JPEG/PNG frame evidence is supported');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length<12||bytes.length>130000)error('Frame evidence must be 12..130000 bytes',413);
  if(match[1]==='jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))
    error('Corrupt JPEG thumbnail');
  if(match[1]==='png'&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')
    error('Corrupt PNG thumbnail');
  return data;
}
function atomic(file,obj){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{mode:0o600});
  try{fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
}
export function sceneReviewStore({root,getDeck,getVersion,now=()=>new Date().toISOString()}){
  function file(id,scene){
    if(typeof id!=='string'||!SLUG.test(id)||typeof scene!=='string'||!SLUG.test(scene))error('Invalid project/scene');
    if(!getDeck(id).slides.some(s=>s.id===scene))error('Scene not found',404);
    return path.join(root,id,'.scene-reviews',scene+'.json');
  }
  function read(id,scene){
    const p=file(id,scene);
    if(!fs.existsSync(p))return {project:id,scene_id:scene,revision:0,items:[]};
    return JSON.parse(fs.readFileSync(p,'utf8'));
  }
  function list(id,scene){
    const record=read(id,scene);
    return {...record,items:record.items.map(({frame_evidence,...item})=>({
      ...item,has_frame_evidence:!!frame_evidence
    }))};
  }
  function get(id,scene,itemId){
    if(typeof itemId!=='string'||!/^[0-9a-f-]{36}$/.test(itemId))error('Invalid review item ID');
    const item=read(id,scene).items.find(x=>x.id===itemId);
    if(!item)error('Review item not found',404);
    return item;
  }
  const checkRevision=(expected,old)=>{
    if(!Number.isSafeInteger(expected)||expected!==old.revision)error('Review revision conflict',409);
  };
  function create(id,scene,fields,actor,expected_revision){
    const f=file(id,scene),old=read(id,scene);checkRevision(expected_revision,old);
    if(!fields||typeof fields!=='object'||Array.isArray(fields)||
      Object.keys(fields).some(k=>!['version_id','t','text','severity','rect','frame_evidence'].includes(k)))error('Invalid review payload');
    if(!['director','reviewer'].includes(actor?.role))error('Only reviewers may create review items',403);
    if(old.items.length>=150)error('Scene review limit reached',413);
    const ver=getVersion(id,scene,fields.version_id);
    const t=finite(fields.t,0,Math.max(0,ver.duration-1/ver.fps),'t');
    if(typeof fields.text!=='string'||fields.text.trim().length<4||fields.text.length>2000)error('Review text must be 4..2000 chars');
    if(!SEVERITIES.has(fields.severity))error('Invalid review severity');
    const stamp=now(),uid=randomUUID(),r=validateRect(fields.rect);
    const item={id:uid,version_id:ver.version_id,t,frame:Math.floor(t*ver.fps),rect:r,
      text:fields.text.trim(),severity:fields.severity,status:'OPEN',created_at:stamp,created_by:actor.id,
      frame_evidence:thumbnail(fields.frame_evidence),
      history:[{status:'OPEN',at:stamp,actor:actor.id}]};
    const next={...old,revision:old.revision+1,items:[...old.items,item]};atomic(f,next);
    return {revision:next.revision,item};
  }
  function transition(id,scene,itemId,target,note,actor,expected_revision,{assertWorker=()=>{}}={}){
    const f=file(id,scene),old=read(id,scene);checkRevision(expected_revision,old);
    if(typeof itemId!=='string'||!/^[0-9a-f-]{36}$/.test(itemId))error('Invalid review item ID');
    if(!STATES.has(target)||target==='OPEN')error('Invalid review transition');
    const idx=old.items.findIndex(i=>i.id===itemId);
    if(idx<0)error('Review item not found',404);
    const entry=old.items[idx],prev=entry.status;
    if(typeof note!=='string'||note.length>1000)error('Review note must be <=1000 characters');
    if(target==='FIXED'){
      if(!['OPEN','REOPENED'].includes(prev))error('Can only fix open item',409);
      if(actor.role==='worker')assertWorker();else if(actor.role!=='director')error('Only worker or director may mark fixed',403);
    }else if(target==='VERIFIED'){
      if(prev!=='FIXED')error('Only fixed item can be verified',409);
      if(!['reviewer','director'].includes(actor.role))error('Only reviewer/director may verify',403);
    }else if(target==='REOPENED'){
      if(!['FIXED','VERIFIED'].includes(prev))error('Can only reopen fixed/verified item',409);
      if(!['reviewer','director'].includes(actor.role))error('Only reviewer/director may reopen',403);
    }
    const stamp=now();
    const updated={...entry,status:target,history:[...entry.history,{status:target,at:stamp,actor:actor.id,note:note.trim()}]};
    const items=[...old.items];items[idx]=updated;
    const next={...old,revision:old.revision+1,items};atomic(f,next);
    return {revision:next.revision,item:updated};
  }
  function unresolved(id,scene,version){
    return read(id,scene).items.some(i=>i.version_id===version&&i.status!=='VERIFIED');
  }
  return {read,list,get,create,transition,unresolved};
}

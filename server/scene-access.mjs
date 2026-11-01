/** Per-agent MCP credentials and durable per-scene leases.
 * Single-process atomic operations on a persistent volume. A multi-replica
 * deployment MUST replace this with a transactional shared store.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const ACTOR=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ROLES=new Set(['viewer','worker','reviewer','director']);
const err=(msg,status=403)=>Object.assign(new Error(msg),{status});
const hash=s=>createHash('sha256').update(s).digest('hex');
const eq=(a,b)=>{const x=Buffer.from(hash(a),'hex'),y=Buffer.from(hash(b),'hex');return timingSafeEqual(x,y)};
function atomic(file,data){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=file+'.'+process.pid+'.'+randomBytes(6).toString('hex')+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file)}
  finally{fs.rmSync(tmp,{force:true})}
}
export function actorResolver({ownerKey,verifyOAuth=()=>false,agentsJson=''}){
  let config={};
  if(agentsJson.trim()){
    try{config=JSON.parse(agentsJson)}catch{throw new Error('PB_AGENT_KEYS_JSON must contain valid JSON')}
    if(!config||typeof config!=='object'||Array.isArray(config))throw new Error('PB_AGENT_KEYS_JSON must be an object');
  }
  const keys=[];
  for(const [id,entry] of Object.entries(config)){
    if(!ACTOR.test(id)||!entry||typeof entry!=='object'||Array.isArray(entry)
       ||typeof entry.token!=='string'||entry.token.length<24
       ||!ROLES.has(entry.role)||id==='owner')throw new Error('Invalid PB_AGENT_KEYS_JSON identity: '+id);
    if(eq(entry.token,ownerKey)||keys.some(k=>eq(k.token,entry.token)))throw new Error('Duplicate agent API key');
    keys.push({id,role:entry.role,token:entry.token});
  }
  return bearer=>{
    if(typeof bearer!=='string'||!bearer)return null;
    if(eq(bearer,ownerKey)||verifyOAuth(bearer))return {id:'owner',role:'director',source:'owner'};
    const found=keys.find(k=>eq(k.token,bearer));
    return found?{id:found.id,role:found.role,source:'agent-key'}:null;
  };
}
export function sceneAccessStore({root,getDeck,getTask,now=()=>Date.now()}){
  const valid=(id,sid)=>{
    if(typeof id!=='string'||!ID.test(id)||typeof sid!=='string'||!ID.test(sid))throw err('Invalid scene ID',400);
    const deck=getDeck(id);
    if(!deck?.slides?.some(s=>s.id===sid))throw err('Scene not found',404);
    return path.join(root,id,'.scene-leases',sid+'.json');
  };
  const read=(id,sid)=>{
    const f=valid(id,sid);
    if(!fs.existsSync(f))return {fence:0,owner:null,expires_at:0,token_hash:null};
    try{
      const x=JSON.parse(fs.readFileSync(f,'utf8'));
      if(!Number.isSafeInteger(x.fence)||x.fence<0)throw Error('Invalid lease');
      return x;
    }catch{throw err('Lease store is corrupted; writes blocked',503)}
  };
  const isActive=x=>Boolean(x.owner&&x.expires_at>now());
  const status=(id,sid)=>{
    const x=read(id,sid);
    return {id,scene_id:sid,owner:isActive(x)?x.owner:null,
      expires_at:isActive(x)?new Date(x.expires_at).toISOString():null,
      fencing_token:x.fence,active:isActive(x)};
  };
  const ensureRole=(actor,roles)=>{
    if(!actor||!roles.includes(actor.role))throw err('Insufficient agent role');
  };
  const assigned=(id,sid,actor)=>{
    const assignee=getTask(id,sid)?.assignee;
    if(assignee!==actor.id)throw err('Scene is not assigned to this agent');
  };
  const leaseCheck=(id,sid,actor,token,fence)=>{
    ensureRole(actor,['worker','director']);
    if(actor.role==='director')return;
    assigned(id,sid,actor);
    const x=read(id,sid);
    if(!isActive(x)||x.owner!==actor.id||!Number.isSafeInteger(fence)||x.fence!==fence
        ||typeof token!=='string'||token.length<24||hash(token)!==x.token_hash){
      throw err('Scene lease expired, changed, or missing; claim or renew the scene',409);
    }
  };
  function claim(id,sid,actor,ttl=600,force=false){
    ensureRole(actor,['worker','director']);
    if(actor.role!=='director'){if(force)throw err('Only director can force a takeover');assigned(id,sid,actor)}
    if(!Number.isSafeInteger(ttl)||ttl<30||ttl>3600)throw err('Lease ttl_seconds must be 30..3600',400);
    const prev=read(id,sid);
    if(isActive(prev)&&!(force&&actor.role==='director'))throw err('Scene already claimed; use renew_scene_lease or director force',409);
    const token=randomBytes(32).toString('base64url');
    const next={owner:actor.id,fence:prev.fence+1,token_hash:hash(token),expires_at:now()+ttl*1000};
    atomic(valid(id,sid),next);
    audit(id,sid,actor,'claim_scene',{fence:next.fence,ttl_seconds:ttl,forced:!!force});
    return {...status(id,sid),lease_token:token};
  }
  function renew(id,sid,actor,token,fence,ttl=600){
    if(!Number.isSafeInteger(ttl)||ttl<30||ttl>3600)throw err('Lease ttl_seconds must be 30..3600',400);
    // Even director must present its own token for renewal; takeover uses claim(force).
    const x=read(id,sid);
    if(!actor||!isActive(x)||x.owner!==actor.id||x.fence!==fence
        ||typeof token!=='string'||hash(token)!==x.token_hash)throw err('Cannot renew an expired or foreign lease',409);
    if(actor.role==='worker')assigned(id,sid,actor);
    x.expires_at=now()+ttl*1000;
    atomic(valid(id,sid),x);
    audit(id,sid,actor,'renew_scene_lease',{fence,ttl_seconds:ttl});
    return status(id,sid);
  }
  function release(id,sid,actor,token,fence){
    const x=read(id,sid);
    if(!actor||!isActive(x)||x.owner!==actor.id||x.fence!==fence
        ||typeof token!=='string'||hash(token)!==x.token_hash)throw err('Cannot release a foreign or expired lease',409);
    atomic(valid(id,sid),{owner:null,fence:x.fence+1,token_hash:null,expires_at:0});
    audit(id,sid,actor,'release_scene',{fence:x.fence+1});
    return status(id,sid);
  }
  function audit(id,sid,actor,action,details={}){
    valid(id,sid);
    const dir=path.join(root,id,'.scene-audit');
    fs.mkdirSync(dir,{recursive:true});
    const log=path.join(dir,sid+'.jsonl');
    const safe=JSON.parse(JSON.stringify(details));
    fs.appendFileSync(log,JSON.stringify({at:new Date(now()).toISOString(),actor:actor?.id||'unknown',
      role:actor?.role||'unknown',project_id:id,scene_id:sid,action,...safe})+'\n',{mode:0o600});
  }
  function guard(id,sid,actor,token,fence){
    leaseCheck(id,sid,actor,token,fence);
  }
  function director(actor){ensureRole(actor,['director'])}
  function reviewer(actor){ensureRole(actor,['reviewer','director'])}
  function workerOrDirector(actor){ensureRole(actor,['worker','director'])}
  return {status,claim,renew,release,guard,director,reviewer,workerOrDirector,audit,assigned};
}

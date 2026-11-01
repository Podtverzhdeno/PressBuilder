/** P06: fenced per-scene leases, authenticated identities and append-only audit. Single-process MVP. */
import fs from 'node:fs';
import path from 'node:path';
import {timingSafeEqual,randomUUID} from 'node:crypto';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const error=(s,status=403)=>{throw Object.assign(new Error(s),{status})};
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
export function agentDirectory(source=process.env.PB_AGENT_KEYS_JSON||'[]'){
  let items;
  try{items=JSON.parse(source)}catch{error('Invalid PB_AGENT_KEYS_JSON',500)}
  if(!Array.isArray(items)||items.length>50)error('Invalid agent directory',500);
  const ids=new Set(),tokens=new Set();
  for(const a of items){
    if(!a||typeof a!=='object'||!SLUG.test(a.id)||!['worker','reviewer','viewer'].includes(a.role)
      ||typeof a.token!=='string'||a.token.length<24||ids.has(a.id)||tokens.has(a.token)
      ||!Array.isArray(a.projects)||!a.projects.length||a.projects.some(s=>!SLUG.test(s))
      ||!Array.isArray(a.scenes)||!a.scenes.length||a.scenes.some(s=>!SLUG.test(s)))
      error('Invalid agent account configuration',500);
    ids.add(a.id);tokens.add(a.token);
  }
  return {authenticate(token){
    const record=items.find(a=>eq(a.token,token));
    return record?{id:record.id,role:record.role,projects:record.projects,scenes:record.scenes}:null;
  },count:items.length};
}
export function sceneLeaseStore({root,getDeck,now=()=>Date.now()}){
  function locate(id,scene){
    if(typeof id!=='string'||!SLUG.test(id)||typeof scene!=='string'||!SLUG.test(scene))error('Invalid ID',400);
    const d=getDeck(id);
    if(!d.slides?.some(s=>s.id===scene))error('Scene not found',404);
    return path.join(root,id,'.scene-leases',scene+'.json');
  }
  const read=(id,scene)=>{
    const p=locate(id,scene);
    if(!fs.existsSync(p))return {scene_id:scene,holder:null,fence:0,expires_at:0};
    const v=JSON.parse(fs.readFileSync(p,'utf8'));
    return {scene_id:scene,holder:v.holder??null,fence:v.fence||0,expires_at:v.expires_at||0};
  };
  function save(id,scene,record){
    const p=locate(id,scene);fs.mkdirSync(path.dirname(p),{recursive:true});
    const tmp=p+'.'+process.pid+'.'+randomUUID()+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(record)+'\n',{mode:0o600});
    try{fs.renameSync(tmp,p)}finally{fs.rmSync(tmp,{force:true})}
  }
  function audit(id,event,actor,scene,details={}){
    const p=path.join(root,id,'.scene-leases','audit.jsonl');
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.appendFileSync(p,JSON.stringify({time:new Date(now()).toISOString(),trace_id:randomUUID(),
      event,actor:actor.id,scene,...details})+'\n',{mode:0o600});
  }
  function scoped(actor,id,scene){
    if(!actor||!['director','worker','reviewer','viewer'].includes(actor.role))error('Unauthenticated actor',401);
    if(actor.role==='director')return;
    if(!actor.projects.includes(id)||!actor.scenes.includes(scene))error('Agent scope does not include this scene');
  }
  function role(actor,accepted){
    if(!accepted.includes(actor?.role))error('Role cannot perform this action');
  }
  function claim(id,scene,actor,ttl=300){
    scoped(actor,id,scene);role(actor,['director','worker']);
    if(!Number.isInteger(ttl)||ttl<30||ttl>3600)error('TTL must be 30..3600 seconds',400);
    const old=read(id,scene);
    if(old.holder&&old.expires_at>now()&&actor.role!=='director')error('Scene is already leased',409);
    const next={scene_id:scene,holder:actor.id,fence:old.fence+1,expires_at:now()+ttl*1000};
    save(id,scene,next);audit(id,'claim',actor,scene,{fence:next.fence});
    return next;
  }
  function renew(id,scene,actor,fence,ttl=300){
    scoped(actor,id,scene);role(actor,['director','worker']);
    if(!Number.isInteger(ttl)||ttl<30||ttl>3600)error('Invalid lease TTL',400);
    const old=read(id,scene);
    if(old.holder!==actor.id||old.fence!==fence||old.expires_at<=now())error('Stale or foreign lease',409);
    const next={...old,expires_at:now()+ttl*1000};
    save(id,scene,next);audit(id,'renew',actor,scene,{fence});
    return next;
  }
  function release(id,scene,actor,fence){
    scoped(actor,id,scene);role(actor,['director','worker']);
    const old=read(id,scene);
    if(actor.role!=='director'&&(old.holder!==actor.id||old.fence!==fence||old.expires_at<=now()))
      error('Stale or foreign lease',409);
    const next={scene_id:scene,holder:null,fence:old.fence+1,expires_at:0};
    save(id,scene,next);audit(id,'release',actor,scene,{fence:next.fence});
    return next;
  }
  function assertWrite(id,scene,actor,fence){
    scoped(actor,id,scene);role(actor,['director','worker']);
    if(actor.role==='director')return;
    const old=read(id,scene);
    if(old.holder!==actor.id||old.expires_at<=now()||!Number.isSafeInteger(fence)||old.fence!==fence)
      error('Scene write rejected: missing, expired or fenced lease',409);
  }
  const logWrite=(id,scene,actor,revision,action)=>audit(id,action,actor,scene,{revision});
  return {read,claim,renew,release,assertWrite,scoped,role,logWrite};
}

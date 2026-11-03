/**
 * P05-R28: bounded, in-process admission for authenticated SHA-costly calls.
 * Keys are derived exclusively from authenticated server actors, never
 * X-Forwarded-For, user-supplied headers or unvalidated path fragments.
 * R27's full-SHA concurrency governor remains the final I/O backstop.
 */
const PROJECT=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const failure=(status,code,retryAfter=1)=>
 Object.assign(new Error(code),{status,retryAfter});

export function p05HttpQuotaProject(pathname,method){
 if(typeof pathname!=='string'||typeof method!=='string')return null;
 let matched=/^\/api\/decks\/([^/]+)\/(audio-audit|qc-cockpit|assemble)$/.exec(pathname);
 if(matched){
  const op=matched[2];
  if((op==='audio-audit'&&method!=='GET'&&method!=='POST')||
     (op!=='audio-audit'&&method!=='GET'))return null;
 }else{
  matched=/^\/api\/decks\/([^/]+)\/assembly\/releases\/[^/]+\/final\.mp4$/.exec(pathname);
  if(!matched||!['GET','HEAD'].includes(method))return null;
 }
 let project;
 try{project=decodeURIComponent(matched[1])}catch{return null}
 return PROJECT.test(project)?project:null;
}
export function p05McpQuotaProject(msg){
 if(msg?.method!=='tools/call')return null;
 if(!['get_qc_cockpit','get_assembly_status'].includes(msg.params?.name))return null;
 const id=msg.params?.arguments?.id;
 return typeof id==='string'&&PROJECT.test(id)?id:null;
}
export function createP05RequestQuota({
 actorCapacity=64,actorRefillPerSecond=2,
 projectCapacity=96,projectRefillPerSecond=3,
 maxActors=256,maxProjects=512,idleMs=180000,
 now=()=>performance.now(),
}={}){
 for(const n of [actorCapacity,projectCapacity,maxActors,maxProjects,idleMs])
  if(!Number.isSafeInteger(n)||n<1)throw Error('P05_QUOTA_INVALID_LIMIT');
 for(const n of [actorRefillPerSecond,projectRefillPerSecond])
  if(typeof n!=='number'||!Number.isFinite(n)||n<=0||n>1000)
   throw Error('P05_QUOTA_INVALID_LIMIT');
 if(typeof now!=='function')throw Error('P05_QUOTA_INVALID_CLOCK');
 const actors=new Map(),projects=new Map();
 // Inspect both limits without allocating either bucket. An exhausted
 // principal must not fill the project-key map with rejected requests;
 // likewise an exhausted project must not create useless actor records.
 function peek(store,key,capacity,maxKeys,t,rate){
  const existing=store.get(key);
  if(existing){
   const elapsed=Math.max(0,t-existing.last);
   return {store,key,existing,
    tokens:Math.min(capacity,existing.tokens+elapsed/1000*rate),
    last:Math.max(existing.last,t),rate};
  }
  if(store.size>=maxKeys){
   // Only evict truly idle identities, never active/exhausted ones.
   for(const [k,v] of store){
    if(t-v.last>=idleMs)store.delete(k);
   }
   if(store.size>=maxKeys)throw failure(429,'P05_QUOTA_IDENTITY_CAPACITY',1);
  }
  return {store,key,existing:null,tokens:capacity,last:t,rate};
 }
 function commit(state){
  const item=state.existing??{tokens:0,last:state.last,rate:state.rate};
  item.tokens=state.tokens-1;
  item.last=state.last;
  if(!state.existing)state.store.set(state.key,item);
 }
 function admit(principal,project){
  if(typeof principal!=='string'||!principal||
     principal.length>128||!PROJECT.test(project))
   throw failure(400,'P05_QUOTA_INVALID_IDENTITY');
  const t=now();
  if(typeof t!=='number'||!Number.isFinite(t)||t<0)
   throw Error('P05_QUOTA_CLOCK_INVALID');
  const a=peek(actors,principal,actorCapacity,maxActors,t,actorRefillPerSecond);
  const p=peek(projects,project,projectCapacity,maxProjects,t,projectRefillPerSecond);
  const waitA=Math.max(0,1-a.tokens)/actorRefillPerSecond;
  const waitP=Math.max(0,1-p.tokens)/projectRefillPerSecond;
  if(waitA>0||waitP>0)
   throw failure(429,'P05_VERIFICATION_RATE_LIMITED',
    Math.max(1,Math.min(60,Math.ceil(Math.max(waitA,waitP)))));
  // Commit both only after both pass. The quota maps themselves must not
  // grow on rate-limited requests, even for real existing projects.
  commit(a);commit(p);
  return {accepted:true};
 }
 return {admit,snapshot:()=>({actors:actors.size,projects:projects.size})};
}

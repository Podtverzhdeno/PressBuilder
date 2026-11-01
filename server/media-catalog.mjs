/**
 * M32-R01: source-attested asset registry for immutable P08 approved MP4s.
 * This module never imports arbitrary paths/URLs, claims legal verification,
 * grants a render/publish right, or modifies approved scene artifacts.
 *
 * Single-process FS-CAS MVP (same operational boundary as P08/P10).
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const ASSET=/^[a-z0-9][a-z0-9_-]{0,48}$/;
const VERSION=/^[a-f0-9]{16}$/;
const SHA=/^[a-f0-9]{64}$/;
const REF=/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{3,159}$/;
const USES=new Set(['b_roll','internal_preview','composition','research']);
const BAD=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const object=(o,fields)=>{
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!fields.includes(k)))
   BAD('MEDIA_INVALID_FIELDS',400);
};
const str=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v===v.trim();
const seq=(a,limit,valid)=>Array.isArray(a)&&a.length>=1&&a.length<=limit&&
 new Set(a).size===a.length&&a.every(valid);
const clock=(v)=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))
   BAD('MEDIA_INVALID_EXPIRY',400);
 const parsed=Date.parse(v);
 if(!Number.isFinite(parsed)||new Date(parsed).toISOString()!==v)BAD('MEDIA_INVALID_EXPIRY',400);
 return parsed;
};
const safeName=x=>typeof x==='string'&&ASSET.test(x);

function atomic(file,body){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.'+randomUUID()+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(body,null,2)+'\n',{mode:0o600,flag:'wx'});
 try{fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
}
export function mediaCatalogStore({root,getDeck,versions,enabled=false,now=()=>Date.now()}){
 if(!versions||typeof versions.approved!=='function')throw new Error('M32 requires verified P08 approved source interface');
 function location(id){
  if(!ID.test(id??''))BAD('MEDIA_INVALID_PROJECT',400);
  getDeck(id);
  const parent=path.join(root,id);
  // Reject symlinked project/catalog directories; no client-provided relative paths.
  for(const dir of [root,parent,path.join(parent,'.media-catalog')]){
   const st=fs.lstatSync(dir,{throwIfNoEntry:false});
   if(st?.isSymbolicLink()||(st&&!st.isDirectory()))BAD('MEDIA_UNSAFE_STORAGE',403);
  }
  return path.join(parent,'.media-catalog','catalog.json');
 }
 function active(){
  if(!enabled)BAD('MEDIA_CATALOG_DISABLED',501);
 }
 function read(id){
  active();
  const file=location(id);
  if(!fs.existsSync(file))return {schema_version:1,project_id:id,revision:0,assets:[]};
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>256*1024)
    BAD('MEDIA_CORRUPT_CATALOG',500);
  let data;
  try{data=JSON.parse(fs.readFileSync(file,'utf8'))}
  catch{BAD('MEDIA_CORRUPT_CATALOG',500)}
  if(data?.schema_version!==1||data.project_id!==id||
    !Number.isSafeInteger(data.revision)||data.revision<0||
    !Array.isArray(data.assets)||data.assets.length>128||
    new Set(data.assets.map(x=>x?.asset_id)).size!==data.assets.length)
    BAD('MEDIA_CORRUPT_CATALOG',500);
  for(const a of data.assets){
   if(!safeName(a?.asset_id)||!ID.test(a?.source_scene_id??'')||
      !VERSION.test(a?.source_version_id??'')||!SHA.test(a?.source_sha256??'')||
      !Number.isSafeInteger(a?.source_approval_revision)||
      !['PENDING_ATTESTATION','ATTESTED','REVOKED'].includes(a?.status)||
      !Number.isSafeInteger(a?.revision)||a.revision<1)
     BAD('MEDIA_CORRUPT_CATALOG',500);
  }
  return data;
 }
 function pinSource(id,scene,version,sha,rev){
  const verified=versions.approved(id,scene);
  if(!verified?.artifact||verified.version_id!==version||
     verified.revision!==rev||verified.artifact.version_id!==version||
     verified.artifact.sha256!==sha||verified.artifact.qa?.verdict!=='PASS')
   BAD('MEDIA_SOURCE_NOT_APPROVED_OR_CHANGED');
  return verified;
 }
 function timestamp(){return new Date(now()).toISOString()}
 function compare(current,expected){
  if(!Number.isSafeInteger(expected)||expected<0||current.revision!==expected)
    BAD('MEDIA_CATALOG_STALE',409);
 }
 function save(id,catalog,kind,assetId,actor){
  if(!str(actor?.id,80)||actor.role!=='director')BAD('MEDIA_DIRECTOR_REQUIRED',403);
  const file=location(id);
  atomic(file,catalog);
  // Auditable journal, append-only best effort. No approval authority comes from the log.
  const event={at:timestamp(),kind,asset_id:assetId,actor_id:actor.id,catalog_revision:catalog.revision,
    manifest_sha256:hash(catalog)};
  fs.appendFileSync(path.join(path.dirname(file),'events.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});
 }
 function propose(id,actor,args){
  active();
  if(actor?.role!=='director')BAD('MEDIA_DIRECTOR_REQUIRED',403);
  object(args,['expected_revision','asset_id','source_scene_id','source_version_id',
   'source_sha256','source_approval_revision','label','rights_holder','license_ref',
   'evidence_ref','expires_at','allowed_uses','allowed_scenes','attribution']);
  if(!safeName(args.asset_id)||!ID.test(args.source_scene_id??'')||
    !VERSION.test(args.source_version_id??'')||!SHA.test(args.source_sha256??'')||
    !Number.isSafeInteger(args.source_approval_revision)||args.source_approval_revision<1||
    !str(args.label,140)||!str(args.rights_holder,140)||
    !REF.test(args.license_ref??'')||!REF.test(args.evidence_ref??'')||
    !str(args.attribution,400)||!seq(args.allowed_uses,4,x=>USES.has(x))||
    !seq(args.allowed_scenes,12,x=>ID.test(x)))
    BAD('MEDIA_INVALID_PROPOSAL',400);
  const deck=getDeck(id),all=new Set(deck.slides?.map(x=>x.id));
  if(!all.has(args.source_scene_id)||args.allowed_scenes.some(x=>!all.has(x)))
    BAD('MEDIA_UNKNOWN_SCENE',400);
  if(clock(args.expires_at)<=now())BAD('MEDIA_RIGHTS_EXPIRED',403);
  // Approval verification is performed before writing any data.
  pinSource(id,args.source_scene_id,args.source_version_id,args.source_sha256,args.source_approval_revision);
  const old=read(id);compare(old,args.expected_revision);
  if(old.assets.length>=128)BAD('MEDIA_CATALOG_FULL',413);
  if(old.assets.some(a=>a.asset_id===args.asset_id||
       (a.status!=='REVOKED'&&a.source_sha256===args.source_sha256)))
    BAD('MEDIA_ASSET_EXISTS',409);
  const {expected_revision,...fields}=args;
  const rec={...fields,kind:'approved_scene_mp4',status:'PENDING_ATTESTATION',
    revision:1,proposed_at:timestamp(),proposed_by:actor.id,
    attested_at:null,attested_by:null,revoked_at:null,revoked_by:null,reason:null};
  const next={...old,revision:old.revision+1,assets:[...old.assets,rec]};
  save(id,next,'proposal',args.asset_id,actor);
  return {catalog_revision:next.revision,asset:rec};
 }
 function mutate(id,assetId,actor,args,action){
  active();
  if(actor?.role!=='director')BAD('MEDIA_DIRECTOR_REQUIRED',403);
  if(!safeName(assetId))BAD('MEDIA_INVALID_ASSET',400);
  object(args,action==='attest'
   ?['expected_revision','expected_asset_revision','source_sha256','confirm']
   :['expected_revision','expected_asset_revision','reason','confirm']);
  const old=read(id);compare(old,args.expected_revision);
  const i=old.assets.findIndex(x=>x.asset_id===assetId);
  if(i<0)BAD('MEDIA_ASSET_NOT_FOUND',404);
  const a=old.assets[i];
  if(!Number.isSafeInteger(args.expected_asset_revision)||a.revision!==args.expected_asset_revision)
    BAD('MEDIA_ASSET_STALE',409);
  if(action==='attest'){
   if(a.status!=='PENDING_ATTESTATION'||args.confirm!=='ATTEST_RIGHTS'||
      args.source_sha256!==a.source_sha256)BAD('MEDIA_ATTESTATION_REJECTED',409);
   if(clock(a.expires_at)<=now())BAD('MEDIA_RIGHTS_EXPIRED',403);
   pinSource(id,a.source_scene_id,a.source_version_id,a.source_sha256,a.source_approval_revision);
  }else{
   if(a.status==='REVOKED'||args.confirm!=='REVOKE_RIGHTS'||!str(args.reason,500))
    BAD('MEDIA_REVOCATION_REJECTED',409);
  }
  const rec={...a,status:action==='attest'?'ATTESTED':'REVOKED',revision:a.revision+1,
    ...(action==='attest'?{attested_at:timestamp(),attested_by:actor.id}:
     {revoked_at:timestamp(),revoked_by:actor.id,reason:args.reason})};
  const next={...old,revision:old.revision+1,
    assets:old.assets.map((v,j)=>j===i?rec:v)};
  save(id,next,action,assetId,actor);
  return {catalog_revision:next.revision,asset:rec};
 }
 function verify(id,assetId,sceneId,use){
  const catalog=read(id);
  const asset=catalog.assets.find(a=>a.asset_id===assetId);
  if(!asset)BAD('MEDIA_ASSET_NOT_FOUND',404);
  const fails=[];
  if(asset.status!=='ATTESTED')fails.push('NOT_ATTESTED_OR_REVOKED');
  if(clock(asset.expires_at)<=now())fails.push('RIGHTS_EXPIRED');
  if(!ID.test(sceneId??'')||!asset.allowed_scenes.includes(sceneId))fails.push('SCENE_NOT_AUTHORIZED');
  if(!USES.has(use)||!asset.allowed_uses.includes(use))fails.push('USE_NOT_AUTHORIZED');
  try{pinSource(id,asset.source_scene_id,asset.source_version_id,
    asset.source_sha256,asset.source_approval_revision)}
  catch{fails.push('SOURCE_APPROVAL_OR_HASH_INVALID')}
  return {schema_version:1,project_id:id,asset_id:assetId,asset_revision:asset.revision,
    catalog_revision:catalog.revision,source_sha256:asset.source_sha256,
    status:fails.length?'BLOCKED':'ATTESTED_FOR_PROPOSAL',
    use,for_scene:sceneId,reason_codes:fails,
    proposal_allowed:fails.length===0,
    render_allowed:false,publication_allowed:false,
    rights_basis:'RECORDED_DIRECTOR_ATTESTATION_NOT_LEGAL_VERIFICATION'};
 }
 return {read,propose,attest:(id,assetId,actor,args)=>mutate(id,assetId,actor,args,'attest'),
  revoke:(id,assetId,actor,args)=>mutate(id,assetId,actor,args,'revoke'),verify};
}

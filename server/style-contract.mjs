/** P04: conservative project-scoped visual constraints, independent of deck.json. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const HEX=/^#[0-9a-fA-F]{6}$/;
const FONTS=new Set(['display','sans','mono']);
const bad=(msg,status=400)=>{throw Object.assign(new Error(msg),{status})};
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const keys=(x,allowed)=>{if(!plain(x)||Object.keys(x).some(k=>!allowed.includes(k)))bad('Invalid style contract fields')};
const finite=(v,min,max,name)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)bad('Invalid '+name);return v};
const defaults=Object.freeze({schemaVersion:1,enforce:false,
  palette:['#FFFFFF','#000000','#E0B66B','#6B7BB8'],
  typography:{fonts:['display','sans','mono'],minFontSize:16,maxTextLength:250},
  safeArea:{left:64,right:64,top:48,bottom:48},
  camera:{maxYawSpeed:2,maxPitchSpeed:0.5},
  motion:{maxSpin:4},transitions:{allowed:['hard-cut'],maxDuration:0}});
export function validateStyleContract(x){
  keys(x,['schemaVersion','enforce','palette','typography','safeArea','camera','motion','transitions']);
  if(x.schemaVersion!==1||typeof x.enforce!=='boolean')bad('Unsupported contract version/enforcement');
  if(!Array.isArray(x.palette)||x.palette.length<1||x.palette.length>24||
      x.palette.some(c=>typeof c!=='string'||!HEX.test(c)))bad('Invalid palette');
  keys(x.typography,['fonts','minFontSize','maxTextLength']);
  if(!Array.isArray(x.typography.fonts)||!x.typography.fonts.length||
     x.typography.fonts.some(f=>!FONTS.has(f))||new Set(x.typography.fonts).size!==x.typography.fonts.length)bad('Invalid fonts');
  keys(x.safeArea,['left','right','top','bottom']);
  const area={};
  for(const k of ['left','right','top','bottom'])area[k]=finite(x.safeArea[k],0,400,'safeArea.'+k);
  if(area.left+area.right>=1920||area.top+area.bottom>=1080)bad('Safe area consumes the frame');
  keys(x.camera,['maxYawSpeed','maxPitchSpeed']);
  keys(x.motion,['maxSpin']);
  keys(x.transitions,['allowed','maxDuration']);
  if(!Array.isArray(x.transitions.allowed)||x.transitions.allowed.length!==1||x.transitions.allowed[0]!=='hard-cut')bad('Only hard-cut is implemented');
  if(x.transitions.maxDuration!==0)bad('Hard cut must have zero duration');
  return {schemaVersion:1,enforce:x.enforce,palette:[...new Set(x.palette.map(c=>c.toUpperCase()))],
    typography:{fonts:[...x.typography.fonts],minFontSize:finite(x.typography.minFontSize,16,240,'minFontSize'),
      maxTextLength:finite(x.typography.maxTextLength,1,250,'maxTextLength')},
    safeArea:area,camera:{maxYawSpeed:finite(x.camera.maxYawSpeed,0,2,'maxYawSpeed'),
      maxPitchSpeed:finite(x.camera.maxPitchSpeed,0,0.5,'maxPitchSpeed')},
    motion:{maxSpin:finite(x.motion.maxSpin,0,4,'maxSpin')},
    transitions:{allowed:['hard-cut'],maxDuration:0}};
}
export function enforceScene3D(contract,spec){
  if(!contract.enforce)return;
  const colors=new Set(contract.palette.map(x=>x.toUpperCase()));
  if(spec.objects.some(o=>!colors.has(o.color.toUpperCase())||
     (o.edge_color&&!colors.has(o.edge_color.toUpperCase()))))bad('Scene 3D uses a color outside the project palette',422);
  if(Math.abs(spec.camera.yaw_speed??0)>contract.camera.maxYawSpeed||
      Math.abs(spec.camera.pitch_speed??0)>contract.camera.maxPitchSpeed)bad('Camera speed exceeds style contract',422);
  if(spec.objects.some(o=>(o.spin||[]).some(n=>Math.abs(n)>contract.motion.maxSpin)))bad('Object spin exceeds style contract',422);
}
export function enforceVisuals(contract,elements){
  if(!contract.enforce)return;
  const {safeArea:s,typography:t}=contract;
  for(const e of elements){
    if(e.kind!=='text')continue;
    if(e.font&&!t.fonts.includes(e.font))bad('Text font forbidden by style contract',422);
    if((e.size??40)<t.minFontSize||(e.text||'').length>t.maxTextLength)bad('Text size/length violates style contract',422);
    // Conservative origin check; full glyph bounding-box QA is deferred to P03.
    if(e.x<s.left||e.y<s.top||e.x>1920-s.right||e.y>1080-s.bottom)bad('Text origin outside safe area',422);
  }
}
export function styleContractStore({root,getDeck}){
  const file=id=>{
    if(typeof id!=='string'||!SLUG.test(id))bad('Invalid project ID');
    getDeck(id);
    return path.join(root,id,'style-contract.json');
  };
  const read=id=>{
    const p=file(id);
    if(!fs.existsSync(p))return {id,revision:0,contract:structuredClone(defaults),updated_at:null};
    const record=JSON.parse(fs.readFileSync(p,'utf8'));
    return {id,revision:record.revision,contract:validateStyleContract(record.contract),updated_at:record.updated_at};
  };
  const put=(id,contract,expected_revision)=>{
    const p=file(id),old=read(id);
    if(!Number.isSafeInteger(expected_revision)||old.revision!==expected_revision)bad('Style contract revision conflict',409);
    const checked=validateStyleContract(contract);
    const next={id,revision:old.revision+1,contract:checked,updated_at:new Date().toISOString()};
    fs.mkdirSync(path.dirname(p),{recursive:true});
    const tmp=p+'.'+process.pid+'.'+createHash('sha256').update(String(Math.random())).digest('hex').slice(0,12)+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
    try{fs.renameSync(tmp,p)}finally{fs.rmSync(tmp,{force:true})}
    return next;
  };
  return {read,put};
}

/** P04: conservative project-scoped visual constraints, independent of deck.json. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {styleById} from '../src/engine/styles.ts';

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
  safeArea:{left:64,right:64,top:48,bottom:150},
  camera:{maxYawSpeed:2,maxPitchSpeed:0.5},
  motion:{maxSpin:4},transitions:{allowed:['hard-cut','crossfade','match-cut'],maxDuration:0.75},sceneOverrides:{}});
export function validateStyleContract(x){
  keys(x,['schemaVersion','enforce','palette','typography','safeArea','camera','motion','transitions','sceneOverrides']);
  if(x.schemaVersion!==1||typeof x.enforce!=='boolean')bad('Unsupported contract version/enforcement');
  if(!Array.isArray(x.palette)||x.palette.length<1||x.palette.length>24||
      x.palette.some(c=>typeof c!=='string'||!HEX.test(c))||
      new Set(x.palette.map(c=>c.toUpperCase())).size!==x.palette.length)bad('Invalid or duplicate palette');
  keys(x.typography,['fonts','minFontSize','maxTextLength']);
  if(!Array.isArray(x.typography.fonts)||!x.typography.fonts.length||
     x.typography.fonts.some(f=>!FONTS.has(f))||new Set(x.typography.fonts).size!==x.typography.fonts.length)bad('Invalid fonts');
  keys(x.safeArea,['left','right','top','bottom']);
  const area={};
  for(const k of ['left','right','top','bottom'])area[k]=finite(x.safeArea[k],k==='bottom'?100:32,400,'safeArea.'+k);
  if(area.left+area.right>=1920||area.top+area.bottom>=1080)bad('Safe area consumes the frame');
  keys(x.camera,['maxYawSpeed','maxPitchSpeed']);
  keys(x.motion,['maxSpin']);
  keys(x.transitions,['allowed','maxDuration']);
  const transitionAllowed=new Set(['hard-cut','crossfade','match-cut']);
  if(!Array.isArray(x.transitions.allowed)||!x.transitions.allowed.length||x.transitions.allowed.length>3||new Set(x.transitions.allowed).size!==x.transitions.allowed.length||x.transitions.allowed.some(t=>!transitionAllowed.has(t)))bad('Invalid allowed transitions');
  finite(x.transitions.maxDuration,0,0.75,'maxDuration');
  return {schemaVersion:1,enforce:x.enforce,palette:[...new Set(x.palette.map(c=>c.toUpperCase()))],
    typography:{fonts:[...x.typography.fonts],minFontSize:finite(x.typography.minFontSize,16,240,'minFontSize'),
      maxTextLength:finite(x.typography.maxTextLength,1,250,'maxTextLength')},
    safeArea:area,camera:{maxYawSpeed:finite(x.camera.maxYawSpeed,0,2,'maxYawSpeed'),
      maxPitchSpeed:finite(x.camera.maxPitchSpeed,0,0.5,'maxPitchSpeed')},
    motion:{maxSpin:finite(x.motion.maxSpin,0,4,'maxSpin')},
    transitions:{allowed:[...x.transitions.allowed],maxDuration:x.transitions.maxDuration},
    sceneOverrides:validateOverrides(x.sceneOverrides??{},x)};
}

/** Scene overrides can only tighten the globally agreed constraints. */
function validateOverrides(overrides,parent){
  if(!plain(overrides)||Object.keys(overrides).length>300)bad('Invalid scene overrides');
  const result={};
  for(const [id,override] of Object.entries(overrides)){
    if(!SLUG.test(id))bad('Invalid override scene ID');
    keys(override,['palette','minFontSize','safeArea','maxYawSpeed','maxPitchSpeed','maxSpin','maxTransitionDuration']);
    const o={};
    if(override.palette!==undefined){
      if(!Array.isArray(override.palette)||!override.palette.length||override.palette.length>24||
        override.palette.some(c=>typeof c!=='string'||!HEX.test(c)||!parent.palette.map(x=>x.toUpperCase()).includes(c.toUpperCase())))bad('Scene palette cannot expand project palette');
      o.palette=[...new Set(override.palette.map(c=>c.toUpperCase()))];
    }
    if(override.minFontSize!==undefined)o.minFontSize=finite(override.minFontSize,parent.typography.minFontSize,240,'scene minFontSize');
    if(override.safeArea!==undefined){
      keys(override.safeArea,['left','right','top','bottom']);
      o.safeArea={};
      for(const k of ['left','right','top','bottom']){
        o.safeArea[k]=finite(override.safeArea[k]??parent.safeArea[k],parent.safeArea[k],400,'scene safeArea.'+k);
      }
    }
    for(const [key,globalValue] of [['maxYawSpeed',parent.camera.maxYawSpeed],['maxPitchSpeed',parent.camera.maxPitchSpeed],
      ['maxSpin',parent.motion.maxSpin],['maxTransitionDuration',parent.transitions.maxDuration]]){
      if(override[key]!==undefined)o[key]=finite(override[key],0,globalValue,'scene '+key);
    }
    result[id]=o;
  }
  return result;
}
export function effectiveStyle(contract,slideId){
  const override=contract.sceneOverrides?.[slideId]??{};
  return {...contract,
    palette:override.palette??contract.palette,
    typography:{...contract.typography,minFontSize:override.minFontSize??contract.typography.minFontSize},
    safeArea:{...contract.safeArea,...override.safeArea},
    camera:{maxYawSpeed:override.maxYawSpeed??contract.camera.maxYawSpeed,
      maxPitchSpeed:override.maxPitchSpeed??contract.camera.maxPitchSpeed},
    motion:{maxSpin:override.maxSpin??contract.motion.maxSpin},
    transitions:{...contract.transitions,maxDuration:override.maxTransitionDuration??contract.transitions.maxDuration}};
}

export function enforceScene3D(contract,spec,slideId){
  contract=effectiveStyle(contract,slideId);
  if(!contract.enforce)return;
  if(!plain(spec)||!Array.isArray(spec.objects)||!plain(spec.camera))bad('Invalid 3D scene specification',400);
  if(spec.objects.some(o=>!plain(o)||typeof o.color!=='string'||!HEX.test(o.color)||
      (o.edge_color!=null&&(typeof o.edge_color!=='string'||!HEX.test(o.edge_color)))))
    bad('Invalid 3D object colors',400);
  const colors=new Set(contract.palette.map(x=>x.toUpperCase()));
  if(spec.objects.some(o=>!colors.has(o.color.toUpperCase())||
     (o.edge_color&&!colors.has(o.edge_color.toUpperCase()))))bad('Scene 3D uses a color outside the project palette',422);
  for(const k of ['yaw_speed','pitch_speed']){
    if(spec.camera[k]!==undefined&&!Number.isFinite(spec.camera[k]))bad('Invalid camera '+k,400);
  }
  if(Math.abs(spec.camera.yaw_speed??0)>contract.camera.maxYawSpeed||
      Math.abs(spec.camera.pitch_speed??0)>contract.camera.maxPitchSpeed)bad('Camera speed exceeds style contract',422);
  if(spec.objects.some(o=>o.spin!==undefined&&(!Array.isArray(o.spin)||
      o.spin.some(n=>typeof n!=='number'||!Number.isFinite(n)))))bad('Invalid object spin',400);
  if(spec.objects.some(o=>(o.spin||[]).some(n=>Math.abs(n)>contract.motion.maxSpin)))bad('Object spin exceeds style contract',422);
}
/** Check declarative visuals; colors are engine token names resolved from the deck preset. */
export function enforceVisuals(contract,elements,slideId,theme){
  if(!contract.enforce)return;
  contract=effectiveStyle(contract,slideId);
  if(!Array.isArray(elements))bad('Visual elements must be an array',400);
  const {safeArea:s,typography:t}=contract;
  const colors=new Set(contract.palette.map(x=>x.toUpperCase()));
  for(const e of elements){
    if(!plain(e))bad('Invalid visual element',400);
    if(theme){
      const color=theme[e.color??'h1'];
      if(typeof color!=='string'||!HEX.test(color))bad('Unknown visual color token',400);
      if(!colors.has(color.toUpperCase()))bad('Visual color outside contract palette',422);
    }
    if(e.kind!=='text')continue;
    if(e.font&&!t.fonts.includes(e.font))bad('Text font forbidden by style contract',422);
    if(typeof e.text!=='string'||e.text.length>t.maxTextLength||
       (e.size??40)<t.minFontSize)bad('Text size/length violates style contract',422);
    if(!Number.isFinite(e.x)||!Number.isFinite(e.y))bad('Invalid text position',400);
    // Canvas glyph bounds require frame analysis; reject clearly unsafe text anchors.
    if(e.x<s.left||e.y<s.top||e.x>1920-s.right||e.y>1080-s.bottom)
      bad('Text origin outside safe area',422);
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
    const p=file(id),old=read(id),deck=getDeck(id);
    if(!Number.isSafeInteger(expected_revision)||old.revision!==expected_revision)bad('Style contract revision conflict',409);
    const checked=validateStyleContract(contract);
    const planFile=path.join(root,id,'assembly-plan.json');
    if(fs.existsSync(planFile)){
      const stored=JSON.parse(fs.readFileSync(planFile,'utf8'));
      for(const scene of stored.plan?.scenes??[]){
        const transition=scene.transition_after;
        const rules=effectiveStyle(checked,scene.scene_id).transitions;
        if(!rules.allowed.includes(transition.type)||transition.duration>rules.maxDuration)
          bad('Style change conflicts with existing assembly transition for '+scene.scene_id,422);
      }
    }
    for(const scene of Object.keys(checked.sceneOverrides)){
      if(!deck.slides.some(s=>s.id===scene))bad('Unknown scene override: '+scene);
    }
    // A tightened contract must not silently invalidate existing declarative scenes.
    if(checked.enforce){
      for(const slide of deck.slides){
        if(slide.visuals?.length)enforceVisuals(checked,slide.visuals,slide.id,styleById(deck.style).colors);
        const path3d=path.join(root,id,'.scene3d',slide.id+'.json');
        if(fs.existsSync(path3d)){
          const stored=JSON.parse(fs.readFileSync(path3d,'utf8'));
          if(stored.spec)enforceScene3D(checked,stored.spec,slide.id);
        }
      }
    }
    const next={id,revision:old.revision+1,contract:checked,updated_at:new Date().toISOString()};
    fs.mkdirSync(path.dirname(p),{recursive:true});
    const tmp=p+'.'+process.pid+'.'+createHash('sha256').update(String(Math.random())).digest('hex').slice(0,12)+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
    try{fs.renameSync(tmp,p)}finally{fs.rmSync(tmp,{force:true})}
    return next;
  };
  return {read,put};
}

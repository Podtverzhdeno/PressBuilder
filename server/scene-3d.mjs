/**
 * Safe, isolated 3D compositions authored through MCP.
 * Only allowlisted meshes and bounded numeric animation values.
 * Each scene lives in its own versioned JSON file; no uploaded JS is executed.
 */
import fs from 'node:fs';
import path from 'node:path';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const NAMES=/^[a-zA-Z][a-zA-Z0-9_-]{0,50}$/;
const MESHES=new Set(['cube','pyramid','octa','icosa','hexPrism','cylinder']);
const COLOR=/^#[0-9a-fA-F]{6}$/;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const keys=(obj,allowed)=>{for(const key of Object.keys(obj))if(!allowed.includes(key))throw error('Unexpected field: '+key)};
function numeric(n,name,min,max){
  if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw error('Invalid '+name);
  return n;
}
function vec(v,name,min,max){
  if(!Array.isArray(v)||v.length!==3)throw error('Invalid '+name);
  return v.map((n,i)=>numeric(n,name+'['+i+']',min,max));
}
function validate(camera,objects){
  if(!camera||typeof camera!=='object'||Array.isArray(camera))throw error('Missing camera');
  keys(camera,['cx','cy','size','dist','yaw','pitch','yaw_speed','pitch_speed','zoom_speed']);
  const c={
    cx:numeric(camera.cx??960,'camera.cx',0,1920),
    cy:numeric(camera.cy??510,'camera.cy',0,1080),
    size:numeric(camera.size??200,'camera.size',20,500),
    dist:numeric(camera.dist??9,'camera.dist',5,80),
    yaw:numeric(camera.yaw??0,'camera.yaw',-6.2832,6.2832),
    pitch:numeric(camera.pitch??0,'camera.pitch',-1.4,1.4),
    yaw_speed:numeric(camera.yaw_speed??0,'camera.yaw_speed',-2,2),
    pitch_speed:numeric(camera.pitch_speed??0,'camera.pitch_speed',-0.5,0.5),
    zoom_speed:numeric(camera.zoom_speed??0,'camera.zoom_speed',-0.1,0.1),
  };
  if(!Array.isArray(objects)||objects.length<1||objects.length>18)throw error('Scene needs 1..18 3D objects');
  const ids=new Set();
  const out=objects.map((o,i)=>{
    if(!o||typeof o!=='object'||Array.isArray(o))throw error('Invalid object '+i);
    keys(o,['id','mesh','pos','scale','rotation','spin','color','edge_color','wire','start','fade']);
    if(typeof o.id!=='string'||!NAMES.test(o.id)||ids.has(o.id))throw error('Invalid or duplicate object id');
    ids.add(o.id);
    if(!MESHES.has(o.mesh))throw error('Unsupported mesh '+o.mesh);
    if(typeof o.color!=='string'||!COLOR.test(o.color))throw error('Invalid color');
    const edge=o.edge_color===undefined?null:o.edge_color;
    if(edge!==null&&(typeof edge!=='string'||!COLOR.test(edge)))throw error('Invalid edge_color');
    if(o.wire!==undefined&&typeof o.wire!=='boolean')throw error('wire must be boolean');
    return {
      id:o.id,mesh:o.mesh,
      pos:vec(o.pos??[0,0,0],'pos',-8,8),
      scale:numeric(o.scale??1,'scale',0.02,5),
      rotation:vec(o.rotation??[0,0,0],'rotation',-6.2832,6.2832),
      spin:vec(o.spin??[0,0,0],'spin',-4,4),
      color:o.color,edge_color:edge,wire:o.wire===true,
      start:numeric(o.start??0,'start',0,60),
      fade:numeric(o.fade??0.45,'fade',0.05,5),
    };
  });
  return {version:1,camera:c,objects:out};
}
export function scene3dStore({root,seedRoot,getDeck}){
  function locate(id,slideId){
    if(typeof id!=='string'||!SLUG.test(id)||typeof slideId!=='string'||!SLUG.test(slideId))throw error('Invalid project or scene ID');
    const deck=getDeck(id);
    if(!deck?.slides?.some(s=>s.id===slideId))throw error('Unknown scene '+slideId,404);
    const file=path.join(root,id,'.scene3d',slideId+'.json');
    const seedFile=seedRoot?path.join(seedRoot,id,'.scene3d',slideId+'.json'):null;
    return {file,seedFile};
  }
  function read(id,slideId){
    const {file,seedFile}=locate(id,slideId);
    const src=fs.existsSync(file)?file:(seedFile&&fs.existsSync(seedFile)?seedFile:null);
    if(!src)return {id,scene_id:slideId,revision:0,spec:null,updated_at:null};
    const data=JSON.parse(fs.readFileSync(src,'utf8'));
    const spec=data.spec===null?null:validate(data.spec?.camera,data.spec?.objects);
    return {id,scene_id:slideId,revision:data.revision,spec,updated_at:data.updated_at};
  }
  function list(id){
    const deck=getDeck(id);
    return deck.slides.map(s=>read(id,s.id)).filter(x=>x.spec!==null);
  }
  function put(id,slideId,spec,expected_revision){
    const {file}=locate(id,slideId);
    const old=read(id,slideId);
    if(!Number.isSafeInteger(expected_revision)||expected_revision!==old.revision)throw error('Scene 3D changed; reload and retry',409);
    if(!spec||typeof spec!=='object'||Array.isArray(spec))throw error('Missing scene 3D specification');
    keys(spec,['version','camera','objects']);
    if(spec.version!==1)throw error('Only scene3d spec version 1 is supported');
    const checked=validate(spec.camera,spec.objects);
    const next={id,scene_id:slideId,revision:old.revision+1,spec:checked,updated_at:new Date().toISOString()};
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const tmp=file+'.'+process.pid+'.'+Math.random().toString(36).slice(2)+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
    try{fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
    return next;
  }
  // Internal director-only recovery path: validates the same data schema as regular MCP writes.
  // A null snapshot clears this scene's declarative overlay without touching another scene.
  function restore(id,slideId,spec,expected_revision){
    const {file}=locate(id,slideId);
    const old=read(id,slideId);
    if(!Number.isSafeInteger(expected_revision)||expected_revision!==old.revision)
      throw error('Scene 3D changed; reload before source restoration',409);
    const checked=spec===null?null:validate(spec?.camera,spec?.objects);
    const next={id,scene_id:slideId,revision:old.revision+1,spec:checked,updated_at:new Date().toISOString()};
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const tmp=file+'.'+process.pid+'.'+Math.random().toString(36).slice(2)+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
    try{fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}
    return next;
  }
  return {read,list,put,restore};
}

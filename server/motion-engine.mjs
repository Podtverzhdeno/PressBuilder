/** P18-C01/C02: pure deterministic bounded keyframe motion preview; no media or deck writes. */
import {createHash} from 'node:crypto';
const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA=/^[a-f0-9]{64}$/;
const ALLOWED_FPS=new Set(['24/1','25/1','30/1','60/1','24000/1001','30000/1001']);
const PROPERTIES={
 x:{min:-1,max:1,velocity:0.85,acceleration:4},
 y:{min:-1,max:1,velocity:0.85,acceleration:4},
 scale:{min:0.1,max:3,velocity:0.65,acceleration:3},
 rotation_rad:{min:-6.2832,max:6.2832,velocity:1.6,acceleration:8},
 camera_yaw:{min:-120,max:120,velocity:45,acceleration:180},
 camera_zoom:{min:0.7,max:2,velocity:0.5,acceleration:2.4},
 opacity:{min:0,max:1,velocity:0.8,acceleration:3.2},
 blur_px:{min:0,max:6,velocity:4,acceleration:16}
};
const EASINGS=new Set(['linear','smoothstep','cubic_in_out']);
const MOVING=new Set(['x','y','scale','rotation_rad','camera_yaw','camera_zoom','blur_px']);
const bad=(code,status=422)=>{throw Object.assign(new Error(code),{code,status})};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const keys=(o,allowed)=>Object.keys(o).every(k=>allowed.includes(k));
const smooth=(x,name)=>name==='linear'?x:name==='smoothstep'
 ?x*x*(3-2*x):x<0.5?4*x*x*x:1-(-2*x+2)**3/2;
function valueAt(points,frame){
 let lo=0,hi=points.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].frame<=frame)lo=mid;else hi=mid}
 const a=points[lo],b=points[lo+1]||a;
 if(b.frame===a.frame)return a.value;
 const t=(frame-a.frame)/(b.frame-a.frame);
 return a.value+(b.value-a.value)*smooth(t,a.easing);
}
function validateTrack(t,frames,fps){
 if(!t||typeof t!=='object'||Array.isArray(t)||!keys(t,['target_id','property','keyframes'])||
  !SLUG.test(t.target_id)||!Object.hasOwn(PROPERTIES,t.property)||
  !Array.isArray(t.keyframes)||t.keyframes.length<2||t.keyframes.length>32)bad('MOTION_TRACK_INVALID');
 const limit=PROPERTIES[t.property],points=[];
 for(const p of t.keyframes){
  if(!p||typeof p!=='object'||Array.isArray(p)||!keys(p,['frame','value','easing'])||
    !Number.isSafeInteger(p.frame)||p.frame<0||p.frame>frames||
    !finite(p.value,limit.min,limit.max)||!EASINGS.has(p.easing??'linear')||
    (points.length&&p.frame<=points.at(-1).frame))bad('MOTION_KEYFRAME_INVALID');
  points.push({frame:p.frame,value:p.value,easing:p.easing??'linear'});
 }
 if(points[0].frame!==0||points.at(-1).frame!==frames)bad('MOTION_KEYFRAME_COVERAGE');
 const secondsPerFrame=fps.den/fps.num;
 let previous=valueAt(points,0),previousV=0;
 for(let f=1;f<=frames;f++){
  const current=valueAt(points,f),velocity=(current-previous)/secondsPerFrame;
  if(!Number.isFinite(velocity)||Math.abs(velocity)>limit.velocity+1e-6)
    bad(t.property==='opacity'?'MOTION_FLASH_RISK':'MOTION_VELOCITY_EXCEEDED');
  if(f>1&&Math.abs((velocity-previousV)/secondsPerFrame)>limit.acceleration+1e-6)
    bad('MOTION_ACCELERATION_EXCEEDED');
  previous=current;previousV=velocity;
 }
 return {target_id:t.target_id,property:t.property,keyframes:points};
}
export function proposeMotionFrames(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
  !keys(input,['schema_version','project_id','scene_id','source_sha256',
    'expected_revision','frame_rate','duration_frames','reduced_motion','tracks','sample_frames'])||
  input.schema_version!==1||!SLUG.test(input.project_id)||!SLUG.test(input.scene_id)||
  !SHA.test(input.source_sha256)||!Number.isSafeInteger(input.expected_revision)||
  input.expected_revision<0||!input.frame_rate||
  !Number.isSafeInteger(input.frame_rate.num)||!Number.isSafeInteger(input.frame_rate.den)||
  !keys(input.frame_rate,['num','den'])||
  !ALLOWED_FPS.has(input.frame_rate.num+'/'+input.frame_rate.den)||
  !Number.isSafeInteger(input.duration_frames)||input.duration_frames<4||
  input.duration_frames>1800||input.duration_frames*input.frame_rate.den/input.frame_rate.num>60||
  typeof input.reduced_motion!=='boolean'||!Array.isArray(input.tracks)||
  input.tracks.length<1||input.tracks.length>12)bad('MOTION_REQUEST_INVALID',400);
 const frame_rate={num:input.frame_rate.num,den:input.frame_rate.den},total=input.duration_frames;
 const sample=input.sample_frames??[0,Math.floor(total/4),Math.floor(total/2),Math.floor(total*3/4),total];
 if(!Array.isArray(sample)||sample.length<2||sample.length>120||
  sample[0]!==0||sample.at(-1)!==total||sample.some((f,i)=>
   !Number.isSafeInteger(f)||f<0||f>total||(i>0&&f<=sample[i-1])))
  bad('MOTION_SAMPLES_INVALID');
 const tracks=[],seen=new Set();let totalKeys=0;
 for(const t of input.tracks){
  const checked=validateTrack(t,total,frame_rate),id=checked.target_id+':'+checked.property;
  if(seen.has(id))bad('MOTION_DUPLICATE_PROPERTY');
  seen.add(id);tracks.push(checked);totalKeys+=checked.keyframes.length;
 }
 if(totalKeys>144)bad('MOTION_TOO_MANY_KEYFRAMES');
 const samples=sample.map(frame=>({frame,
  t_us:Number((BigInt(frame)*1000000n*BigInt(frame_rate.den)+BigInt(frame_rate.num)/2n)/BigInt(frame_rate.num)),
  values:tracks.map(t=>({target_id:t.target_id,property:t.property,
   value:+(input.reduced_motion&&MOVING.has(t.property)?t.keyframes[0].value:
    valueAt(t.keyframes,frame)).toFixed(6)}))}));
 const canonical={project_id:input.project_id,scene_id:input.scene_id,
  source_sha256:input.source_sha256,expected_revision:input.expected_revision,
  frame_rate,duration_frames:total,reduced_motion:input.reduced_motion,tracks,sample_frames:sample};
 return {schema_version:1,status:'REVIEW_ONLY',project_id:input.project_id,scene_id:input.scene_id,
  source_sha256:input.source_sha256,source_revision:input.expected_revision,
  proposal_sha256:digest(canonical),frame_rate,duration_frames:total,
  sample_count:samples.length,total_keyframes:totalKeys,samples,
  applied_reduced_motion:input.reduced_motion,motion_blur_rendered:false,
  publication_allowed:false,approved:false,persisted:false,
  caveat:'Deterministic preview values only. Renderer integration, source-authority verification and human motion/flash QA remain required.'};
}

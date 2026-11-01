/**
 * P17-C01/C02: pure, fail-closed frame boundary planner.
 * A data-only preview. Never decodes, renders, alters a source, or publishes.
 * Version and boundary attestations MUST come from a trusted server at integration.
 */
import {createHash} from 'node:crypto';

const HASH=/^[0-9a-f]{64}$/;
const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const TYPES=new Set(['hard_cut','match_on_action','j_cut','l_cut']);
const SAFE=[[24,1],[25,1],[30,1],[60,1],[24000,1001],[30000,1001]];
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{status,code})};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const vec=v=>Array.isArray(v)&&v.length===2&&v.every(n=>finite(n,-1,1));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const deltaAngle=(a,b)=>Math.abs((a-b+540)%360-180);
const framesToUs=(f,fps)=>Number((BigInt(f)*1000000n*BigInt(fps.den)
  +BigInt(fps.num)/2n)/BigInt(fps.num));
function fpsValid(fps){
 return fps&&Number.isSafeInteger(fps.num)&&Number.isSafeInteger(fps.den)&&
  SAFE.some(([n,d])=>n===fps.num&&d===fps.den);
}
function boundary(x,role){
 if(!x||typeof x!=='object'||Array.isArray(x)||
    !Number.isSafeInteger(x.frame)||x.frame<0||
    !HASH.test(x.image_sha256)||
    !finite(x.camera_yaw_deg,-360,360)||
    !vec(x.subject_anchor)||!vec(x.motion_vector)||
    !finite(x.mean_luma,0,1)||!finite(x.hue_deg,0,360)||
    !finite(x.audio_rms_dbfs,-120,0))
   fail('BOUNDARY_DESCRIPTOR_INVALID',422);
 return {
   frame:x.frame,image_sha256:x.image_sha256,camera_yaw_deg:x.camera_yaw_deg,
   subject_anchor:[...x.subject_anchor],motion_vector:[...x.motion_vector],
   mean_luma:x.mean_luma,hue_deg:x.hue_deg,
   audio_rms_dbfs:x.audio_rms_dbfs,role
 };
}
function source(s){
 if(!s||typeof s!=='object'||Array.isArray(s)||
    !SLUG.test(s.scene_id)||!HASH.test(s.source_sha256)||
    !SLUG.test(s.approved_version_id)||
    !fpsValid(s.fps)||!Number.isSafeInteger(s.frames)||s.frames<2||s.frames>432000||
    !Number.isSafeInteger(s.audio_prehandle_frames)||
    !Number.isSafeInteger(s.audio_posthandle_frames)||
    s.audio_prehandle_frames<0||s.audio_posthandle_frames<0||
    s.audio_prehandle_frames>240||s.audio_posthandle_frames>240)
   fail('TRANSITION_SOURCE_INVALID',422);
 const entry=boundary(s.entry,'entry');
 const exit=boundary(s.exit,'exit');
 if(entry.frame!==0||exit.frame!==s.frames-1)
   fail('BOUNDARY_FRAME_ID_MISMATCH',422);
 return {scene_id:s.scene_id,source_sha256:s.source_sha256,
  approved_version_id:s.approved_version_id,fps:{...s.fps},frames:s.frames,
  entry,exit,
  audio_prehandle_frames:s.audio_prehandle_frames,
  audio_posthandle_frames:s.audio_posthandle_frames};
}
function continuity(left,right){
 const a=left.exit,b=right.entry;
 const issues=[];
 const yaw_diff=deltaAngle(a.camera_yaw_deg,b.camera_yaw_deg);
 const anchor_shift=distance(a.subject_anchor,b.subject_anchor);
 const luma_diff=Math.abs(a.mean_luma-b.mean_luma);
 const hue_diff=deltaAngle(a.hue_deg,b.hue_deg);
 const normA=Math.hypot(...a.motion_vector),normB=Math.hypot(...b.motion_vector);
 let motion_angle=normA<=0.1&&normB<=0.1?0:180;
 if(normA>0.1&&normB>0.1){
  const cosine=(a.motion_vector[0]*b.motion_vector[0]+a.motion_vector[1]*b.motion_vector[1])/(normA*normB);
  motion_angle=Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI;
 }
 if(yaw_diff>60)issues.push('CAMERA_DIRECTION_DISCONTINUITY');
 if(anchor_shift>0.45)issues.push('SUBJECT_ANCHOR_DISCONTINUITY');
 if(luma_diff>0.24)issues.push('EXPOSURE_DISCONTINUITY');
 if(hue_diff>75)issues.push('PALETTE_DISCONTINUITY');
 if(motion_angle>45)issues.push('MOTION_DIRECTION_DISCONTINUITY');
 return {yaw_diff_deg:+yaw_diff.toFixed(2),
  anchor_shift:+anchor_shift.toFixed(4),luma_diff:+luma_diff.toFixed(4),
  hue_diff_deg:+hue_diff.toFixed(2),motion_angle_deg:+motion_angle.toFixed(2),
  issues,match_on_action_supported:normA>0.1&&normB>0.1&&motion_angle<=45&&anchor_shift<=0.45};
}
export function proposeContinuityTransition(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).some(k=>!['schema_version','left','right','transition','overlap_frames'].includes(k))||
   input.schema_version!==1||!TYPES.has(input.transition))
   fail('TRANSITION_REQUEST_INVALID',400);
 const left=source(input.left),right=source(input.right);
 if(left.scene_id===right.scene_id||left.approved_version_id===right.approved_version_id||
    left.fps.num!==right.fps.num||left.fps.den!==right.fps.den)
   fail('TRANSITION_SOURCE_INCOMPATIBLE',422);
 const requested=input.overlap_frames??0;
 if(!Number.isSafeInteger(requested)||requested<0||requested>120)
   fail('TRANSITION_OVERLAP_INVALID',400);
 if((input.transition==='hard_cut'||input.transition==='match_on_action')&&requested!==0)
   fail('TRANSITION_OVERLAP_INVALID',400);
 if((input.transition==='j_cut'&&requested>right.audio_prehandle_frames)||
    (input.transition==='l_cut'&&requested>left.audio_posthandle_frames))
   fail('AUDIO_HANDLE_INSUFFICIENT',409);
 if(['j_cut','l_cut'].includes(input.transition)&&requested===0)
   fail('AUDIO_HANDLE_INSUFFICIENT',409);
 if(requested>=Math.min(left.frames,right.frames))
   fail('TRANSITION_BOUNDARY_EXCEEDED',409);
 const measured=continuity(left,right);
 const issues=[...measured.issues];
 if(input.transition==='match_on_action'&&!measured.match_on_action_supported)
   issues.push('MATCH_ON_ACTION_UNVERIFIED');
 const status=issues.length?'REVIEW':'READY_FOR_REVIEW';
 const operation={
   kind:input.transition,left_scene_id:left.scene_id,right_scene_id:right.scene_id,
   video_left_last_frame:left.frames-1,video_right_first_frame:0,
   video_boundary_us:framesToUs(left.frames,left.fps),
   audio_pre_overlap_frames:input.transition==='j_cut'?requested:0,
   audio_post_overlap_frames:input.transition==='l_cut'?requested:0,
   audio_overlap_us:framesToUs(requested,left.fps),
   exact_frame_rate:left.fps,source_approved_versions:{
     left:left.approved_version_id,right:right.approved_version_id
   }
 };
 const boundary_evidence={
     left:{scene_id:left.scene_id,version_id:left.approved_version_id,
       source_sha256:left.source_sha256,frame:left.exit.frame,image_sha256:left.exit.image_sha256},
     right:{scene_id:right.scene_id,version_id:right.approved_version_id,
       source_sha256:right.source_sha256,frame:right.entry.frame,image_sha256:right.entry.image_sha256}
   };
 const result={schema_version:1,status,boundary_evidence,
   metrics:measured,issues,
   operation,status_explanation:issues.length?'Technical continuity requires independent review':'No configured continuity thresholds exceeded',
   proposal_sha256:hash({left:left.source_sha256,right:right.source_sha256,
     left_version:left.approved_version_id,right_version:right.approved_version_id,
     boundary_evidence,operation,metrics:measured,issues}),
   approved:false,persisted:false,publication_allowed:false,
   caveat:'Data-only frame operation. Source approvals and boundary frame hashes need server-side proof. Actual audio, subtitles and visual continuity require human review.'};
 return result;
}

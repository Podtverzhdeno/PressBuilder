/** P17-C03: server-attested immutable boundary-frame evidence. Never publishes cuts. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA=/^[a-f0-9]{64}$/;
const FPS=new Set(['24/1','25/1','30/1','60/1','24000/1001','30000/1001']);
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
const digest=x=>createHash('sha256').update(x).digest('hex');
function command(bin,args,exec){
  const r=exec(bin,args,{encoding:null,timeout:12000,maxBuffer:2*1024*1024,
    stdio:['ignore','pipe','pipe']});
  if(r.error||r.status!==0||!Buffer.isBuffer(r.stdout))fail('BOUNDARY_MEDIA_PROBE_FAILED',422);
  return r.stdout;
}
function mediaInfo(file,ffprobe,exec){
  const raw=command(ffprobe,['-v','error','-select_streams','v:0','-count_frames',
    '-show_entries','stream=codec_name,avg_frame_rate,nb_read_frames',
    '-show_entries','format=duration','-of','json',file],exec);
  let info;try{info=JSON.parse(raw.toString('utf8'))}catch{fail('BOUNDARY_PROBE_INVALID',422)}
  const v=info.streams?.[0],fps=v?.avg_frame_rate;
  const frames=Number(v?.nb_read_frames),duration=Number(info.format?.duration);
  if(v?.codec_name!=='h264'||!FPS.has(fps)||!Number.isSafeInteger(frames)||
    frames<2||frames>2700||!Number.isFinite(duration)||duration<=0||duration>45)
    fail('BOUNDARY_MEDIA_UNSUPPORTED',422);
  const [num,den]=fps.split('/').map(Number);
  if(Math.abs(frames*den/num-duration)>Math.max(0.08,2*den/num))
    fail('BOUNDARY_FRAME_PTS_MISMATCH',422);
  return {frames,duration,fps:{num,den}};
}
function exactJpeg(file,frame,ffmpeg,exec){
  const bytes=command(ffmpeg,['-hide_banner','-nostdin','-v','error','-i',file,
    '-vf','select=eq(n\\,'+frame+'),scale=160:90:flags=area',
    '-frames:v','1','-c:v','mjpeg','-q:v','4','-f','image2pipe','pipe:1'],exec);
  if(bytes.length<150||bytes.length>1024*1024||bytes[0]!==0xff||bytes[1]!==0xd8||
    bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)fail('BOUNDARY_FRAME_DECODE_INVALID',422);
  return {frame,image_sha256:digest(bytes),jpeg_size:bytes.length};
}
export function continuityBoundaryService({versions,enabled=false,ffmpeg='ffmpeg',ffprobe='ffprobe',exec=spawnSync}){
  function allowed(id,left,right){
    if(!enabled)fail('CONTINUITY_PREVIEW_DISABLED',501);
    if(!ID.test(id)||!ID.test(left)||!ID.test(right)||left===right)
      fail('BOUNDARY_SCENE_IDS_INVALID',400);
  }
  function inspect(id,scene){
    const approval=versions.approved(id,scene);
    const a=approval.artifact;
    if(!a||!a.absolute_file||!SHA.test(a.sha256)||a.qa?.verdict!=='PASS'||
      !/^[0-9a-f]{16}$/.test(approval.version_id||'')||
      !Number.isSafeInteger(approval.revision)||approval.revision<1)
      fail('BOUNDARY_SCENE_NOT_APPROVED',409);
    const st=fs.lstatSync(a.absolute_file);
    if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size!==a.size||
      st.size<1024||st.size>64*1024*1024)fail('BOUNDARY_MEDIA_REJECTED',422);
    // P08 verifies MP4 and existing P03 images; exact boundary JPEGs are decoded afresh.
    const info=mediaInfo(a.absolute_file,ffprobe,exec);
    if(Math.abs(Number(a.fps)-info.fps.num/info.fps.den)>0.025||
      Math.abs(Number(a.duration)-info.duration)>0.08)
      fail('BOUNDARY_SOURCE_METADATA_DRIFT',409);
    const entry=exactJpeg(a.absolute_file,0,ffmpeg,exec);
    const exit=exactJpeg(a.absolute_file,info.frames-1,ffmpeg,exec);
    const again=versions.approved(id,scene),file=again.artifact;
    if(again.revision!==approval.revision||again.version_id!==approval.version_id||
      file?.sha256!==a.sha256||file?.size!==a.size||file?.qa?.verdict!=='PASS')
      fail('BOUNDARY_APPROVAL_CHANGED_DURING_READ',409);
    return {scene_id:scene,approved_version_id:a.version_id,
      approval_revision:approval.revision,mp4_sha256:a.sha256,
      fps:info.fps,frames:info.frames,duration:info.duration,entry,exit};
  }
  function context(id,left,right){
    allowed(id,left,right);
    const a=inspect(id,left),b=inspect(id,right);
    if(a.fps.num!==b.fps.num||a.fps.den!==b.fps.den)
      fail('BOUNDARY_FPS_INCOMPATIBLE',422);
    return {schema_version:1,project_id:id,status:'REVIEW_ONLY',left:a,right:b,
      source_pair_sha256:digest(JSON.stringify({a,b})),
      allowed_transitions:['hard_cut'],unavailable:['match_on_action','j_cut','l_cut'],
      caveat:'Exact first/last JPEGs decoded from P08-verified MP4. Camera/motion and audio handles are not attested. No automatic edit, approval or release.'};
  }
  function preview(id,request){
    if(!request||typeof request!=='object'||Array.isArray(request)||
      Object.keys(request).some(k=>!['left_scene_id','right_scene_id','expected_pair_sha256','transition'].includes(k))||
      !ID.test(request.left_scene_id)||!ID.test(request.right_scene_id)||
      !SHA.test(request.expected_pair_sha256))fail('BOUNDARY_REQUEST_INVALID',400);
    if(request.transition!=='hard_cut')
      fail('BOUNDARY_AUDIO_MOTION_NOT_ATTESTED',422);
    const ctx=context(id,request.left_scene_id,request.right_scene_id);
    if(ctx.source_pair_sha256!==request.expected_pair_sha256)
      fail('BOUNDARY_SOURCE_STALE',409);
    return {schema_version:1,project_id:id,status:'REVIEW',
      proposal_sha256:digest(JSON.stringify({source:ctx.source_pair_sha256,transition:'hard_cut'})),
      source_pair_sha256:ctx.source_pair_sha256,transition:'hard_cut',
      left_boundary:ctx.left.exit,right_boundary:ctx.right.entry,
      video_left_last_frame:ctx.left.frames-1,video_right_first_frame:0,
      issues:['CAMERA_AND_MOTION_NOT_ATTESTED','HUMAN_EDITOR_REVIEW_REQUIRED'],
      approved:false,persisted:false,publication_allowed:false};
  }
  return {context,preview};
}

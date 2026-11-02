/** M58-R03: independently decode the active P05 master; technical-only proof.
 * Trusted local out directory, no network/command shell, no release mutation.
 * Byte integrity is always checked before AND after media decoding.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectP05ActiveRelease} from './release-media-integrity.mjs';

const bad=(code,status=422)=>{throw Object.assign(new Error(code),{code,status})};
function tool(binary,args,code,timeout){
  const result=spawnSync(binary,args,{
    encoding:'utf8',timeout,maxBuffer:256*1024,windowsHide:true,
    shell:false,stdio:['ignore','pipe','pipe'],
  });
  if(result.error||result.status!==0||result.signal)
    bad(code,422);
  return result.stdout;
}
function rational(value){
  if(typeof value!=='string'||!/^\d{1,8}\/\d{1,8}$/.test(value))return null;
  const [n,d]=value.split('/').map(Number);
  return d>0&&n>0?n/d:null;
}
/** A six-scene real-media preflight, not a production release authorization. */
export function inspectP05DecodedMedia({
  rootOut,projectId,expectedMasterSha256=null,
  ffprobe='ffprobe',ffmpeg='ffmpeg',
}={}){
  // No arbitrary external executables from client payloads. Paths to binaries
  // may only be configured by trusted server-side code.
  const attestation=inspectP05ActiveRelease({rootOut,projectId,expectedMasterSha256});
  if(attestation.scenes!==6)bad('M58_DECODE_SIX_SCENES_REQUIRED');
  const release=path.join(path.resolve(rootOut),'releases',projectId,attestation.release_id);
  const manifest=JSON.parse(fs.readFileSync(path.join(release,'manifest.json'),'utf8'));
  const master=path.join(release,'final.mp4');
  const height=manifest.target_height,fps=manifest.target_fps;
  if(!Number.isSafeInteger(height)||height<90||height>1080||
    !Number.isSafeInteger(fps)||fps<20||fps>60)bad('M58_DECODE_TARGET_INVALID');
  const expectedDuration=manifest.scenes.reduce((sum,s)=>sum+Number(s.duration),0)-
    manifest.scenes.slice(0,-1).reduce((sum,s)=>sum+
      (s.transition_after?.type==='crossfade'?Number(s.transition_after.duration):0),0);
  if(!Number.isFinite(expectedDuration)||expectedDuration<1||
    expectedDuration>120)bad('M58_DECODE_DURATION_BUDGET');
  const raw=tool(ffprobe,[
    '-v','error','-count_frames',
    '-show_entries','stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,sample_rate,channels:format=duration',
    '-of','json',master,
  ],'M58_DECODE_PROBE_FAILED',30000);
  let probe;
  try{probe=JSON.parse(raw)}catch{bad('M58_DECODE_PROBE_INVALID')}
  const streams=probe.streams;
  if(!Array.isArray(streams)||streams.length>6)bad('M58_DECODE_STREAMS_INVALID');
  const videos=streams.filter(s=>s.codec_type==='video');
  const audios=streams.filter(s=>s.codec_type==='audio');
  if(videos.length!==1||audios.length!==1)bad('M58_DECODE_TRACKS_INVALID');
  const v=videos[0],a=audios[0];
  const frameCount=Number(v.nb_read_frames),realFps=rational(v.avg_frame_rate);
  const duration=Number(probe.format?.duration);
  if(v.codec_name!=='h264'||v.height!==height||
    v.width!==Math.round(height*16/9)||!realFps||
    Math.abs(realFps-fps)>0.05||
    !Number.isSafeInteger(frameCount)||frameCount<1||
    a.codec_name!=='aac'||Number(a.sample_rate)!==48000||a.channels!==2||
    !Number.isFinite(duration)||duration<=0||duration>121)
    bad('M58_DECODE_STREAM_FORMAT_INVALID');
  if(Math.abs(duration-expectedDuration)>0.25||
    Math.abs(frameCount/realFps-expectedDuration)>0.25)
    bad('M58_DECODE_TIMELINE_DRIFT');

  // Decode every video frame and audio packet with FFmpeg. The null muxer
  // deliberately does not generate or modify any media.
  tool(ffmpeg,[
    '-hide_banner','-nostdin','-loglevel','error',
    '-xerror','-err_detect','explode','-i',master,
    '-map','0:v:0','-map','0:a:0','-f','null','-',
  ],'M58_DECODE_FRAME_OR_PCM_FAILED',120000);
  const after=inspectP05ActiveRelease({
    rootOut,projectId,expectedMasterSha256:attestation.master_sha256,
  });
  if(after.release_id!==attestation.release_id||
     after.p05_manifest_sha256!==attestation.p05_manifest_sha256)
    bad('M58_DECODE_SOURCE_CHANGED_DURING_READ',409);
  return {
    schema_version:1,scope:'SIX_SCENE_SYNTHETIC_COMPATIBLE_MEDIA_DECODE',
    status:'MEDIA_DECODED_FOR_REVIEW',may_publish:false,may_deploy:false,
    project_id:projectId,release_id:attestation.release_id,
    master_sha256:attestation.master_sha256,
    p05_manifest_sha256:attestation.p05_manifest_sha256,
    scene_count:attestation.scenes,video_codec:v.codec_name,
    audio_codec:a.codec_name,frame_count:frameCount,
    fps:realFps,height,width:v.width,audio_sample_rate:Number(a.sample_rate),
    audio_channels:a.channels,
    expected_duration_sec:expectedDuration,decoded_duration_sec:duration,
    video_decoded:true,audio_decoded:true,
    scene_content_reviewed:false,voice_alignment_verified:false,
    licensing_verified:false,independent_review_verified:false,
    caveat:'FFprobe counted real frames; FFmpeg decoded video/audio to a null muxer. No source licensing, audio loudness/sync, content readability, flash threshold, human review or production authorization.',
  };
}

/** M58-R03: independently decode the active P05 master; technical-only proof.
 * Trusted local out directory, no network/command shell, no release mutation.
 * Byte integrity is always checked before AND after media decoding.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {inspectP05ActiveRelease} from './release-media-integrity.mjs';
import {analyzePcm16leStereo} from './release-pcm-qc.mjs';

const bad=(code,status=422)=>{throw Object.assign(new Error(code),{code,status})};
function tool(binary,args,code,timeout){
  const result=spawnSync(binary,args,{
    encoding:'utf8',timeout,maxBuffer:256*1024,windowsHide:true,
    shell:false,stdio:['ignore','pipe','pipe'],
  });
  if(result.error||result.status!==0||result.signal)
    bad(code,422);
  return result;
}
function rational(value){
  if(typeof value!=='string'||!/^\d{1,8}\/\d{1,8}$/.test(value))return null;
  const [n,d]=value.split('/').map(Number);
  return d>0&&n>0?n/d:null;
}
const finiteSeconds=x=>{
  if(x===null||x===undefined||x==='N/A'||x==='')return null;
  const n=Number(x);
  return Number.isFinite(n)&&n>=-1&&n<200?n:null;
};
export function parseLongBlackIntervals(stderr,minDurationSec=0.75){
  // FFmpeg's blackdetect writes a bounded info log; never trust raw log as
  // approval. Collect only numeric, monotonic intervals above threshold.
  if(typeof stderr!=='string'||stderr.length>262144)return [];
  const out=[];
  const pattern=/black_start:([0-9]+(?:\.[0-9]+)?)\s+black_end:([0-9]+(?:\.[0-9]+)?)\s+black_duration:([0-9]+(?:\.[0-9]+)?)/g;
  for(const match of stderr.matchAll(pattern)){
    const start=Number(match[1]),end=Number(match[2]),dur=Number(match[3]);
    if(Number.isFinite(start)&&Number.isFinite(end)&&Number.isFinite(dur)&&
       start>=0&&end>=start&&end<=122&&
       Math.abs(end-start-dur)<0.06&&dur>=minDurationSec){
      out.push({start_sec:start,end_sec:end,duration_sec:dur});
      if(out.length>=16)break;
    }
  }
  return out;
}
export function assessContainerAvTiming(video,audio,{maxOffsetMs=250}={}){
  if(!Number.isSafeInteger(maxOffsetMs)||maxOffsetMs<0||maxOffsetMs>2000)
    bad('M58_DECODE_POLICY_INVALID',400);
  const vStart=finiteSeconds(video?.start_time);
  const aStart=finiteSeconds(audio?.start_time);
  const vDuration=finiteSeconds(video?.duration);
  const aDuration=finiteSeconds(audio?.duration);
  if([vStart,aStart,vDuration,aDuration].some(x=>x===null))
    bad('M58_DECODE_STREAM_TIMESTAMP_MISSING');
  const avStartOffsetMs=Math.round((aStart-vStart)*1000);
  const avEndOffsetMs=Math.round(((aStart+aDuration)-(vStart+vDuration))*1000);
  if(Math.abs(avStartOffsetMs)>maxOffsetMs||Math.abs(avEndOffsetMs)>maxOffsetMs)
    bad('M58_DECODE_AV_CONTAINER_DRIFT');
  return {start_offset_ms:avStartOffsetMs,end_offset_ms:avEndOffsetMs};
}
/** A six-scene real-media preflight, not a production release authorization. */
export function inspectP05DecodedMedia({
  rootOut,projectId,expectedMasterSha256=null,
}={}){
  // Fixed program names only. No shell or user-defined binary or filter graph.
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
  const raw=tool('ffprobe',[
    '-v','error','-count_frames',
    '-show_entries','stream=codec_type,codec_name,width,height,avg_frame_rate,nb_read_frames,sample_rate,channels,start_time,duration:format=duration',
    '-of','json',master,
  ],'M58_DECODE_PROBE_FAILED',30000).stdout;
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
  // Container stream PTS/DTS consistency only, not perceptual word/lip sync.
  const {start_offset_ms:avStartOffsetMs,end_offset_ms:avEndOffsetMs}=
    assessContainerAvTiming(v,a);

  // Decode ALL video frames and audio samples; concurrently flag long fully
  // black runs. Short transitions and deliberate dark scenes need a reviewer,
  // not automatic claims about their artistic correctness.
  const decode=tool('ffmpeg',[
    '-hide_banner','-nostats','-nostdin','-loglevel','info',
    '-xerror','-err_detect','explode','-i',master,
    '-map','0:v:0','-map','0:a:0',
    '-vf','blackdetect=d=0.75:pix_th=0.04:pic_th=0.995',
    '-f','null','-',
  ],'M58_DECODE_FRAME_OR_PCM_FAILED',120000);
  const longBlackIntervals=parseLongBlackIntervals(decode.stderr);
  // Decode bounded, signed 16-bit stereo PCM to memory only (<=121 seconds).
  // No temporary audio file, user-provided binary, command shell or arguments.
  const pcmRun=spawnSync('ffmpeg',[
    '-hide_banner','-nostats','-nostdin','-loglevel','error',
    '-xerror','-err_detect','explode','-i',master,
    '-map','0:a:0','-vn','-ac','2','-ar','48000',
    '-c:a','pcm_s16le','-f','s16le','-',
  ],{encoding:null,timeout:120000,maxBuffer:26*1024*1024,
     windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  if(pcmRun.error||pcmRun.status!==0||pcmRun.signal)
    bad('M58_PCM_DECODE_FAILED');
  const pcmQuality=analyzePcm16leStereo(pcmRun.stdout);
  // PCM length is checked against the *video* timeline, not just container
  // audio metadata; padding near AAC packet boundaries is tolerated.
  if(Math.abs(pcmQuality.pcm_duration_sec-expectedDuration)>0.25)
    bad('M58_PCM_TIMELINE_DRIFT');
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
    av_container_start_offset_ms:avStartOffsetMs,
    av_container_end_offset_ms:avEndOffsetMs,
    av_container_timestamps_verified:true,
    long_black_intervals:longBlackIntervals,
    manual_visual_review_required:longBlackIntervals.length>0,
    pcm_quality:pcmQuality,
    manual_audio_review_required:pcmQuality.manual_audio_review_required,
    media_quality_verdict:longBlackIntervals.length>0||
      pcmQuality.manual_audio_review_required?'REVIEW':'TECHNICAL_PASS',
    scene_content_reviewed:false,voice_alignment_verified:false,
    licensing_verified:false,independent_review_verified:false,
    caveat:'Container timing, full A/V decode and 48kHz stereo PCM sample peak/RMS/silence measured. Black, clipping or long silence requires review. No LUFS, true peak, lip-sync, font/flash, licensing or release authorization.',
  };
}

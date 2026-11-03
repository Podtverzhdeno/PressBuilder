/** M58-R20: create review-only evidence from an actual P05 verified master.
 * Only server-held assembly.current()/download() may select the path.
 * No user path, user report, publish override, signing key or network action.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {screenRealStereoPcm} from './real-master-stereo-qc.mjs';
const MAX_SECONDS=60,MAX_MP4_BYTES=128*1024*1024;
const MAX_PCM_BYTES=MAX_SECONDS*48000*4;
const SHA=/^[a-f0-9]{64}$/,PROJECT=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const RELEASE=/^[a-f0-9-]{36}$/;
const bad=code=>{throw Object.assign(new Error(code),{code,status:422})};
function hashFile(file){
 const fd=fs.openSync(file,'r');
 const digest=createHash('sha256'),chunk=Buffer.allocUnsafe(1024*1024);
 try{
  let count=0;
  for(;;){
   const read=fs.readSync(fd,chunk,0,chunk.length,null);
   if(!read)break;
   count+=read;
   if(count>MAX_MP4_BYTES)bad('M58_REAL_MASTER_TOO_LARGE');
   digest.update(chunk.subarray(0,read));
  }
  return digest.digest('hex');
 }finally{fs.closeSync(fd)}
}
export function inspectCurrentMasterStereo({
 assembly,projectId,ffmpegBin=process.env.FFMPEG||'ffmpeg',
}={}){
 if(typeof projectId!=='string'||!PROJECT.test(projectId)||
    typeof assembly?.current!=='function'||
    typeof assembly?.download!=='function'||
    typeof ffmpegBin!=='string'||!ffmpegBin||ffmpegBin.length>512)
   bad('M58_REAL_AUDIT_INPUT_INVALID');
 const release=assembly.current(projectId);
 const manifest=release?.manifest;
 const duration=manifest?.output?.qa?.metadata?.duration;
 if(!release||!RELEASE.test(release.release_id??'')||
    manifest?.schemaVersion!==1||manifest.project!==projectId||
    manifest.release_id!==release.release_id||
    manifest.output?.qa?.verdict!=='PASS'||
    !SHA.test(manifest.output?.sha256??'')||
    !Number.isSafeInteger(manifest.output?.bytes)||
    manifest.output.bytes<1024||manifest.output.bytes>MAX_MP4_BYTES||
    typeof duration!=='number'||!Number.isFinite(duration)||
    duration<.3||duration>MAX_SECONDS||
    !Array.isArray(manifest.scenes)||manifest.scenes.length<2||
    manifest.scenes.length>12||
    manifest.scenes.some(s=>typeof s?.id!=='string'||!PROJECT.test(s.id)||
      !SHA.test(s.sha256??'')||
      typeof s.duration!=='number'||!Number.isFinite(s.duration)||
      s.duration<=0||s.duration>MAX_SECONDS))
   bad('M58_REAL_MASTER_NOT_VERIFIED');
 let file;
 try{file=assembly.download(projectId,release.release_id)}
 catch{bad('M58_REAL_MASTER_NOT_VERIFIED')}
 if(typeof file!=='string'||!file)bad('M58_REAL_MASTER_NOT_VERIFIED');
 let stat;
 try{stat=fs.statSync(file)}
 catch{bad('M58_REAL_MASTER_NOT_VERIFIED')}
 if(!stat.isFile()||stat.size!==manifest.output.bytes||
    hashFile(file)!==manifest.output.sha256)
   bad('M58_REAL_MASTER_HASH_MISMATCH');
 const decode=spawnSync(ffmpegBin,[
  '-hide_banner','-nostats','-nostdin','-loglevel','error',
  '-xerror','-err_detect','explode','-i',file,
  '-map','0:a:0','-vn','-ac','2','-ar','48000',
  '-c:a','pcm_s16le','-t',String(MAX_SECONDS),'-f','s16le','-',
 ],{shell:false,windowsHide:true,encoding:null,timeout:90000,
   maxBuffer:MAX_PCM_BYTES+262144,stdio:['ignore','pipe','pipe']});
 if(decode.error||decode.signal||decode.status!==0||
    !Buffer.isBuffer(decode.stdout)||
    decode.stdout.length<.3*48000*4||
    decode.stdout.length>MAX_PCM_BYTES)
   bad('M58_REAL_AUDIO_DECODE_FAILED');
 const qc=screenRealStereoPcm(decode.stdout,{expectedDurationSec:duration});
 // A file replacement, truncation or concurrent change of current pointer
 // invalidates the receipt even if FFmpeg successfully decoded earlier bytes.
 try{stat=fs.statSync(file)}
 catch{bad('M58_REAL_MASTER_CHANGED_DURING_ANALYSIS')}
 if(!stat.isFile()||stat.size!==manifest.output.bytes||
    hashFile(file)!==manifest.output.sha256)
   bad('M58_REAL_MASTER_CHANGED_DURING_ANALYSIS');
 const current=assembly.current(projectId);
 if(current?.release_id!==release.release_id||
    current?.manifest?.output?.sha256!==manifest.output.sha256)
   bad('M58_REAL_MASTER_STALE_RELEASE');
 const record={
  schema_version:1,
  scope:'P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY',
  project_id:projectId,release_id:release.release_id,
  release_sha256:manifest.output.sha256,
  release_bytes:manifest.output.bytes,
  source_scene_hashes:manifest.scenes.map(x=>({scene_id:x.id,
   declared_source_sha256:x.sha256})),
  provenance:'P05_CURRENT_AND_DOWNLOAD_SERVER_VERIFIED_HASH_BEFORE_AND_AFTER',
  issued_by:'SERVER_PROCESS_LOCAL_AUDIT',
  cryptographically_signed:false,source_scene_files_rehashed_now:false,
  decoded_master_audio:qc,manual_review_required:qc.manual_audio_review_required,
  audio_video_pts_alignment_verified:false,
  human_listening_verified:false,source_rights_verified:false,
  may_publish:false,may_deploy:false,
 };
 return {...record,report_sha256:createHash('sha256')
  .update(JSON.stringify(record)).digest('hex')};
}

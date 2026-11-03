import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {screenRealStereoPcm} from '../server/real-master-stereo-qc.mjs';
import {inspectCurrentMasterStereo} from '../server/current-master-audio-evidence.mjs';

const RATE=48000,SECONDS=2.4,FRAME_BYTES=4;
const ready=['ffmpeg','ffprobe'].every(exe=>
 spawnSync(exe,['-version'],{stdio:'ignore',timeout:4000}).status===0);
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const RID='00000000-0000-0000-0000-000000000222';
function pcm({invert=false,dropRight=false}={}){
 const b=Buffer.alloc(Math.round(RATE*SECONDS)*FRAME_BYTES);
 for(let f=0;f<b.length/FRAME_BYTES;f++){
  const t=f/RATE;
  const wave=Math.round(.15*32767*Math.sin(2*Math.PI*220*t));
  const affected=t>=.6&&t<1.8;
  b.writeInt16LE(wave,f*FRAME_BYTES);
  b.writeInt16LE(affected&&dropRight?0:affected&&invert?-wave:wave,f*FRAME_BYTES+2);
 }
 return b;
}
function media(dir,mode='clean'){
 const file=path.join(dir,mode+'.mp4');
 const source=path.join(dir,mode+'.pcm');
 fs.writeFileSync(source,pcm({invert:mode==='phase',dropRight:mode==='drop'}));
 const args=['-hide_banner','-nostdin','-loglevel','error','-y',
  '-f','s16le','-ar','48000','-ac','2','-i',source,
  '-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=2.4',
  '-map','1:v:0','-map','0:a:0','-t','2.4',
  '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
  ...(mode==='mono'?['-ac','1']:[]),
  '-c:a','aac','-b:a','160k',file];
 const res=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:45000});
 assert.equal(res.status,0,String(res.stderr).slice(-1000));
 fs.rmSync(source);
 return file;
}
function releaseFor(file){
 return {release_id:RID,manifest:{
  schemaVersion:1,project:'real-audio-test',release_id:RID,
  scenes:[{id:'s01',sha256:'a'.repeat(64),duration:1.2},
   {id:'s02',sha256:'b'.repeat(64),duration:1.2}],
  output:{sha256:digest(file),bytes:fs.statSync(file).size,
   qa:{verdict:'PASS',metadata:{duration:SECONDS}}}}};
}
function assemblyFor(file,release=releaseFor(file)){
 return {current:()=>release,download:()=>file};
}
const fails=(fn,code)=>assert.throws(fn,e=>e?.code===code,code);

test('M58-R20 arbitrary stereo PCM clean, antiphase and asymmetric dropout are advisory-only',()=>{
 const clean=screenRealStereoPcm(pcm(),{expectedDurationSec:SECONDS});
 assert.equal(clean.issues.length,0);
 assert.equal(clean.scanned_windows,8);
 assert.equal(clean.may_publish,false);
 assert.equal(clean.audio_video_pts_alignment_verified,false);
 const phase=screenRealStereoPcm(pcm({invert:true}),{expectedDurationSec:SECONDS});
 assert.ok(phase.issues.some(i=>i.code==='POSSIBLE_MONO_FOLD_DOWN_CANCELLATION'));
 assert.ok(phase.issues.some(i=>i.window_start_sec>=.9&&i.window_start_sec<1.5));
 const dropout=screenRealStereoPcm(pcm({dropRight:true}),{expectedDurationSec:SECONDS});
 assert.ok(dropout.issues.some(i=>i.code==='POSSIBLE_ONE_CHANNEL_DROPOUT'));
 assert.equal(dropout.may_deploy,false);
 assert.equal(dropout.source_rights_verified,false);
});
test('M58-R20 bounded and malformed PCM fails closed',()=>{
 fails(()=>screenRealStereoPcm(Buffer.alloc(3)),'M58_REAL_AUDIO_PCM_INVALID');
 fails(()=>screenRealStereoPcm(Buffer.alloc(4)),'M58_REAL_AUDIO_PCM_INVALID');
 fails(()=>screenRealStereoPcm(pcm(),{expectedDurationSec:4}),
  'M58_REAL_AUDIO_DURATION_MISMATCH');
 fails(()=>screenRealStereoPcm(Buffer.alloc(60*48000*4+4)),
  'M58_REAL_AUDIO_PCM_INVALID');
});
test('M58-R20 two genuine 2.4s MP4/AAC masters: SHA-attested current release and real antiphase',{
 timeout:180000,skip:!ready,
},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-r20-'));
 try{
  const clean=media(root,'clean'),phase=media(root,'phase');
  const normal=inspectCurrentMasterStereo({
   assembly:assemblyFor(clean),projectId:'real-audio-test'});
  assert.equal(normal.scope,'P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY');
  assert.equal(normal.release_sha256,digest(clean));
  assert.match(normal.report_sha256,/^[a-f0-9]{64}$/);
  assert.equal(normal.decoded_master_audio.issues.length,0);
  assert.equal(normal.decoded_master_audio.scanned_windows,8);
  assert.equal(normal.cryptographically_signed,false);
  assert.deepEqual(normal.source_audio_stream,{codec:'aac',channels:2,sample_rate_hz:48000});
  assert.equal(normal.source_scene_files_rehashed_now,false);
  assert.equal(normal.may_publish,false);
  assert.equal(normal.human_listening_verified,false);
  assert.deepEqual(normal.source_scene_hashes.map(x=>x.scene_id),['s01','s02']);
  assert.equal(normal.report_sha256,inspectCurrentMasterStereo({
   assembly:assemblyFor(clean),projectId:'real-audio-test'}).report_sha256);
  const changed=inspectCurrentMasterStereo({
   assembly:assemblyFor(phase),projectId:'real-audio-test'});
  assert.equal(changed.release_sha256,digest(phase));
  assert.notEqual(changed.release_sha256,normal.release_sha256);
  assert.ok(changed.decoded_master_audio.issues.some(x=>
   x.code==='POSSIBLE_MONO_FOLD_DOWN_CANCELLATION'));
  assert.equal(changed.manual_review_required,true);
  assert.equal(changed.may_publish,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('M58-R20 reject stale current pointer, mutated master, forged QA and duration',{
 timeout:180000,skip:!ready,
},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-r20-negative-'));
 try{
  const file=media(root,'clean');
  const r=releaseFor(file);
  const forge=structuredClone(r);
  forge.manifest.output.sha256='1'.repeat(64);
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(file,forge),
   projectId:'real-audio-test'}),'M58_REAL_MASTER_HASH_MISMATCH');
  const tooLong=structuredClone(r);
  tooLong.manifest.output.qa.metadata.duration=70;
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(file,tooLong),
   projectId:'real-audio-test'}),'M58_REAL_MASTER_NOT_VERIFIED');
  const badTimeline=structuredClone(r);
  badTimeline.manifest.scenes[0].duration=2.5;
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(file,badTimeline),
   projectId:'real-audio-test'}),'M58_REAL_MASTER_TIMELINE_INVALID');
  const duplicateScene=structuredClone(r);
  duplicateScene.manifest.scenes[1].id='s01';
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(file,duplicateScene),
   projectId:'real-audio-test'}),'M58_REAL_MASTER_TIMELINE_INVALID');
  const badTransition=structuredClone(r);
  badTransition.manifest.scenes[1].transition_after={type:'crossfade',duration:.3};
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(file,badTransition),
   projectId:'real-audio-test'}),'M58_REAL_MASTER_TIMELINE_INVALID');
  const mono=media(root,'mono');
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(mono),
   projectId:'real-audio-test'}),'M58_REAL_MASTER_AUDIO_LAYOUT_UNSUPPORTED');
  const badQa=structuredClone(r);
  badQa.manifest.output.qa.verdict='FAIL';
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(file,badQa),
   projectId:'real-audio-test'}),'M58_REAL_MASTER_NOT_VERIFIED');
  let calls=0;
  const switched={current:()=>++calls===1?r:{...r,release_id:'0'.repeat(36)},
   download:()=>file};
  fails(()=>inspectCurrentMasterStereo({assembly:switched,
   projectId:'real-audio-test'}),'M58_REAL_MASTER_STALE_RELEASE');
  const broken=path.join(root,'broken.mp4');fs.copyFileSync(file,broken);
  fs.appendFileSync(broken,'tampered');
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(broken,r),
   projectId:'real-audio-test'}),'M58_REAL_MASTER_HASH_MISMATCH');
  fails(()=>inspectCurrentMasterStereo({assembly:assemblyFor(file),
   projectId:'../forbidden'}),'M58_REAL_AUDIT_INPUT_INVALID');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

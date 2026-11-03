import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inspectCurrentMasterStereo} from '../server/current-master-audio-evidence.mjs';

const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ready=process.platform==='linux'&&['ffmpeg','ffprobe'].every(bin=>
 spawnSync(bin,['-version'],{stdio:'ignore',timeout:4000}).status===0);
const PROJECT='pinned-audio',RELEASE='00000000-0000-0000-0000-000000000521';
function fixture(root,name,frequency=320){
 const pcm=path.join(root,name+'.pcm'),mp4=path.join(root,name+'.mp4');
 const bytes=Buffer.alloc(48000*2.4*4);
 for(let i=0;i<bytes.length/4;i++){
  const t=i/48000,value=Math.round(.14*32767*Math.sin(2*Math.PI*frequency*t));
  bytes.writeInt16LE(value,4*i);bytes.writeInt16LE(value,4*i+2);
 }
 fs.writeFileSync(pcm,bytes);
 const result=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y',
  '-f','s16le','-ar','48000','-ac','2','-i',pcm,
  '-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=2.4',
  '-map','1:v:0','-map','0:a:0','-t','2.4',
  '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','160k',mp4],
 {timeout:35000,encoding:'utf8'});
 assert.equal(result.status,0,String(result.stderr).slice(-600));
 fs.rmSync(pcm,{force:true});
 return mp4;
}
function release(file){
 return {release_id:RELEASE,manifest:{
  schemaVersion:1,project:PROJECT,release_id:RELEASE,
  scenes:[{id:'s01',sha256:'a'.repeat(64),duration:1.2},
   {id:'s02',sha256:'b'.repeat(64),duration:1.2}],
  output:{sha256:hash(file),bytes:fs.statSync(file).size,
   qa:{verdict:'PASS',metadata:{duration:2.4}}}}};
}
const assembly=(file,r)=>({current:()=>r,download:()=>file});
const denied=(fn,code)=>assert.throws(fn,e=>e?.code===code,code);

test('M58-R24 genuine AAC master is decoded through a pinned regular-file FD',{
 timeout:90000,skip:!ready,
},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r24-pin-'));
 try{
  const mp4=fixture(root,'clean'),r=release(mp4);
  const record=inspectCurrentMasterStereo({
   projectId:PROJECT,assembly:assembly(mp4,r)});
  assert.equal(record.release_sha256,r.manifest.output.sha256);
  assert.equal(record.decoded_master_audio.scanned_windows,8);
  assert.equal(record.decoded_master_audio.issues.length,0);
  assert.equal(record.may_publish,false);
  assert.equal(record.cryptographically_signed,false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('M58-R24 symlinked master and special device fail before child processes open inputs',{
 timeout:90000,skip:!ready,
},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r24-symlink-'));
 try{
  const mp4=fixture(root,'master'),r=release(mp4),link=path.join(root,'pointer.mp4');
  fs.symlinkSync(mp4,link);
  denied(()=>inspectCurrentMasterStereo({
   projectId:PROJECT,assembly:assembly(link,r)}),'M58_REAL_MASTER_FILE_UNSAFE');
  denied(()=>inspectCurrentMasterStereo({
   projectId:PROJECT,assembly:assembly('/dev/null',r)}),
   'M58_REAL_MASTER_HASH_MISMATCH');
  denied(()=>inspectCurrentMasterStereo({
   projectId:PROJECT,assembly:assembly(root,r)}),
   'M58_REAL_MASTER_HASH_MISMATCH');
  assert.equal(fs.readFileSync(link).length,fs.readFileSync(mp4).length);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('M58-R24 hostile rename during FFprobe sees pinned inode and fails at final path-inode CAS',{
 timeout:90000,skip:!ready,
},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r24-swap-'));
 try{
  const original=fixture(root,'original',320);
  const other=fixture(root,'other',470);
  const r=release(original);
  const argsFile=path.join(root,'probe-args.json');
  const wrapper=path.join(root,'probe-wrapper.mjs');
  // This adversarial probe wrapper swaps the PUBLIC pathname and then runs
  // genuine ffprobe, inheriting fd 3 from the audio analyzer. It verifies
  // ffprobe was NOT passed the changed filename.
  const script=`#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argsFile)},JSON.stringify(args));
fs.renameSync(${JSON.stringify(original)},${JSON.stringify(original+'.old')});
fs.copyFileSync(${JSON.stringify(other)},${JSON.stringify(original)});
const probe=spawnSync('ffprobe',args,{
 stdio:['ignore','inherit','inherit',3],timeout:15000});
process.exit(probe.status??98);
`;
  fs.writeFileSync(wrapper,script,{mode:0o700});
  denied(()=>inspectCurrentMasterStereo({
   projectId:PROJECT,assembly:assembly(original,r),ffprobeBin:wrapper}),
   'M58_REAL_MASTER_CHANGED_DURING_ANALYSIS');
  const argv=JSON.parse(fs.readFileSync(argsFile,'utf8'));
  assert.equal(argv.at(-1),'/proc/self/fd/3');
  assert.equal(argv.includes(original),false,'subprocess never receives mutable master path');
  assert.notEqual(hash(original),r.manifest.output.sha256,
   'replacement must differ from pinned original master SHA');
  assert.equal(hash(original+'.old'),r.manifest.output.sha256,
   'pinned original was actually kept alive by its inode');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseFrameSsimStats,summarizeSeamFrameSsim}
  from '../server/release-seam-ssim.mjs';
import {compareVideoSimilarity} from '../tools/compare-p13-single-edit.mjs';

const available=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{stdio:'ignore',timeout:4000}).status===0);
function run(args){
  const result=spawnSync('ffmpeg',[
    '-hide_banner','-nostats','-nostdin','-loglevel','error','-y',...args,
  ],{encoding:'utf8',timeout:45000,maxBuffer:262144,
     windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  assert.equal(result.status,0,result.stderr);
}

test('M58-R12 catches a damaged cut frame despite excellent mean/global SSIM',()=>{
  const frames=6*3*24;
  const data=Array(frames).fill(.999);
  data[71]=.11; // 1-indexed FFmpeg frame 72, exactly at first scene boundary
  const summary=summarizeSeamFrameSsim(data,{sceneDurationSec:3});
  assert.ok(summary.full_video_mean_frame_ssim>.995);
  assert.equal(summary.full_video_min_frame_ssim,.11);
  assert.equal(summary.min_seam_window_ssim,.11);
  assert.equal(summary.manual_visual_review_required,true);
  assert.deepEqual(summary.boundaries.filter(b=>b.review_required)
    .map(b=>b.boundary_after_scene),[1]);
  assert.equal(summary.boundaries.length,5);
  assert.equal(summary.may_publish,false);
  assert.equal(summary.may_deploy,false);
});

test('M58-R12 frame log must be complete, ordered and trustworthy',()=>{
  const frames=432;
  const raw=Array.from({length:frames},(_,i)=>
    'n:'+(i+1)+' Y:0.98765 U:0.9999 V:0.9999 All:0.9888 (18.4)').join('\n');
  const data=parseFrameSsimStats(raw,{expectedFrames:frames});
  assert.equal(data.length,frames);
  assert.equal(summarizeSeamFrameSsim(data,{
    sceneDurationSec:3,
  }).manual_visual_review_required,false);
  for(const text of [
    raw.replace('n:72 ','n:71 '),
    raw.split('\n').slice(0,-1).join('\n'),
    raw.replace('All:0.9888','All:NaN'),
    raw.replace('All:0.9888','All:1.5'),
    raw+'\n'+raw,
  ])assert.throws(()=>parseFrameSsimStats(text,{expectedFrames:frames}),
    e=>e?.code?.startsWith('M58_SEAM_'));
  assert.throws(()=>parseFrameSsimStats(raw,{expectedFrames:1001}),
    e=>e.code==='M58_SEAM_FRAME_COUNT_MISMATCH');
  assert.throws(()=>summarizeSeamFrameSsim(data,{sceneDurationSec:8}),
    e=>e.code==='M58_SEAM_POLICY_INVALID');
});

test('M58-R12 end-to-end: one black video frame on actual MP4 hard cut must force review',{
  timeout:90000,skip:!available,
},t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-seam-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const good=path.join(root,'good.mp4'),bad=path.join(root,'one-frame-bad.mp4');
  run(['-f','lavfi','-i',
    'testsrc2=size=96x54:rate=24:duration=18',
    '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',good]);
  run(['-i',good,'-vf',
    'drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable=eq(n\\,71)',
    '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',bad]);
  const result=compareVideoSimilarity(good,bad,{durationSec:3});
  assert.ok(result.overall>.95,'Mean/full SSIM should mask the one-frame glitch');
  assert.ok(result.seam.full_video_mean_frame_ssim>.95);
  assert.equal(result.seam.frame_count,432);
  assert.equal(result.seam.boundaries.length,5);
  assert.equal(result.seam.manual_visual_review_required,true);
  assert.ok(result.seam.min_seam_window_ssim<.9);
  assert.equal(result.seam.boundaries[0].review_required,true);
  assert.equal(result.seam.may_publish,false);
});

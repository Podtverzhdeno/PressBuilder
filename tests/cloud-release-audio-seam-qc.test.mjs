import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {measurePcmSeamWindows,comparePcmCutSeams}
  from '../server/release-audio-seam-qc.mjs';
import {measureAudioVideoSeams} from '../tools/compare-p13-single-edit.mjs';

const RATE=48000,FRAMES=18*RATE;
const mediaReady=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{stdio:'ignore',timeout:4000}).status===0);
function pureTone(){
  const pcm=Buffer.alloc(FRAMES*4);
  for(let i=0;i<FRAMES;i++){
    const sample=Math.round(9000*Math.sin(2*Math.PI*440*i/RATE));
    pcm.writeInt16LE(sample,i*4);
    pcm.writeInt16LE(sample,i*4+2);
  }
  return pcm;
}
function run(args){
  const r=spawnSync('ffmpeg',['-hide_banner','-nostdin','-loglevel',
    'error','-y',...args],{
      encoding:'utf8',timeout:45000,maxBuffer:262144,
      windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],
    });
  assert.equal(r.status,0,r.stderr);
}
test('M58-R13 normal continuous 48-kHz PCM across five cuts is not a defect',()=>{
  const pcm=pureTone();
  const q=measurePcmSeamWindows(pcm,{sceneDurationSec:3});
  assert.equal(q.boundaries.length,5);
  assert.equal(q.decoded_duration_sec,18);
  const compared=comparePcmCutSeams(q,q);
  assert.equal(compared.manual_audio_review_required,false);
  assert.equal(compared.relative_decoded_duration_delta_ms,0);
  assert.equal(compared.issues.length,0);
  assert.equal(compared.may_publish,false);
  assert.equal(compared.may_deploy,false);
});
test('M58-R13 one-sample click and 40ms audio dropout trigger relative review',()=>{
  const base=pureTone();
  const click=Buffer.from(base);
  const seam=3*RATE;
  click.writeInt16LE(32767,seam*4);
  click.writeInt16LE(-32768,seam*4+2);
  const qa=comparePcmCutSeams(
    measurePcmSeamWindows(click),measurePcmSeamWindows(base));
  assert.equal(qa.manual_audio_review_required,true);
  assert.equal(qa.boundaries[0].click_risk,true);
  assert.equal(qa.boundaries[1].click_risk,false);
  const mute=Buffer.from(base);
  const start=3*RATE+240,end=3*RATE+2640;
  mute.fill(0,start*4,end*4);
  const dropout=comparePcmCutSeams(
    measurePcmSeamWindows(mute),measurePcmSeamWindows(base));
  assert.equal(dropout.boundaries[0].dropout_risk,true);
  assert.ok(dropout.boundaries[0].dropout_bin_indices.length>=2);
  assert.equal(dropout.boundaries[1].dropout_risk,false);
  assert.equal(dropout.manual_audio_review_required,true);
});
test('M58-R13 rejects malformed buffers, wrong timelines and forged comparisons',()=>{
  const base=pureTone(),valid=measurePcmSeamWindows(base);
  for(const options of [{sceneDurationSec:2},{sampleRate:44100},
    {sceneCount:7}]){
    assert.throws(()=>measurePcmSeamWindows(base,options),
      e=>e.code==='M58_AUDIO_SEAM_POLICY_INVALID');
  }
  assert.throws(()=>measurePcmSeamWindows(Buffer.alloc(3)),
    e=>e.code==='M58_AUDIO_SEAM_PCM_INVALID');
  assert.throws(()=>measurePcmSeamWindows(Buffer.alloc(20)),
    e=>e.code==='M58_AUDIO_SEAM_TIMELINE_DRIFT');
  assert.throws(()=>comparePcmCutSeams(valid,valid,
    {minAbsoluteJump:-1}),e=>e.code==='M58_AUDIO_SEAM_POLICY_INVALID');
  const forged=structuredClone(valid);
  forged.boundaries[0].rms_10ms_windows[0]=NaN;
  assert.throws(()=>comparePcmCutSeams(forged,valid),
    e=>e.code==='M58_AUDIO_SEAM_COMPARISON_INVALID');
  const short=structuredClone(valid);short.decoded_duration_sec-=.2;
  assert.throws(()=>comparePcmCutSeams(short,valid),
    e=>e.code==='M58_AUDIO_SEAM_RELATIVE_TIMELINE_DRIFT');
});
test('M58-R13 real AAC MP4 injected dropout is detected on exact first cut',{
  skip:!mediaReady,timeout:90000,
},t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-audio-seam-'));
  t.after(()=>fs.rmSync(dir,{force:true,recursive:true,maxRetries:3}));
  const raw=pureTone(),corrupted=Buffer.from(raw);
  corrupted.fill(0,(3*RATE+240)*4,(3*RATE+2640)*4);
  const video=path.join(dir,'video.mp4'),
    source=path.join(dir,'normal.pcm'),
    poisoned=path.join(dir,'poisoned.pcm'),
    baseline=path.join(dir,'normal.mp4'),
    edited=path.join(dir,'damaged.mp4');
  fs.writeFileSync(source,raw);fs.writeFileSync(poisoned,corrupted);
  run(['-f','lavfi','-i','testsrc2=size=96x54:rate=24:duration=18',
    '-an','-c:v','libx264','-preset','ultrafast',
    '-pix_fmt','yuv420p',video]);
  for(const [pcm,mp4] of [[source,baseline],[poisoned,edited]]){
    run(['-f','s16le','-ar','48000','-ac','2','-i',pcm,
      '-i',video,'-map','1:v:0','-map','0:a:0',
      '-c:v','copy','-c:a','aac','-b:a','192k',mp4]);
  }
  const q=measureAudioVideoSeams(edited,baseline,{durationSec:3});
  assert.equal(q.scope,'P13_VS_IDENTICAL_SOURCE_FULL_P05_AUDIO_CUT_COMPARISON');
  assert.equal(q.manual_audio_review_required,true);
  assert.equal(q.boundaries.length,5);
  assert.equal(q.boundaries[0].dropout_risk,true);
  assert.equal(q.boundaries[1].dropout_risk,false);
  assert.ok(q.relative_decoded_duration_delta_ms<80);
  assert.equal(q.may_publish,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {analyzeCrossfadePcm,inspectP05CrossfadeAudioMp4}
  from '../server/release-crossfade-audio-qc.mjs';

const RATE=48000,DURATION=17.1,FRAMES=Math.round(RATE*DURATION);
const fades=[2.7,8.4,14.1];
const ready=['ffmpeg','ffprobe'].every(x=>
  spawnSync(x,['-version'],{timeout:4000,stdio:'ignore'}).status===0);
function program({dropout=false,clipping=false,fadeOutSilence=false}={}){
  const pcm=Buffer.alloc(FRAMES*4);
  for(let i=0;i<FRAMES;i++){
    const t=i/RATE;
    // Two independent synthetic sources (voice-ish and music-ish) plus a
    // low-level bed demonstrate safe mixing and intentional volume changes.
    let signal=.16*Math.sin(2*Math.PI*220*t)+
      .07*Math.sin(2*Math.PI*660*t)+.04*Math.sin(2*Math.PI*110*t);
    if(t>4)signal*=.75; // deliberate gain change, not a fault
    for(let f=0;f<fades.length;f++){
      const start=fades[f];
      if(t>=start&&t<start+.3){
        const alpha=(t-start)/.3;
        signal=.18*((1-alpha)*Math.sin(2*Math.PI*330*t)+
          alpha*Math.sin(2*Math.PI*550*t))+
          .04*Math.sin(2*Math.PI*110*t);
        if(fadeOutSilence&&f===0)
          signal*=1-alpha; // legitimate fade out from audible bed
      }
    }
    if(dropout&&t>=2.83&&t<2.88)signal=0;
    if(clipping&&t>=8.52&&t<8.57)
      signal=1.7*Math.sin(2*Math.PI*440*t);
    const x=Math.max(-32768,Math.min(32767,Math.round(signal*32768)));
    pcm.writeInt16LE(x,i*4);pcm.writeInt16LE(x,i*4+2);
  }
  return pcm;
}
function ffmpeg(args){
  const p=spawnSync('ffmpeg',['-hide_banner','-nostdin','-loglevel',
    'error','-y',...args],{
      encoding:'utf8',timeout:45000,maxBuffer:262144,
      windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],
    });
  assert.equal(p.status,0,p.stderr);
}
test('M58-R14 real two-layer PCM mix and volume changes avoid false positives',()=>{
  const result=analyzeCrossfadePcm(program());
  assert.equal(result.boundaries.length,3);
  assert.equal(result.scene_count,6);
  assert.equal(result.decoded_duration_sec,DURATION);
  assert.equal(result.manual_audio_review_required,false);
  assert.equal(result.review_boundary_count,0);
  for(const edge of result.boundaries){
    assert.ok(edge.fade_end_sec>edge.fade_start_sec);
    assert.equal(edge.dropout_risk,false);
    assert.equal(edge.clipping_risk,false);
    assert.equal(edge.excessive_gain_risk,false);
  }
  assert.equal(result.may_publish,false);
  assert.equal(result.may_deploy,false);
});
test('M58-R14 localized dropout is flagged even if rest of crossfade sounds normal',()=>{
  const q=analyzeCrossfadePcm(program({dropout:true}));
  assert.equal(q.manual_audio_review_required,true);
  assert.equal(q.boundaries[0].dropout_risk,true);
  assert.ok(q.boundaries[0].longest_near_silent_ms>=20);
  assert.equal(q.boundaries[1].dropout_risk,false);
  assert.equal(q.boundaries[2].dropout_risk,false);
});
test('M58-R14 mixed-track overload clips near second crossfade',()=>{
  const q=analyzeCrossfadePcm(program({clipping:true}));
  assert.equal(q.manual_audio_review_required,true);
  assert.equal(q.boundaries[1].clipping_risk,true);
  assert.equal(q.boundaries[0].clipping_risk,false);
  assert.equal(q.boundaries[2].clipping_risk,false);
});
test('M58-R14 intentional fade-to-silence does not force dropout review',()=>{
  const q=analyzeCrossfadePcm(program({fadeOutSilence:true}));
  assert.equal(q.boundaries[0].dropout_risk,false);
  assert.equal(q.boundaries[0].clipping_risk,false);
});
test('M58-R14 bad duration, truncation and unsafe policy fail closed',()=>{
  const pcm=program();
  assert.throws(()=>analyzeCrossfadePcm(Buffer.alloc(3)),
    e=>e.code==='M58_CROSSFADE_AUDIO_PCM_INVALID');
  assert.throws(()=>analyzeCrossfadePcm(Buffer.alloc(400)),
    e=>e.code==='M58_CROSSFADE_AUDIO_TIMELINE_DRIFT');
  for(const options of [
    {sceneDurationSec:8},{fadeDurationSec:.5},{edges:[0,1,4]},
    {audibleRms:NaN},{clippedFractionThreshold:0},
  ])assert.throws(()=>analyzeCrossfadePcm(pcm,options),
    e=>e.code==='M58_CROSSFADE_AUDIO_POLICY_INVALID');
  assert.throws(()=>inspectP05CrossfadeAudioMp4('dummy',{sceneDurationSec:10}),
    e=>e.code==='M58_CROSSFADE_AUDIO_PROFILE_INVALID');
});
test('M58-R14 real AAC MP4 fade has no review; injected 50ms mute does',{
  skip:!ready,timeout:90000,
},t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-crossfade-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:3}));
  const video=path.join(dir,'video.mp4');
  ffmpeg(['-f','lavfi','-i','testsrc2=size=96x54:rate=24:duration=17.1',
    '-an','-c:v','libx264','-preset','ultrafast',
    '-pix_fmt','yuv420p',video]);
  const scores=[];
  for(const [name,raw] of [['normal',program()],
    ['dropout',program({dropout:true})]]){
    const src=path.join(dir,name+'.pcm');
    const dest=path.join(dir,name+'.mp4');
    fs.writeFileSync(src,raw);
    ffmpeg(['-f','s16le','-ar','48000','-ac','2','-i',src,
      '-i',video,'-map','1:v:0','-map','0:a:0',
      '-c:v','copy','-c:a','aac','-b:a','192k',dest]);
    scores.push(inspectP05CrossfadeAudioMp4(dest));
  }
  assert.equal(scores[0].manual_audio_review_required,false);
  assert.equal(scores[1].manual_audio_review_required,true);
  assert.equal(scores[1].boundaries[0].dropout_risk,true);
  assert.equal(scores[1].boundaries[1].dropout_risk,false);
  assert.equal(scores[1].may_publish,false);
});

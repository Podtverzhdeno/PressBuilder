import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {analyzeKnownVoiceMusicPcm}
  from '../server/release-known-voice-music-qc.mjs';
import {generateKnownVoiceMusicPcm,checkP05KnownVoiceMusic}
  from '../tools/check-p05-known-voice-music.mjs';

const RATE=48000,SEC=3,FADE=.3,SCENES=6;
const starts=[0,2.7,5.7,8.4,11.4,14.1];
const ready=['ffmpeg','ffprobe'].every(x=>
  spawnSync(x,['-version'],{stdio:'ignore',timeout:4000}).status===0);
/** Exact synthetic P05 triangular crossfade envelopes before AAC coding.
 * This is solely a deterministic fixture, never a simulation of real voice.
 */
function mix({missingVoiceScene=null,unduckedScene=null,gap=false}={}){
  const sources=Array.from({length:SCENES},(_,i)=>
    generateKnownVoiceMusicPcm({sceneIndex:i,
      missingVoice:i===missingVoiceScene,
      unducked:i===unduckedScene}));
  const frames=Math.round((SCENES*SEC-3*FADE)*RATE);
  const output=Buffer.alloc(frames*4);
  for(let n=0;n<frames;n++){
    const time=n/RATE;
    let left=0,right=0;
    for(let i=0;i<SCENES;i++){
      const relative=time-starts[i];
      if(relative<0||relative>=SEC)continue;
      const sourceFrame=Math.floor(relative*RATE);
      const index=sourceFrame*4;
      let weight=1;
      if(i%2===0&&i<5&&relative>SEC-FADE)
        weight=Math.max(0,(SEC-relative)/FADE);
      if(i%2===1&&relative<FADE)
        weight=Math.min(1,relative/FADE);
      left+=sources[i].readInt16LE(index)*weight;
      right+=sources[i].readInt16LE(index+2)*weight;
    }
    if(gap&&time>=2.7&&time<3)left=right=0;
    output.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(left))),n*4);
    output.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(right))),n*4+2);
  }
  return output;
}
test('M58-R15 synthetic continuous music bed with ducked voice references passes',()=>{
  const report=analyzeKnownVoiceMusicPcm(mix());
  assert.equal(report.scope,
    'CONTROLLED_SYNTHETIC_110HZ_MUSIC_440HZ_VOICE_SURROGATE');
  assert.equal(report.manual_audio_review_required,false);
  assert.equal(report.issues.length,0);
  assert.equal(report.scenes.length,6);
  assert.equal(report.boundaries.length,3);
  assert.equal(report.may_publish,false);
  assert.equal(report.may_deploy,false);
  for(const scene of report.scenes){
    assert.ok(scene.music_tone_110hz_amplitude>=.012);
    if(scene.voice_expected){
      assert.ok(scene.voice_tone_440hz_amplitude>.038);
      assert.ok(scene.music_to_unvoiced_reference_ratio>.12);
      assert.ok(scene.music_to_unvoiced_reference_ratio<.73);
    }
  }
});
test('M58-R15 voice missing, music unducking and continuous-bed gap are distinct defects',()=>{
  const missing=analyzeKnownVoiceMusicPcm(mix({missingVoiceScene:4}));
  assert.ok(missing.issues.some(x=>x.code==='VOICE_SURROGATE_MISSING'&&x.scene_id==='s05'));
  const unducked=analyzeKnownVoiceMusicPcm(mix({unduckedScene:1}));
  assert.ok(unducked.issues.some(x=>x.code==='MUSIC_DUCKING_MISSING'&&x.scene_id==='s02'));
  const gap=analyzeKnownVoiceMusicPcm(mix({gap:true}));
  assert.ok(gap.issues.some(x=>x.code==='MUSIC_BED_CROSSFADE_GAP'&&x.boundary_after_scene===1));
  assert.equal(gap.boundaries[1].music_bed_gap,false);
  assert.equal(missing.may_publish,false);
});
test('M58-R15 malformed PCM, false stem assertions and invalid policies fail closed',()=>{
  const pcm=mix();
  assert.throws(()=>analyzeKnownVoiceMusicPcm(Buffer.alloc(3)),
    e=>e.code==='M58_STEM_PCM_INVALID');
  assert.throws(()=>analyzeKnownVoiceMusicPcm(Buffer.alloc(100)),
    e=>e.code==='M58_STEM_TIMELINE_DRIFT');
  for(const opts of [
    {sceneDurationSec:9},{expectedVoiceScenes:[0,2]},
    {maxUnduckedRatio:NaN},{minMusicAmplitude:-1},
  ])assert.throws(()=>analyzeKnownVoiceMusicPcm(pcm,opts),
    e=>e.code==='M58_STEM_POLICY_INVALID');
  assert.throws(()=>generateKnownVoiceMusicPcm({sceneIndex:12}),
    e=>e.code==='M58_STEM_FIXTURE_POLICY_INVALID');
  const absent=Buffer.alloc(pcm.length);
  assert.throws(()=>analyzeKnownVoiceMusicPcm(absent),
    e=>e.code==='M58_STEM_REFERENCE_MUSIC_MISSING');
});
test('M58-R15 two actual P05 six-scene AAC masters preserve music, and missing s05 voice fails',{
  timeout:240000,skip:!ready,
},async()=>{
  const result=await checkP05KnownVoiceMusic();
  assert.equal(result.unique_release_count,2);
  assert.equal(result.status,'TWO_REAL_P05_SYNTHETIC_RELEASES_VERIFIED');
  assert.equal(result.cases[0].audio_qc.manual_audio_review_required,false);
  assert.equal(result.cases[1].audio_qc.manual_audio_review_required,true);
  assert.deepEqual(result.cases.map(x=>x.output_qa_verdict),['PASS','PASS']);
  assert.ok(result.cases[1].audio_qc.issues.some(x=>
    x.scene_id==='s05'&&x.code==='VOICE_SURROGATE_MISSING'));
  assert.equal(result.cases[0].original_source_sha256.length,6);
  assert.equal(result.cases[0].original_source_sha256.filter((sha,i)=>
    sha!==result.cases[1].original_source_sha256[i]).length,1);
  assert.equal(result.may_publish,false);
  assert.equal(result.may_deploy,false);
});

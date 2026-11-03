import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {analyzeStereoFoldDownPcm}
  from '../server/release-stereo-fold-down-qc.mjs';
import {checkP05KnownVoiceMusic}
  from '../tools/check-p05-known-voice-music.mjs';

const RATE=48000,DURATION=17.1,STARTS=[0,2.7,5.7,8.4,11.4,14.1];
const ready=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{stdio:'ignore',timeout:4000}).status===0);

function controlledPcm({invertedScene=-1,weakScene=-1}={}){
  const pcm=Buffer.alloc(Math.round(DURATION*RATE)*4);
  for(let f=0;f<pcm.length/4;f++){
    const time=f/RATE;
    const wave=Math.round(0.09*32767*Math.sin(2*Math.PI*110*time));
    const inside=s=>time>=STARTS[s]+.95&&time<STARTS[s]+1.25;
    const weak=weakScene>=0&&inside(weakScene);
    const invert=invertedScene>=0&&inside(invertedScene);
    const left=weak?0:wave;
    pcm.writeInt16LE(left,f*4);
    pcm.writeInt16LE(invert?-left:left,f*4+2);
  }
  return pcm;
}
test('M58-R18 clean controlled stereo six-scene PCM survives mono fold-down',()=>{
  const report=analyzeStereoFoldDownPcm(controlledPcm());
  assert.equal(report.scope,'CONTROLLED_P05_STEREO_MONO_FOLD_DOWN_QA');
  assert.equal(report.scenes.length,6);
  assert.equal(report.issues.length,0);
  assert.equal(report.manual_audio_review_required,false);
  assert.equal(report.may_publish,false);
  assert.equal(report.may_deploy,false);
  assert.ok(report.scenes.every(x=>x.interchannel_correlation>.98));
});
test('M58-R18 destructive right-channel inversion in s05 is distinguished from weak signal',()=>{
  const inverted=analyzeStereoFoldDownPcm(controlledPcm({invertedScene:4}));
  assert.deepEqual(inverted.issues,[{
    scene_id:'s05',code:'PHASE_INVERTED_MONO_CANCELLATION',
  }]);
  assert.ok(inverted.scenes[4].interchannel_correlation<-.98);
  assert.ok(inverted.scenes[4].mid_to_side_ratio<.01);
  assert.equal(inverted.scenes[1].review_reason,null);
  const weak=analyzeStereoFoldDownPcm(controlledPcm({weakScene:2}));
  assert.deepEqual(weak.issues,[{
    scene_id:'s03',code:'CHANNEL_SIGNAL_TOO_WEAK',
  }]);
  assert.equal(weak.scenes[2].phase_inverted,false);
  assert.equal(weak.may_publish,false);
});
test('M58-R19 detects a late s05 phase error beyond the former .95s window',()=>{
  const pcm=controlledPcm();
  const start=STARTS[4]+1.8,finish=STARTS[4]+2.36;
  for(let frame=Math.round(start*RATE);frame<Math.round(finish*RATE);frame++){
    const pos=frame*4+2;
    pcm.writeInt16LE(-pcm.readInt16LE(pos),pos);
  }
  const report=analyzeStereoFoldDownPcm(pcm);
  assert.equal(report.window_ms,300);
  assert.equal(report.windows_per_scene,7);
  assert.equal(report.scenes.length,6);
  assert.equal(report.issues.length,1);
  assert.deepEqual(report.issues,[{
    scene_id:'s05',code:'PHASE_INVERTED_MONO_CANCELLATION',
  }]);
  const target=report.scenes[4];
  assert.ok(target.interchannel_correlation>.98,
    'former .95s diagnostic stays normal; only scanning should catch the error');
  assert.equal(target.review_reason,'PHASE_INVERTED_MONO_CANCELLATION');
  assert.equal(target.first_failing_window_start_sec,STARTS[4]+1.99);
  assert.ok(target.windows.some(x=>x.phase_inverted));
  assert.equal(report.scenes[1].review_reason,null);
  assert.equal(report.manual_audio_review_required,true);
  assert.equal(report.may_publish,false);
});
test('M58-R18 invalid policy, one-channel PCM and incorrect timeline fail closed',()=>{
  const pcm=controlledPcm();
  assert.throws(()=>analyzeStereoFoldDownPcm(Buffer.alloc(3)),
    e=>e.code==='M58_STEREO_PCM_INVALID');
  assert.throws(()=>analyzeStereoFoldDownPcm(Buffer.alloc(4)),
    e=>e.code==='M58_STEREO_TIMELINE_INVALID');
  for(const opts of [
    {minChannelRms:0},{maxMidToSideRatio:1},
    {invertedCorrelationLimit:Infinity},{invertedCorrelationLimit:-.1},
  ])assert.throws(()=>analyzeStereoFoldDownPcm(pcm,opts),
    e=>e.code==='M58_STEREO_POLICY_INVALID');
  assert.equal(analyzeStereoFoldDownPcm(Buffer.alloc(pcm.length)).
    manual_audio_review_required,true,'silence cannot be accepted as coherent stereo');
});
test('M58-R18 three genuine P05 H264/AAC masters: inverted s05 stays decodable but fails content QA',{
  timeout:300000,skip:!ready,
},async()=>{
  const report=await checkP05KnownVoiceMusic({checkStereoInversion:true});
  assert.equal(report.status,'THREE_REAL_P05_STEREO_PHASE_RELEASES_VERIFIED');
  assert.equal(report.stereo_phase_negative_control,true);
  assert.equal(report.unique_release_count,3);
  assert.deepEqual(report.cases.map(x=>x.label),[
    'normal','missing-voice-s05','inverted-right-s05',
  ]);
  assert.ok(report.cases.every(x=>x.output_qa_verdict==='PASS'));
  assert.equal(new Set(report.cases.map(x=>x.master_sha256)).size,3);
  for(const c of report.cases){
    assert.equal(c.audio_qc.stereo_fold_down.may_publish,false);
    assert.equal(c.audio_qc.stereo_fold_down.may_deploy,false);
    assert.equal(c.audio_qc.stereo_fold_down.scenes.length,6);
  }
  const [normal,missing,inverted]=report.cases;
  assert.equal(normal.audio_qc.manual_audio_review_required,false);
  assert.equal(normal.audio_qc.stereo_fold_down.issues.length,0);
  assert.equal(missing.audio_qc.stereo_fold_down.issues.length,0);
  assert.deepEqual(inverted.audio_qc.stereo_fold_down.issues,[{
    scene_id:'s05',code:'PHASE_INVERTED_MONO_CANCELLATION',
  }]);
  assert.equal(inverted.audio_qc.manual_audio_review_required,true);
  assert.equal(inverted.original_source_sha256.filter((h,i)=>
    h!==normal.original_source_sha256[i]).length,1);
  assert.equal(inverted.original_source_sha256[1],normal.original_source_sha256[1]);
  assert.equal(report.may_publish,false);
  assert.equal(report.may_deploy,false);
});

test('M58-R19 real six-scene P05 AAC: off-center s05 antiphase is flagged',{
  timeout:300000,skip:!ready,
},async()=>{
  const report=await checkP05KnownVoiceMusic({checkIntermittentPhase:true});
  assert.equal(report.status,'TWO_REAL_P05_INTERMITTENT_STEREO_RELEASES_VERIFIED');
  assert.equal(report.stereo_intermittent_negative_control,true);
  assert.equal(report.unique_release_count,2);
  assert.deepEqual(report.cases.map(x=>x.label),['normal','late-inverted-right-s05']);
  assert.ok(report.cases.every(x=>x.output_qa_verdict==='PASS'));
  const [normal,mutated]=report.cases;
  assert.equal(normal.audio_qc.stereo_fold_down.issues.length,0);
  assert.equal(mutated.audio_qc.stereo_fold_down.issues.length,1);
  const q=mutated.audio_qc.stereo_fold_down.scenes[4];
  assert.equal(q.review_reason,'PHASE_INVERTED_MONO_CANCELLATION');
  assert.ok(q.interchannel_correlation>.9,
    'original R18 single-window s05 result remains clean');
  assert.ok(q.windows.some(x=>x.phase_inverted));
  assert.ok(q.first_failing_window_start_sec>STARTS[4]+1.5);
  assert.equal(mutated.audio_qc.manual_audio_review_required,true);
  assert.equal(normal.original_source_sha256.filter((h,i)=>
    h!==mutated.original_source_sha256[i]).length,1);
  assert.equal(normal.original_source_sha256[1],mutated.original_source_sha256[1]);
  assert.equal(report.may_publish,false);
  assert.equal(report.may_deploy,false);
});

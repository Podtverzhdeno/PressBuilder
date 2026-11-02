import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {probeOfflineSpeech} from '../tools/probe-offline-speech.mjs';
import {checkP05KnownVoiceMusic} from '../tools/check-p05-known-voice-music.mjs';
import {analyzeOfflineSpeechCueTiming,speechEnvelope}
  from '../server/release-speech-cue-timing.mjs';

const ffmpegReady=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{stdio:'ignore',timeout:4000}).status===0);
const offlineReady=probeOfflineSpeech().any_available;

test('M58-R17 rejects unpinned speech reference, malformed PCM and unsafe timing policy',async()=>{
  const master=Buffer.alloc(17.1*48000*4);
  const reference=Buffer.alloc(48000*4);
  for(const config of [
    {expectedOffsetSec:0.4},
    {sourceSceneIds:['s05']},
    {maxDelayMs:900},
    {minCorrelation:NaN},
    {searchRadiusMs:900},
  ])assert.throws(()=>analyzeOfflineSpeechCueTiming(master,reference,config),
    e=>e.code==='M58_CUE_POLICY_INVALID');
  assert.throws(()=>speechEnvelope(Buffer.alloc(3)),
    e=>e.code==='M58_CUE_PCM_INVALID');
  assert.throws(()=>analyzeOfflineSpeechCueTiming(Buffer.alloc(4),reference),
    e=>e.code==='M58_CUE_MASTER_TIMELINE_INVALID');
  assert.throws(()=>analyzeOfflineSpeechCueTiming(master,Buffer.alloc(3)),
    e=>e.code==='M58_CUE_REFERENCE_INVALID');
  await assert.rejects(
    ()=>checkP05KnownVoiceMusic({voiceSource:'tone',checkSpeechTiming:true}),
    e=>e.code==='M58_STEM_TIMING_PROFILE_INVALID');
});

test('M58-R17 true P05 video: 3 immutable masters; on-time speech passes, 250ms cue shift fails',{
  timeout:300000,skip:!ffmpegReady||!offlineReady,
},async()=>{
  const report=await checkP05KnownVoiceMusic({
    voiceSource:'offline-speech',checkSpeechTiming:true,
  });
  assert.equal(report.status,'THREE_REAL_P05_SYNTHETIC_RELEASES_VERIFIED');
  assert.equal(report.unique_release_count,3);
  assert.equal(report.speech_timing_evidence,true);
  assert.match(report.original_spoken_pcm_sha256,/^[a-f0-9]{64}$/);
  assert.equal(report.manual_timing_review_trial_count,2);
  assert.deepEqual(report.cases.map(x=>x.label),[
    'normal','missing-voice-s05','shifted-voice-s05',
  ]);
  assert.equal(new Set(report.cases.map(x=>x.release_id)).size,3);
  assert.ok(report.cases.every(x=>x.output_qa_verdict==='PASS'));
  for(const c of report.cases){
    const q=c.audio_qc.spoken_cue_timing;
    assert.equal(q.scope,'SOURCE_PINNED_OFFLINE_TTS_P05_CUE_TIME_ALIGNMENT');
    assert.equal(q.scenes.length,2);
    assert.equal(q.max_allowed_drift_ms,90);
    assert.equal(q.word_accuracy_verified,undefined);
    assert.equal(q.phoneme_word_alignment_verified,false);
    assert.equal(q.lip_sync_verified,false);
    assert.equal(q.may_publish,false);
    assert.equal(q.may_deploy,false);
    assert.equal(q.scenes[0].review_reason,null,'s02 must stay aligned');
    assert.equal(q.scenes[0].drift_exceeds_policy,false);
  }
  const [normal,missing,shifted]=report.cases;
  assert.equal(normal.audio_qc.spoken_cue_timing.scenes[1].review_reason,null);
  assert.ok(Math.abs(normal.audio_qc.spoken_cue_timing.scenes[1].
    observed_relative_offset_ms)<=90);
  assert.equal(missing.audio_qc.spoken_cue_timing.scenes[1].review_reason,
    'VOICE_TEMPLATE_NOT_IDENTIFIABLE');
  assert.equal(shifted.audio_qc.spoken_cue_timing.scenes[1].review_reason,
    'SPEECH_CUE_TIME_DRIFT');
  assert.ok(shifted.audio_qc.spoken_cue_timing.scenes[1].
    observed_relative_offset_ms>=160);
  assert.ok(shifted.audio_qc.spoken_cue_timing.scenes[1].
    observed_relative_offset_ms<=360);
  // Both corruptions touch only s05 sources, with s02 unchanged.
  for(const candidate of [missing,shifted]){
    assert.equal(normal.original_source_sha256.filter((h,i)=>
      h!==candidate.original_source_sha256[i]).length,1);
    assert.equal(normal.original_source_sha256[1],
      candidate.original_source_sha256[1]);
  }
  assert.equal(report.may_publish,false);
  assert.equal(report.may_deploy,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {probeOfflineSpeech,createOfflineSpokenWav}
  from '../tools/probe-offline-speech.mjs';
import {checkP05KnownVoiceMusic}
  from '../tools/check-p05-known-voice-music.mjs';
import {analyzeOfflineSpokenVoicePcm}
  from '../server/release-offline-speech-qc.mjs';
const RATE=48000,FRAMES=RATE*17.1;
const exists=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{timeout:4000,stdio:'ignore'}).status===0);
test('M58-R16 original offline synthesizer produces actual WAV speech without network',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'m58-spoken-'));
  try{
    const status=probeOfflineSpeech();
    assert.equal(status.any_available,true,
      'Offline TTS required: Windows System.Speech or Linux espeak-ng');
    const file=path.join(root,'original-words.wav');
    const gen=createOfflineSpokenWav(file);
    assert.ok(['sapi','espeak','espeak-ng'].includes(gen.engine));
    assert.ok(gen.bytes>4000);
    const bytes=fs.readFileSync(file);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');
    assert.equal(bytes.toString('ascii',8,12),'WAVE');
    assert.equal(gen.source,'LOCAL_OFFLINE_GENERATED_SPEECH');
    assert.match(gen.original_text,/voice stays clear/i);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('M58-R16 unknown speech and forged source policy fail closed',async()=>{
  const total=Math.round(FRAMES)*4;
  const zero=Buffer.alloc(total);
  for(const config of [{sceneDurationSec:7},{expectedVoiceScenes:[0,5]},
    {minVoiceResidualRms:NaN},{minimumVoiceToNonvoiceRatio:0}]){
    assert.throws(()=>analyzeOfflineSpokenVoicePcm(zero,config),
      e=>e.code==='M58_NATIVE_SPEECH_POLICY_INVALID');
  }
  assert.throws(()=>analyzeOfflineSpokenVoicePcm(Buffer.alloc(3)),
    e=>e.code==='M58_NATIVE_SPEECH_PCM_INVALID');
  assert.throws(()=>analyzeOfflineSpokenVoicePcm(Buffer.alloc(400)),
    e=>e.code==='M58_NATIVE_SPEECH_TIMELINE_DRIFT');
  assert.throws(()=>analyzeOfflineSpokenVoicePcm(zero),
    e=>e.code==='M58_NATIVE_SPEECH_MUSIC_REFERENCE_MISSING');
  await assert.rejects(()=>checkP05KnownVoiceMusic({voiceSource:'real-licensed-media'}),
    e=>e.code==='M58_STEM_VOICE_SOURCE_INVALID');
  assert.throws(()=>createOfflineSpokenWav('../not-a-wav.mp3'),
    /M58_OFFLINE_TTS_PATH_INVALID/);
});
test('M58-R16 two actual P05 six-scene MP4 assemblies preserve original spoken words and isolate missing s05', {
  timeout:240000,skip:!exists,
},async()=>{
  const report=await checkP05KnownVoiceMusic({voiceSource:'offline-speech'});
  assert.equal(report.scope,'CONTROLLED_REAL_P05_AAC_OFFLINE_SPOKEN_WORDS_E2E');
  assert.equal(report.voice_source,'offline-speech');
  assert.ok(['sapi','espeak','espeak-ng'].includes(report.original_spoken_words_engine));
  assert.equal(report.unique_release_count,2);
  assert.equal(report.cases.length,2);
  const [normal,missing]=report.cases;
  assert.equal(normal.output_qa_verdict,'PASS');
  assert.equal(missing.output_qa_verdict,'PASS');
  assert.equal(normal.audio_qc.source_kind,'ACTUAL_OFFLINE_TTS_WAVEFORM_NOT_REFERENCE_TONE');
  assert.equal(normal.audio_qc.manual_audio_review_required,false);
  assert.equal(missing.audio_qc.manual_audio_review_required,true);
  assert.ok(missing.audio_qc.issues.some(x=>
    x.code==='SPOKEN_WORD_ENERGY_MISSING'&&x.scene_id==='s05'));
  assert.ok(normal.audio_qc.scenes.filter(x=>x.voice_expected)
    .every(x=>x.non_music_to_reference_ratio>2.5));
  assert.ok(normal.audio_qc.boundaries.every(x=>x.music_bed_gap===false));
  assert.equal(normal.original_source_sha256.filter((sha,i)=>
    sha!==missing.original_source_sha256[i]).length,1);
  assert.notEqual(normal.release_id,missing.release_id);
  assert.equal(report.may_publish,false);
  assert.equal(report.may_deploy,false);
  assert.equal(normal.audio_qc.word_accuracy_verified,false);
  assert.equal(normal.audio_qc.speech_intelligibility_verified,false);
});

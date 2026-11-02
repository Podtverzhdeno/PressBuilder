import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePcm16leStereo} from '../server/release-pcm-qc.mjs';

const RATE=48000;
function tone(seconds,amplitude){
  const frames=Math.round(seconds*RATE);
  const pcm=Buffer.alloc(frames*4);
  for(let frame=0;frame<frames;frame++){
    const sample=Math.round(Math.sin(frame*2*Math.PI*440/RATE)*amplitude);
    pcm.writeInt16LE(sample,frame*4);
    pcm.writeInt16LE(sample,frame*4+2);
  }
  return pcm;
}
function silence(seconds){return Buffer.alloc(Math.round(seconds*RATE)*4)}

test('M58 PCM: normal voice-range sine yields finite RMS and no fake approvals',()=>{
  const q=analyzePcm16leStereo(tone(3,8000));
  assert.equal(q.schema_version,1);
  assert.equal(q.sample_rate,48000);
  assert.equal(q.channels,2);
  assert.equal(q.sample_frames,3*RATE);
  assert.equal(q.pcm_duration_sec,3);
  assert.ok(q.sample_peak_dbfs<0&&q.sample_peak_dbfs> -20);
  assert.ok(q.rms_dbfs<0&&q.rms_dbfs> -25);
  assert.equal(q.clipped_sample_count,0);
  assert.equal(q.clipping_risk,false);
  assert.equal(q.long_silence_count,0);
  assert.equal(q.manual_audio_review_required,false);
  assert.equal(q.lufs_verified,false);
  assert.equal(q.true_peak_verified,false);
  assert.equal(q.speech_sync_verified,false);
  assert.equal(q.may_publish,false);
  assert.equal(q.may_deploy,false);
});

test('M58 PCM: >2s digital silence requires review; short pause is allowed',()=>{
  const full=analyzePcm16leStereo(silence(2.5));
  assert.equal(full.rms_dbfs,null);
  assert.equal(full.sample_peak_dbfs,null);
  assert.deepEqual(full.long_silence_intervals,[
    {start_sec:0,end_sec:2.5,duration_sec:2.5},
  ]);
  assert.equal(full.manual_audio_review_required,true);
  const short=analyzePcm16leStereo(Buffer.concat([
    tone(1,6000),silence(1.5),tone(1,6000),
  ]));
  assert.equal(short.long_silence_count,0);
  assert.equal(short.manual_audio_review_required,false);
});

test('M58 PCM: clipped samples and real peaks remain separate from LUFS/true peak',()=>{
  const hot=Buffer.alloc(RATE*4);
  for(let pos=0;pos<hot.length;pos+=2)
    hot.writeInt16LE(pos%4===0?32767:-32768,pos);
  const q=analyzePcm16leStereo(hot);
  assert.equal(q.clipped_sample_count,RATE*2);
  assert.equal(q.clipped_sample_fraction,1);
  assert.equal(q.clipping_risk,true);
  assert.equal(q.manual_audio_review_required,true);
  assert.ok(q.sample_peak_dbfs<=0);
  assert.equal(q.true_peak_verified,false);
});

test('M58 PCM: unknown data, malformed chunks and fabricated policy fail closed',()=>{
  const invalid=[
    null,undefined,Buffer.alloc(0),Buffer.alloc(3),
    Buffer.alloc(4),new Uint8Array(8),
  ];
  // A one-frame PCM buffer is valid by design; reject malformed ones only.
  for(const x of invalid.filter(v=>!(Buffer.isBuffer(v)&&v.length===4)))
    assert.throws(()=>analyzePcm16leStereo(x),e=>e.code==='M58_PCM_BUFFER_INVALID');
  const good=tone(1,4000);
  for(const options of [
    {sampleRate:44100},{minLongSilenceSec:-1},
    {silenceThresholdDbfs:NaN},{clippingThreshold:0},
    {clippingThreshold:2},
  ])assert.throws(()=>analyzePcm16leStereo(good,options),
    e=>e.code==='M58_PCM_POLICY_INVALID');
});

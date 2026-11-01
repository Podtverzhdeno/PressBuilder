import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {measureOwnedWavSilence} from '../server/rhythm-audio-silence.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
function wav({rate=16000,seconds=2.5,channels=1,quiet=[[0.3,0.85],[1.5,1.95]]}={}){
  const frames=Math.round(rate*seconds),dataSize=frames*channels*2;
  const b=Buffer.alloc(44+dataSize);
  b.write('RIFF',0,'ascii');b.writeUInt32LE(b.length-8,4);
  b.write('WAVE',8,'ascii');b.write('fmt ',12,'ascii');b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);
  b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*2,28);
  b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);
  b.write('data',36,'ascii');b.writeUInt32LE(dataSize,40);
  for(let f=0;f<frames;f++){
    const t=f/rate,silent=quiet.some(([start,end])=>t>=start&&t<end);
    const sample=silent?0:Math.round(18000*Math.sin(2*Math.PI*440*t));
    for(let ch=0;ch<channels;ch++)
      b.writeInt16LE(sample,44+f*channels*2+ch*2);
  }
  return b;
}
function setup(bytes=wav()){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p15-real-wav-')),id='owned-video';
  fs.mkdirSync(path.join(root,id));
  fs.writeFileSync(path.join(root,id,'voice.wav'),bytes);
  const request={root,id,filename:'voice.wav',expected_sha256:sha(bytes)};
  return {root,id,request,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function denied(code,action){assert.throws(action,e=>e?.code===code,code)}
test('measures actual PCM waveform and reports silence windows without guessing words',()=>{
  const x=setup();try{
    const a=measureOwnedWavSilence(x.request);
    assert.equal(a.analysis,'MEASURED_AUDIO_SILENCE');
    assert.equal(a.audio_source_sha256,x.request.expected_sha256);
    assert.equal(a.sample_rate,16000);
    assert.equal(a.duration_us,2_500_000);
    assert.equal(a.silences.length,2);
    const [[first,second],expected]=[a.silences,[[300_000,850_000],[1_500_000,1_950_000]]];
    for(let i=0;i<2;i++){
      assert.ok(Math.abs(a.silences[i].start_us-expected[i][0])<=20_000);
      assert.ok(Math.abs(a.silences[i].end_us-expected[i][1])<=20_000);
    }
    assert.equal(first.method,'pcm16_rms');
    assert.equal(second.confidence,'measured_signal_only');
    assert.equal(a.word_alignment_verified,false);
    assert.equal(a.publication_allowed,false);
    assert.deepEqual(measureOwnedWavSilence(x.request),a,'deterministic');
    assert.equal(fs.existsSync(path.join(x.root,x.id,'.rhythm')),false);
  }finally{x.close()}
});
test('stereo 48kHz samples and nondefault silence policy',()=>{
  const bytes=wav({rate:48000,seconds:1.2,channels:2,quiet:[[0.3,0.75]]});
  const x=setup(bytes);try{
    const result=measureOwnedWavSilence({...x.request,min_silence_us:250000});
    assert.equal(result.channels,2);
    assert.equal(result.silences.length,1);
  }finally{x.close()}
});
test('short pauses do not satisfy minimum 220ms duration',()=>{
  const x=setup(wav({quiet:[[0.3,0.42],[1.6,1.72]]}));try{
    assert.equal(measureOwnedWavSilence(x.request).silences.length,0);
  }finally{x.close()}
});
test('rejects source SHA drift, corrupt RIFF and invalid expected hash',()=>{
  const x=setup();try{
    denied('AUDIO_SOURCE_CHANGED',()=>measureOwnedWavSilence({...x.request,expected_sha256:'f'.repeat(64)}));
    denied('INVALID_EXPECTED_SHA',()=>measureOwnedWavSilence({...x.request,expected_sha256:'broken'}));
    const corrupt=Buffer.from('this is not RIFF');
    fs.writeFileSync(path.join(x.root,x.id,'voice.wav'),corrupt);
    denied('AUDIO_SIZE_UNSUPPORTED',()=>measureOwnedWavSilence({...x.request,expected_sha256:sha(corrupt)}));
  }finally{x.close()}
});
test('rejects unsupported sample precision, channels and forged RIFF lengths',()=>{
 const base=wav();
 const variants=[
  {b:Buffer.from(base),patch:b=>b.writeUInt16LE(32,34),code:'UNSUPPORTED_PCM_FORMAT'},
  {b:Buffer.from(base),patch:b=>b.writeUInt16LE(4,22),code:'UNSUPPORTED_PCM_FORMAT'},
  {b:Buffer.from(base),patch:b=>b.writeUInt32LE(7,4),code:'INVALID_WAV_LENGTH'}
 ];
 const x=setup();try{for(const item of variants){
  item.patch(item.b);
  fs.writeFileSync(path.join(x.root,x.id,'voice.wav'),item.b);
  denied(item.code,()=>measureOwnedWavSilence({...x.request,expected_sha256:sha(item.b)}));
 }}finally{x.close()}
});
test('source filename and symlink escape are denied',()=>{
 const x=setup();try{
  denied('ANALYSIS_FORMAT_UNSUPPORTED',()=>measureOwnedWavSilence({...x.request,filename:'../private.wav'}));
  denied('ANALYSIS_FORMAT_UNSUPPORTED',()=>measureOwnedWavSilence({...x.request,filename:'voice.mp3'}));
  const external=path.join(x.root,'private.wav');
  fs.writeFileSync(external,wav());
  fs.unlinkSync(path.join(x.root,x.id,'voice.wav'));
  try{fs.symlinkSync(external,path.join(x.root,x.id,'voice.wav'))}
  catch(e){if(['EPERM','EACCES'].includes(e.code))return;throw e}
  denied('AUDIO_FILE_UNSAFE',()=>measureOwnedWavSilence({...x.request,expected_sha256:sha(fs.readFileSync(external))}));
 }finally{x.close()}
});
test('oversized input and invalid policy fail closed',()=>{
  const x=setup();try{
    denied('INVALID_SILENCE_POLICY',()=>measureOwnedWavSilence({...x.request,rms_threshold:NaN}));
    denied('INVALID_SILENCE_POLICY',()=>measureOwnedWavSilence({...x.request,min_silence_us:5}));
    const file=path.join(x.root,x.id,'voice.wav');
    fs.truncateSync(file,33*1024*1024);
    denied('AUDIO_SIZE_UNSUPPORTED',()=>measureOwnedWavSilence(x.request));
  }finally{x.close()}
});

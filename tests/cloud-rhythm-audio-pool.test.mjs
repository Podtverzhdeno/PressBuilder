import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {rhythmAudioPool} from '../server/rhythm-audio-pool.mjs';
import {rhythmPreviewService} from '../server/rhythm-preview.mjs';

class StubWorker extends EventEmitter {
  terminated=false;
  postMessage(msg){this.input=msg}
  terminate(){this.terminated=true;return Promise.resolve(0)}
}
const error=(code,fn)=>assert.rejects(fn,e=>e?.code===code,code);
test('worker admission enforces max-active/max-waiting and does not overrun',async()=>{
 const workers=[],pool=rhythmAudioPool({maxActive:1,maxWaiting:1,timeoutMs:1000,
   workerFactory:()=>{const w=new StubWorker();workers.push(w);return w}});
 try{
  const one=pool.inspect({job:1}),two=pool.inspect({job:2});
  assert.deepEqual(pool.stats(),{active:1,waiting:1,maxActive:1,maxWaiting:1,closed:false});
  await error('AUDIO_QUEUE_FULL',()=>pool.inspect({job:3}));
  assert.equal(workers.length,1);
  workers[0].emit('message',{ok:true,result:{job:1}});
  assert.deepEqual(await one,{job:1});
  assert.equal(workers.length,2);
  assert.deepEqual(workers[1].input,{job:2});
  workers[1].emit('message',{ok:true,result:{job:2}});
  assert.deepEqual(await two,{job:2});
  assert.equal(pool.stats().active,0);
  assert.equal(pool.stats().waiting,0);
 }finally{pool.close()}
});
test('worker cancellation and timeout never publish a successful inspection',async()=>{
 const workers=[],pool=rhythmAudioPool({maxActive:1,maxWaiting:2,timeoutMs:30,
   workerFactory:()=>{const w=new StubWorker();workers.push(w);return w}});
 try{
  const one=pool.inspect({job:'first'});
  const abort=new AbortController();
  const two=pool.inspect({job:'queued'},{signal:abort.signal});
  abort.abort();
  await error('AUDIO_CANCELLED',()=>two);
  await error('AUDIO_WORKER_TIMEOUT',()=>one);
  assert.equal(pool.stats().active,0);
  assert.equal(pool.stats().waiting,0);
  assert.ok(workers[0].terminated);
 }finally{pool.close()}
});
test('pool shutdown drains queued jobs and cancels running one',async()=>{
 const workers=[],pool=rhythmAudioPool({maxActive:1,maxWaiting:2,timeoutMs:1000,
   workerFactory:()=>{const w=new StubWorker();workers.push(w);return w}});
 const a=pool.inspect({a:1}),b=pool.inspect({b:2});
 pool.close();
 await error('AUDIO_POOL_CLOSED',()=>a);
 await error('AUDIO_CANCELLED',()=>b);
 assert.equal(pool.stats().active,0);
 assert.ok(workers[0].terminated);
});
function makeWav(){
 const pcm=Buffer.alloc(4*8000*2);
 for(let i=0;i<32000;i++){
  const sample=i%8000<4000?Math.round(Math.sin(i*2*Math.PI*440/8000)*8000):0;
  pcm.writeInt16LE(sample,2*i);
 }
 const w=Buffer.alloc(44+pcm.length);
 w.write('RIFF',0);w.writeUInt32LE(w.length-8,4);w.write('WAVEfmt ',8);
 w.writeUInt32LE(16,16);w.writeUInt16LE(1,20);w.writeUInt16LE(1,22);
 w.writeUInt32LE(8000,24);w.writeUInt32LE(16000,28);w.writeUInt16LE(2,32);
 w.writeUInt16LE(16,34);w.write('data',36);w.writeUInt32LE(pcm.length,40);
 pcm.copy(w,44);return w;
}
function fixture(pool){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-rhythm-async-')),id='worker-test';
 const dir=path.join(root,id);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'voice.wav'),makeWav());
 const deck={id,format:{fps:24,height:1080},audio:{file:'voice.wav'},target:4,
  slides:Array.from({length:4},(_,i)=>({id:'s0'+(i+1),lead:0,tail:0,
    cues:[{id:'c01',say:'synthetic audio '+i,dur:1}]}))};
 const service=rhythmPreviewService({root,getDeck:()=>deck,enabled:true,
  audioEvidenceEnabled:true,asyncAudioPool:pool});
 const c=service.context(id);
 const request={
  schema_version:1,project_id:id,voice_source_sha256:c.voice_source_sha256,
  alignment_revision:c.alignment_revision,expected_alignment_revision:c.alignment_revision,
  timebase_revision:c.timebase_revision,expected_timebase_revision:c.timebase_revision,
  frame_rate:c.frame_rate,duration_us:c.duration_us,
  words:Array.from({length:4},(_,i)=>({id:'w'+i,scene_id:'s0'+(i+1),
   cue_id:'c01',start_us:i*1_000_000,end_us:i*1_000_000+400_000})),
  pauses:Array.from({length:4},(_,i)=>({scene_id:'s0'+(i+1),cue_id:'c01',
   start_us:i*1_000_000+650_000,end_us:i*1_000_000+900_000})),
  beats:[],policy:{min_shot_frames:4,max_cuts_per_10s:8,max_cuts:8}
 };
 return {root,dir,id,deck,service,request,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const ffmpeg=spawnSync('ffmpeg',['-version'],{timeout:2000}).status===0;
test('real worker-thread PCM inspection returns evidence without mutating output',
 {skip:!ffmpeg,timeout:15_000},async()=>{
 const pool=rhythmAudioPool({maxActive:1,maxWaiting:1,timeoutMs:12_000});
 const x=fixture(pool);
 try{
  const before=fs.readFileSync(path.join(x.dir,'voice.wav'));
  const r=await x.service.previewAsync(x.id,x.request);
  assert.equal(r.status,'READY_FOR_REVIEW',JSON.stringify(r.issues));
  assert.equal(r.provenance.pause_audio_verified,true);
  assert.equal(r.provenance.word_alignment_verified,false);
  assert.equal(r.audio_evidence.findings.length,4);
  assert.equal(r.publication_allowed,false);
  assert.equal(r.persisted,false);
  assert.deepEqual(fs.readFileSync(path.join(x.dir,'voice.wav')),before);
  assert.equal(fs.existsSync(path.join(x.dir,'.rhythm')),false);
 }finally{x.close();pool.close()}
});
test('changing actual voice while worker is pending fails closed after queue',async()=>{
 let release;
 const barrier=new Promise(resolve=>{release=resolve});
 const pool={inspect:()=>barrier};
 const x=fixture(pool);
 try{
  const task=x.service.previewAsync(x.id,x.request);
  fs.appendFileSync(path.join(x.dir,'voice.wav'),Buffer.from('modified'));
  release({status:'PAUSES_SUPPORTED',findings:[]});
  const r=await task;
  assert.equal(r.status,'REVIEW');
  assert.deepEqual(r.cuts,[]);
  assert.ok(r.issues.includes('CUE_CLOCK_OR_AUDIO_STALE'));
  assert.equal(r.publication_allowed,false);
 }finally{x.close()}
});


test('shifted narration never receives false audio-silence approval',async()=>{
 let calls=0;
 const pool={inspect:async()=>{calls++;return {status:'PAUSES_SUPPORTED'}}};
 const x=fixture(pool);
 try{
  x.deck.audio.offset=0.25;
  const c=x.service.context(x.id);
  const request={...x.request,alignment_revision:c.alignment_revision,
   expected_alignment_revision:c.alignment_revision,
   timebase_revision:c.timebase_revision,
   expected_timebase_revision:c.timebase_revision};
  const r=await x.service.previewAsync(x.id,request);
  assert.equal(r.status,'REVIEW');
  assert.deepEqual(r.cuts,[]);
  assert.ok(r.issues.includes('AUDIO_OFFSET_UNSUPPORTED'));
  assert.equal(calls,0,'must reject before launching decoder');
 }finally{x.close()}
});

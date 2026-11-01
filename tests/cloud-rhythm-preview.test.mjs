import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {rhythmPreviewService} from '../server/rhythm-preview.mjs';

const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pb-rhythm-preview-'));
const data=Buffer.from('RIFF!synthetic-voice-fixture-not-a-real-decoded-audio');
function fixture(enabled=true){
  const root=tmp(),id='owned-video';
  fs.mkdirSync(path.join(root,id),{recursive:true});
  fs.writeFileSync(path.join(root,id,'voice.wav'),data);
  const deck={
    id,format:{fps:24,height:1080},audio:{file:'voice.wav'},
    target:4,slides:[
      {id:'s01',lead:0,tail:0,cues:[{id:'c01',say:'Hello',dur:2}]},
      {id:'s02',lead:0,tail:0,cues:[{id:'c01',say:'Again',dur:2}]},
    ]
  };
  const svc=rhythmPreviewService({root,getDeck:requested=>{
    if(requested!==id)throw Object.assign(new Error('No deck'),{status:404});
    return deck;
  },enabled});
  function request(){
    const c=svc.context(id);
    return {
      schema_version:1,project_id:id,
      voice_source_sha256:c.voice_source_sha256,
      alignment_revision:c.alignment_revision,
      expected_alignment_revision:c.alignment_revision,
      timebase_revision:c.timebase_revision,
      expected_timebase_revision:c.timebase_revision,
      frame_rate:c.frame_rate,duration_us:c.duration_us,
      words:[
        {id:'w1',scene_id:'s01',cue_id:'c01',start_us:0,end_us:800_000},
        {id:'w2',scene_id:'s02',cue_id:'c01',start_us:2_000_000,end_us:2_800_000}
      ],
      pauses:[
        {scene_id:'s01',cue_id:'c01',start_us:900_000,end_us:1_400_000},
        {scene_id:'s02',cue_id:'c01',start_us:2_900_000,end_us:3_400_000}
      ],
      beats:[],policy:{min_shot_frames:4,max_cuts_per_10s:6,max_cuts:5}
    };
  }
  return {root,id,deck,svc,request,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const rejects=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);

test('context SHA comes from real voice bytes and matches scoped deck cue revision',()=>{
 const x=fixture();
 try{
  const c=x.svc.context(x.id);
  assert.equal(c.voice_source_sha256,createHash('sha256').update(data).digest('hex'));
  assert.equal(c.cues.length,2);
  assert.deepEqual(c.cues.map(t=>t.scene_id),['s01','s02']);
  assert.equal(c.duration_us,4_000_000);
  assert.equal(c.voice_verified,true);
  assert.equal(c.word_alignment_verified,false);
  assert.match(c.timebase_revision,/^[a-f0-9]{64}$/);
 }finally{x.close()}
});
test('scoped preview is reversible, deterministic, and explicitly unapproved',()=>{
 const x=fixture();
 try{
  const before=fs.readFileSync(path.join(x.root,x.id,'voice.wav'));
  const a=x.svc.preview(x.id,x.request()),b=x.svc.preview(x.id,x.request());
  assert.deepEqual(a,b);
  assert.equal(a.status,'READY_FOR_REVIEW');
  assert.deepEqual(a.cuts.map(c=>c.reason),['pause','pause']);
  assert.equal(a.publication_allowed,false);
  assert.equal(a.provenance.voice_sha_verified,true);
  assert.equal(a.provenance.word_alignment_verified,false);
  assert.equal(a.provenance.music_rights_verified,false);
  assert.equal(a.persisted,false);
  assert.deepEqual(fs.readFileSync(path.join(x.root,x.id,'voice.wav')),before);
  assert.equal(fs.existsSync(path.join(x.root,x.id,'montage')),false);
 }finally{x.close()}
});
test('feature is opt-in and cannot silently enable during production',()=>{
 const x=fixture(false);
 try{rejects('RHYTHM_PREVIEW_DISABLED',()=>x.svc.context(x.id))}
 finally{x.close()}
});
test('foreign project ID and stale voice hash rejected',()=>{
 const x=fixture();
 try{
  rejects('PROJECT_MISMATCH',()=>x.svc.preview(x.id,{...x.request(),project_id:'foreign-project'}));
  const manifest=x.request();
  fs.writeFileSync(path.join(x.root,x.id,'voice.wav'),'another file');
  rejects('VOICE_SOURCE_STALE',()=>x.svc.preview(x.id,manifest));
 }finally{x.close()}
});
test('modified cue clocks invalidate prior manifests',()=>{
 const x=fixture();
 try{
  const prev=x.request();
  x.deck.slides[0].cues[0].say='Updated narration';
  rejects('CUE_CLOCK_STALE',()=>x.svc.preview(x.id,prev));
 }finally{x.close()}
});
test('duplicated IDs must be explicitly qualified by scene',()=>{
 const x=fixture();
 try{
  const r=x.request();
  delete r.words[0].scene_id;
  rejects('AMBIGUOUS_CUE_ID',()=>x.svc.preview(x.id,r));
  const p=x.request();
  p.words[0].scene_id='s03';
  rejects('UNKNOWN_SCENE_CUE',()=>x.svc.preview(x.id,p));
 }finally{x.close()}
});
test('a word cannot claim timing outside the actual cue',()=>{
 const x=fixture();
 try{
  const r=x.request();
  r.words[0].end_us=2_700_000;
  rejects('WORD_OUTSIDE_CUE',()=>x.svc.preview(x.id,r));
 }finally{x.close()}
});
test('no voice file means no false trusted preview',()=>{
 const x=fixture();
 try{
  fs.rmSync(path.join(x.root,x.id,'voice.wav'));
  rejects('VOICE_UNAVAILABLE',()=>x.svc.context(x.id));
 }finally{x.close()}
});
test('unsafe voice paths and symlinks are refused before reading external bytes',()=>{
 const x=fixture();
 const outside=path.join(x.root,'private.wav');
 try{
  x.deck.audio.file='../private.wav';
  rejects('VOICE_FILE_UNSUPPORTED',()=>x.svc.context(x.id));
  x.deck.audio.file='voice.wav';
  fs.writeFileSync(outside,'CONFIDENTIAL');
  fs.unlinkSync(path.join(x.root,x.id,'voice.wav'));
  try{
   fs.symlinkSync(outside,path.join(x.root,x.id,'voice.wav'));
   rejects('VOICE_FILE_UNSAFE',()=>x.svc.context(x.id));
  }catch(e){if(e.code==='EPERM')return;throw e}
 }finally{x.close()}
});
test('unsupported project FPS fails before any montage calculations',()=>{
 const x=fixture();
 try{
  x.deck.format.fps=29.97;
  rejects('UNSUPPORTED_PROJECT_FPS',()=>x.svc.context(x.id));
 }finally{x.close()}
});
test('cue-clock fingerprints are stable over no-op reads',()=>{
 const x=fixture();
 try{
  const a=x.svc.context(x.id),b=x.svc.context(x.id);
  assert.equal(a.timebase_revision,b.timebase_revision);
  assert.equal(a.voice_source_sha256,b.voice_source_sha256);
 }finally{x.close()}
});


test('review finding: changing narration offset invalidates prior cue timebase',()=>{
 const x=fixture();try{
  const manifest=x.request();
  const old=x.svc.context(x.id).timebase_revision;
  x.deck.audio.offset=0.45;
  assert.notEqual(x.svc.context(x.id).timebase_revision,old);
  rejects('CUE_CLOCK_STALE',()=>x.svc.preview(x.id,manifest));
 }finally{x.close()}
});
test('review finding: unique unqualified cue ID is normalized exactly once',()=>{
 const x=fixture();try{
  x.deck.slides[1].cues[0].id='c02';
  const m=x.request();
  m.words[1].cue_id='c02';
  m.pauses[1].cue_id='c02';
  const explicit=x.svc.preview(x.id,m);
  assert.equal(explicit.status,'READY_FOR_REVIEW');
  const shorthand=structuredClone(m);
  delete shorthand.words[0].scene_id;
  delete shorthand.pauses[0].scene_id;
  const normalized=x.svc.preview(x.id,shorthand);
  assert.equal(normalized.status,'READY_FOR_REVIEW');
  assert.deepEqual(normalized.cuts,explicit.cuts);
  assert.equal(normalized.plan_sha256,explicit.plan_sha256);
 }finally{x.close()}
});

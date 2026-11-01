import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {inspectRhythmSilence} from '../server/rhythm-audio-evidence.mjs';
import {musicRightsVerifier} from '../server/rhythm-music-rights.mjs';
import {rhythmPreviewService} from '../server/rhythm-preview.mjs';

const ffmpegAvailable=spawnSync('ffmpeg',['-version'],{encoding:'utf8',timeout:2000}).status===0;
const sha=b=>createHash('sha256').update(b).digest('hex');
/** Actual PCM RIFF/WAV file; six one-second scene sections. Each first 0.5s
 * carries a sine "voice activity" stimulus, the second 0.5s is digital silence.
 * This is not human speech and NEVER proves word alignment or artistic quality.
 */
function makeWav(scenes=6){
 const sampleRate=8000, samples=scenes*sampleRate,pcm=Buffer.alloc(samples*2);
 for(let i=0;i<samples;i++){
   const within=i%sampleRate;
   const value=within<sampleRate/2
     ?Math.round(Math.sin(2*Math.PI*330*i/sampleRate)*0.36*32767):0;
   pcm.writeInt16LE(value,i*2);
 }
 const out=Buffer.alloc(44+pcm.length);
 out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
 out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
 out.writeUInt32LE(sampleRate,24);out.writeUInt32LE(sampleRate*2,28);
 out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
 out.write('data',36);out.writeUInt32LE(pcm.length,40);pcm.copy(out,44);
 return out;
}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-audio-gates-'));
 const projectRoot=path.join(root,'decks');
 const catalogDir=path.join(root,'operator');
 const musicRoot=path.join(root,'licensed-music');
 const id='owned-six',project=path.join(projectRoot,id);
 fs.mkdirSync(project,{recursive:true});fs.mkdirSync(catalogDir);fs.mkdirSync(musicRoot);
 const voice=makeWav(), music=makeWav(1);
 fs.writeFileSync(path.join(project,'voice.wav'),voice);
 fs.writeFileSync(path.join(musicRoot,'beat.wav'),music);
 const catalog=path.join(catalogDir,'music.json');
 const license='owned/producer-1';
 const asset={asset_id:'beat-1',file_name:'beat.wav',source_sha256:sha(music),
   license_ref:license,status:'approved',rights_attested_by:'operator-1',
   allowed_projects:[id],expires_at:'2030-01-01T00:00:00Z'};
 fs.writeFileSync(catalog,JSON.stringify({schema_version:1,assets:[asset]}));
 const rights=musicRightsVerifier({catalogFile:catalog,assetRoot:musicRoot,projectRoot});
 const deck={id,format:{fps:24,height:1080},audio:{file:'voice.wav'},
   target:6,slides:Array.from({length:6},(_,i)=>({
     id:'s0'+(i+1),lead:0,tail:0,
     cues:[{id:'c01',say:'synthetic demonstration '+i,dur:1}]
   }))};
 const preview=rhythmPreviewService({root:projectRoot,getDeck:()=>deck,enabled:true,
   audioEvidenceEnabled:true,rightsVerifier:rights});
 function manifest(){
   const c=preview.context(id);
   return {schema_version:1,project_id:id,voice_source_sha256:c.voice_source_sha256,
     alignment_revision:c.alignment_revision,
     expected_alignment_revision:c.alignment_revision,
     timebase_revision:c.timebase_revision,
     expected_timebase_revision:c.timebase_revision,
     frame_rate:c.frame_rate,duration_us:c.duration_us,
     words:Array.from({length:6},(_,i)=>({id:'w'+i,scene_id:'s0'+(i+1),
       cue_id:'c01',start_us:i*1_000_000,end_us:i*1_000_000+450_000})),
     pauses:Array.from({length:6},(_,i)=>({scene_id:'s0'+(i+1),
       cue_id:'c01',start_us:i*1_000_000+600_000,end_us:i*1_000_000+900_000})),
     beats:[],policy:{min_shot_frames:6,max_cuts_per_10s:10,max_cuts:10}};
 }
 return {root,id,projectRoot,project,musicRoot,catalog,asset,rights,preview,manifest,
   music:{licensed:true,source_sha256:sha(music),license_ref:license},
   close(){fs.rmSync(root,{recursive:true,force:true})}};
}
const bad=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);
test('P15 six real WAV scene intervals: silence vs active audio', {skip:!ffmpegAvailable},()=>{
 const x=fixture();try{
   const c=x.preview.context(x.id),m=x.manifest();
   const result=inspectRhythmSilence({
     root:x.projectRoot,project_id:x.id,filename:'voice.wav',
     voice_source_sha256:c.voice_source_sha256,duration_us:c.duration_us,
     spans:m.pauses
   });
   assert.equal(result.status,'PAUSES_SUPPORTED');
   assert.equal(result.findings.length,6);
   assert.ok(result.findings.every(f=>f.verdict==='SILENT'&&f.rms_dbfs<-70));
   assert.equal(result.decoded_samples,48_000);
   assert.equal(result.word_alignment_verified,false);
   assert.equal(result.publication_allowed,false);
   const approved=x.preview.preview(x.id,m);
   assert.equal(approved.status,'READY_FOR_REVIEW');
   assert.equal(approved.cuts.length,6);
   assert.equal(approved.provenance.pause_audio_verified,true);
   assert.equal(approved.provenance.word_alignment_verified,false);
   assert.equal(approved.publication_allowed,false);
   const falsePause=structuredClone(m);
   falsePause.pauses[0]={...falsePause.pauses[0],start_us:100_000,end_us:400_000};
   const rejected=x.preview.preview(x.id,falsePause);
   assert.equal(rejected.status,'REVIEW');
   assert.deepEqual(rejected.cuts,[]);
   assert.ok(rejected.issues.includes('PAUSE_AUDIO_NOT_SILENT'));
   assert.equal(rejected.audio_evidence.findings[0].verdict,'AUDIBLE');
 }finally{x.close()}
});
test('P15 fail-closed on forged SHA and malformed audio span',()=>{
 const x=fixture();try{
   const c=x.preview.context(x.id);
   bad('VOICE_SOURCE_STALE',()=>inspectRhythmSilence({
     root:x.projectRoot,project_id:x.id,filename:'voice.wav',
     voice_source_sha256:'f'.repeat(64),duration_us:6_000_000,
     spans:[{start_us:600_000,end_us:900_000}]}));
   bad('AUDIO_SPAN_BOUNDS',()=>inspectRhythmSilence({
     root:x.projectRoot,project_id:x.id,filename:'voice.wav',
     voice_source_sha256:c.voice_source_sha256,duration_us:6_000_000,
     spans:[{start_us:600_000,end_us:5_900_000}]}));
 }finally{x.close()}
});
test('P15 real decode unavailable yields REVIEW without any cuts',()=>{
 const x=fixture();try{
   const m=x.manifest();
   const fault=rhythmPreviewService({root:x.projectRoot,getDeck:()=>({
     id:x.id,format:{fps:24,height:1080},audio:{file:'voice.wav'},target:6,
     slides:Array.from({length:6},(_,i)=>({id:'s0'+(i+1),
       cues:[{id:'c01',say:'synthetic demonstration '+i,dur:1}]}))
   }),enabled:true,audioEvidenceEnabled:true,
   audioInspector:()=>{throw Object.assign(new Error('decoder missing'),
     {code:'AUDIO_DECODE_UNAVAILABLE'})}});
   // The two schedules might differ in decorative slide defaults. Use the
   // service's own exact context, never weaken source checks for a test.
   const c=fault.context(x.id);
   const input={...m,alignment_revision:c.alignment_revision,
     expected_alignment_revision:c.alignment_revision,
     timebase_revision:c.timebase_revision,
     expected_timebase_revision:c.timebase_revision};
   const r=fault.preview(x.id,input);
   assert.equal(r.status,'REVIEW');assert.deepEqual(r.cuts,[]);
   assert.ok(r.issues.includes('AUDIO_DECODE_UNAVAILABLE'));
 }finally{x.close()}
});
test('P15 trusted music catalog verifies actual bytes and project scope',()=>{
 const x=fixture();try{
   const verified=x.rights.verify(x.id,x.music);
   assert.equal(verified.verified,true);
   assert.equal(verified.source,'operator_owned_catalog_v1');
   bad('MUSIC_RIGHTS_UNVERIFIED',()=>x.rights.verify('foreign-video',x.music));
   bad('MUSIC_RIGHTS_UNVERIFIED',()=>x.rights.verify(x.id,{
     ...x.music,source_sha256:'d'.repeat(64)}));
   const withBeat=x.manifest();
   withBeat.beats=[{frame:35}];withBeat.music=x.music;
   const result=x.preview.preview(x.id,withBeat);
   assert.equal(result.status,'READY_FOR_REVIEW');
   assert.equal(result.provenance.music_rights_verified,true);
   fs.appendFileSync(path.join(x.musicRoot,'beat.wav'),Buffer.from('tamper'));
   bad('MUSIC_SOURCE_SHA_MISMATCH',()=>x.rights.verify(x.id,x.music));
   const review=x.preview.preview(x.id,withBeat);
   assert.equal(review.status,'REVIEW');
   assert.ok(review.issues.includes('MUSIC_SOURCE_SHA_MISMATCH'));
   assert.deepEqual(review.cuts,[]);
 }finally{x.close()}
});
test('P15 license expiry blocks beats, even if caller says licensed:true',()=>{
 const x=fixture();try{
   const expired=musicRightsVerifier({catalogFile:x.catalog,
     assetRoot:x.musicRoot,projectRoot:x.projectRoot,
     now:()=>new Date('2031-01-01T00:00:00Z')});
   bad('MUSIC_RIGHTS_EXPIRED',()=>expired.verify(x.id,x.music));
   const noCatalog=rhythmPreviewService({
     root:x.projectRoot,getDeck:()=>({id:x.id,format:{fps:24,height:1080},
       audio:{file:'voice.wav'},target:6,
       slides:Array.from({length:6},(_,i)=>({id:'s0'+(i+1),
         cues:[{id:'c01',say:'synthetic demonstration '+i,dur:1}]}))
     }),enabled:true
   });
   const c=noCatalog.context(x.id);
   const manifest={...x.manifest(),alignment_revision:c.alignment_revision,
     expected_alignment_revision:c.alignment_revision,
     timebase_revision:c.timebase_revision,
     expected_timebase_revision:c.timebase_revision,
     beats:[{frame:35}],music:x.music};
   const r=noCatalog.preview(x.id,manifest);
   assert.equal(r.status,'REVIEW');
   assert.ok(r.issues.includes('MUSIC_CATALOG_NOT_CONFIGURED'));
   assert.equal(r.provenance.music_rights_verified,false);
 }finally{x.close()}
});
test('P15 operator rights catalog cannot be inside project-controlled root',()=>{
 const x=fixture();try{
   const unsafe=musicRightsVerifier({
     catalogFile:path.join(x.project,'admin-rights.json'),
     assetRoot:x.project,projectRoot:x.projectRoot
   });
   bad('UNSAFE_MUSIC_CATALOG_LOCATION',()=>unsafe.verify(x.id,x.music));
 }finally{x.close()}
});

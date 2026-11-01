import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeMotionFrames} from '../server/motion-engine.mjs';
function fixture(){return {schema_version:1,project_id:'p18',scene_id:'s01',source_sha256:'a'.repeat(64),
 expected_revision:2,frame_rate:{num:24,den:1},duration_frames:120,reduced_motion:false,
 tracks:[{target_id:'mesh01',property:'x',keyframes:[
  {frame:0,value:0,easing:'smoothstep'},{frame:120,value:0.6,easing:'linear'}]}]};}
const bad=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);
test('P18 bounded rational easing preview is deterministic, SHA-pinned and never published',()=>{
 const a=proposeMotionFrames(fixture()),b=proposeMotionFrames(fixture());
 assert.deepEqual(a,b);assert.equal(a.status,'REVIEW_ONLY');
 assert.equal(a.samples[0].values[0].value,0);
 assert.equal(a.samples[2].values[0].value,0.3);
 assert.equal(a.samples.at(-1).values[0].value,0.6);
 assert.equal(a.samples.at(-1).t_us,5_000_000);
 assert.equal(a.publication_allowed,false);
 const reduced=proposeMotionFrames({...fixture(),reduced_motion:true});
 assert.equal(reduced.samples.at(-1).values[0].value,0);
 assert.notEqual(a.proposal_sha256,reduced.proposal_sha256);
 const next=proposeMotionFrames({...fixture(),expected_revision:3});
 assert.notEqual(next.proposal_sha256,a.proposal_sha256);
});
test('P18 rejects invalid FPS, NaN, velocity, flash, duplicate tracks and excessive samples',()=>{
 bad('MOTION_REQUEST_INVALID',()=>proposeMotionFrames({...fixture(),frame_rate:{num:24,den:2}}));
 bad('MOTION_REQUEST_INVALID',()=>proposeMotionFrames({...fixture(),duration_frames:1801}));
 bad('MOTION_REQUEST_INVALID',()=>proposeMotionFrames({...fixture(),source_url:'https://bad.example'}));
 const noProject=fixture();delete noProject.project_id;
 bad('MOTION_REQUEST_INVALID',()=>proposeMotionFrames(noProject));
 const noTarget=fixture();delete noTarget.tracks[0].target_id;
 bad('MOTION_TRACK_INVALID',()=>proposeMotionFrames(noTarget));
 const nil=fixture();nil.tracks[0].keyframes[1].value=NaN;
 bad('MOTION_KEYFRAME_INVALID',()=>proposeMotionFrames(nil));
 const o=fixture();o.tracks[0].keyframes=[{frame:0,value:0},{frame:2,value:1},{frame:120,value:1}];
 bad('MOTION_VELOCITY_EXCEEDED',()=>proposeMotionFrames(o));
 const flash=fixture();flash.tracks[0].property='opacity';
 flash.tracks[0].keyframes=[{frame:0,value:0},{frame:2,value:1},{frame:120,value:1}];
 bad('MOTION_FLASH_RISK',()=>proposeMotionFrames(flash));
 const duplicate=fixture();duplicate.tracks.push(structuredClone(duplicate.tracks[0]));
 bad('MOTION_DUPLICATE_PROPERTY',()=>proposeMotionFrames(duplicate));
 const samples=fixture();samples.sample_frames=Array.from({length:121},(_,i)=>i);
 bad('MOTION_SAMPLES_INVALID',()=>proposeMotionFrames(samples));
 const accel=fixture();accel.tracks[0].keyframes=[
  {frame:0,value:0},{frame:35,value:0.1},{frame:36,value:0.11},{frame:120,value:0.6}];
 bad('MOTION_ACCELERATION_EXCEEDED',()=>proposeMotionFrames(accel));
});
test('P18 supports exact 30000/1001 FPS and reduced motion preserving readable opacity',()=>{
 const x=fixture();x.frame_rate={num:30000,den:1001};
 const r=proposeMotionFrames(x);assert.equal(r.samples.at(-1).t_us,4_004_000);
 const y=fixture();y.reduced_motion=true;y.tracks=[{
  target_id:'title01',property:'opacity',keyframes:[{frame:0,value:0,easing:'linear'},
   {frame:120,value:1,easing:'linear'}]}];
 const s=proposeMotionFrames(y);assert.equal(s.samples.at(-1).values[0].value,1);
});

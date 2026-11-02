import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildQcCockpit,qcCockpitService} from '../server/qc-cockpit.mjs';
const sha='a'.repeat(64);
const deny=(fn,code)=>assert.throws(fn,e=>e?.code===code||e?.message===code,code);
const releaseId='00000000-0000-0000-0000-000000000001';
function fixture(){
 const scenes=Array.from({length:6},(_,i)=>({
  id:'s0'+(i+1),sha256:('abcdef'[i]).repeat(64),duration:3.5,
  approved_version_id:('abcdef'[i]).repeat(16),approved_revision:2,
  has_audio:false,transition_after:{type:i===0||i===2?'crossfade':'hard-cut',
   duration:i===0?0.25:i===2?0.5:0}
 }));
 const release={release_id:releaseId,manifest:{
  schemaVersion:1,project:'demo',release_id:releaseId,target_fps:24,
  scenes,output:{sha256:sha,qa:{verdict:'PASS',metadata:{duration:20.25},issues:[]}}}};
 const reviews={};
 for(let i=0;i<6;i++){
  const scene=scenes[i];
  reviews[scene.id]={revision:3,items:Array.from({length:i<5?4:0},(_,j)=>({
   id:'review-'+i+'-'+j,version_id:scene.approved_version_id,
   t:j===0?0.5:j===1?1:j===2?2:3,
   severity:j===0?'blocking':j===1?'high':'medium',
   status:j===3?'VERIFIED':'OPEN',text:'review note',
   created_by:'director',has_frame_evidence:true}))};
 }
 return {release,reviews};
}
test('M51-R01 six-scene 20 synthetic P07 issues receive exact relative PTS and source SHA',()=>{
 const {release,reviews}=fixture();
 const r=buildQcCockpit({projectId:'demo',release,reviewsByScene:reviews});
 assert.equal(r.events.length,20);
 assert.equal(r.scenes.length,6);
 assert.equal(r.duration_estimated_tick,Math.round(20.25*24)*10000);
 assert.equal(r.scenes[0].start_tick,0);
 assert.equal(r.scenes[1].start_tick,Math.round(3.25*24)*10000);
 assert.equal(r.events[0].global_pts_tick,500000/1000*240); // 0.5 s = 120000 ticks
 for(const e of r.events){
  assert.equal(e.global_pts_tick,e.global_frame*10000);
  assert.equal(e.release_sha256,sha);
  assert.equal(e.location,'EXACT_REVIEW_TIMECODE');
  assert.equal(e.source,'P07_REVIEW');
  assert.ok(e.global_seconds>=0);
  assert.ok(e.scene_source_sha256);
 }
 assert.equal(r.unresolved_review_events,15);
 assert.equal(r.technical_failures,0);
 assert.equal(r.publication_allowed,false);
 assert.equal(r.snapshot_sha256,buildQcCockpit({projectId:'demo',release,reviewsByScene:reviews}).snapshot_sha256);
});
test('M51-R01 never invents timecode for untimed technical P05 QA issues',()=>{
 const {release,reviews}=fixture();
 release.manifest.output.qa.issues=[{id:'VIDEO_CODEC',message:'Video codec warning'}];
 const r=buildQcCockpit({projectId:'demo',release,reviewsByScene:reviews});
 const last=r.events.find(x=>x.source==='P03_RELEASE_TECHNICAL');
 assert.equal(last.global_pts_tick,null);
 assert.equal(last.global_frame,null);
 assert.equal(last.global_seconds,null);
 assert.equal(last.location,'UNLOCATED_TECHNICAL_ISSUE');
 assert.equal(r.technical_failures,1);
 assert.equal(r.publication_allowed,false);
});
test('M51-R01 suppress stale reviews for older P08 source version and expose review-only scope',()=>{
 const {release,reviews}=fixture();
 reviews.s01.items[0].version_id='0000000000000000';
 const a=buildQcCockpit({projectId:'demo',release,reviewsByScene:reviews});
 assert.equal(a.stale_version_events_ignored,1);
 assert.equal(a.events.length,19);
 const svc=qcCockpitService({enabled:true,assembly:{current:()=>release},
  reviews:{list:(_,scene)=>reviews[scene]}});
 const full=svc.read('demo');
 assert.equal(full.events.length,19);
 const own=svc.read('demo',{sceneId:'s02'});
 assert.equal(own.events.length,4);
 assert.equal(own.scenes.length,1);
 assert.equal(own.scenes[0].scene_id,'s02');
 assert.ok(!('stale_version_events_ignored' in own));
 deny(()=>svc.read('demo',{sceneId:'wrong'}),'M51_SCENE_NOT_FOUND');
});
test('M51-R01 fail-closed on unverified release, FPS, malformed P07 and overlap',()=>{
 const {release,reviews}=fixture();
 deny(()=>qcCockpitService({enabled:false,assembly:{current:()=>release},reviews:{list:()=>({revision:0,items:[]})}}).read('demo'),'M51_DISABLED');
 deny(()=>qcCockpitService({enabled:true,assembly:{current:()=>null},reviews:{list:()=>({revision:0,items:[]})}}).read('demo'),'M51_NO_VERIFIED_RELEASE');
 release.manifest.output.qa.verdict='FAIL';
 deny(()=>buildQcCockpit({projectId:'demo',release,reviewsByScene:reviews}),'M51_UNTRUSTED_RELEASE');
 release.manifest.output.qa.verdict='PASS';
 release.manifest.scenes[0].transition_after.duration=0.9;
 deny(()=>buildQcCockpit({projectId:'demo',release,reviewsByScene:reviews}),'M51_INVALID_TRANSITION');
 release.manifest.scenes[0].transition_after.duration=0.25;
 reviews.s01.items[0].t=100;
 deny(()=>buildQcCockpit({projectId:'demo',release,reviewsByScene:reviews}),'M51_INVALID_REVIEW_ENTRY');
});

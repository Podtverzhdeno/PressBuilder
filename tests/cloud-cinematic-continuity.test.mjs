import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeContinuityTransition} from '../server/cinematic-continuity.mjs';
const hash=x=>x.repeat(64);
function pair(fps={num:24,den:1}){
 const shape=(frame,image)=>({
  frame,image_sha256:hash(image),camera_yaw_deg:10,
  subject_anchor:[0.2,0.2],motion_vector:[0.6,0.3],
  mean_luma:0.45,hue_deg:210,audio_rms_dbfs:-30
 });
 const left={scene_id:'s01',approved_version_id:'approved-left',source_sha256:hash('a'),
  fps,frames:144,entry:shape(0,'c'),exit:shape(143,'d'),
  audio_prehandle_frames:0,audio_posthandle_frames:24};
 const right={scene_id:'s02',approved_version_id:'approved-right',source_sha256:hash('b'),
  fps,frames:144,entry:shape(0,'e'),exit:shape(143,'f'),
  audio_prehandle_frames:24,audio_posthandle_frames:0};
 return {schema_version:1,left,right,transition:'hard_cut',overlap_frames:0};
}
const bad=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);
test('P17 hard cut is deterministic, source pinned and never published',()=>{
 const r=proposeContinuityTransition(pair());
 assert.equal(r.status,'READY_FOR_REVIEW');
 assert.equal(r.operation.video_left_last_frame,143);
 assert.equal(r.operation.video_right_first_frame,0);
 assert.equal(r.operation.video_boundary_us,6_000_000);
 assert.equal(r.operation.audio_overlap_us,0);
 assert.equal(r.publication_allowed,false);
 assert.equal(r.approved,false);
 assert.equal(r.persisted,false);
 assert.equal(proposeContinuityTransition(pair()).proposal_sha256,r.proposal_sha256);
 assert.equal(r.boundary_evidence.left.frame,143);
 assert.equal(r.boundary_evidence.right.frame,0);
});
test('P17 supports exact rational 30000/1001 frame rate without drift',()=>{
 const r=proposeContinuityTransition(pair({num:30000,den:1001}));
 assert.equal(r.status,'READY_FOR_REVIEW');
 assert.equal(r.operation.video_boundary_us,4_804_800);
 assert.deepEqual(r.operation.exact_frame_rate,{num:30000,den:1001});
});
test('P17 J and L cuts require the correct signed audio handle',()=>{
 const j=proposeContinuityTransition({...pair(),transition:'j_cut',overlap_frames:12});
 assert.equal(j.status,'READY_FOR_REVIEW');
 assert.equal(j.operation.audio_pre_overlap_frames,12);
 assert.equal(j.operation.audio_overlap_us,500_000);
 const l=proposeContinuityTransition({...pair(),transition:'l_cut',overlap_frames:12});
 assert.equal(l.operation.audio_post_overlap_frames,12);
 assert.equal(l.operation.audio_overlap_us,500_000);
 const noHandles=pair();noHandles.right.audio_prehandle_frames=11;
 bad('AUDIO_HANDLE_INSUFFICIENT',()=>proposeContinuityTransition({...noHandles,
  transition:'j_cut',overlap_frames:12}));
 const noTail=pair();noTail.left.audio_posthandle_frames=3;
 bad('AUDIO_HANDLE_INSUFFICIENT',()=>proposeContinuityTransition({...noTail,
  transition:'l_cut',overlap_frames:12}));
});
test('P17 motion mismatch and exposure change require REVIEW not silent approval',()=>{
 const m=pair();m.right.entry.motion_vector=[-0.6,-0.3];
 m.right.entry.mean_luma=0.95;
 const r=proposeContinuityTransition({...m,transition:'match_on_action'});
 assert.equal(r.status,'REVIEW');
 assert.ok(r.issues.includes('MATCH_ON_ACTION_UNVERIFIED'));
 assert.ok(r.issues.includes('EXPOSURE_DISCONTINUITY'));
 assert.ok(r.issues.includes('MOTION_DIRECTION_DISCONTINUITY'));
 assert.equal(r.publication_allowed,false);
});
test('P17 bad boundary frames, wrong project versions and fps fail closed',()=>{
 const m=pair();m.left.exit.frame=142;
 bad('BOUNDARY_FRAME_ID_MISMATCH',()=>proposeContinuityTransition(m));
 const n=pair();n.right.fps={num:25,den:1};
 bad('TRANSITION_SOURCE_INCOMPATIBLE',()=>proposeContinuityTransition(n));
 const w=pair();w.right.source_sha256='forged';
 bad('TRANSITION_SOURCE_INVALID',()=>proposeContinuityTransition(w));
 const dup=pair();dup.right.scene_id='s01';
 bad('TRANSITION_SOURCE_INCOMPATIBLE',()=>proposeContinuityTransition(dup));
 const empty=pair();delete empty.right.entry.image_sha256;
 bad('BOUNDARY_DESCRIPTOR_INVALID',()=>proposeContinuityTransition(empty));
});
test('P17 disallows unattested arbitrary extra request fields and impossible overlap',()=>{
 const x=pair();
 bad('TRANSITION_REQUEST_INVALID',()=>proposeContinuityTransition({...x,
  source_url:'https://example.com/malicious.mp4'}));
 bad('TRANSITION_OVERLAP_INVALID',()=>proposeContinuityTransition({...x,
  transition:'hard_cut',overlap_frames:1}));
 bad('AUDIO_HANDLE_INSUFFICIENT',()=>proposeContinuityTransition({...x,
  transition:'j_cut',overlap_frames:0}));
 const y=pair();y.right.frames=2;y.right.exit.frame=1;
 y.right.audio_prehandle_frames=24;
 bad('TRANSITION_BOUNDARY_EXCEEDED',()=>proposeContinuityTransition({...y,
  transition:'j_cut',overlap_frames:3}));
});


test('P17 proposal fingerprint includes exact boundary JPEG hashes even with identical metrics',()=>{
 const baseline=pair();
 const candidate=pair(); candidate.left.exit.image_sha256=hash('9');
 const a=proposeContinuityTransition(baseline);
 const b=proposeContinuityTransition(candidate);
 assert.equal(a.status,b.status);
 assert.deepEqual(a.metrics,b.metrics);
 assert.notEqual(a.proposal_sha256,b.proposal_sha256);
 assert.notEqual(a.boundary_evidence.left.image_sha256,b.boundary_evidence.left.image_sha256);
});

test('P17 supports precise cinema 24000/1001 FPS and distinguishes stationary motion',()=>{
 const rate=proposeContinuityTransition(pair({num:24000,den:1001}));
 assert.equal(rate.operation.video_boundary_us,6_006_000);
 const still=pair();
 still.left.exit.motion_vector=[0,0]; still.right.entry.motion_vector=[0,0];
 const hard=proposeContinuityTransition(still);
 assert.equal(hard.status,'READY_FOR_REVIEW');
 assert.equal(hard.metrics.motion_angle_deg,0);
 const action=proposeContinuityTransition({...still,transition:'match_on_action'});
 assert.equal(action.status,'REVIEW');
 assert.ok(action.issues.includes('MATCH_ON_ACTION_UNVERIFIED'));
});

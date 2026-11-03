import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectM58SyntheticAudio} from '../server/m58-qc-bridge.mjs';
import {qcCockpitService} from '../server/qc-cockpit.mjs';

const sha=i=>'abcdef'[i].repeat(64);
const RID='00000000-0000-0000-0000-000000000078';
const master='9'.repeat(64);
const OFFSETS=[.34,.67,1,1.33,1.66,1.99,2.32];
const reason='PHASE_INVERTED_MONO_CANCELLATION';
function fixture(){
 const scenes=Array.from({length:6},(_,i)=>({
  id:'s0'+(i+1),sha256:sha(i),duration:3,
  approved_version_id:'v'+(i+1),
  transition_after:{type:i%2===0?'crossfade':'hard-cut',
    duration:i%2===0 ? .3 : 0},
 }));
 const release={release_id:RID,manifest:{schemaVersion:1,
  release_id:RID,project:'demo',target_fps:24,scenes,
  output:{sha256:master,qa:{verdict:'PASS',issues:[],metadata:{duration:17.1}}}}};
 let time=0;
 const stereoScenes=scenes.map((scene,i)=>{
  const start=time;
  const windows=OFFSETS.map((offset,j)=>({
   window_start_sec:Number((start+offset).toFixed(5)),
   review_reason:i===4&&j===5?reason:null,
   phase_inverted:i===4&&j===5,
  }));
  time+=3-scene.transition_after.duration;
  return {scene_id:scene.id,review_reason:i===4?reason:null,windows};
 });
 const audio={scope:'CONTROLLED_P05_STEREO_MONO_FOLD_DOWN_QA',
  window_ms:300,windows_per_scene:7,decoded_duration_sec:17.1,
  scenes:stereoScenes,issues:[{scene_id:'s05',code:reason}],
  manual_audio_review_required:true,may_publish:false,may_deploy:false};
 const candidate={label:'late-inverted-right-s05',
  release_id:RID,master_sha256:master,
  original_source_sha256:scenes.map(s=>s.sha256),
  output_qa_verdict:'PASS',
  audio_qc:{stereo_fold_down:audio}};
 const report={scope:'CONTROLLED_REAL_P05_AAC_MUSIC_VOICE_SURROGATE_E2E',
  voice_source:'tone',status:'TWO_REAL_P05_INTERMITTENT_STEREO_RELEASES_VERIFIED',
  may_publish:false,may_deploy:false,
  cases:[{...candidate,release_id:'00000000-0000-0000-0000-000000000079',
   master_sha256:'8'.repeat(64)},candidate]};
 return {release,report};
}
const trustedTestVerifier=({release,report,candidate})=>
 report.cases.includes(candidate)&&candidate.master_sha256===release.manifest.output.sha256;

test('M51-R03 synthetic-only M58 evidence projects exact PCM window into separate read-only QC lane',()=>{
 const {release,report}=fixture();
 const result=projectM58SyntheticAudio({release,report,verifyReport:trustedTestVerifier});
 assert.equal(result.state,'SYNTHETIC_REVIEW_ONLY');
 assert.equal(result.evidence_basis,'SERVER_CALLBACK_ON_EXACT_SOURCE_AND_MASTER');
 assert.equal(result.fixture_only,true);
 assert.equal(result.release_sha256,master);
 assert.equal(result.findings.length,1);
 assert.deepEqual(result.findings.map(x=>[x.scene_id,x.global_seconds,x.issue_code]),
  [['s05',13.39,reason]]);
 assert.equal(result.findings[0].scene_source_sha256,sha(4));
 assert.equal(result.findings[0].time_basis,'DECODED_PCM_WINDOW_APPROXIMATE_MP4_SEEK');
 assert.equal(result.publication_allowed,false);
 assert.equal(result.analysis_verified_for_customer_media,false);
 assert.equal(result.human_listening_verified,false);
});
test('M51-R03 no server verifier or untrusted source means NEVER a live M58 finding',()=>{
 const {release,report}=fixture();
 assert.equal(projectM58SyntheticAudio({release,report}).state,'NOT_CONNECTED');
 assert.equal(projectM58SyntheticAudio({release,report,verifyReport:()=>false}).state,'REJECTED');
 assert.equal(projectM58SyntheticAudio({release,report,verifyReport:()=>{throw Error('no')}}).state,'REJECTED');
 const noSource=projectM58SyntheticAudio({release,verifyReport:trustedTestVerifier});
 assert.deepEqual(noSource.findings,[]);
 assert.equal(noSource.state,'NOT_CONNECTED');
});
test('M51-R03 rejects stale MP4, source SHA drift, untrusted QA flags and forged windows',()=>{
 const original=fixture();
 const badChanges=[
  ({release})=>{release.manifest.output.sha256='1'.repeat(64)},
  ({release})=>{release.manifest.scenes[4].sha256='1'.repeat(64)},
  ({release})=>{release.manifest.scenes[0].duration=4},
  ({release})=>{release.manifest.scenes[4].transition_after.duration=.2},
  ({report})=>{report.may_publish=true},
  ({report})=>{report.scope='ARBITRARY_CUSTOMER_AUDIO'},
  ({report})=>{report.cases[1].audio_qc.stereo_fold_down.windows_per_scene=1},
  ({report})=>{report.cases[1].audio_qc.stereo_fold_down.scenes[4].windows[5].window_start_sec=4},
  ({report})=>{report.cases[1].audio_qc.stereo_fold_down.scenes[4].windows[5].phase_inverted=false},
  ({report})=>{report.cases[1].audio_qc.stereo_fold_down.scenes[4].windows.splice(5,1)},
  ({report})=>{report.cases[1].audio_qc.stereo_fold_down.issues=[]},
  ({report})=>{report.cases[1].audio_qc.stereo_fold_down.scenes[4].review_reason=null},
 ];
 assert.equal(projectM58SyntheticAudio({...original,verifyReport:trustedTestVerifier}).state,
  'SYNTHETIC_REVIEW_ONLY');
 for(const [i,mutate] of badChanges.entries()){
  const copy=structuredClone(fixture());mutate(copy);
  const projected=projectM58SyntheticAudio({...copy,verifyReport:trustedTestVerifier});
  assert.equal(projected.state,'REJECTED','tamper case '+i);
  assert.deepEqual(projected.findings,[],'tamper case '+i);
 }
});
test('M51-R03 service never leaks whole-project synthetic findings into P06 scene scope',()=>{
 const {release,report}=fixture();
 const service=qcCockpitService({
  enabled:true,assembly:{current:()=>release},
  reviews:{list:()=>({revision:0,items:[]})},
  m58ReportLoader:()=>report,verifyM58Report:trustedTestVerifier,
 });
 const full=service.read('demo');
 assert.equal(full.m58_audio_review.state,'SYNTHETIC_REVIEW_ONLY');
 assert.equal(full.m58_audio_review.findings.length,1);
 assert.equal(full.events.length,0,'synthetic findings must not become P07 reviewer issues');
 assert.match(full.snapshot_sha256,/^[0-9a-f]{64}$/);
 assert.equal(full.publication_allowed,false);
 const scoped=service.read('demo',{sceneId:'s02'});
 assert.ok(!('m58_audio_review' in scoped),'worker sees no cross-scene laboratory report');
 assert.equal(scoped.events.length,0);
 const disabled=qcCockpitService({
  enabled:true,assembly:{current:()=>release},reviews:{list:()=>({revision:0,items:[]})}});
 assert.equal(disabled.read('demo').m58_audio_review.state,'NOT_CONNECTED');
 const rejected=qcCockpitService({
  enabled:true,assembly:{current:()=>release},reviews:{list:()=>({revision:0,items:[]})},
  m58ReportLoader:()=>report,verifyM58Report:()=>false});
 assert.equal(rejected.read('demo').m58_audio_review.state,'REJECTED');
});
test('M51-R03 optional v1 schema and client panel are explicitly synthetic-only',()=>{
 const schema=JSON.parse(fs.readFileSync(new URL(
  '../schemas/montage/qc-cockpit-v1.schema.json',import.meta.url),'utf8'));
 assert.equal(schema.properties.m58_audio_review.properties.publication_allowed.const,false);
 assert.equal(schema.properties.m58_audio_review.properties.fixture_only.const,true);
 const panel=fs.readFileSync(new URL('../src/editor/QcCockpitPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/Лабораторные данные, не проверка пользовательского видео/);
 assert.match(panel,/версия MP4 или исходные сцены не подтверждены/);
 assert.match(panel,/Публикация запрещена/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectRealMasterAudio} from '../server/real-master-qc-projection.mjs';
import {qcCockpitService} from '../server/qc-cockpit.mjs';

const RID='00000000-0000-0000-0000-000000000123';
const HASH='a'.repeat(64),RECEIPT='b'.repeat(64),REPORT='c'.repeat(64);
function fixture(){
 const release={release_id:RID,manifest:{schemaVersion:1,
  project:'demo',release_id:RID,target_fps:24,
  scenes:[{id:'s01',sha256:'1'.repeat(64),duration:1.2,
    transition_after:{type:'hard-cut',duration:0},approved_version_id:'v1'},
   {id:'s02',sha256:'2'.repeat(64),duration:1.2,
    transition_after:{type:'hard-cut',duration:0},approved_version_id:'v2'}],
  output:{sha256:HASH,qa:{verdict:'PASS',issues:[],metadata:{duration:2.4}}}}};
 const issues=[{window_start_sec:.6,window_end_sec:.9,
  code:'POSSIBLE_MONO_FOLD_DOWN_CANCELLATION',requires_human_review:true}];
 const report={schema_version:1,project_id:'demo',release_id:RID,release_sha256:HASH,
  report_sha256:REPORT,scope:'P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY',
  cryptographically_signed:false,may_publish:false,may_deploy:false,
  manual_review_required:true,
  decoded_master_audio:{schema_version:1,
   scope:'REAL_MP4_DECODED_48K_STEREO_RISK_SCREEN',
   audio_duration_sec:2.4,issues,manual_audio_review_required:true,
   audio_video_pts_alignment_verified:false,may_publish:false,may_deploy:false}};
 const result={job:{project_id:'demo',status:'completed',release_id:RID,
   release_sha256:HASH,report_sha256:REPORT},
  receipt:{release_id:RID,release_sha256:HASH,receipt_sha256:RECEIPT,report}};
 return {release,result};
}
test('M51-R04 real MP4 source-bound receipt is separate, PCM times are not exact PTS',()=>{
 const {release,result}=fixture();
 const p=projectRealMasterAudio({release,result});
 assert.equal(p.state,'COMPLETED_REVIEW_ONLY');
 assert.equal(p.release_sha256,HASH);
 assert.equal(p.receipt_sha256,RECEIPT);
 assert.deepEqual(p.findings.map(x=>[x.global_seconds,x.window_end_seconds,x.issue_code]),
  [[.6,.9,'POSSIBLE_MONO_FOLD_DOWN_CANCELLATION']]);
 assert.equal(p.findings[0].requires_human_review,true);
 assert.equal(p.verified_video_pts,false);
 assert.equal(p.cryptographically_signed,false);
 assert.equal(p.publication_allowed,false);
 const clean=structuredClone(result);
 clean.receipt.report.decoded_master_audio.issues=[];
 clean.receipt.report.decoded_master_audio.manual_audio_review_required=false;
 clean.receipt.report.manual_review_required=false;
 const zero=projectRealMasterAudio({release,result:clean});
 assert.equal(zero.state,'COMPLETED_REVIEW_ONLY');
 assert.equal(zero.findings.length,0);
 assert.equal(zero.human_listening_verified,false,'zero findings cannot become human signoff');
});
test('M51-R04 mismatched or malicious media evidence rejects before display',()=>{
 const changes=[
  ({result})=>{result.receipt.report.release_sha256='f'.repeat(64)},
  ({result})=>{result.job.release_id='00000000-0000-0000-0000-000000000456'},
  ({result})=>{result.receipt.receipt_sha256='NO_SHA'},
  ({result})=>{result.receipt.report.cryptographically_signed=true},
  ({result})=>{result.receipt.report.may_publish=true},
  ({result})=>{result.receipt.report.decoded_master_audio.may_publish=true},
  ({result})=>{result.receipt.report.decoded_master_audio.issues[0].window_start_sec=10},
  ({result})=>{result.receipt.report.decoded_master_audio.issues[0].code='VERIFIED'},
  ({result})=>{result.receipt.report.decoded_master_audio.issues[0].requires_human_review=false},
  ({result})=>{result.receipt.report.decoded_master_audio.manual_audio_review_required=false},
  ({result})=>{result.receipt.report.decoded_master_audio.audio_video_pts_alignment_verified=true},
  ({result})=>{result.receipt.report.report_sha256='none'},
 ];
 for(const [i,change] of changes.entries()){
  const obj=structuredClone(fixture());change(obj);
  const p=projectRealMasterAudio(obj);
  assert.equal(p.state,'REJECTED','tamper '+i);
  assert.equal(p.findings.length,0,'no forged observations '+i);
  assert.equal(p.publication_allowed,false);
 }
});
test('M51-R04 queue status never masquerades as completed review',()=>{
 const {release}=fixture();
 for(const [status,state] of [
  ['not_started','NOT_STARTED'],['queued','QUEUED'],['running','RUNNING'],
  ['failed','FAILED'],['stale','STALE'],
 ]){
  const p=projectRealMasterAudio({release,result:{job:{status},receipt:null}});
  assert.equal(p.state,state);
  assert.deepEqual(p.findings,[]);
 }
 assert.equal(projectRealMasterAudio({release}).state,'NOT_CONNECTED');
 assert.equal(projectRealMasterAudio({release,result:{job:{status:'completed'},receipt:null}}).state,'REJECTED');
 assert.equal(projectRealMasterAudio({release,result:{job:{status:'VERIFIED'},receipt:null}}).state,'REJECTED');
});
test('M51-R04 full-project cockpit includes real receipt, P06-scoped reader never invokes provider',()=>{
 const {release,result}=fixture();
 let reads=0;
 const cockpit=qcCockpitService({enabled:true,assembly:{current:()=>release},
  reviews:{list:()=>({revision:0,items:[]})},
  realAudioRead:id=>{assert.equal(id,'demo');reads++;return result}});
 const scoped=cockpit.read('demo',{sceneId:'s01'});
 assert.equal(reads,0);
 assert.ok(!('real_audio_review' in scoped));
 assert.ok(!('m58_audio_review' in scoped));
 const full=cockpit.read('demo');
 assert.equal(reads,1);
 assert.equal(full.real_audio_review.state,'COMPLETED_REVIEW_ONLY');
 assert.equal(full.real_audio_review.findings.length,1);
 assert.equal(full.events.length,0,'machine audio findings cannot become P07 review dispositions');
 assert.equal(full.publication_allowed,false);
 assert.match(full.snapshot_sha256,/^[a-f0-9]{64}$/);
 const rejected=qcCockpitService({enabled:true,assembly:{current:()=>release},
  reviews:{list:()=>({revision:0,items:[]})},
  realAudioRead:()=>{throw Error('M58_AUDIO_RECEIPT_UNTRUSTED')}});
 assert.equal(rejected.read('demo').real_audio_review.state,'REJECTED');
 assert.equal(rejected.read('demo').real_audio_review.findings.length,0);
});
test('M51-R04 documented schema and UI never approve a real audio report',()=>{
 const schema=JSON.parse(fs.readFileSync(new URL(
  '../schemas/montage/qc-cockpit-v1.schema.json',import.meta.url),'utf8'));
 const p=schema.properties.real_audio_review;
 assert.equal(p.properties.publication_allowed.const,false);
 assert.equal(p.properties.cryptographically_signed.const,false);
 assert.equal(p.properties.verified_video_pts.const,false);
 const panel=fs.readFileSync(new URL('../src/editor/QcCockpitPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/реальный MP4 \(проверка для ревью\)/);
 assert.match(panel,/Время по PCM приблизительное/);
 assert.match(panel,/Публикация запрещена/);
 assert.doesNotMatch(panel,/approveRelease|autoSignoff|setPublicationAllowed/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectReleaseEvidence} from '../server/release-evidence-preflight.mjs';

const commit='a'.repeat(40),image='b'.repeat(64),master='c'.repeat(64);
const categories=[
  'source_provenance','media_licenses','real_media_e2e','worker_execution',
  'technical_qa','audio_sync','font_flash','accessibility','performance',
  'ci_tests','independent_review','rollback'
];
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){
  const metrics={
    baseline:{sample_count:12,p95_render_ms:120000,peak_rss_mib:768,cost_usd:1.5},
    candidate:{sample_count:12,p95_render_ms:123000,peak_rss_mib:760,cost_usd:1.45},
    limits:{max_p95_ratio:1.1,max_rss_ratio:1.1,max_cost_ratio:1.1},
  };
  const receipts=categories.map((category,i)=>({
    id:'evidence-'+i,category,commit_sha:commit,image_sha256:image,
    master_sha256:master,evidence_sha256:String(i+1).padStart(64,'0'),
    actor:category==='independent_review'?'reviewer-02':'worker-01',verdict:'PASS',
    ...(category==='performance'?{metrics_sha256:digest(metrics)}:{}),
  }));
  return {schema_version:1,project_id:'montage',submitted_by:'worker-01',
    build:{commit_sha:commit,image_sha256:image,master_sha256:master},
    metrics,receipts};
}
const rejects=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);

test('M58 full pinned evidence remains review-only even after trusted verification',()=>{
  const f=fixture(), copy=structuredClone(f);
  const a=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  const b=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  assert.deepEqual(a,b);
  assert.deepEqual(f,copy,'inspection must not mutate caller data');
  assert.equal(a.verdict,'EVIDENCE_COMPLETE_FOR_REVIEW');
  assert.equal(a.status,'REVIEW_ONLY');
  assert.equal(a.may_publish,false);
  assert.equal(a.may_deploy,false);
  assert.equal(a.blockers.length,0);
  assert.equal(a.checks.length,categories.length);
  assert.equal(a.checks.filter(c=>c.state==='VERIFIED').length,categories.length);
});

test('M58 self-reported PASS never authenticates itself',()=>{
  const noTrust=inspectReleaseEvidence(fixture());
  assert.equal(noTrust.verdict,'BLOCKED');
  assert.equal(noTrust.checks.filter(c=>c.state==='UNVERIFIED').length,categories.length);
  assert.equal(noTrust.may_publish,false);
  const thrown=inspectReleaseEvidence(fixture(),{verifyReceipt:()=>{throw Error('offline')}});
  assert.ok(thrown.blockers.includes('source_provenance:UNVERIFIED'));
  const partial=inspectReleaseEvidence(fixture(),{verifyReceipt:r=>r.category==='ci_tests'});
  assert.equal(partial.checks.filter(c=>c.state==='VERIFIED').length,1);
  assert.equal(partial.verdict,'BLOCKED');
});

test('M58 fail closed: missing media E2E, forged master, failed QA and self-review',()=>{
  const f=fixture();
  f.receipts=f.receipts.filter(r=>r.category!=='real_media_e2e');
  let result=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  assert.ok(result.blockers.includes('real_media_e2e:MISSING'));
  f.receipts.push({...fixture().receipts.find(x=>x.category==='real_media_e2e'),
    master_sha256:'d'.repeat(64)});
  result=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  assert.ok(result.blockers.includes('real_media_e2e:STALE'));
  f.receipts.find(r=>r.category==='technical_qa').verdict='FAIL';
  result=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  assert.ok(result.blockers.includes('technical_qa:FAILED'));
  f.receipts.find(r=>r.category==='independent_review').actor='worker-01';
  result=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  assert.ok(result.blockers.includes('independent_review:SELF_REVIEW'));
});

test('M58 SLO regression blocks preflight regardless of other green receipts',()=>{
  const f=fixture();
  f.metrics.candidate.p95_render_ms=170000;
  f.metrics.candidate.peak_rss_mib=1000;
  f.metrics.candidate.cost_usd=1.9;
  f.receipts.find(x=>x.category==='performance').metrics_sha256=digest(f.metrics);
  const out=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  assert.equal(out.verdict,'BLOCKED');
  assert.ok(out.blockers.includes('SLO_REGRESSION:p95_render'));
  assert.ok(out.blockers.includes('SLO_REGRESSION:peak_rss'));
  assert.ok(out.blockers.includes('SLO_REGRESSION:cost'));
  assert.equal(out.checks.find(c=>c.category==='performance').state,'VERIFIED');
});

test('M58 metrics must be source-pinned and sampled; no fabricated zero-cost baseline',()=>{
  const f=fixture();
  f.metrics.candidate.p95_render_ms=125000;
  let out=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  assert.ok(out.blockers.includes('performance:STALE'),'changing metrics invalidates performance receipt');
  f.metrics.baseline.cost_usd=0;
  rejects('M58_BASELINE_INVALID',()=>inspectReleaseEvidence(f));
  f.metrics.baseline.cost_usd=1.5;f.metrics.candidate.sample_count=1;
  rejects('M58_CANDIDATE_INVALID',()=>inspectReleaseEvidence(f));
  f.metrics.candidate.sample_count=12;f.metrics.candidate.peak_rss_mib=Infinity;
  rejects('M58_CANDIDATE_INVALID',()=>inspectReleaseEvidence(f));
});

test('M58 rejects unknown fields, forged verification flags, duplicate IDs and categories',()=>{
  const f=fixture();
  rejects('M58_MANIFEST_INVALID',()=>inspectReleaseEvidence({...f,may_publish:true}));
  rejects('M58_RECEIPT_INVALID',()=>inspectReleaseEvidence({...f,
    receipts:f.receipts.map((r,i)=>i===0?{...r,verified:true}:r)}));
  rejects('M58_DUPLICATE_RECEIPT_ID',()=>inspectReleaseEvidence({...f,
    receipts:[...f.receipts,{...f.receipts[0],category:'unexpected'}]}));
  rejects('M58_DUPLICATE_CATEGORY',()=>inspectReleaseEvidence({...f,
    receipts:[...f.receipts,{...f.receipts[0],id:'new-proof'}]}));
  rejects('M58_RECEIPTS_INVALID',()=>inspectReleaseEvidence({...f,receipts:Array(33).fill(null)}));
  rejects('M58_MASTER_INVALID',()=>inspectReleaseEvidence({...f,build:{...f.build,master_sha256:'../../x'}}));
  rejects('M58_RECEIPT_CATEGORY_INVALID',()=>inspectReleaseEvidence({...f,
    receipts:[{...f.receipts[0],category:'secret_admin'},...f.receipts.slice(1)]}));
  rejects('M58_VERIFIER_INVALID',()=>inspectReleaseEvidence(f,{verifyReceipt:true}));
});

test('M58 verdict cannot bypass reviewer, rollback or source attestation',()=>{
  const f=fixture();f.receipts=f.receipts.filter(x=>!['rollback','independent_review'].includes(x.category));
  const out=inspectReleaseEvidence(f,{verifyReceipt:()=>true});
  assert.ok(out.blockers.includes('rollback:MISSING'));
  assert.ok(out.blockers.includes('independent_review:MISSING'));
  assert.equal(out.may_publish,false);
});

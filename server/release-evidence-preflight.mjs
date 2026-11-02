/** M58-R01: pure, read-only release evidence preflight.
 * Receipt content is untrusted until an independent caller-supplied verifier checks it.
 * Never issues a release token, modifies P05 pointers, or deploys.
 */
import {createHash} from 'node:crypto';

const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const ACTOR=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
const SHA=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const CATEGORIES=Object.freeze([
  'source_provenance','media_licenses','real_media_e2e','worker_execution',
  'technical_qa','audio_sync','font_flash','accessibility','performance',
  'ci_tests','independent_review','rollback'
]);

const fail=(code)=>{throw Object.assign(new Error(code),{code,status:400})};
const shape=(v,keys,code)=>{
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>!keys.includes(k)))fail(code);
};
const required=(v,re,code)=>{if(typeof v!=='string'||!re.test(v))fail(code)};
const num=(v,min,max,code)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(code)};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const MEASURES=['p95_render_ms','peak_rss_mib','cost_usd'];

function checkSample(v,code){
  shape(v,['sample_count',...MEASURES],code);
  if(!Number.isSafeInteger(v.sample_count)||v.sample_count<5||v.sample_count>100000)fail(code);
  num(v.p95_render_ms,1,86400000,code);
  num(v.peak_rss_mib,1,1048576,code);
  num(v.cost_usd,0.000001,1000000,code);
}
function checkMetrics(metrics){
  shape(metrics,['baseline','candidate','limits'],'M58_METRICS_INVALID');
  checkSample(metrics.baseline,'M58_BASELINE_INVALID');
  checkSample(metrics.candidate,'M58_CANDIDATE_INVALID');
  shape(metrics.limits,['max_p95_ratio','max_rss_ratio','max_cost_ratio'],'M58_LIMITS_INVALID');
  for(const k of ['max_p95_ratio','max_rss_ratio','max_cost_ratio'])
    num(metrics.limits[k],1,1.5,'M58_LIMITS_INVALID');
}

/** Returns a bounded, deterministic diagnostic report. No verifier => all receipts UNVERIFIED. */
export function inspectReleaseEvidence(manifest,{verifyReceipt}={}){
  shape(manifest,['schema_version','project_id','submitted_by','build','metrics','receipts'],
    'M58_MANIFEST_INVALID');
  if(manifest.schema_version!==1)fail('M58_SCHEMA_VERSION_INVALID');
  required(manifest.project_id,ID,'M58_PROJECT_INVALID');
  required(manifest.submitted_by,ACTOR,'M58_SUBMITTER_INVALID');
  shape(manifest.build,['commit_sha','image_sha256','master_sha256'],'M58_BUILD_INVALID');
  required(manifest.build.commit_sha,GIT_SHA,'M58_COMMIT_INVALID');
  required(manifest.build.image_sha256,SHA,'M58_IMAGE_INVALID');
  required(manifest.build.master_sha256,SHA,'M58_MASTER_INVALID');
  checkMetrics(manifest.metrics);
  if(!Array.isArray(manifest.receipts)||manifest.receipts.length>32)
    fail('M58_RECEIPTS_INVALID');
  if(verifyReceipt!==undefined&&typeof verifyReceipt!=='function')
    fail('M58_VERIFIER_INVALID');

  const metricsSha256=hash(manifest.metrics);
  const receipts=new Map(),ids=new Set();
  for(const r of manifest.receipts){
    shape(r,['id','category','commit_sha','image_sha256','master_sha256',
      'evidence_sha256','metrics_sha256','verdict','actor'],'M58_RECEIPT_INVALID');
    required(r.id,ID,'M58_RECEIPT_ID_INVALID');
    if(ids.has(r.id))fail('M58_DUPLICATE_RECEIPT_ID');
    ids.add(r.id);
    if(!CATEGORIES.includes(r.category))fail('M58_RECEIPT_CATEGORY_INVALID');
    if(receipts.has(r.category))fail('M58_DUPLICATE_CATEGORY');
    required(r.commit_sha,GIT_SHA,'M58_RECEIPT_COMMIT_INVALID');
    required(r.image_sha256,SHA,'M58_RECEIPT_IMAGE_INVALID');
    required(r.master_sha256,SHA,'M58_RECEIPT_MASTER_INVALID');
    required(r.evidence_sha256,SHA,'M58_RECEIPT_PROOF_INVALID');
    required(r.actor,ACTOR,'M58_RECEIPT_ACTOR_INVALID');
    if(!['PASS','FAIL'].includes(r.verdict))fail('M58_RECEIPT_VERDICT_INVALID');
    if(r.category==='performance'){
      required(r.metrics_sha256,SHA,'M58_RECEIPT_METRICS_SHA_INVALID');
    }else if(r.metrics_sha256!==undefined)fail('M58_UNEXPECTED_METRICS_SHA');
    receipts.set(r.category,r);
  }

  const checks=[],blockers=[];
  for(const category of CATEGORIES){
    const r=receipts.get(category);
    let state='MISSING';
    if(r){
      if(r.commit_sha!==manifest.build.commit_sha||
         r.image_sha256!==manifest.build.image_sha256||
         r.master_sha256!==manifest.build.master_sha256||
         (category==='performance'&&r.metrics_sha256!==metricsSha256)){
        state='STALE';
      }else if(category==='independent_review'&&r.actor===manifest.submitted_by){
        state='SELF_REVIEW';
      }else if(r.verdict==='FAIL'){
        state='FAILED';
      }else{
        let verified=false;
        try{verified=verifyReceipt?.(structuredClone(r),structuredClone(manifest.build))===true}
        catch{verified=false}
        state=verified?'VERIFIED':'UNVERIFIED';
      }
    }
    checks.push({category,state,receipt_id:r?.id??null});
    if(state!=='VERIFIED')blockers.push(category+':'+state);
  }
  const ratios={
    p95_render:manifest.metrics.candidate.p95_render_ms/manifest.metrics.baseline.p95_render_ms,
    peak_rss:manifest.metrics.candidate.peak_rss_mib/manifest.metrics.baseline.peak_rss_mib,
    cost:manifest.metrics.candidate.cost_usd/manifest.metrics.baseline.cost_usd,
  };
  for(const [metric,limit] of [
    ['p95_render','max_p95_ratio'],['peak_rss','max_rss_ratio'],['cost','max_cost_ratio']]){
    if(ratios[metric]>manifest.metrics.limits[limit]+1e-9)
      blockers.push('SLO_REGRESSION:'+metric);
  }

  // Even a complete verified evidence set requires separately authorized
  // media inspection, independent release decision, and reversible deployment.
  return {
    schema_version:1,scope:'STRUCTURAL_RELEASE_PREFLIGHT',
    status:'REVIEW_ONLY',verdict:blockers.length?'BLOCKED':'EVIDENCE_COMPLETE_FOR_REVIEW',
    may_publish:false,may_deploy:false,
    project_id:manifest.project_id,commit_sha:manifest.build.commit_sha,
    master_sha256:manifest.build.master_sha256,
    metrics_sha256:metricsSha256,checks,blockers,
    slo:ratios,
    caveat:'Receipts are not self-authenticating. Only a trusted verifier may accept evidence. This report never authorizes release or deployment.',
  };
}

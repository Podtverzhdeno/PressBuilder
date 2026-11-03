/** M51-R03: M58 R19 synthetic-fixture audio evidence -> read-only QC bridge.
 * Only an independently trusted server callback may attach a report to the
 * exact current P05 release. No client report, receipt, or QA "PASS" is trust.
 * This does NOT accept customer media or authorize release/publish.
 */
const SHA=/^[a-f0-9]{64}$/;
const WINDOW_OFFSETS=[.34,.67,1,1.33,1.66,1.99,2.32];
const FADES=[.3,0,.3,0,.3,0];
const REASONS=new Set(['PHASE_INVERTED_MONO_CANCELLATION','CHANNEL_SIGNAL_TOO_WEAK']);
const GOOD='SYNTHETIC_REVIEW_ONLY';
const NO='NOT_CONNECTED';
const fail=()=>{throw Error('M51_M58_EVIDENCE_MISMATCH')};
const near=(a,b,t=.015)=>typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=t;
const empty=(state=NO)=>({state,source:'M58_R19_STEREO_PCM_SYNTHETIC',
 evidence_basis:'NO_PRODUCTION_M58_ATTESTATION',release_sha256:null,
 findings:[],analysis_verified_for_customer_media:false,
 human_listening_verified:false,publication_allowed:false});
const reasonMessage={
 PHASE_INVERTED_MONO_CANCELLATION:'Возможно выпадение аудио при сведении стерео в моно. Проверьте вручную.',
 CHANNEL_SIGNAL_TOO_WEAK:'Недостаточный уровень хотя бы одного аудиоканала. Проверьте вручную.',
};
function validateReport(release,report){
 const m=release?.manifest;
 if(m?.schemaVersion!==1||m?.output?.qa?.verdict!=='PASS'||
    !SHA.test(m.output?.sha256??'')||!Array.isArray(m.scenes)||
    m.scenes.length!==6||!Array.isArray(report?.cases)||
    report.cases.length<2||report.cases.length>3||
    report.scope!=='CONTROLLED_REAL_P05_AAC_MUSIC_VOICE_SURROGATE_E2E'||
    report.voice_source!=='tone'||report.may_publish!==false||
    report.may_deploy!==false||
    !['TWO_REAL_P05_INTERMITTENT_STEREO_RELEASES_VERIFIED',
      'THREE_REAL_P05_STEREO_PHASE_RELEASES_VERIFIED'].includes(report.status))
   fail();
 const match=report.cases.filter(x=>
   x?.release_id===release.release_id&&
   x?.master_sha256===m.output.sha256);
 if(match.length!==1)fail();
 const c=match[0];
 if(c.output_qa_verdict!=='PASS'||!Array.isArray(c.original_source_sha256)||
    c.original_source_sha256.length!==6||!Array.isArray(m.scenes)||
    c.original_source_sha256.some((h,i)=>h!==m.scenes[i].sha256))fail();
 const a=c.audio_qc?.stereo_fold_down;
 if(a?.scope!=='CONTROLLED_P05_STEREO_MONO_FOLD_DOWN_QA'||
    a.window_ms!==300||a.windows_per_scene!==7||
    !near(a.decoded_duration_sec,17.1,.12)||
    !Array.isArray(a.scenes)||a.scenes.length!==6||
    !Array.isArray(a.issues)||a.issues.length>6||
    a.may_publish!==false||a.may_deploy!==false)
   fail();
 let start=0;
 const findings=[],issues=[];
 for(let i=0;i<6;i++){
   const scene=m.scenes[i],id='s'+String(i+1).padStart(2,'0');
   if(scene?.id!==id||!near(scene.duration,3,.001)||
      scene.transition_after?.type!==(FADES[i]?'crossfade':'hard-cut')||
      !near(scene.transition_after?.duration,FADES[i],.001)||
      !SHA.test(scene.sha256??'')||
      a.scenes[i]?.scene_id!==id||!Array.isArray(a.scenes[i].windows)||
      a.scenes[i].windows.length!==7)fail();
   const windows=a.scenes[i].windows, seen=[];
   for(let j=0;j<7;j++){
     const w=windows[j],expected=start+WINDOW_OFFSETS[j];
     if(!near(w?.window_start_sec,expected,.002)||
        ![null,...REASONS].includes(w.review_reason)||
        typeof w.phase_inverted!=='boolean'|| 
        (w.phase_inverted!==(w.review_reason==='PHASE_INVERTED_MONO_CANCELLATION')))
       fail();
     if(w.review_reason){
       seen.push(w.review_reason);
       findings.push({id:'m58:'+id+':'+j+':'+w.review_reason,
         scene_id:id,scene_source_sha256:scene.sha256,
         source_version_id:scene.approved_version_id??null,
         release_sha256:m.output.sha256,
         issue_code:w.review_reason,
         message:reasonMessage[w.review_reason],
         severity:'high',disposition:'REVIEW_REQUIRED',
         global_seconds:Number(w.window_start_sec.toFixed(3)),
         window_ms:300,
         time_basis:'DECODED_PCM_WINDOW_APPROXIMATE_MP4_SEEK',
         human_review_required:true});
     }
   }
   const expectedReason=seen.includes('PHASE_INVERTED_MONO_CANCELLATION')?
     'PHASE_INVERTED_MONO_CANCELLATION':
     seen.includes('CHANNEL_SIGNAL_TOO_WEAK')?'CHANNEL_SIGNAL_TOO_WEAK':null;
   if(a.scenes[i].review_reason!==expectedReason)fail();
   if(expectedReason)issues.push({scene_id:id,code:expectedReason});
   start+=3-FADES[i];
 }
 if(!near(start,17.1,.001)||
    JSON.stringify(a.issues)!==JSON.stringify(issues)||
    a.manual_audio_review_required!==(issues.length>0))fail();
 return {candidate:c,findings};
}

/** A missing validator leaves the bridge disabled; the report is NEVER accepted
 * just because it contains success flags. Server must supply a real provenance
 * callback that authenticates the report and its source/master bytes.
 */
export function projectM58SyntheticAudio({release,report,verifyReport}={}){
 if(!report||typeof verifyReport!=='function')return empty();
 try{
   const {candidate,findings}=validateReport(release,report);
   if(verifyReport({release,report,candidate})!==true)return empty('REJECTED');
   return {...empty(GOOD),release_sha256:release.manifest.output.sha256,
     evidence_basis:'SERVER_CALLBACK_ON_EXACT_SOURCE_AND_MASTER',
     findings,fixture_only:true,analysis_verified_for_customer_media:false};
 }catch{
   return empty('REJECTED');
 }
}

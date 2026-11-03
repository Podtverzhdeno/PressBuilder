/** M51-R04: project the separately verified REAL P05 R20/R21 audio receipt.
 * This is a read-only advisory lane, never a P07 reviewer event or a gate.
 * Only full-project readers may obtain this summary; no exact video PTS.
 */
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9-]{36}$/;
const CODES=new Set(['POSSIBLE_MONO_FOLD_DOWN_CANCELLATION',
 'POSSIBLE_ONE_CHANNEL_DROPOUT','POSSIBLE_SILENT_AUDIO_TRACK']);
const labels={
 POSSIBLE_MONO_FOLD_DOWN_CANCELLATION:'Возможна потеря звука при сведении в моно',
 POSSIBLE_ONE_CHANNEL_DROPOUT:'Возможен провал одного стереоканала',
 POSSIBLE_SILENT_AUDIO_TRACK:'Почти беззвучная аудиодорожка',
};
const validNumber=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const invalid=(v)=>!v||typeof v!=='object'||Array.isArray(v);
function empty(state){
 return {state,source:'M58_R20_REAL_MASTER_PCM',
  release_sha256:null,receipt_sha256:null,findings:[],
  time_basis:'DECODED_PCM_SECONDS_APPROXIMATE_VIDEO_SEEK',
  cryptographically_signed:false,verified_video_pts:false,
  human_listening_verified:false,publication_allowed:false};
}
export function projectRealMasterAudio({release,result}={}){
 if(!release?.manifest?.output?.sha256||!SHA.test(release.manifest.output.sha256))
  return empty('REJECTED');
 if(!result)return empty('NOT_CONNECTED');
 if(invalid(result)||invalid(result.job))return empty('REJECTED');
 const job=result.job;
 if(!['not_started','queued','running','failed','stale','completed'].includes(job.status))
  return empty('REJECTED');
 if(job.status!=='completed'){
  if(result.receipt!==null)return empty('REJECTED');
  return empty(({not_started:'NOT_STARTED',queued:'QUEUED',running:'RUNNING',
   failed:'FAILED',stale:'STALE'})[job.status]);
 }
 const receipt=result.receipt,report=receipt?.report;
 const media=report?.decoded_master_audio;
 if(invalid(receipt)||invalid(report)||invalid(media)||
    !UUID.test(job.release_id??'')||job.release_id!==release.release_id||
    job.release_sha256!==release.manifest.output.sha256||
    !SHA.test(job.report_sha256??'')||
    !SHA.test(receipt.receipt_sha256??'')||
    !SHA.test(report.report_sha256??'')||
    report.report_sha256!==job.report_sha256||
    receipt.release_id!==job.release_id||
    receipt.release_sha256!==job.release_sha256||
    report.project_id!==release.manifest.project||
    report.release_id!==job.release_id||
    report.release_sha256!==job.release_sha256||
    report.scope!=='P05_CURRENT_MASTER_DECODED_AUDIO_REVIEW_ONLY'||
    media.scope!=='REAL_MP4_DECODED_48K_STEREO_RISK_SCREEN'||
    report.cryptographically_signed!==false||
    report.may_publish!==false||report.may_deploy!==false||
    media.may_publish!==false||media.may_deploy!==false||
    media.audio_video_pts_alignment_verified!==false||
    !validNumber(media.audio_duration_sec)||media.audio_duration_sec>60||
    !Array.isArray(media.issues)||media.issues.length>200)
  return empty('REJECTED');
 const findings=[];
 for(const [i,issue] of media.issues.entries()){
  if(invalid(issue)||!CODES.has(issue.code)||
     !validNumber(issue.window_start_sec)||!validNumber(issue.window_end_sec)||
     issue.window_end_sec<issue.window_start_sec||
     issue.window_end_sec>media.audio_duration_sec+.35||
     issue.requires_human_review!==true)
   return empty('REJECTED');
  findings.push({id:'real-audio:'+i+':'+issue.code,issue_code:issue.code,
   message:labels[issue.code],global_seconds:issue.window_start_sec,
   window_end_seconds:issue.window_end_sec,
   time_basis:'DECODED_PCM_SECONDS_APPROXIMATE_VIDEO_SEEK',
   requires_human_review:true});
 }
 if(media.manual_audio_review_required!==(findings.length>0)||
    report.manual_review_required!==media.manual_audio_review_required)
  return empty('REJECTED');
 return {...empty('COMPLETED_REVIEW_ONLY'),
  release_sha256:report.release_sha256,
  receipt_sha256:receipt.receipt_sha256,findings};
}

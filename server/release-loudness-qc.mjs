/** M58-R07: independent FFmpeg loudnorm input measurements.
 * The loudnorm filter's INPUT integrated loudness (EBU R128) and INPUT
 * 4x oversampled true peak are measurements, not normalized-output claims.
 * This is diagnostic only: loudness policies require editorial sign-off.
 */
const bad=(code)=>{throw Object.assign(new Error(code),{code,status:422})};
const KEYS=new Set(['input_i','input_tp','input_lra','input_thresh',
  'output_i','output_tp','output_lra','output_thresh',
  'normalization_type','target_offset']);
function level(value,lower,upper){
  if(value==='-inf'||value==='-Infinity')return null;
  if(typeof value!=='string'||!/^-?\d{1,3}(?:\.\d{1,6})?$/.test(value))
    bad('M58_LOUDNORM_VALUE_INVALID');
  const n=Number(value);
  if(!Number.isFinite(n)||n<lower||n>upper)
    bad('M58_LOUDNORM_VALUE_INVALID');
  return n;
}

/** Parse a single bounded JSON summary emitted by loudnorm=print_format=json.
 * A partial, ambiguous or forged-looking summary must never be a PASS.
 */
export function parseLoudnormInput(stderr){
  if(typeof stderr!=='string'||stderr.length===0||stderr.length>262144)
    bad('M58_LOUDNORM_LOG_INVALID');
  const reports=[];
  const marker=/"input_i"\s*:/g;
  for(const found of stderr.matchAll(marker)){
    const begin=stderr.lastIndexOf('{',found.index);
    const end=stderr.indexOf('}',found.index);
    if(begin<0||end<0||end-begin>4096)bad('M58_LOUDNORM_LOG_INVALID');
    let data;
    try{data=JSON.parse(stderr.slice(begin,end+1))}
    catch{bad('M58_LOUDNORM_JSON_INVALID')}
    if(!data||typeof data!=='object'||Array.isArray(data)||
       Object.keys(data).some(k=>!KEYS.has(k))||
       typeof data.input_i!=='string'||typeof data.input_tp!=='string'||
       typeof data.input_lra!=='string')bad('M58_LOUDNORM_SCHEMA_INVALID');
    reports.push(data);
    if(reports.length>1)bad('M58_LOUDNORM_MULTIPLE_REPORTS');
  }
  if(reports.length!==1)bad('M58_LOUDNORM_REPORT_MISSING');
  const v=reports[0];
  return {
    integrated_lufs:level(v.input_i,-120,20),
    true_peak_dbtp:level(v.input_tp,-120,20),
    loudness_range_lu:level(v.input_lra,0,100),
  };
}

/** Conservative triage thresholds, not automatic mastering targets. */
export function evaluateLoudness(measured,{
  minIntegratedLufs=-38,maxIntegratedLufs=-8,maxTruePeakDbtp=-1,
}={}){
  for(const [name,value,low,high] of [
    ['minIntegratedLufs',minIntegratedLufs,-70,-10],
    ['maxIntegratedLufs',maxIntegratedLufs,-40,0],
    ['maxTruePeakDbtp',maxTruePeakDbtp,-12,0],
  ])if(typeof value!=='number'||!Number.isFinite(value)||value<low||value>high)
    bad('M58_LOUDNORM_POLICY_INVALID');
  if(minIntegratedLufs>=maxIntegratedLufs)bad('M58_LOUDNORM_POLICY_INVALID');
  if(!measured||typeof measured!=='object'||Array.isArray(measured))
    bad('M58_LOUDNORM_MEASUREMENT_INVALID');
  for(const key of ['integrated_lufs','true_peak_dbtp','loudness_range_lu']){
    const v=measured[key];
    if(v!==null&&(!Number.isFinite(v)||typeof v!=='number'))
      bad('M58_LOUDNORM_MEASUREMENT_INVALID');
  }
  const {integrated_lufs:integrated,true_peak_dbtp:peak,loudness_range_lu:lra}=measured;
  if((integrated!==null&&(integrated< -120||integrated>20))||
     (peak!==null&&(peak< -120||peak>20))||
     (lra!==null&&(lra<0||lra>100)))
    bad('M58_LOUDNORM_MEASUREMENT_INVALID');
  const issues=[];
  if(integrated===null||peak===null)issues.push('LOUDNESS_UNMEASURABLE');
  else{
    if(integrated<minIntegratedLufs)issues.push('INTEGRATED_LOUDNESS_TOO_LOW');
    if(integrated>maxIntegratedLufs)issues.push('INTEGRATED_LOUDNESS_TOO_HIGH');
    if(peak>maxTruePeakDbtp)issues.push('TRUE_PEAK_RISK');
  }
  return {
    schema_version:1,
    scope:'FFMPEG_LOUDNORM_INPUT_EBU_R128_AND_TRUE_PEAK',
    measurement_status:issues.includes('LOUDNESS_UNMEASURABLE')?
      'UNMEASURABLE':'MEASURED',
    integrated_lufs:integrated,true_peak_dbtp:peak,loudness_range_lu:lra,
    thresholds:{min_integrated_lufs:minIntegratedLufs,
      max_integrated_lufs:maxIntegratedLufs,max_true_peak_dbtp:maxTruePeakDbtp},
    issues,manual_audio_review_required:issues.length>0,
    normalized_output_generated:false,
    may_publish:false,may_deploy:false,
    caveat:'Diagnostic loudnorm input measurements; no automatic mastering, content-specific loudness standard, reviewer approval or release authority.',
  };
}

/** M58-R13: audio discontinuities at six-scene hard-cut boundaries.
 * Compare decoded 48-kHz stereo PCM of P13 and the SAME-SOURCE forced P05.
 * Normal intended cuts can change audio abruptly. Flag only EXCESS risk
 * relative to full P05, not absolute loudness or artistic silence.
 */
const bad=code=>{throw Object.assign(new Error(code),{code,status:422})};
const RATE=48000,CHANNELS=2;
const round=n=>Number(n.toFixed(5));
const rms=(pcm,from,to)=>{
  let sum=0;
  for(let i=from;i<to;i++)for(let c=0;c<CHANNELS;c++){
    const s=pcm.readInt16LE(i*4+c*2)/32768;
    sum+=s*s;
  }
  return Math.sqrt(sum/((to-from)*CHANNELS));
};
export function measurePcmSeamWindows(pcm,{
  sceneDurationSec=3,sceneCount=6,sampleRate=RATE,
}={}){
  if(sampleRate!==RATE||sceneCount!==6||![3,4,5,6,7].includes(sceneDurationSec))
    bad('M58_AUDIO_SEAM_POLICY_INVALID');
  const requiredFrames=sceneDurationSec*sceneCount*RATE;
  if(!Buffer.isBuffer(pcm)||pcm.length===0||pcm.length%4!==0||
    pcm.length>22*1024*1024)
    bad('M58_AUDIO_SEAM_PCM_INVALID');
  const frames=pcm.length/4;
  // AAC may add a little encoder padding. Require full program, not truncate
  // or silently pad missing audio in our own measurements.
  if(Math.abs(frames-requiredFrames)>Math.round(RATE*0.12))
    bad('M58_AUDIO_SEAM_TIMELINE_DRIFT');
  const boundaries=[];
  const span=Math.round(RATE*0.02); // ±20 ms, localized click candidate
  const bin=Math.round(RATE*0.01); // 10 ms RMS dropout probe
  for(let b=1;b<sceneCount;b++){
    const cut=Math.round(sceneDurationSec*b*RATE);
    if(cut-span-1<0||cut+span>=frames)
      bad('M58_AUDIO_SEAM_INCOMPLETE');
    let peakStep=0;
    for(let frame=cut-span;frame<=cut+span;frame++)
      for(let c=0;c<CHANNELS;c++){
        const x=pcm.readInt16LE(frame*4+c*2);
        const y=pcm.readInt16LE((frame-1)*4+c*2);
        peakStep=Math.max(peakStep,Math.abs(x-y)/32768);
      }
    const bins=[];
    for(let start=cut-5*bin;start<cut+5*bin;start+=bin){
      if(start<0||start+bin>frames)
        bad('M58_AUDIO_SEAM_INCOMPLETE');
      bins.push(round(rms(pcm,start,start+bin)));
    }
    boundaries.push({
      boundary_after_scene:b,cut_sample:cut,
      max_adjacent_sample_jump:round(peakStep),
      rms_10ms_windows:bins,
    });
  }
  return {
    scope:'DECODED_PCM_48K_STEREO_CUT_SEAMS',
    sample_rate:RATE,channels:CHANNELS,
    decoded_duration_sec:round(frames/RATE),
    expected_duration_sec:sceneDurationSec*sceneCount,
    boundaries,may_publish:false,may_deploy:false,
  };
}
export function comparePcmCutSeams(incremental,baseline,{
  excessJumpThreshold=0.35,minAbsoluteJump=0.55,
  dropoutBaselineRms=0.07,dropoutIncrementalRms=0.004,
}={}){
  if([excessJumpThreshold,minAbsoluteJump,dropoutBaselineRms,
    dropoutIncrementalRms].some(v=>typeof v!=='number'||!Number.isFinite(v)||
      v<0||v>1)||excessJumpThreshold<0.1||minAbsoluteJump<0.2||
      dropoutBaselineRms<0.03||dropoutIncrementalRms>0.02)
    bad('M58_AUDIO_SEAM_POLICY_INVALID');
  if(!incremental||!baseline||
    incremental.scope!=='DECODED_PCM_48K_STEREO_CUT_SEAMS'||
    baseline.scope!==incremental.scope||
    !Array.isArray(incremental.boundaries)||
    !Array.isArray(baseline.boundaries)||
    incremental.boundaries.length!==5||baseline.boundaries.length!==5||
    incremental.sample_rate!==RATE||baseline.sample_rate!==RATE||
    !Number.isFinite(incremental.decoded_duration_sec)||
    !Number.isFinite(baseline.decoded_duration_sec))
    bad('M58_AUDIO_SEAM_COMPARISON_INVALID');
  const deltaDuration=Math.abs(incremental.decoded_duration_sec-
    baseline.decoded_duration_sec);
  if(deltaDuration>0.08)
    bad('M58_AUDIO_SEAM_RELATIVE_TIMELINE_DRIFT');
  const boundaries=[];
  for(let i=0;i<5;i++){
    const a=incremental.boundaries[i],b=baseline.boundaries[i];
    if(a?.boundary_after_scene!==i+1||b?.boundary_after_scene!==i+1||
      a.cut_sample!==b.cut_sample||
      !Number.isFinite(a.max_adjacent_sample_jump)||
      !Number.isFinite(b.max_adjacent_sample_jump)||
      a.max_adjacent_sample_jump<0||a.max_adjacent_sample_jump>2||
      b.max_adjacent_sample_jump<0||b.max_adjacent_sample_jump>2||
      !Array.isArray(a.rms_10ms_windows)||
      !Array.isArray(b.rms_10ms_windows)||
      a.rms_10ms_windows.length!==10||
      b.rms_10ms_windows.length!==10||
      [...a.rms_10ms_windows,...b.rms_10ms_windows].some(v=>
        typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))
      bad('M58_AUDIO_SEAM_COMPARISON_INVALID');
    const excess=round(a.max_adjacent_sample_jump-
      b.max_adjacent_sample_jump);
    const click=excess>excessJumpThreshold&&
      a.max_adjacent_sample_jump>minAbsoluteJump;
    const dropouts=[];
    for(let bin=0;bin<10;bin++){
      if(b.rms_10ms_windows[bin]>=dropoutBaselineRms&&
        a.rms_10ms_windows[bin]<dropoutIncrementalRms)
        dropouts.push(bin);
    }
    boundaries.push({
      boundary_after_scene:i+1,
      incremental_max_sample_jump:a.max_adjacent_sample_jump,
      full_p05_max_sample_jump:b.max_adjacent_sample_jump,
      excess_sample_jump:excess,
      click_risk:click,
      dropout_bin_indices:dropouts,
      dropout_risk:dropouts.length>=2, // at least 20 ms, not a zero crossing
      review_required:click||dropouts.length>=2,
    });
  }
  const issues=boundaries.filter(x=>x.review_required).map(x=>({
    boundary_after_scene:x.boundary_after_scene,
    click_risk:x.click_risk,dropout_risk:x.dropout_risk,
  }));
  return {
    schema_version:1,
    scope:'P13_VS_IDENTICAL_SOURCE_FULL_P05_AUDIO_CUT_COMPARISON',
    relative_decoded_duration_delta_ms:round(deltaDuration*1000),
    thresholds:{excess_jump:excessJumpThreshold,
      minimum_absolute_jump:minAbsoluteJump,
      reference_rms:dropoutBaselineRms,
      silent_rms:dropoutIncrementalRms},
    boundaries,issues,
    manual_audio_review_required:issues.length>0,
    synchronized_words_verified:false,perceptual_clicks_verified:false,
    may_publish:false,may_deploy:false,
    caveat:'Relative 48kHz PCM click/dropout triage at five hard cuts. This is NOT perceptual loudness, spoken-word sync, licensing or an authorization to publish.',
  };
}

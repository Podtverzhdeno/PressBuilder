/** M58-R14: bounded crossfade audio envelope QC for six-scene P05 masters.
 * Read-only PCM diagnostics. A change in music/voice loudness is not an error.
 * Flags only severe mid-overlap dropouts, clipped samples or over-gain risks.
 */
const bad=code=>{throw Object.assign(new Error(code),{code,status:422})};
const RATE=48000,CHANNELS=2,BIN=480;
const round=(v,n=5)=>Number(v.toFixed(n));
function binMeasure(pcm,from,to){
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
     from<0||to>pcm.length/4||from>=to)
    bad('M58_CROSSFADE_AUDIO_WINDOW_INVALID');
  let sum=0,peak=0,clipped=0;
  for(let frame=from;frame<to;frame++)for(let c=0;c<CHANNELS;c++){
    const value=pcm.readInt16LE(frame*4+c*2);
    const abs=Math.abs(value);
    peak=Math.max(peak,abs);
    if(abs>=32700)clipped++;
    const x=value/32768;
    sum+=x*x;
  }
  return {rms:Math.sqrt(sum/((to-from)*CHANNELS)),
    peak:peak/32768,clipped,
    sample_count:(to-from)*CHANNELS};
}
function rmsAcross(bins){
  const sum=bins.reduce((n,x)=>n+x.rms*x.rms,0);
  return Math.sqrt(sum/bins.length);
}
export function analyzeCrossfadePcm(pcm,{
  sceneDurationSec=3,fadeDurationSec=0.3,edges=[0,2,4],
  audibleRms=0.04,nearSilentRms=0.004,
  excessiveGainFactor=1.8,clippedFractionThreshold=0.001,
}={}){
  if(!Buffer.isBuffer(pcm)||pcm.length%4!==0||pcm.length===0||
     pcm.length>22*1024*1024)
    bad('M58_CROSSFADE_AUDIO_PCM_INVALID');
  if(![3,4,5,6,7].includes(sceneDurationSec)||
    fadeDurationSec!==0.3||!Array.isArray(edges)||
    edges.length!==3||edges.join(',')!=='0,2,4'||
    [audibleRms,nearSilentRms,excessiveGainFactor,clippedFractionThreshold].
      some(x=>typeof x!=='number'||!Number.isFinite(x))||
    audibleRms<0.02||audibleRms>0.2||
    nearSilentRms<0.0001||nearSilentRms>0.01||
    excessiveGainFactor<1.5||excessiveGainFactor>3||
    clippedFractionThreshold<0.0001||clippedFractionThreshold>0.02)
    bad('M58_CROSSFADE_AUDIO_POLICY_INVALID');
  const expectedFrames=Math.round((6*sceneDurationSec-
    edges.length*fadeDurationSec)*RATE);
  const decodedFrames=pcm.length/4;
  if(Math.abs(decodedFrames-expectedFrames)>RATE*.12)
    bad('M58_CROSSFADE_AUDIO_TIMELINE_DRIFT');
  const windows=[];
  for(let j=0;j<edges.length;j++){
    const edge=edges[j];
    const start=Math.round(((edge+1)*sceneDurationSec-
      j*fadeDurationSec-fadeDurationSec)*RATE);
    const end=start+Math.round(fadeDurationSec*RATE);
    const pre=[],during=[],post=[];
    for(let k=-10;k<40;k++){
      const left=start+k*BIN,right=left+BIN;
      const metric=binMeasure(pcm,left,right);
      if(k<0)pre.push(metric);
      else if(k<30)during.push(metric);
      else post.push(metric);
    }
    if(end!==start+30*BIN||pre.length!==10||
       during.length!==30||post.length!==10)
      bad('M58_CROSSFADE_AUDIO_WINDOW_INVALID');
    const preRms=rmsAcross(pre),postRms=rmsAcross(post);
    const audibleBoth=preRms>=audibleRms&&postRms>=audibleRms;
    let silentConsecutive=0,longestSilence=0;
    for(const b of during){
      if(b.rms<nearSilentRms)silentConsecutive++;
      else silentConsecutive=0;
      longestSilence=Math.max(longestSilence,silentConsecutive);
    }
    const peak=Math.max(...during.map(x=>x.peak));
    const clipped=during.reduce((n,x)=>n+x.clipped,0);
    const samples=during.reduce((n,x)=>n+x.sample_count,0);
    const fraction=clipped/samples;
    const peakRms=Math.max(...during.map(x=>x.rms));
    const referenceRms=Math.max(preRms,postRms);
    const gainRatio=referenceRms>0?peakRms/referenceRms:null;
    const fadeOutToSilence=preRms>=audibleRms&&postRms<nearSilentRms;
    const fadeInFromSilence=postRms>=audibleRms&&preRms<nearSilentRms;
    const dropout=audibleBoth&&longestSilence>=2;
    const clipping=fraction>=clippedFractionThreshold;
    const excessiveGain=referenceRms>=audibleRms&&
      gainRatio>excessiveGainFactor&&peakRms>0.16;
    windows.push({
      boundary_after_scene:edge+1,
      fade_start_sec:round(start/RATE,3),
      fade_end_sec:round(end/RATE,3),
      pre_rms:round(preRms),post_rms:round(postRms),
      peak_fade_bin_rms:round(peakRms),
      fade_rms_gain_ratio:gainRatio===null?null:round(gainRatio),
      peak_sample_normalized:round(peak),
      clipped_sample_fraction:round(fraction,6),
      longest_near_silent_ms:longestSilence*10,
      fade_out_to_silence:fadeOutToSilence,
      fade_in_from_silence:fadeInFromSilence,
      dropout_risk:dropout,
      clipping_risk:clipping,
      excessive_gain_risk:excessiveGain,
      review_required:dropout||clipping||excessiveGain,
    });
  }
  return {
    schema_version:1,
    scope:'P05_SYNTHETIC_CROSSFADE_PCM_ENVELOPE_48KHZ_STEREO',
    scene_count:6,scene_duration_sec:sceneDurationSec,
    fade_duration_sec:fadeDurationSec,
    expected_duration_sec:round(expectedFrames/RATE),
    decoded_duration_sec:round(decodedFrames/RATE),
    boundaries:windows,
    review_boundary_count:windows.filter(x=>x.review_required).length,
    manual_audio_review_required:windows.some(x=>x.review_required),
    synchronized_words_verified:false,
    multilayer_perceptual_quality_verified:false,
    may_publish:false,may_deploy:false,
    caveat:'Observed envelope and sample clipping in three declared P05 crossfades. Intended fades to/from silence and volume changes are not defects. Not LUFS, multi-track source separation, lip sync, or release approval.',
  };
}

/** M58-R17: source-pinned timing of a known, offline TTS speech cue.
 * Cross-correlates high-pass speech-energy envelopes after real P05/AAC.
 * Not automatic transcription, lip sync, word alignment or human listening.
 */
const RATE=48000,BIN=960,SCENE=3,OVERLAP=.3;
const error=code=>{throw Object.assign(new Error(code),{code,status:422})};
const round=(n,d=4)=>Number(n.toFixed(d));
/** Butterworth biquad ~450Hz HP removes the fixture's known 110Hz music. */
export function speechEnvelope(pcm){
  if(!Buffer.isBuffer(pcm)||pcm.length<4*BIN||pcm.length%4||
    pcm.length>22*1024*1024)error('M58_CUE_PCM_INVALID');
  const omega=2*Math.PI*450/RATE;
  const co=Math.cos(omega),si=Math.sin(omega);
  const alpha=si/(2*Math.SQRT1_2),a0=1+alpha;
  const b0=(1+co)/(2*a0),b1=-(1+co)/a0,b2=b0;
  const a1=-2*co/a0,a2=(1-alpha)/a0;
  let x1=0,x2=0,y1=0,y2=0,sum=0,n=0;
  const out=[];
  for(let i=0;i<pcm.length;i+=4){
    const x=(pcm.readInt16LE(i)+pcm.readInt16LE(i+2))/65536;
    const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;
    x2=x1;x1=x;y2=y1;y1=y;
    sum+=y*y;
    if(++n===BIN){
      out.push(Math.sqrt(sum/BIN));
      n=0;sum=0;
    }
  }
  return out;
}
function similarity(ref,observed,offset){
  let xy=0,xx=0,yy=0,rx=0,ox=0,n=0;
  for(let i=0;i<ref.length;i++){
    const j=offset+i;
    if(j<0||j>=observed.length)return null;
    const r=ref[i],o=observed[j];
    xy+=r*o;xx+=r*r;yy+=o*o;rx+=r;ox+=o;n++;
  }
  if(!n)return null;
  const numerator=xy-rx*ox/n;
  const denom=Math.sqrt(Math.max(0,xx-rx*rx/n)*Math.max(0,yy-ox*ox/n));
  return denom>1e-9?numerator/denom:null;
}
/** Negative control: 250ms late spoken cue must fail even if vocal energy exists. */
export function analyzeOfflineSpeechCueTiming(masterPcm,spokenPcm,{
  expectedOffsetSec=.2,sourceSceneIds=['s02','s05'],
  maxDelayMs=90,searchRadiusMs=400,minCorrelation=.55,
}={}){
  if(expectedOffsetSec!==.2||!Array.isArray(sourceSceneIds)||
    sourceSceneIds.join(',')!=='s02,s05'||
    !Number.isSafeInteger(maxDelayMs)||maxDelayMs<40||maxDelayMs>120||
    !Number.isSafeInteger(searchRadiusMs)||searchRadiusMs<250||searchRadiusMs>500||
    typeof minCorrelation!=='number'||!Number.isFinite(minCorrelation)||
    minCorrelation<.45||minCorrelation>.8)
    error('M58_CUE_POLICY_INVALID');
  const duration=masterPcm?.length/4/RATE;
  if(!Number.isFinite(duration)||Math.abs(duration-17.1)>.12)
    error('M58_CUE_MASTER_TIMELINE_INVALID');
  if(!Buffer.isBuffer(spokenPcm)||spokenPcm.length<.25*RATE*4||
    spokenPcm.length>3*RATE*4||spokenPcm.length%4)
    error('M58_CUE_REFERENCE_INVALID');
  const master=speechEnvelope(masterPcm),source=speechEnvelope(spokenPcm);
  // Include 200ms of expected silence at the cue start. This avoids
  // confusing an earlier transient with the beginning of spoken words.
  const pad=Math.round(expectedOffsetSec*RATE/BIN);
  const template=Array(Math.round(SCENE*RATE/BIN)).fill(0);
  for(let i=0;i<source.length&&i+pad<template.length;i++)
    template[pad+i]=source[i];
  const scenes=[];
  const starts={s02:SCENE-OVERLAP,s05:4*SCENE-2*OVERLAP};
  for(const id of sourceSceneIds){
    const nominalStart=Math.round(starts[id]*RATE/BIN);
    const radius=Math.floor(searchRadiusMs/20);
    let best=null;
    for(let lag=-radius;lag<=radius;lag++){
      const correlation=similarity(template,master,nominalStart+lag);
      if(correlation!==null&&(!best||correlation>best.correlation))
        best={lag,correlation};
    }
    const offsetMs=best?best.lag*20:null;
    const match=best!==null&&best.correlation>=minCorrelation;
    const drift=match&&Math.abs(offsetMs)>maxDelayMs;
    const reason=!match?'VOICE_TEMPLATE_NOT_IDENTIFIABLE':
      drift?'SPEECH_CUE_TIME_DRIFT':null;
    scenes.push({scene_id:id,expected_scene_start_sec:starts[id],
      original_cue_offset_sec:expectedOffsetSec,
      observed_relative_offset_ms:match?offsetMs:null,
      source_correlation:best?round(best.correlation,6):null,
      correlation_verified:match,
      drift_exceeds_policy:drift,review_reason:reason});
  }
  return {
    scope:'SOURCE_PINNED_OFFLINE_TTS_P05_CUE_TIME_ALIGNMENT',
    reference_window_ms:20,
    max_allowed_drift_ms:maxDelayMs,
    minimum_envelope_correlation:minCorrelation,
    scenes,manual_speech_timing_review_required:
      scenes.some(s=>s.review_reason!==null),
    phoneme_word_alignment_verified:false,
    lip_sync_verified:false,transcript_accuracy_verified:false,
    human_intelligibility_verified:false,
    may_publish:false,may_deploy:false,
    caveat:'High-pass envelope lag against the exact locally synthesized source used in a controlled six-scene P05 fixture. Supports only known speech and background, not ASR, word timing, generic voices or visual lip synchronization.',
  };
}

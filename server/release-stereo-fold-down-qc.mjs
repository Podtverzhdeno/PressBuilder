/** M58-R19: bounded scan of controlled P05 fixture audio, including off-center
 * intermittent stereo phase cancellations, without crossing 300 ms fades.
 * This is NOT general-purpose quality approval of arbitrary licensed videos.
 */
const RATE=48000,FRAME_BYTES=4,SCENE_SEC=3,FADE_SEC=.3;
const WINDOW_FRAMES=14400;
const OFFSETS=[.34,.67,1,1.33,1.66,1.99,2.32];
const fail=code=>{throw Object.assign(new Error(code),{code,status:422})};
const rounded=(x)=>Number(x.toFixed(5));
function measureWindow(pcm,first,limits){
  let ll=0,rr=0,lr=0,mm=0,ss=0;
  for(let f=first;f<first+WINDOW_FRAMES;f++){
    const left=pcm.readInt16LE(f*FRAME_BYTES)/32768;
    const right=pcm.readInt16LE(f*FRAME_BYTES+2)/32768;
    const mid=(left+right)/2,side=(left-right)/2;
    ll+=left*left;rr+=right*right;lr+=left*right;
    mm+=mid*mid;ss+=side*side;
  }
  const rmsL=Math.sqrt(ll/WINDOW_FRAMES),rmsR=Math.sqrt(rr/WINDOW_FRAMES);
  const rmsMid=Math.sqrt(mm/WINDOW_FRAMES);
  const rmsSide=Math.sqrt(ss/WINDOW_FRAMES);
  const corr=rmsL>0&&rmsR>0?lr/WINDOW_FRAMES/(rmsL*rmsR):null;
  const midSideRatio=rmsSide>1e-9?rmsMid/rmsSide:null;
  const audible=rmsL>=limits.minChannelRms&&rmsR>=limits.minChannelRms;
  const inverted=audible&&corr!==null&&
    corr<=limits.invertedCorrelationLimit&&midSideRatio!==null&&
    midSideRatio<=limits.maxMidToSideRatio;
  return {
    channel_left_rms:rounded(rmsL),
    channel_right_rms:rounded(rmsR),
    mid_rms:rounded(rmsMid),
    side_rms:rounded(rmsSide),
    interchannel_correlation:corr===null?null:rounded(corr),
    mid_to_side_ratio:midSideRatio===null?null:rounded(midSideRatio),
    phase_inverted:inverted,
    review_reason:!audible?'CHANNEL_SIGNAL_TOO_WEAK':
      inverted?'PHASE_INVERTED_MONO_CANCELLATION':null,
  };
}
export function analyzeStereoFoldDownPcm(pcm,{
  minChannelRms=.006,
  maxMidToSideRatio=.25,
  invertedCorrelationLimit=-.85,
}={}){
  if([minChannelRms,maxMidToSideRatio,invertedCorrelationLimit].
      some(x=>typeof x!=='number'||!Number.isFinite(x))||
     minChannelRms<.003||minChannelRms>.025||
     maxMidToSideRatio<.1||maxMidToSideRatio>.4||
     invertedCorrelationLimit>-.7||invertedCorrelationLimit<-.98)
    fail('M58_STEREO_POLICY_INVALID');
  if(!Buffer.isBuffer(pcm)||pcm.length%FRAME_BYTES!==0||
     pcm.length===0||pcm.length>22*1024*1024)
    fail('M58_STEREO_PCM_INVALID');
  const durationSec=pcm.length/FRAME_BYTES/RATE;
  if(Math.abs(durationSec-(6*SCENE_SEC-3*FADE_SEC))>.12)
    fail('M58_STEREO_TIMELINE_INVALID');
  const scenes=[],issues=[];
  const limits={minChannelRms,maxMidToSideRatio,invertedCorrelationLimit};
  for(let scene=0;scene<6;scene++){
    const sceneStart=scene*SCENE_SEC-Math.ceil(scene/2)*FADE_SEC;
    // Keep the original s05 .95s diagnostic for backward compatibility.
    const first=Math.round((sceneStart+.95)*RATE);
    const baseline=measureWindow(pcm,first,limits);
    const windows=OFFSETS.map(offset=>{
      const start=sceneStart+offset;
      return {window_start_sec:rounded(start),
        ...measureWindow(pcm,Math.round(start*RATE),limits)};
    });
    // A single antiphase/low-signal window must trigger review. Prioritize
    // destructive cancellation if it coexists with a weak section.
    const problem=windows.find(x=>
      x.review_reason==='PHASE_INVERTED_MONO_CANCELLATION')||
      windows.find(x=>x.review_reason==='CHANNEL_SIGNAL_TOO_WEAK');
    const reason=problem?.review_reason||baseline.review_reason;
    const id='s'+String(scene+1).padStart(2,'0');
    const evidence=problem|| (baseline.review_reason?
      {window_start_sec:rounded(sceneStart+.95)}:null);
    scenes.push({scene_id:id,window_start_sec:rounded(sceneStart+.95),
      ...baseline,phase_inverted:reason==='PHASE_INVERTED_MONO_CANCELLATION',
      review_reason:reason,
      first_failing_window_start_sec:evidence?.window_start_sec??null,
      windows});
    if(reason)issues.push({scene_id:id,code:reason});
  }
  return {scope:'CONTROLLED_P05_STEREO_MONO_FOLD_DOWN_QA',
    window_ms:300,windows_per_scene:OFFSETS.length,
    decoded_duration_sec:rounded(durationSec),
    scenes,issues,manual_audio_review_required:issues.length>0,
    stereo_intent_verified:false,human_listening_verified:false,
    source_rights_verified:false,may_publish:false,may_deploy:false,
    caveat:'Controlled 48 kHz s16le two-channel fixture; seven discrete 300ms windows inside each scene detect gross local antiphase or missing channel energy, not complete sample-by-sample coverage. Excludes 300ms fades, intentional stereo design, surround, human listening and source rights.'};
}

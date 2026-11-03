/** M58-R18: controlled stereo phase-cancellation QA on real decoded P05 PCM.
 * This is NOT generic phase-coherence or professional stereo master approval.
 * It checks six known six-scene fixture centers, away from crossfade boundaries.
 */
const RATE=48000,FRAME_BYTES=4,SCENE_SEC=3,FADE_SEC=.3;
const fail=code=>{throw Object.assign(new Error(code),{code,status:422})};
const rounded=(x)=>Number(x.toFixed(5));
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
  for(let scene=0;scene<6;scene++){
    const sceneStart=scene*SCENE_SEC-Math.ceil(scene/2)*FADE_SEC;
    // 300 ms safely inside each scene, never over a 300 ms transition.
    const first=Math.round((sceneStart+.95)*RATE);
    const count=Math.round(.3*RATE);
    let ll=0,rr=0,lr=0,mm=0,ss=0;
    for(let f=first;f<first+count;f++){
      const left=pcm.readInt16LE(f*FRAME_BYTES)/32768;
      const right=pcm.readInt16LE(f*FRAME_BYTES+2)/32768;
      const mid=(left+right)/2,side=(left-right)/2;
      ll+=left*left;rr+=right*right;lr+=left*right;
      mm+=mid*mid;ss+=side*side;
    }
    const rmsL=Math.sqrt(ll/count),rmsR=Math.sqrt(rr/count);
    const rmsMid=Math.sqrt(mm/count),rmsSide=Math.sqrt(ss/count);
    const corr=rmsL>0&&rmsR>0?lr/count/(rmsL*rmsR):null;
    const midSideRatio=rmsSide>1e-9?rmsMid/rmsSide:null;
    const audible=rmsL>=minChannelRms&&rmsR>=minChannelRms;
    const inverted=audible&&corr!==null&&
      corr<=invertedCorrelationLimit&&midSideRatio!==null&&
      midSideRatio<=maxMidToSideRatio;
    const code=!audible?'CHANNEL_SIGNAL_TOO_WEAK':
      inverted?'PHASE_INVERTED_MONO_CANCELLATION':null;
    const sceneId='s'+String(scene+1).padStart(2,'0');
    scenes.push({scene_id:sceneId,window_start_sec:rounded(sceneStart+.95),
      channel_left_rms:rounded(rmsL),channel_right_rms:rounded(rmsR),
      mid_rms:rounded(rmsMid),side_rms:rounded(rmsSide),
      interchannel_correlation:corr===null?null:rounded(corr),
      mid_to_side_ratio:midSideRatio===null?null:rounded(midSideRatio),
      phase_inverted:inverted,review_reason:code});
    if(code)issues.push({scene_id:sceneId,code});
  }
  return {scope:'CONTROLLED_P05_STEREO_MONO_FOLD_DOWN_QA',
    window_ms:300,decoded_duration_sec:rounded(durationSec),
    scenes,issues,manual_audio_review_required:issues.length>0,
    stereo_intent_verified:false,human_listening_verified:false,
    source_rights_verified:false,may_publish:false,may_deploy:false,
    caveat:'Controlled 48 kHz s16le two-channel fixture only; flags gross antiphase or missing channel energy in six known scene centers. Cannot validate intentional wide stereo, headphones, surround, perceptual balance, or production rights.'};
}

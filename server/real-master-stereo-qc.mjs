/** M58-R20: real decoded stereo MP4 PCM *risk screening*.
 * This is deliberately not a generic intelligibility or media release gate.
 */
const RATE=48000, FRAME_BYTES=4, WINDOW_FRAMES=14400, MAX_SECONDS=60;
const bad=code=>{throw Object.assign(new Error(code),{code,status:422})};
const round=(n,digits=5)=>Number(n.toFixed(digits));
export function screenRealStereoPcm(pcm,{expectedDurationSec=null}={}){
 if(!Buffer.isBuffer(pcm)||pcm.length<WINDOW_FRAMES*FRAME_BYTES||
    pcm.length%FRAME_BYTES!==0||pcm.length>(MAX_SECONDS*RATE*FRAME_BYTES))
   bad('M58_REAL_AUDIO_PCM_INVALID');
 const frameCount=pcm.length/FRAME_BYTES;
 const durationSec=frameCount/RATE;
 if(expectedDurationSec!==null&&
    (typeof expectedDurationSec!=='number'||!Number.isFinite(expectedDurationSec)||
     expectedDurationSec<.3||expectedDurationSec>MAX_SECONDS||
     Math.abs(durationSec-expectedDurationSec)>.35))
   bad('M58_REAL_AUDIO_DURATION_MISMATCH');
 const windows=[],issues=[];
 const windowCount=Math.floor(frameCount/WINDOW_FRAMES);
 for(let i=0;i<windowCount;i++){
  let ll=0,rr=0,lr=0,mm=0,ss=0;
  const start=i*WINDOW_FRAMES;
  for(let frame=start;frame<start+WINDOW_FRAMES;frame++){
   const l=pcm.readInt16LE(frame*FRAME_BYTES)/32768;
   const r=pcm.readInt16LE(frame*FRAME_BYTES+2)/32768;
   const m=(l+r)/2,s=(l-r)/2;
   ll+=l*l;rr+=r*r;lr+=l*r;mm+=m*m;ss+=s*s;
  }
  const left=Math.sqrt(ll/WINDOW_FRAMES),right=Math.sqrt(rr/WINDOW_FRAMES);
  const mid=Math.sqrt(mm/WINDOW_FRAMES),side=Math.sqrt(ss/WINDOW_FRAMES);
  const corr=left>0&&right>0?lr/WINDOW_FRAMES/(left*right):null;
  const midSide=side>1e-9?mid/side:null;
  // Gross antiphase with adequate energy on both sides can mute mono playback.
  const antiphase=left>=.012&&right>=.012&&corr!==null&&
   corr<=-.94&&midSide!==null&&midSide<=.18;
  // One-channel dropout is distinct from intentionally quiet *both* channels.
  const loud=Math.max(left,right),quiet=Math.min(left,right);
  const missingChannel=loud>=.035&&quiet<=.005&&quiet/loud<.12;
  const reason=antiphase?'POSSIBLE_MONO_FOLD_DOWN_CANCELLATION':
   missingChannel?'POSSIBLE_ONE_CHANNEL_DROPOUT':null;
  const startSec=round(start/RATE,3);
  const window={window_start_sec:startSec,window_end_sec:round((start+WINDOW_FRAMES)/RATE,3),
   left_rms:round(left),right_rms:round(right),
   mid_rms:round(mid),side_rms:round(side),
   correlation:corr===null?null:round(corr),
   mid_to_side_ratio:midSide===null?null:round(midSide),
   review_reason:reason};
  windows.push(window);
  if(reason)issues.push({window_start_sec:startSec,
   window_end_sec:window.window_end_sec,code:reason,
   requires_human_review:true});
 }
 return {schema_version:1,scope:'REAL_MP4_DECODED_48K_STEREO_RISK_SCREEN',
  audio_duration_sec:round(durationSec,5),sample_rate_hz:RATE,
  channels:2,window_ms:300,scanned_windows:windowCount,
  unscanned_tail_ms:round((frameCount-windowCount*WINDOW_FRAMES)/RATE*1000,3),
  windows,issues,manual_audio_review_required:issues.length>0,
  audio_video_pts_alignment_verified:false,
  speech_intelligibility_verified:false,creative_intent_verified:false,
  human_listening_verified:false,source_rights_verified:false,
  may_publish:false,may_deploy:false,
  caveat:'Decoded 48kHz stereo only. A 300ms window can miss brief defects. Antiphase and single-channel audio can be intentional. PCM clock is approximate for MP4 seek; A/V PTS, speech, rights and artistic quality are not established.'};
}

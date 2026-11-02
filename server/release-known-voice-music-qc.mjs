/** M58-R15: *fixture-calibrated* audio bed/voice QA, not speech recognition.
 * A generated 110Hz music tone and a 440Hz voice surrogate are intentionally
 * known references. This cannot identify voices in arbitrary real-world media.
 */
const fail=code=>{throw Object.assign(new Error(code),{code,status:422})};
const RATE=48000,FRAMES_PER_WINDOW=9600,FADE=0.3;
const round=(x,n=5)=>Number(x.toFixed(n));
const VALID_DURATIONS=new Set([3,4,5,6,7]);
/** Estimate a known-tone amplitude in a 200-ms stereo PCM window.
 * Fourier sin/cos projection is phase independent and has integer cycles
 * for the two known reference tones, minimizing spectral leakage.
 */
function amplitude(pcm,centerSeconds,freq){
  const start=Math.round(centerSeconds*RATE)-FRAMES_PER_WINDOW/2;
  const end=start+FRAMES_PER_WINDOW;
  if(start<0||end>pcm.length/4)fail('M58_STEM_WINDOW_INVALID');
  let cosine=0,sine=0;
  for(let n=0;n<FRAMES_PER_WINDOW;n++){
    const mono=(pcm.readInt16LE((start+n)*4)+
      pcm.readInt16LE((start+n)*4+2))/(2*32768);
    const angle=2*Math.PI*freq*n/RATE;
    cosine+=mono*Math.cos(angle);
    sine+=mono*Math.sin(angle);
  }
  return round(2*Math.hypot(cosine,sine)/FRAMES_PER_WINDOW,6);
}
export function analyzeKnownVoiceMusicPcm(pcm,{
  sceneDurationSec=3,expectedVoiceScenes=[1,4],
  minMusicAmplitude=0.012,minVoiceAmplitude=0.038,
  maxUnexpectedVoiceAmplitude=0.025,
  maxUnduckedRatio=0.73,minDuckedRatio=0.12,
}={}){
  if(!VALID_DURATIONS.has(sceneDurationSec)||
    !Array.isArray(expectedVoiceScenes)||
    expectedVoiceScenes.length!==2||expectedVoiceScenes.join(',')!=='1,4'||
    [minMusicAmplitude,minVoiceAmplitude,maxUnexpectedVoiceAmplitude,
     maxUnduckedRatio,minDuckedRatio].some(x=>
       typeof x!=='number'||!Number.isFinite(x)||x<0||x>1)||
    minMusicAmplitude<.005||minVoiceAmplitude<.02||
    maxUnexpectedVoiceAmplitude>.05||
    maxUnduckedRatio<.45||minDuckedRatio>.4)
    fail('M58_STEM_POLICY_INVALID');
  if(!Buffer.isBuffer(pcm)||pcm.length===0||pcm.length%4!==0||
    pcm.length>22*1024*1024)
    fail('M58_STEM_PCM_INVALID');
  const seconds=6*sceneDurationSec-3*FADE,frames=pcm.length/4;
  if(Math.abs(frames-seconds*RATE)>RATE*.12)
    fail('M58_STEM_TIMELINE_DRIFT');
  const scenes=[];
  for(let i=0;i<6;i++){
    const priorFades=i===0?0:i<=2?1:i<=4?2:3;
    const start=i*sceneDurationSec-priorFades*FADE;
    const center=start+sceneDurationSec/2;
    scenes.push({
      scene_id:'s0'+(i+1),voice_expected:expectedVoiceScenes.includes(i),
      center_sec:round(center,3),
      music_tone_110hz_amplitude:amplitude(pcm,center,110),
      voice_tone_440hz_amplitude:amplitude(pcm,center,440),
    });
  }
  const nonVoice=scenes.filter(s=>!s.voice_expected);
  const referenceMusic=nonVoice.map(s=>s.music_tone_110hz_amplitude)
    .sort((a,b)=>a-b);
  const nonVoiceMedian=(referenceMusic[1]+referenceMusic[2])/2;
  if(nonVoiceMedian<minMusicAmplitude)
    fail('M58_STEM_REFERENCE_MUSIC_MISSING');
  const issues=[];
  for(const scene of scenes){
    const music=scene.music_tone_110hz_amplitude;
    const voice=scene.voice_tone_440hz_amplitude;
    const duckRatio=music/nonVoiceMedian;
    scene.music_to_unvoiced_reference_ratio=round(duckRatio,4);
    scene.voice_to_music_db=music>0&&voice>0?
      round(20*Math.log10(voice/music),2):null;
    const current=[];
    if(music<minMusicAmplitude)current.push('MUSIC_BED_MISSING');
    if(scene.voice_expected){
      if(voice<minVoiceAmplitude)current.push('VOICE_SURROGATE_MISSING');
      if(duckRatio>maxUnduckedRatio)current.push('MUSIC_DUCKING_MISSING');
      if(duckRatio<minDuckedRatio)current.push('MUSIC_DUCKING_TOO_DEEP');
    }else if(voice>maxUnexpectedVoiceAmplitude){
      current.push('UNEXPECTED_VOICE_TONE');
    }
    scene.issues=current;
    issues.push(...current.map(code=>({scene_id:scene.scene_id,code})));
  }
  const boundaries=[];
  const edgeStarts=[sceneDurationSec-FADE,
    3*sceneDurationSec-2*FADE,
    5*sceneDurationSec-3*FADE];
  for(let i=0;i<edgeStarts.length;i++){
    const center=edgeStarts[i]+FADE/2;
    const amp=amplitude(pcm,center,110);
    const missing=amp<minMusicAmplitude;
    boundaries.push({
      after_scene:[1,3,5][i],center_sec:round(center,3),
      music_tone_110hz_amplitude:amp,
      music_bed_gap:missing,
    });
    if(missing)issues.push({
      boundary_after_scene:[1,3,5][i],code:'MUSIC_BED_CROSSFADE_GAP',
    });
  }
  return {
    schema_version:1,
    scope:'CONTROLLED_SYNTHETIC_110HZ_MUSIC_440HZ_VOICE_SURROGATE',
    measurement_kind:'REFERENCE_FREQUENCY_200MS_FOURIER',
    scene_count:6,scene_duration_sec:sceneDurationSec,
    audio_duration_sec:round(frames/RATE,4),
    reference_unvoiced_music_amplitude:round(nonVoiceMedian,6),
    scenes,boundaries,issues,
    manual_audio_review_required:issues.length>0,
    actual_speech_intelligibility_verified:false,
    real_music_stem_identity_verified:false,
    music_license_verified:false,may_publish:false,may_deploy:false,
    caveat:'Only synthetic *known* 110Hz music/440Hz speech-surrogate references, not actual speech or arbitrary instruments. Verify real media by listening and licensed-stem evidence before any release.',
  };
}

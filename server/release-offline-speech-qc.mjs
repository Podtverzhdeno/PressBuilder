/** M58-R16: original offline synthesized SPOKEN WORDS against known 110Hz bed.
 * Detect lost speech-band energy after genuine P05 H264/AAC montage. This is
 * NOT ASR, intelligibility, language identification or real music separation.
 */
import {measureToneReference} from './release-known-voice-music-qc.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code,status:422})};
const RATE=48000,WINDOW=0.2,FADE=0.3,SEC=3;
const round=(n,d=6)=>Number(n.toFixed(d));
const percent=(a,b)=>b>0?a/b:null;
export function analyzeOfflineSpokenVoicePcm(pcm,{
  sceneDurationSec=SEC,expectedVoiceScenes=[1,4],
  minVoiceResidualRms=0.007,
  minimumVoiceToNonvoiceRatio=2.5,
  minMusicAmplitude=0.010,
  minDuckingRatio=0.12,
  maxDuckingRatio=0.65,
}={}){
  if(sceneDurationSec!==3||!Array.isArray(expectedVoiceScenes)||
     expectedVoiceScenes.join(',')!=='1,4'||
     [minVoiceResidualRms,minimumVoiceToNonvoiceRatio,
      minMusicAmplitude,minDuckingRatio,maxDuckingRatio].
        some(n=>typeof n!=='number'||!Number.isFinite(n))||
     minVoiceResidualRms<0.003||minVoiceResidualRms>0.03||
     minimumVoiceToNonvoiceRatio<2||minimumVoiceToNonvoiceRatio>10||
     minMusicAmplitude<0.005||minMusicAmplitude>0.02||
     minDuckingRatio<0.08||minDuckingRatio>0.25||
     maxDuckingRatio<0.5||maxDuckingRatio>0.85)
    fail('M58_NATIVE_SPEECH_POLICY_INVALID');
  if(!Buffer.isBuffer(pcm)||pcm.length===0||pcm.length%4!==0||
     pcm.length>22*1024*1024)
    fail('M58_NATIVE_SPEECH_PCM_INVALID');
  const actualSec=pcm.length/4/RATE;
  if(Math.abs(actualSec-(6*SEC-3*FADE))>0.12)
    fail('M58_NATIVE_SPEECH_TIMELINE_DRIFT');
  const scenes=[];
  const offsets=[0.8,1.1,1.4,1.7,2.0];
  for(let i=0;i<6;i++){
    const start=i*SEC-Math.ceil(i/2)*FADE;
    const windows=offsets.map(x=>
      measureToneReference(pcm,start+x,110));
    const music=windows.map(w=>w.amplitude);
    const residual=windows.map(w=>w.residual_rms);
    scenes.push({
      scene_id:'s0'+(i+1),voice_expected:expectedVoiceScenes.includes(i),
      music_110hz_amplitude:round(music.reduce((a,b)=>a+b,0)/music.length),
      non_music_rms:round(residual.reduce((a,b)=>a+b,0)/residual.length),
    });
  }
  const unvoiced=scenes.filter(x=>!x.voice_expected);
  const referenceNoise=Math.max(0.0001,...unvoiced.map(x=>x.non_music_rms));
  const referenceMusic=unvoiced.reduce((sum,x)=>
    sum+x.music_110hz_amplitude,0)/unvoiced.length;
  if(referenceMusic<minMusicAmplitude)
    fail('M58_NATIVE_SPEECH_MUSIC_REFERENCE_MISSING');
  const issues=[];
  for(const s of scenes){
    const relative=percent(s.non_music_rms,referenceNoise);
    const duck=percent(s.music_110hz_amplitude,referenceMusic);
    s.non_music_to_reference_ratio=relative===null?null:round(relative,4);
    s.music_ducking_ratio=duck===null?null:round(duck,4);
    s.issues=[];
    if(s.music_110hz_amplitude<minMusicAmplitude)
      s.issues.push('MUSIC_BED_MISSING');
    if(s.voice_expected){
      if(s.non_music_rms<minVoiceResidualRms||
         relative<minimumVoiceToNonvoiceRatio)
        s.issues.push('SPOKEN_WORD_ENERGY_MISSING');
      if(duck>maxDuckingRatio)
        s.issues.push('MUSIC_DUCKING_MISSING');
      if(duck<minDuckingRatio)
        s.issues.push('MUSIC_DUCKING_TOO_DEEP');
    }
    issues.push(...s.issues.map(code=>({scene_id:s.scene_id,code})));
  }
  const boundaries=[];
  for(const [j,after] of [1,3,5].entries()){
    const center=(after*SEC-(j+1)*FADE)+FADE/2;
    const music=measureToneReference(pcm,center,110).amplitude;
    boundaries.push({after_scene:after,
      music_110hz_amplitude:music,music_bed_gap:music<minMusicAmplitude});
    if(music<minMusicAmplitude)
      issues.push({after_scene:after,code:'MUSIC_BED_CROSSFADE_GAP'});
  }
  return {
    scope:'OFFLINE_ORIGINAL_SPOKEN_WORDS_KNOWN_MUSIC_BED_QA',
    source_kind:'ACTUAL_OFFLINE_TTS_WAVEFORM_NOT_REFERENCE_TONE',
    expected_voice_scenes:[...expectedVoiceScenes],
    decoded_duration_sec:round(actualSec,4),
    music_reference_amplitude:round(referenceMusic),
    nonvoice_residual_reference_rms:round(referenceNoise),
    scenes,boundaries,issues,
    manual_audio_review_required:issues.length>0,
    word_accuracy_verified:false,speech_intelligibility_verified:false,
    source_licenses_verified:false,may_publish:false,may_deploy:false,
    caveat:'Only controlled locally-generated offline TTS speech with a deliberately known 110Hz background bed. Non-music energy does not prove words correct, good sound or actual source separation.',
  };
}

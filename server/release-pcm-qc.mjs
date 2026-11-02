/** M58-R06: bounded, deterministic decoded PCM diagnostics.
 * Computes sample-peak / RMS and long digital-silence spans, not LUFS,
 * intersample true-peak, intelligibility, speech-to-video synchronization,
 * licensing, or a release authorization.
 */
const fail=code=>{throw Object.assign(new Error(code),{code,status:422})};
const RATE=48000,CHANNELS=2,MAX_SECONDS=121,WINDOW_FRAMES=4800;
const round=(n,digits=4)=>Number(n.toFixed(digits));
const dbfs=(linear)=>linear>0?round(20*Math.log10(linear),2):null;

/** Requires interleaved 48 kHz, stereo signed 16-bit LE samples. No files. */
export function analyzePcm16leStereo(pcm,{
  minLongSilenceSec=2, silenceThresholdDbfs=-55,
  clippingThreshold=0.001, sampleRate=RATE,
}={}){
  if(sampleRate!==RATE||typeof minLongSilenceSec!=='number'||
     !Number.isFinite(minLongSilenceSec)||minLongSilenceSec<0.5||
     minLongSilenceSec>30||typeof silenceThresholdDbfs!=='number'||
     !Number.isFinite(silenceThresholdDbfs)||silenceThresholdDbfs< -100||
     silenceThresholdDbfs> -20||typeof clippingThreshold!=='number'||
     !Number.isFinite(clippingThreshold)||clippingThreshold<=0||
     clippingThreshold>0.1)fail('M58_PCM_POLICY_INVALID');
  if(!Buffer.isBuffer(pcm)||pcm.length%4!==0||pcm.length===0||
    pcm.length>MAX_SECONDS*RATE*CHANNELS*2)
    fail('M58_PCM_BUFFER_INVALID');
  const frames=pcm.length/4,total=frames*CHANNELS;
  let sumSquares=0,peak=0,clipped=0;
  let silentStart=null;
  const intervals=[];
  let silenceWindows=0;
  const amplitudeThreshold=Math.pow(10,silenceThresholdDbfs/20);
  for(let start=0;start<frames;start+=WINDOW_FRAMES){
    const end=Math.min(frames,start+WINDOW_FRAMES);
    let windowSq=0;
    for(let frame=start;frame<end;frame++){
      for(let channel=0;channel<CHANNELS;channel++){
        const value=pcm.readInt16LE(frame*4+channel*2);
        const abs=Math.abs(value);
        peak=Math.max(peak,abs);
        if(abs>=32700)clipped++;
        const normalized=value/32768;
        const squared=normalized*normalized;
        windowSq+=squared;
      }
    }
    sumSquares+=windowSq;
    const silence=Math.sqrt(windowSq/((end-start)*CHANNELS))<=amplitudeThreshold;
    if(silence){
      silenceWindows++;
      if(silentStart===null)silentStart=start;
    }else if(silentStart!==null){
      const duration=(start-silentStart)/RATE;
      if(duration>=minLongSilenceSec)
        intervals.push({start_sec:round(silentStart/RATE,3),
          end_sec:round(start/RATE,3),duration_sec:round(duration,3)});
      silentStart=null;
    }
  }
  if(silentStart!==null){
    const duration=(frames-silentStart)/RATE;
    if(duration>=minLongSilenceSec)
      intervals.push({start_sec:round(silentStart/RATE,3),
        end_sec:round(frames/RATE,3),duration_sec:round(duration,3)});
  }
  const peakNormalized=peak/32768;
  const rms=Math.sqrt(sumSquares/total);
  const clippedFraction=clipped/total;
  const result={
    schema_version:1,scope:'PCM_SAMPLE_PEAK_RMS_DIGITAL_SILENCE_ONLY',
    sample_rate:RATE,channels:CHANNELS,sample_frames:frames,
    pcm_duration_sec:round(frames/RATE,4),
    sample_peak_dbfs:dbfs(peakNormalized),
    rms_dbfs:dbfs(rms),
    clipped_sample_count:clipped,
    clipped_sample_fraction:round(clippedFraction,6),
    clipping_risk:clippedFraction>=clippingThreshold,
    long_silence_intervals:intervals.slice(0,16),
    long_silence_count:intervals.length,
    silence_window_count:silenceWindows,
    manual_audio_review_required:clippedFraction>=clippingThreshold||
      intervals.length>0,
    true_peak_verified:false,lufs_verified:false,
    speech_sync_verified:false,may_publish:false,may_deploy:false,
  };
  return result;
}

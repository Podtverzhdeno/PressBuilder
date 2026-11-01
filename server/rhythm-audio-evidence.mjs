/**
 * P15 bounded, read-only evidence from the ACTUAL local audio bytes.
 * This verifies audible/non-audible intervals only. It cannot align WORDS.
 * FFmpeg receives a pipe:0 buffer, never a client-supplied path or URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const PROJECT=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const VOICE=/^voice\.(wav|mp3|m4a|aac|ogg|opus|flac|webm)$/;
const HASH=/^[a-f0-9]{64}$/;
const MAX_INPUT=16*1024*1024;
const MAX_PCM=2*1024*1024;
const RATE=8_000;
const MICROSECONDS=1_000_000;
const MAX_SPANS=100;
const MAX_SPAN_US=5_000_000;
const RMSCUTOFF=0.020; // -34 dBFS; calibrated tests required before production
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};

function safeVoiceBytes(root,projectId,filename,expectedSha){
  if(typeof projectId!=='string'||!PROJECT.test(projectId))fail('INVALID_PROJECT',400);
  if(typeof filename!=='string'||!VOICE.test(filename))fail('UNSUPPORTED_VOICE_FILE',400);
  if(typeof expectedSha!=='string'||!HASH.test(expectedSha))fail('INVALID_VOICE_SHA',400);
  const dir=path.resolve(root,projectId);
  const dest=path.resolve(dir,filename);
  if(path.dirname(dest)!==dir)fail('UNSAFE_AUDIO_PATH',403);
  const folder=fs.lstatSync(dir,{throwIfNoEntry:false});
  if(!folder?.isDirectory()||folder.isSymbolicLink())fail('UNSAFE_AUDIO_DIRECTORY',403);
  const before=fs.lstatSync(dest,{throwIfNoEntry:false});
  if(!before?.isFile()||before.isSymbolicLink()||before.nlink!==1||
     before.size<64||before.size>MAX_INPUT)fail('UNSAFE_AUDIO_SOURCE',403);
  let fd;
  try{
    fd=fs.openSync(dest,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
    const opened=fs.fstatSync(fd);
    if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
       opened.size!==before.size||opened.mtimeMs!==before.mtimeMs||opened.nlink!==1)
      fail('AUDIO_CHANGED',409);
    const bytes=Buffer.alloc(before.size);
    let offset=0;
    while(offset<bytes.length){
      const n=fs.readSync(fd,bytes,offset,bytes.length-offset,null);
      if(n===0)fail('AUDIO_CHANGED',409);
      offset+=n;
    }
    const after=fs.fstatSync(fd);
    const byPath=fs.lstatSync(dest);
    if(after.ino!==before.ino||after.dev!==before.dev||
       after.size!==before.size||after.mtimeMs!==before.mtimeMs||
       byPath.ino!==before.ino||byPath.dev!==before.dev||
       byPath.mtimeMs!==before.mtimeMs)fail('AUDIO_CHANGED',409);
    const actualSha=createHash('sha256').update(bytes).digest('hex');
    if(actualSha!==expectedSha)fail('VOICE_SOURCE_STALE',409);
    return bytes;
  }finally{if(fd!==undefined)fs.closeSync(fd)}
}
function validateSpans(spans,durationUs){
  if(!Number.isSafeInteger(durationUs)||durationUs<100_000||
     durationUs>120_000_000)fail('AUDIO_DURATION_UNSUPPORTED',422);
  if(!Array.isArray(spans)||spans.length===0||spans.length>MAX_SPANS)
    fail('AUDIO_SPANS_INVALID',400);
  return spans.map((span,i)=>{
    if(!span||typeof span!=='object'||Array.isArray(span)||
       Object.keys(span).some(k=>!['start_us','end_us','cue_id','scene_id'].includes(k)))
      fail('AUDIO_SPAN_INVALID',400);
    const {start_us,end_us}=span;
    if(!Number.isSafeInteger(start_us)||!Number.isSafeInteger(end_us)||
       start_us<0||end_us>durationUs||end_us-start_us<100_000||
       end_us-start_us>MAX_SPAN_US)fail('AUDIO_SPAN_BOUNDS',400);
    return {index:i,scene_id:span.scene_id??null,cue_id:span.cue_id??null,
      start_us,end_us};
  });
}

/** Decode whole bounded audio to 8000 Hz mono PCM. No URL, no shell, no network. */
export function inspectRhythmSilence({
  root,project_id,filename,voice_source_sha256,duration_us,spans,
  ffmpeg='ffmpeg',spawn=spawnSync
}){
  const valid=validateSpans(spans,duration_us);
  const bytes=safeVoiceBytes(root,project_id,filename,voice_source_sha256);
  if(typeof ffmpeg!=='string'||!['ffmpeg','/usr/bin/ffmpeg'].includes(ffmpeg))
    fail('FFMPEG_PATH_NOT_ALLOWED',403);
  const args=['-hide_banner','-loglevel','error','-nostdin',
    '-i','pipe:0','-map','0:a:0','-vn','-ac','1','-ar',String(RATE),
    '-f','s16le','pipe:1'];
  const result=spawn(ffmpeg,args,{
    input:bytes,encoding:null,timeout:8000,maxBuffer:MAX_PCM+64*1024,
    windowsHide:true,env:{PATH:process.env.PATH??''}
  });
  if(result.error||result.signal||result.status!==0||
     !Buffer.isBuffer(result.stdout)||result.stdout.length<2||
     result.stdout.length>MAX_PCM||result.stdout.length%2)
    fail('AUDIO_DECODE_UNAVAILABLE',422);
  const pcm=result.stdout;
  const actualSamples=pcm.length/2;
  const expectedSamples=Math.round(duration_us*RATE/MICROSECONDS);
  // Do not trust a declared deck duration that disagrees with audio content.
  const delta= Math.abs(actualSamples-expectedSamples);
  if(delta>Math.max(800,Math.round(expectedSamples*0.02)))
    fail('AUDIO_DURATION_MISMATCH',422);
  const evidence=valid.map(span=>{
    const start=Math.max(0,Math.floor(span.start_us*RATE/MICROSECONDS));
    const end=Math.min(actualSamples,Math.ceil(span.end_us*RATE/MICROSECONDS));
    if(end-start<800)fail('AUDIO_SPAN_TOO_SHORT',422);
    // 20-ms window RMS avoids declaring a single digital zero as a pause.
    let frames=0,silent=0,energy=0,peak=0;
    for(let k=start;k<end;k+=160){
      const stop=Math.min(end,k+160);
      let sum=0;
      for(let j=k;j<stop;j++){
        const value=pcm.readInt16LE(j*2)/32768;
        sum+=value*value;
        peak=Math.max(peak,Math.abs(value));
      }
      const mean=sum/(stop-k);
      energy+=mean*(stop-k);
      frames++;
      if(Math.sqrt(mean)<=RMSCUTOFF)silent++;
    }
    const rms=Math.sqrt(energy/(end-start));
    const silent_ratio=silent/frames;
    const verdict=silent_ratio>=0.8&&rms<=RMSCUTOFF?'SILENT':'AUDIBLE';
    return {...span,verdict,silent_ratio:Number(silent_ratio.toFixed(4)),
      rms_dbfs:Number((20*Math.log10(Math.max(rms,1e-8))).toFixed(1)),
      peak_dbfs:Number((20*Math.log10(Math.max(peak,1e-8))).toFixed(1))};
  });
  return {
    schema_version:1,project_id,voice_source_sha256,duration_us,
    decoded_samples:actualSamples,sample_rate:RATE,
    source:'verified_audio_pcm_v1',word_alignment_verified:false,
    music_rights_verified:false,threshold_dbfs:20*Math.log10(RMSCUTOFF),
    findings:evidence,
    status:evidence.every(x=>x.verdict==='SILENT')?'PAUSES_SUPPORTED':'REVIEW_AUDIBLE_INTERVAL',
    publication_allowed:false,
    caveat:'Measures decoded low-energy speech pauses only. Does not verify words, licensing, artistic quality or authorize an edit.'
  };
}

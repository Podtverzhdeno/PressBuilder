/**
 * Technical MP4 quality checks adapted from the PressBuilder Cloud fork.
 * Works with the original local editor; no cloud server or npm dependencies.
 * Subjective visual, audio quality and artistic checks are out of scope.
 */
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const issue=(id,message)=>({id,message});
const finitePositive=n=>Number.isFinite(n)&&n>0;
function rate(value){
  if(typeof value==='number')return finitePositive(value)?value:0;
  if(typeof value!=='string')return 0;
  const parts=value.split('/');
  if(parts.length===1){const n=Number(value);return finitePositive(n)?n:0}
  if(parts.length!==2)return 0;
  const n=Number(parts[0]),d=Number(parts[1]);
  return finitePositive(n)&&finitePositive(d)?n/d:0;
}
function failed(id,message){
  return {verdict:'FAIL',issues:[issue(id,message)],scope:'TECHNICAL_ONLY',
    metadata:null,note:'Visual and artistic quality must be reviewed separately.'};
}

/**
 * Evaluate ffprobe JSON independently of the ffprobe executable.
 * Expected: height, fps, duration (optional target), audio_required.
 */
export function evaluateVideoProbe(data,expected={}){
  const issues=[];
  const streams=Array.isArray(data?.streams)?data.streams:[];
  const videos=streams.filter(s=>s?.codec_type==='video');
  const v=videos[0];
  if(!v)issues.push(issue('VIDEO_STREAM_MISSING','No video stream found'));
  else{
    if(videos.length>1)issues.push(issue('MULTIPLE_VIDEO_STREAMS','Unexpected additional video stream'));
    if(v.codec_name!=='h264')issues.push(issue('VIDEO_CODEC','Expected H.264 video'));
    const width=Number(v.width),height=Number(v.height);
    if(!finitePositive(width)||!finitePositive(height))
      issues.push(issue('INVALID_DIMENSIONS','Missing or invalid video dimensions'));
    else if(Math.abs(width/height-16/9)>0.015)
      issues.push(issue('ASPECT_RATIO','Expected 16:9 video'));
    if(finitePositive(expected.height)&&height!==Number(expected.height))
      issues.push(issue('HEIGHT_MISMATCH','Video height differs from deck format'));
  }
  // avg_frame_rate is generally more representative of actual encoded frames.
  // Fall back to nominal rate for older/malformed ffprobe results.
  const fps=rate(v?.avg_frame_rate)||rate(v?.r_frame_rate);
  if(!fps)issues.push(issue('FPS_INVALID','Video FPS missing or invalid'));
  else if(finitePositive(expected.fps)&&Math.abs(fps-expected.fps)>0.05)
    issues.push(issue('FPS_MISMATCH','Video FPS differs from deck format'));
  const duration=Number(data?.format?.duration??v?.duration);
  if(!finitePositive(duration))issues.push(issue('DURATION_INVALID','MP4 duration missing or invalid'));
  else if(finitePositive(expected.duration)){
    const tolerance=Math.max(0.25,2/(finitePositive(expected.fps)?expected.fps:24));
    if(Math.abs(duration-expected.duration)>tolerance)
      issues.push(issue('DURATION_MISMATCH','Video duration differs from deck target'));
  }
  const size=Number(data?.format?.size??expected.file_size);
  if(!finitePositive(size)||size<1024)issues.push(issue('FILE_TOO_SMALL','Empty or suspiciously small output'));
  const hasAudio=streams.some(s=>s?.codec_type==='audio');
  if(expected.audio_required&&!hasAudio)issues.push(issue('AUDIO_MISSING','Deck requires audio but MP4 has no audio stream'));
  return {
    verdict:issues.length?'FAIL':'PASS',issues,scope:'TECHNICAL_ONLY',
    metadata:{codec:v?.codec_name??null,width:Number(v?.width)||0,height:Number(v?.height)||0,
      fps,duration:finitePositive(duration)?duration:0,size:finitePositive(size)?size:0,
      has_audio:hasAudio},
    note:'Checks stream metadata only. Composition, clarity and artistic quality need human review.',
  };
}

/** No shell: the path is passed as a single ffprobe argument. */
export function inspectMp4(file,expected={},probePath=process.env.FFPROBE||'ffprobe'){
  let st;
  try{st=fs.statSync(file)}
  catch{return failed('FILE_MISSING','Output MP4 does not exist')}
  if(!st.isFile())return failed('INVALID_FILE','Output is not a regular file');
  if(st.size<1024)return failed('FILE_TOO_SMALL','Output MP4 is empty or suspiciously small');
  const command=spawnSync(probePath,[
    '-v','error','-show_entries',
    'format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate',
    '-of','json',file,
  ],{encoding:'utf8',timeout:15000,maxBuffer:256*1024});
  if(command.error||command.status!==0)
    return failed('FFPROBE_FAILED',String(command.error?.message||command.stderr||'ffprobe failed').slice(0,250));
  try{
    const info=JSON.parse(command.stdout);
    // Trust actual local file size, not a potentially inaccurate probe value.
    return evaluateVideoProbe({...info,format:{...info.format,size:st.size}},expected);
  }catch{
    return failed('FFPROBE_JSON','Cannot parse ffprobe output');
  }
}

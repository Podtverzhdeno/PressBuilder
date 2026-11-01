/**
 * Technical (not aesthetic) MP4 QA based on ffprobe.
 * No model scoring, no arbitrary command arguments from users.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';

const issue=(id,message)=>({id,message});
function ratio(x){
  if(typeof x==='number')return x;
  if(typeof x!=='string')return 0;
  const [a,b]=x.split('/').map(Number);
  return Number.isFinite(a)&&Number.isFinite(b)&&b>0?a/b:0;
}
export function evaluateVideoProbe(data,expected={}){
  const problems=[];
  const videos=(data?.streams||[]).filter(s=>s.codec_type==='video');
  const video=videos[0];
  if(!video)problems.push(issue('VIDEO_STREAM_MISSING','MP4 has no video stream'));
  else {
    if(video.codec_name!=='h264')problems.push(issue('VIDEO_CODEC','Expected H.264 video stream'));
    if(Number(expected.height)&&Number(video.height)!==Number(expected.height))
      problems.push(issue('HEIGHT_MISMATCH','Output height differs from requested height'));
    const targetWidth=Math.round(Number(expected.height)*16/9);
    if(Number(expected.height)&&Number(video.width)!==targetWidth)
      problems.push(issue('ASPECT_RATIO','Output width differs from expected 16:9'));
    const fps=ratio(video.r_frame_rate);
    if(Number(expected.fps)&&Math.abs(fps-Number(expected.fps))>0.05)
      problems.push(issue('FPS_MISMATCH','Output FPS differs from requested FPS'));
    if(!fps)problems.push(issue('FPS_INVALID','Video FPS is missing or invalid'));
  }
  const duration=Number(data?.format?.duration||video?.duration||0);
  if(!Number.isFinite(duration)||duration<=0)
    problems.push(issue('DURATION_INVALID','MP4 duration is missing or invalid'));
  else if(Number(expected.duration)>0){
    const allowed=Math.max(0.25,2/Math.max(1,Number(expected.fps)||24));
    if(Math.abs(duration-Number(expected.duration))>allowed)
      problems.push(issue('DURATION_MISMATCH','Output duration differs from scene timeline'));
  }
  const size=Number(data?.format?.size||expected.file_size||0);
  if(!Number.isFinite(size)||size<1024)problems.push(issue('FILE_TOO_SMALL','Output MP4 is empty or suspiciously small'));
  if(expected.audio_required&&!(data?.streams||[]).some(s=>s.codec_type==='audio'))
    problems.push(issue('AUDIO_MISSING','Audio was required but no audio stream is present'));
  return {
    verdict:problems.length?'FAIL':'PASS',
    issues:problems,
    metadata:{codec:video?.codec_name||null,width:Number(video?.width||0),
      height:Number(video?.height||0),fps:ratio(video?.r_frame_rate),
      duration,size,has_audio:(data?.streams||[]).some(s=>s.codec_type==='audio')},
    scope:'TECHNICAL_ONLY',
    note:'Visual composition, readability and artistic quality require separate review.'
  };
}
export function inspectMp4(file,expected={}){
  if(!fs.existsSync(file))return {...evaluateVideoProbe(null,expected),issues:[issue('FILE_MISSING','Output MP4 does not exist')],verdict:'FAIL'};
  const ff=spawnSync(process.env.FFPROBE||'ffprobe',
    ['-v','error','-show_entries',
      'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate',
      '-of','json',file],{encoding:'utf8',timeout:15000,maxBuffer:250000});
  if(ff.error||ff.status!==0){
    return {verdict:'FAIL',issues:[issue('FFPROBE_FAILED',String(ff.error?.message||ff.stderr||'ffprobe failed').slice(0,220))],
      metadata:null,scope:'TECHNICAL_ONLY'};
  }
  try{
    const parsed=JSON.parse(ff.stdout);
    return evaluateVideoProbe(parsed,{...expected,file_size:fs.statSync(file).size});
  }catch{
    return {verdict:'FAIL',issues:[issue('FFPROBE_JSON','Invalid ffprobe JSON')],metadata:null,scope:'TECHNICAL_ONLY'};
  }
}

/**
 * Merge evidence from browser-rendered text geometry and sampled video frames
 * with ffprobe technical checks. REVIEW is intentionally non-blocking: only
 * deterministic violations and proven all-black output become FAIL.
 */
export function mergeVisualQA(technical,visual=null,frames=[]){
  const issues=[...(technical.issues||[]).map(i=>({...i,severity:'FAIL'}))];
  if(visual?.issues){
    for(const item of visual.issues){
      issues.push({id:item.id,severity:item.severity,message:item.message,
        slide_id:item.slide_id,object_id:item.object_id,
        ...(item.metrics?{metrics:item.metrics}:{})});
    }
  }
  const samples=frames.filter(f=>f&&Number.isFinite(f.mean_luma)&&Number.isFinite(f.near_black_fraction));
  if(samples.length){
    const fullBlack=samples.every(f=>f.mean_luma<=3 && f.near_black_fraction>=.995);
    if(fullBlack){
      issues.push({id:'BLACK_VIDEO',severity:'FAIL',
        message:'All representative rendered frames are nearly black',frames:samples.map(f=>f.t)});
    }else{
      const suspect=samples.filter(f=>f.mean_luma<=5 && f.near_black_fraction>=.99);
      if(suspect.length){
        issues.push({id:'POSSIBLE_BLACK_FRAME',severity:'REVIEW',
          message:'Some sampled frames are nearly black; check whether this is intentional',
          frames:suspect.map(f=>f.t)});
      }
    }
  }
  return {
    ...technical,issues,
    verdict:issues.some(i=>i.severity==='FAIL')?'FAIL':
      issues.some(i=>i.severity==='REVIEW')?'REVIEW':'PASS',
    visual:visual??{scope:'UNAVAILABLE',tested_texts:0,uninspected_scenes:[]},
    frame_samples:samples,
    scope:'TECHNICAL_PLUS_SAMPLED_VISUAL',
    note:'Automated checks detect technical faults and some text-layout issues. Artistic quality and TypeScript-authored scenes still require human review.',
  };
}

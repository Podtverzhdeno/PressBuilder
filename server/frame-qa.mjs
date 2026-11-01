/**
 * P03/P08: deterministic, bounded, immutable storyboard evidence from a real MP4.
 * Heuristics are diagnostic warnings, NOT semantic/creative QA or auto-approval.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';

const slug=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const versionPattern=/^[a-f0-9]{16}$/;
const bad=(message,status=422)=>{throw Object.assign(new Error(message),{status})};
function hash(file){
  const h=createHash('sha256');
  const fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1024*1024);
  try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n))}
  finally{fs.closeSync(fd)}
  return h.digest('hex');
}
function run(ffmpeg,args,{binary=false}={}){
  const result=spawnSync(ffmpeg,args,{encoding:binary?null:'utf8',timeout:20000,maxBuffer:2*1024*1024});
  if(result.error||result.status!==0)bad('Could not capture preview frame: '+String(result.error?.message||result.stderr||result.status).slice(0,280));
  return result.stdout;
}
function analyzeGray(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length!==64*36)bad('Unexpected decoded luminance frame size');
  let total=0,totalSquare=0;
  for(const pixel of bytes){total+=pixel;totalSquare+=pixel*pixel}
  const mean=total/bytes.length;
  return {mean:Math.round(mean*100)/100,
    stddev:Math.round(Math.sqrt(Math.max(0,totalSquare/bytes.length-mean*mean))*100)/100};
}
export function captureFrameEvidence({file,out,id,scene,version,duration,fps,ffmpeg=process.env.FFMPEG||'ffmpeg'}){
  if(!slug.test(id)||!slug.test(scene)||!versionPattern.test(version))bad('Invalid frame artifact identifier',400);
  if(!Number.isFinite(duration)||duration<=0||duration>600||!Number.isFinite(fps)||fps<1||fps>120)bad('Invalid frame duration/FPS',400);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())bad('Source MP4 not found');
  fs.mkdirSync(out,{recursive:true});
  const maxTime=Math.max(0,duration-1/fps);
  const frames=[],created=[];
  try{
    for(let i=0;i<3;i++){
      const t=Number((maxTime*[0.1,0.5,0.9][i]).toFixed(6));
      const name=id+'_'+scene+'_v'+version+'_f'+i+'.jpg';
      const dest=path.join(out,name),stage=dest+'.'+randomUUID()+'.jpg';
      try{
        run(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-ss',String(t),'-i',file,
          '-frames:v','1','-vf','scale=640:-2:flags=bicubic','-q:v','4','-y',stage]);
        const stat=fs.statSync(stage);
        if(stat.size<150||stat.size>2*1024*1024)bad('JPEG frame is outside safe size range');
        const jpeg=fs.readFileSync(stage);
        if(jpeg[0]!==0xff||jpeg[1]!==0xd8||jpeg.at(-2)!==0xff||jpeg.at(-1)!==0xd9)bad('Invalid JPEG frame');
        if(fs.existsSync(dest))bad('Immutable frame already exists: '+name,409);
        fs.renameSync(stage,dest);created.push(dest);
      }finally{fs.rmSync(stage,{force:true})}
      const gray=run(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-ss',String(t),'-i',file,
        '-frames:v','1','-vf','scale=64:36:flags=area,format=gray','-f','rawvideo','pipe:1'],{binary:true});
      const stats=analyzeGray(gray);
      const warnings=[];
      if(stats.mean<24)warnings.push('DARK_FRAME');
      if(stats.stddev<1.5)warnings.push('LOW_DETAIL');
      frames.push({index:i,t,frame:Math.floor(t*fps),file:'out/'+name,sha256:hash(dest),
        size:fs.statSync(dest).size,mean_luma:stats.mean,luma_stddev:stats.stddev,warnings,
        _gray:gray});
    }
    const differences=[];
    for(let i=1;i<3;i++){
      let total=0;
      for(let j=0;j<frames[i]._gray.length;j++)total+=Math.abs(frames[i]._gray[j]-frames[i-1]._gray[j]);
      const mae=Number((total/frames[i]._gray.length).toFixed(3));
      differences.push({from:i-1,to:i,mean_absolute_difference:mae});
      if(mae<0.65)frames[i].warnings.push('SIMILAR_TO_PREVIOUS_SAMPLE');
    }
    const publicFrames=frames.map(({_gray,...f})=>f);
    return {schema_version:1,scope:'FRAME_HEURISTICS_ONLY',verdict:'CAPTURED',
      frames:publicFrames,differences,warnings:[...new Set(publicFrames.flatMap(f=>f.warnings))],
      note:'Samples are not a substitute for visual review. Dark/static/flat frames may be intentional.'};
  }catch(e){
    for(const f of created)fs.rmSync(f,{force:true});
    throw e;
  }
}

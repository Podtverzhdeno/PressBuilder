/**
 * P13 experimental: source-addressed per-scene H.264 cache and safe hard-cut
 * concatenation without re-encoding unchanged video. Audio is reassembled
 * from source files. This path is opt-in and never handles crossfades.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {inspectMp4} from './video-qa.mjs';

const VERSION='p13-h264-veryfast-crf20-no-b-v1';
const SAFE_ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA_NAME=/^[0-9a-f]{64}\.mp4$/;
const DEFAULT_CACHE_BUDGET=512*1024*1024; // 512 MiB across all projects
const DEFAULT_CACHE_SEGMENTS=200;
export function pruneSegmentCache({out,protect=[],maxBytes=DEFAULT_CACHE_BUDGET,
  maxSegments=DEFAULT_CACHE_SEGMENTS}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||
     !Number.isSafeInteger(maxSegments)||maxSegments<0)
    throw new Error('Invalid segment cache budget');
  const base=path.join(out,'assembly-segments');
  if(!fs.existsSync(base))return {evicted:0,bytes_after:0,segments_after:0,budget_exceeded:false};
  const safeDirs=dir=>{
    try{return fs.readdirSync(dir,{withFileTypes:true}).filter(x=>
      x.isDirectory()&&SAFE_ID.test(x.name)).map(x=>path.join(dir,x.name))}
    catch{return []}
  };
  const keep=new Set(protect.map(x=>path.resolve(x))),entries=[];
  for(const project of safeDirs(base))for(const scene of safeDirs(project)){
    let files;try{files=fs.readdirSync(scene,{withFileTypes:true})}catch{continue}
    for(const f of files){
      if(!f.isFile()||!SHA_NAME.test(f.name))continue;
      const media=path.join(scene,f.name),manifest=media.slice(0,-4)+'.json';
      try{
        const st=fs.lstatSync(media),meta=fs.existsSync(manifest)?fs.lstatSync(manifest):null;
        if(!st.isFile()||st.isSymbolicLink()||meta&&!meta.isFile())continue;
        entries.push({media,manifest,bytes:st.size+(meta?.size||0),mtime:st.mtimeMs,
          protected:keep.has(path.resolve(media))});
      }catch{}
    }
  }
  let total=entries.reduce((sum,e)=>sum+e.bytes,0),count=entries.length,evicted=0;
  const candidates=entries.filter(e=>!e.protected).sort((a,b)=>a.mtime-b.mtime);
  for(const entry of candidates){
    if(total<=maxBytes&&count<=maxSegments)break;
    try{
      fs.rmSync(entry.media);
      fs.rmSync(entry.manifest,{force:true});
      total-=entry.bytes;count--;evicted++;
    }catch{/* Failed cleanup never invalidates published MP4 or protected inputs. */}
  }
  return {evicted,bytes_after:total,segments_after:count,
    budget_exceeded:total>maxBytes||count>maxSegments};
}
const digest=obj=>createHash('sha256').update(JSON.stringify(obj)).digest('hex');
const sha=file=>{
  const h=createHash('sha256'),fd=fs.openSync(file,'r'),buf=Buffer.allocUnsafe(1048576);
  try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n))}
  finally{fs.closeSync(fd)}
  return h.digest('hex');
};
const rounded=x=>Number(x.toFixed(5));
const err=message=>new Error('Incremental montage: '+message);
function probe(file){
  const res=spawnSync(process.env.FFPROBE||'ffprobe',[
    '-v','error','-show_entries',
    'stream=codec_type,codec_name,profile,level,pix_fmt,width,height,r_frame_rate,time_base,duration,nb_frames:format=duration',
    '-of','json',file],{encoding:'utf8',timeout:15000,maxBuffer:400000});
  if(res.error||res.status!==0)throw err('ffprobe failed');
  let p;try{p=JSON.parse(res.stdout)}catch{throw err('invalid ffprobe output')}
  return p;
}
const codecSignature=s=>JSON.stringify([
  s.codec_name,s.profile,s.level,s.pix_fmt,s.width,s.height,s.r_frame_rate,s.time_base
]);
function validateSegment(file,{height,fps,duration}){
  const report=inspectMp4(file,{fps,height,duration});
  if(report.verdict!=='PASS'||report.metadata.has_audio)throw err('normalized segment QA mismatch');
  const p=probe(file);
  if(p.streams?.length!==1||p.streams[0].codec_type!=='video'||
     p.streams[0].codec_name!=='h264'||p.streams[0].r_frame_rate!==fps+'/1')
    throw err('incompatible segment stream');
  if(Math.abs(Number(p.streams[0].duration||p.format?.duration)-duration)>Math.max(.15,2/fps))
    throw err('segment duration drift');
  return {signature:codecSignature(p.streams[0]),
    duration:Number(p.streams[0].duration||p.format?.duration),
    frames:Number(p.streams[0].nb_frames||0)};
}
function verifiedCache(file,manifest,key,settings){
  try{
    if(!fs.existsSync(file)||!fs.existsSync(manifest))return null;
    const record=JSON.parse(fs.readFileSync(manifest,'utf8'));
    const stat=fs.statSync(file);
    if(record.key!==key||record.version!==VERSION||
       record.bytes!==stat.size||sha(file)!==record.sha256)return null;
    const info=validateSegment(file,settings);
    if(info.signature!==record.signature)return null;
    return info;
  }catch{return null}
}
async function buildSegment({out,id,item,source,fps,height,encoderProfile,signal,ffmpegRun,benchmarkFfmpeg}){
  const key=digest({version:VERSION,encoderProfile,source:item.source_sha256,
    duration:item.duration,fps,height});
  const dir=path.join(out,'assembly-segments',id,item.scene);
  const file=path.join(dir,key+'.mp4'),manifest=path.join(dir,key+'.json');
  const settings={height,fps,duration:item.duration};
  let info=verifiedCache(file,manifest,key,settings);
  if(info)return {file,info,reused:true,benchmark:null};
  fs.mkdirSync(dir,{recursive:true});
  const tmp=path.join(dir,'.partial-'+randomUUID()+'.mp4');
  try{
    signal?.throwIfAborted();
    const benchmark=await ffmpegRun(['-hide_banner','-loglevel','error','-nostats','-y',
      '-i',source,'-map','0:v:0','-an','-vf',
      'trim=duration='+rounded(item.duration)+',setpts=PTS-STARTPTS,fps='+fps+
      ',scale='+Math.round(height*16/9)+':'+height+
      ':flags=lanczos,setsar=1,format=yuv420p',
      '-c:v','libx264','-preset','veryfast','-crf','20',
      '-bf','0','-g',String(fps),'-r',String(fps),
      '-video_track_timescale',String(fps*1000),'-movflags','+faststart',tmp],
    {signal,timeout:240000,benchmark:benchmarkFfmpeg});
    signal?.throwIfAborted();
    info=validateSegment(tmp,settings);
    const record={version:VERSION,key,sha256:sha(tmp),
      bytes:fs.statSync(tmp).size,signature:info.signature};
    fs.renameSync(tmp,file);
    const manifestTemp=manifest+'.'+randomUUID()+'.tmp';
    try{fs.writeFileSync(manifestTemp,JSON.stringify(record)+'\n',{mode:0o600});
      fs.renameSync(manifestTemp,manifest)}
    finally{fs.rmSync(manifestTemp,{force:true})}
    return {file,info,reused:false,benchmark};
  }finally{fs.rmSync(tmp,{force:true})}
}
export async function encodeIncrementalHardCuts({out,id,work,sourcePaths,inputs,
  fps,height,target,encoderProfile,signal,ffmpegRun,benchmarkFfmpeg=false}){
  if(inputs.length<2||inputs.length>12||sourcePaths.length!==inputs.length)
    throw err('invalid clip count');
  const started=performance.now();
  const chunks=[],protectedSegments=[],measurements=[];let reused=0,encoded=0,commonSignature=null;
  for(let i=0;i<inputs.length;i++){
    signal?.throwIfAborted();
    const chunk=await buildSegment({out,id,item:inputs[i],source:sourcePaths[i],
      fps,height,encoderProfile,signal,ffmpegRun,benchmarkFfmpeg});
    if(commonSignature===null)commonSignature=chunk.info.signature;
    if(chunk.info.signature!==commonSignature)throw err('different video codec parameters');
    reused+=Number(chunk.reused);
    encoded+=Number(!chunk.reused);
    protectedSegments.push(chunk.file);
    if(chunk.benchmark)measurements.push(chunk.benchmark);
    // Only generated local basenames appear in the safe concat list.
    const local='seg'+i+'.mp4',dest=path.join(work,local);
    fs.copyFileSync(chunk.file,dest);
    if(sha(dest)!==sha(chunk.file))throw err('segment changed during snapshot');
    chunks.push(local);
  }
  const normalizeMs=Number((performance.now()-started).toFixed(2));
  const list=path.join(work,'segments.ffconcat');
  fs.writeFileSync(list,'ffconcat version 1.0\n'+chunks.map(c=>"file '"+c+"'").join('\n')+'\n',{mode:0o600});
  const args=['-hide_banner','-loglevel','error','-nostats','-y',
    '-f','concat','-safe','1','-i',list];
  sourcePaths.forEach(src=>args.push('-i',src));
  const silence=new Map();
  for(let i=0;i<inputs.length;i++)if(!inputs[i].has_audio){
    silence.set(i,1+inputs.length+silence.size);
    args.push('-f','lavfi','-t',String(rounded(inputs[i].duration)),
      '-i','anullsrc=channel_layout=stereo:sample_rate=48000');
  }
  const filters=[];
  for(let i=0;i<inputs.length;i++){
    const index=silence.get(i)??1+i;
    const duration=rounded(inputs[i].duration);
    filters.push('['+index+':a:0]aresample=48000,'+
      'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,'+
      'apad=whole_dur='+duration+',atrim=duration='+duration+
      ',asetpts=PTS-STARTPTS[a'+i+']');
  }
  filters.push(inputs.map((_,i)=>'[a'+i+']').join('')+
    'concat=n='+inputs.length+':v=0:a=1[a]');
  const output=path.join(work,'final.mp4');
  args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[a]',
    '-c:v','copy','-c:a','aac','-ar','48000','-ac','2','-b:a','192k',
    '-movflags','+faststart',output);
  const muxStart=performance.now();
  const muxBenchmark=await ffmpegRun(args,{signal,timeout:240000,benchmark:benchmarkFfmpeg});
  if(muxBenchmark)measurements.push(muxBenchmark);
  const muxMs=Number((performance.now()-muxStart).toFixed(2));
  signal?.throwIfAborted();
  const report=inspectMp4(output,{fps,height,duration:target,audio_required:true});
  if(report.verdict!=='PASS')throw err('final QA rejected stream-copy output');
  const p=probe(output);
  const video=p.streams.find(s=>s.codec_type==='video'),audio=p.streams.find(s=>s.codec_type==='audio');
  if(!video||!audio||codecSignature(video)!==commonSignature)
    throw err('stream parameters changed during concat');
  const vd=Number(video.duration),ad=Number(audio.duration);
  if(!Number.isFinite(vd)||!Number.isFinite(ad)||
     Math.abs(vd-ad)>Math.max(.12,3/fps)||
     Math.abs(vd-target)>Math.max(.15,3/fps))
    throw err('A/V duration mismatch; use full FFmpeg montage');
  // Single governor slot serializes P13 writers. Protect all segments
  // used for this release while pruning other projects' expired artifacts.
  const cache=pruneSegmentCache({out,protect:protectedSegments});
  const elapsedMs=Number((performance.now()-started).toFixed(2));
  const ffmpeg_benchmark=measurements.length?{
    scope:'FFMPEG_CHILDREN_SUMMED_CPU_MAX_SINGLE_RSS',
    measured_processes:measurements.length,
    cpu_user_ms:Number(measurements.reduce((n,v)=>n+v.cpu_user_ms,0).toFixed(2)),
    cpu_system_ms:Number(measurements.reduce((n,v)=>n+v.cpu_system_ms,0).toFixed(2)),
    peak_single_process_rss_kib:Math.max(...measurements.map(v=>v.max_rss_kib||0))
  }:null;
  return {strategy:'incremental-hardcut-v1',cache_cleanup:cache,
    ...(ffmpeg_benchmark?{ffmpeg_benchmark}:{}),segments_reused:reused,
    segments_encoded:encoded,normalize_ms:normalizeMs,mux_ms:muxMs,
    total_ms:elapsedMs};
}

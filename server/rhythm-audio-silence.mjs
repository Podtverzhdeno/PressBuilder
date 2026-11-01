/** P15: measure signal-level silence from actual owned PCM/WAV bytes.
 * This is neither speech recognition nor verified word alignment.
 * No FFmpeg, shell, network, arbitrary paths, disk writes or approvals.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const NAME=/^voice\.wav$/;
const PROJECT=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const MAX_BYTES=32*1024*1024;
const MAX_SECONDS=300;
const MAX_CHUNKS=128;
const MAX_INTERVALS=500;
const SILENCE_RMS=10**(-36/20);
const MIN_SILENCE_US=220_000;
const error=(code,status=422)=>{throw Object.assign(new Error(code),{code,status})};

function bytesFromSafeFile(root,id,filename){
  if(typeof id!=='string'||!PROJECT.test(id))error('INVALID_PROJECT',400);
  if(typeof filename!=='string'||!NAME.test(filename))error('ANALYSIS_FORMAT_UNSUPPORTED',415);
  const dir=path.resolve(root,id),file=path.resolve(dir,filename);
  if(path.dirname(file)!==dir)error('AUDIO_PATH_DENIED',403);
  let fd;
  try{
    const dirStat=fs.lstatSync(dir);
    if(!dirStat.isDirectory()||dirStat.isSymbolicLink())error('AUDIO_DIRECTORY_UNSAFE',403);
    const before=fs.lstatSync(file);
    if(!before.isFile()||before.isSymbolicLink())error('AUDIO_FILE_UNSAFE',403);
    if(before.size<44||before.size>MAX_BYTES)error('AUDIO_SIZE_UNSUPPORTED',413);
    fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
    const opened=fs.fstatSync(fd);
    if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
       opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)error('AUDIO_SOURCE_CHANGED',409);
    const data=fs.readFileSync(fd);
    if(data.length!==before.size)error('AUDIO_SOURCE_CHANGED',409);
    const after=fs.fstatSync(fd),onDisk=fs.lstatSync(file);
    if(!onDisk.isFile()||onDisk.isSymbolicLink()||
       [after,onDisk].some(st=>st.dev!==before.dev||st.ino!==before.ino||
          st.size!==before.size||st.mtimeMs!==before.mtimeMs))error('AUDIO_SOURCE_CHANGED',409);
    return {data,sha256:createHash('sha256').update(data).digest('hex')};
  }catch(e){
    if(e?.code && /^(AUDIO_|INVALID_PROJECT)/.test(String(e.code)))throw e;
    error('AUDIO_UNAVAILABLE',409);
  }finally{if(fd!==undefined)fs.closeSync(fd)}
}

function parsePcm16(data){
  if(data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE')
    error('UNSUPPORTED_WAV_CONTAINER',415);
  const declared=data.readUInt32LE(4)+8;
  if(declared!==data.length)error('INVALID_WAV_LENGTH',422);
  let offset=12,fmt=null,location=null;
  for(let n=0;offset+8<=data.length && n<MAX_CHUNKS;n++){
    const type=data.toString('ascii',offset,offset+4);
    const size=data.readUInt32LE(offset+4);
    const start=offset+8,end=start+size;
    if(end>data.length||end<start)error('CORRUPT_WAV_CHUNK',422);
    if(type==='fmt '){
      if(fmt||size<16)error('INVALID_WAV_FORMAT',422);
      const audioFormat=data.readUInt16LE(start);
      const channels=data.readUInt16LE(start+2);
      const rate=data.readUInt32LE(start+4);
      const byteRate=data.readUInt32LE(start+8);
      const align=data.readUInt16LE(start+12);
      const bits=data.readUInt16LE(start+14);
      if(audioFormat!==1||bits!==16||![1,2].includes(channels)||
         rate<8000||rate>96000||align!==channels*2||byteRate!==rate*align)
        error('UNSUPPORTED_PCM_FORMAT',415);
      fmt={channels,rate,align};
    }else if(type==='data'){
      if(location)error('MULTIPLE_WAV_DATA',422);
      location={start,size};
    }
    offset=end+(size%2);
    if(offset>data.length)error('CORRUPT_WAV_PADDING',422);
  }
  if(!fmt||!location||location.size===0||location.size%fmt.align!==0)
    error('INVALID_WAV_AUDIO',422);
  const frames=location.size/fmt.align;
  if(frames/fmt.rate>MAX_SECONDS)error('AUDIO_DURATION_UNSUPPORTED',413);
  return {...fmt,...location,frames};
}

export function measureOwnedWavSilence({root,id,filename,expected_sha256,
  rms_threshold=SILENCE_RMS,min_silence_us=MIN_SILENCE_US}){
  if(typeof expected_sha256!=='string'||!/^[a-f0-9]{64}$/.test(expected_sha256))
    error('INVALID_EXPECTED_SHA',400);
  if(!Number.isFinite(rms_threshold)||rms_threshold<=0||rms_threshold>=1 ||
     !Number.isSafeInteger(min_silence_us)||min_silence_us<100_000||min_silence_us>2_000_000)
    error('INVALID_SILENCE_POLICY',400);
  const {data,sha256}=bytesFromSafeFile(root,id,filename);
  if(sha256!==expected_sha256)error('AUDIO_SOURCE_CHANGED',409);
  const {channels,rate,align,start,frames}=parsePcm16(data);
  const windowFrames=Math.max(1,Math.round(rate/50)); // 20 ms RMS windows
  const intervals=[];
  let silenceStart=-1,windowStart=0;
  for(let i=0;i<frames;i+=windowFrames){
    const end=Math.min(frames,i+windowFrames);
    let squares=0, count=0;
    for(let f=i;f<end;f++){
      for(let ch=0;ch<channels;ch++){
        const sample=data.readInt16LE(start+f*align+ch*2)/32768;
        squares+=sample*sample;count++;
      }
    }
    const quiet=Math.sqrt(squares/count)<=rms_threshold;
    if(quiet&&silenceStart===-1)silenceStart=i;
    if((!quiet||end===frames)&&silenceStart!==-1){
      const stop=quiet?end:i;
      const first=Math.round(silenceStart*1_000_000/rate);
      const last=Math.round(stop*1_000_000/rate);
      if(last-first>=min_silence_us){
        if(intervals.length>=MAX_INTERVALS)error('TOO_MANY_SILENCES',413);
        intervals.push({start_us:first,end_us:last,method:'pcm16_rms',
          confidence:'measured_signal_only'});
      }
      silenceStart=-1;
    }
    windowStart=end;
  }
  return {schema_version:1,analysis:'MEASURED_AUDIO_SILENCE',audio_source_sha256:sha256,
    time_reference:'source_audio_start_not_project_clock',sample_rate:rate,channels,
    duration_us:Math.round(frames*1_000_000/rate),
    threshold_dbfs:-36,window_ms:20,min_silence_us,
    silences:intervals,word_alignment_verified:false,license_verified:false,
    publication_allowed:false,note:'RMS silence measured from real PCM samples. Noise, breath, music or silence are not proof of word boundaries.'};
}

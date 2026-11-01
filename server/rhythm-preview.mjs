/** P15 C03 draft preview adapter: validate *real* local voice file and cue clock.
 * No writes, no approval, no rendering and no remote media retrieval.
 * Caller-provided word alignment and rights remain UNVERIFIED.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildSchedule} from '../src/engine/schedule.ts';
import {proposeRhythmCuts, RhythmInputError} from './rhythm-plan.mjs';
import {inspectRhythmSilence} from './rhythm-audio-evidence.mjs';

const PROJECT=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const VOICE=/^voice\.(?:mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/;
const MAX_AUDIO=100*1024*1024;
const MAX_REQUEST=512*1024;
const deny=(code,status=409)=>{throw Object.assign(new Error(code),{status,code})};
const digest=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
const micros=n=>Math.round(n*1_000_000);

function voiceHash(root,id,filename){
  if(typeof filename!=='string'||!VOICE.test(filename))deny('VOICE_FILE_UNSUPPORTED',400);
  const dir=path.resolve(root,id);
  const file=path.resolve(dir,filename);
  if(path.dirname(file)!==dir)deny('VOICE_PATH_INVALID',403);
  let fd;
  try{
    const base=fs.lstatSync(dir);
    if(!base.isDirectory()||base.isSymbolicLink())deny('VOICE_DIRECTORY_UNSAFE',403);
    const before=fs.lstatSync(file);
    if(!before.isFile()||before.isSymbolicLink()||before.size<1||before.size>MAX_AUDIO)deny('VOICE_FILE_UNSAFE',403);
    const flags=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0);
    fd=fs.openSync(file,flags);
    const opened=fs.fstatSync(fd);
    if(!opened.isFile()||opened.ino!==before.ino||opened.dev!==before.dev||
       opened.size!==before.size||opened.mtimeMs!==before.mtimeMs)deny('VOICE_CHANGED',409);
    const hash=createHash('sha256');
    const buf=Buffer.allocUnsafe(64*1024);
    let remain=before.size;
    while(remain>0){
      const n=fs.readSync(fd,buf,0,Math.min(buf.length,remain),null);
      if(n<=0)deny('VOICE_CHANGED',409);
      remain-=n;hash.update(buf.subarray(0,n));
    }
    const after=fs.fstatSync(fd),dest=fs.lstatSync(file);
    if(!dest.isFile()||dest.isSymbolicLink()||
       dest.dev!==before.dev||dest.ino!==before.ino||dest.size!==before.size||
       dest.mtimeMs!==before.mtimeMs||after.ino!==before.ino||after.dev!==before.dev||
       after.size!==before.size||after.mtimeMs!==before.mtimeMs)deny('VOICE_CHANGED',409);
    return hash.digest('hex');
  }catch(e){
    if(e.code&&String(e.code).startsWith('VOICE_'))throw e;
    deny('VOICE_UNAVAILABLE',409);
  }finally{
    if(fd!==undefined)fs.closeSync(fd);
  }
}

export function rhythmPreviewService({
  root,getDeck,enabled=false,audioEvidenceEnabled=false,
  rightsVerifier=null,audioInspector=inspectRhythmSilence
}){
  function context(id){
    if(!enabled)deny('RHYTHM_PREVIEW_DISABLED',501);
    if(typeof id!=='string'||!PROJECT.test(id))deny('INVALID_PROJECT',400);
    const deck=getDeck(id);
    const fps=deck.format?.fps;
    if(!Number.isInteger(fps)||![24,25,30,60].includes(fps))deny('UNSUPPORTED_PROJECT_FPS',409);
    if(!deck.audio?.file)deny('VOICE_NOT_ATTACHED',409);
    const sha256=voiceHash(root,id,deck.audio.file);
    const timeline=buildSchedule(deck);
    if(!Number.isFinite(timeline.duration)||timeline.duration<=0||
       timeline.duration>3600)deny('INVALID_PROJECT_DURATION',409);
    const duration_us=micros(timeline.duration);
    const cueMap=[];
    for(const sc of timeline.slides){
      for(const cue of sc.cues){
        cueMap.push({scene_id:sc.slide.id,cue_id:cue.id,
          start_us:micros(sc.start+cue.start),
          end_us:micros(sc.start+cue.start+cue.dur)});
      }
    }
    if(cueMap.length>2500)deny('TOO_MANY_CUES',413);
    const timebase_revision=digest({fps,duration_us,cues:cueMap,
      cue_source:timeline.slides.map(sc=>({
        scene_id:sc.slide.id,label:sc.slide.label,
        cues:sc.cues.map(c=>({id:c.id,say:c.say,show:c.show,dur:c.dur}))
      })),
      voice:deck.audio.file,format:deck.format});
    return {project_id:id,voice_source_sha256:sha256,
      timebase_revision,alignment_revision:timebase_revision,
      duration_us,frame_rate:{num:fps,den:1},
      cues:cueMap,voice_verified:true,word_alignment_verified:false,
      note:'Actual local voice bytes and current deck cue clock verified; supplied word alignment and music license remain unverified.'};
  }
  function preview(id,input){
    if(!input||typeof input!=='object'||Array.isArray(input))deny('INVALID_RHYTHM_INPUT',400);
    if(JSON.stringify(input).length>MAX_REQUEST)deny('RHYTHM_INPUT_TOO_LARGE',413);
    const c=context(id);
    if(input.project_id!==id)deny('PROJECT_MISMATCH',403);
    if(input.voice_source_sha256!==c.voice_source_sha256)deny('VOICE_SOURCE_STALE',409);
    if(input.timebase_revision!==c.timebase_revision ||
       input.expected_timebase_revision!==c.timebase_revision ||
       input.alignment_revision!==c.alignment_revision ||
       input.expected_alignment_revision!==c.alignment_revision)deny('CUE_CLOCK_STALE',409);
    if(input.frame_rate?.num!==c.frame_rate.num ||
       input.frame_rate?.den!==c.frame_rate.den)deny('PROJECT_FPS_MISMATCH',409);
    if(input.duration_us!==c.duration_us)deny('PROJECT_DURATION_MISMATCH',409);
    // Cue IDs are often repeated across slides (c01, c02...). An unqualified
    // cue_id is not safe for a project-wide montage.
    const byKey=new Map(), byId=new Map();
    for(const cue of c.cues){
      byKey.set(cue.scene_id+'/'+cue.cue_id,cue);
      byId.set(cue.cue_id,(byId.get(cue.cue_id)??0)+1);
    }
    function inspect(source){
      if(!Array.isArray(source))deny('INVALID_ALIGNMENT',400);
      for(const item of source){
        if(!item||typeof item!=='object')deny('INVALID_ALIGNMENT',400);
        if(item.scene_id===undefined && byId.get(item.cue_id)!==1)
          deny('AMBIGUOUS_CUE_ID',409);
        const cue=byKey.get((item.scene_id ??
          c.cues.find(x=>x.cue_id===item.cue_id)?.scene_id)+'/'+item.cue_id);
        if(!cue)deny('UNKNOWN_SCENE_CUE',409);
        // A word OR annotated pause must belong to the correct scene cue;
        // names alone cannot authorize timestamps in other scenes.
        if(!Number.isSafeInteger(item.start_us)||
           !Number.isSafeInteger(item.end_us)||
           item.end_us<=item.start_us||
           item.start_us<cue.start_us||
           item.end_us>cue.end_us)
          deny(source===input.words?'WORD_OUTSIDE_CUE':'PAUSE_OUTSIDE_CUE',409);
      }
    }
    inspect(input.words);inspect(input.pauses);
    let result;
    try {result=proposeRhythmCuts(input)}
    catch(e) {
      if(e instanceof RhythmInputError)deny(e.code,400);
      throw e;
    }
    let audio_evidence=null,music_rights_evidence=null;
    const issues=[];
    if(input.beats?.length) {
      try {
        if(!rightsVerifier)throw Object.assign(new Error('MUSIC_CATALOG_NOT_CONFIGURED'),
          {code:'MUSIC_CATALOG_NOT_CONFIGURED'});
        music_rights_evidence=rightsVerifier.verify(id,input.music);
      }catch(e) {issues.push(e?.code??'MUSIC_RIGHTS_UNVERIFIED')}
    }
    if(audioEvidenceEnabled&&Array.isArray(input.pauses)&&input.pauses.length) {
      try {
        audio_evidence=audioInspector({
          root,project_id:id,filename:getDeck(id).audio.file,
          voice_source_sha256:c.voice_source_sha256,duration_us:c.duration_us,
          spans:input.pauses
        });
        if(audio_evidence.status!=='PAUSES_SUPPORTED')
          issues.push('PAUSE_AUDIO_NOT_SILENT');
      }catch(e){issues.push(e?.code??'AUDIO_EVIDENCE_UNAVAILABLE')}
    }
    // This remains *advisory* quality evidence. The engine MUST NOT use a
    // caller's music.licensed=true as trusted rights proof for beats.
    const validated_rights=Boolean(music_rights_evidence?.verified);
    const validated_audio=Boolean(audio_evidence?.status==='PAUSES_SUPPORTED');
    if(issues.length) {
      return {...result,status:'REVIEW',cuts:[],
        plan_sha256:undefined,issues:[...result.issues,...issues],
        audio_evidence,music_rights_evidence,
        provenance:{voice_sha_verified:true,deck_clock_verified:true,
          pause_audio_verified:validated_audio,
          word_alignment_verified:false,
          music_rights_verified:validated_rights,
          caller_markers_unverified:true},
        approved:false,persisted:false,publication_allowed:false};
    }
    return {...result,audio_evidence,music_rights_evidence,provenance:{
      voice_sha_verified:true,deck_clock_verified:true,
      pause_audio_verified:validated_audio,
      word_alignment_verified:false,
      music_rights_verified:validated_rights,
      caller_markers_unverified:true
    },publication_allowed:false};
  }
  return {context,preview};
}

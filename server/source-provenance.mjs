/** Bounded source provenance for declarative scene data and loaded browser assets. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildSchedule} from '../src/engine/schedule.ts';

const HEX=/^[a-f0-9]{64}$/;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function hashRegularFile(file){
  const s=fs.statSync(file);
  if(!s.isFile())throw new Error('Provenance input must be a regular file');
  const h=createHash('sha256'),buf=Buffer.allocUnsafe(1024*1024),fd=fs.openSync(file,'r');
  try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n))}
  finally{fs.closeSync(fd)}
  return {sha256:h.digest('hex'),size:s.size};
}
export function browserBundleManifest(staticDir){
  const result=[];
  function walk(dir,relative='',depth=0){
    if(!fs.existsSync(dir))return;
    if(depth>3)throw new Error('Browser bundle directory nesting exceeds provenance limit');
    for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const name=relative?relative+'/'+e.name:e.name;
      if(e.isSymbolicLink())continue;
      if(e.isDirectory()){walk(path.join(dir,e.name),name,depth+1);continue}
      if(!e.isFile()||!(/\.(js|css|html)$/.test(e.name)))continue;
      if(result.length>=200)throw new Error('Browser bundle exceeds provenance file count limit');
      const file=path.join(dir,e.name);
      result.push({path:name,...hashRegularFile(file)});
    }
  }
  walk(staticDir);
  return {available:result.length>0,files:result,
    sha256:sha(JSON.stringify(result))};
}
export function sourceManifest({deck,slide,scene3d,styleContract,mediaDir,staticDir,sceneSync=null}){
  const sync=sceneSync||{markers:[],timeline:{events:[]}};
  if(sync.validation_error)throw Object.assign(new Error('Orphaned sync markers: '+sync.validation_error),{status:409});
  const ids=new Set((sync.timeline?.events||[]).filter(e=>!e.out_of_range).map(e=>e.id));
  for(const o of scene3d?.spec?.objects||[])if(o.start_marker&&!ids.has(o.start_marker))
    throw Object.assign(new Error('Unknown 3D start_marker: '+o.start_marker),{status:409});
  const scheduled=buildSchedule(deck).slides.find(s=>s.slide.id===slide.id);
  if(!scheduled)throw Object.assign(new Error('Scene missing from timeline'),{status:409});
  const audio=deck.audio||null;
  let audioAsset=null;
  if(audio?.file){
    if(typeof audio.file!=='string'||!/^voice\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(audio.file))
      throw new Error('Invalid audio provenance path');
    const file=path.join(mediaDir,audio.file);
    if(!fs.existsSync(file))throw new Error('Referenced narration audio no longer exists');
    audioAsset={file:audio.file,...hashRegularFile(file)};
  }
  const browser=browserBundleManifest(staticDir);
  const currentIndex=deck.slides.findIndex(s=>s.id===slide.id);
  if(currentIndex<0)throw new Error('Scene disappeared from timeline');
  const timeline_context={
    project_target:deck.target??null,
    order:deck.slides.map(s=>s.id),
    // Earlier cues influence the current scene's start time and narration alignment.
    preceding:deck.slides.slice(0,currentIndex).map(s=>({
      id:s.id,lead:s.lead??null,tail:s.tail??null,
      cues:(s.cues||[]).map(c=>({id:c.id,say:c.say,dur:c.dur??null,hold:c.hold??null}))
    }))
  };
  const snapshot={schema_version:1,slide:structuredClone(slide),timeline_context,
    project_settings:{
    style:deck.style,format:structuredClone(deck.format),audio:structuredClone(audio)},
    scene3d:structuredClone(scene3d),style_contract:structuredClone(styleContract),
    assets:{audio:audioAsset,browser},
    sync_markers:structuredClone(sync.markers||[]),
    clip_start:scheduled.start,clip_duration:scheduled.dur,
    project_target:deck.target??null,project_lead:deck.lead??null,project_tail:deck.tail??null};
  const fingerprint=sha(JSON.stringify(snapshot));
  return {fingerprint,scene3d_revision:scene3d?.revision??0,style_revision:styleContract?.revision??0,
    audio_sha256:audioAsset?.sha256??null,browser_sha256:browser.sha256,
    browser_available:browser.available,snapshot};
}

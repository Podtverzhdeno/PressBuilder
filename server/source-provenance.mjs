/** Bounded source provenance for declarative scene data and loaded browser assets. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

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
export function sourceManifest({deck,slide,scene3d,styleContract,mediaDir,staticDir}){
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
  const snapshot={schema_version:1,slide:structuredClone(slide),project_settings:{
    style:deck.style,format:structuredClone(deck.format),audio:structuredClone(audio)},
    scene3d:structuredClone(scene3d),style_contract:structuredClone(styleContract),
    assets:{audio:audioAsset,browser}};
  const fingerprint=sha(JSON.stringify(snapshot));
  return {fingerprint,scene3d_revision:scene3d?.revision??0,style_revision:styleContract?.revision??0,
    audio_sha256:audioAsset?.sha256??null,browser_sha256:browser.sha256,
    browser_available:browser.available,snapshot};
}

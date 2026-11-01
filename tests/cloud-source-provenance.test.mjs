import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sceneVersionStore} from '../server/scene-versions.mjs';
import {sourceManifest} from '../server/source-provenance.mjs';

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-source-'));
  const out=path.join(root,'out'),staticRoot=path.join(root,'build');
  fs.mkdirSync(out);fs.mkdirSync(staticRoot);
  fs.mkdirSync(path.join(root,'demo'));
  fs.writeFileSync(path.join(staticRoot,'app.js'),'console.log("v1")');
  fs.writeFileSync(path.join(root,'demo','voice.wav'),'fake-voice-1');
  const deck={id:'demo',style:'paper',format:{fps:24,height:720},
    audio:{file:'voice.wav',offset:0},slides:[{id:'s01',label:'First',cues:[{id:'c01',say:'Hello'}]}]};
  const scene3d={revision:0,spec:null};
  const getDeck=()=>deck;
  const store=sceneVersionStore({root,out,staticRoot,getDeck,getScene3D:()=>scene3d,
    getStyle:()=>({revision:0,contract:{enforce:false}})});
  const capture=(job,snapshot)=>{
    const vid=store.versionId(job),file=path.join(out,'demo_s01_v'+vid+'.mp4');
    fs.writeFileSync(file,Buffer.from('fake-MP4-'+job+'-'.repeat(200)));
    return store.capture({id:'demo',scene:'s01',jobId:job,file,expectedSource:snapshot,
      rendered:{duration:2,fps:24,height:720},qa:{verdict:'PASS'}});
  };
  return {root,out,staticRoot,deck,store,capture,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('P08 source manifest includes audio file and compiled JS hashes, never path-traverses narration',{timeout:10000},()=>{
  const f=fixture();
  try{
    const a=f.store.source('demo','s01');
    assert.match(a.fingerprint,/^[a-f0-9]{64}$/);
    assert.match(a.audio_sha256,/^[a-f0-9]{64}$/);
    assert.equal(a.browser_available,true);
    assert.equal(a.snapshot.assets.browser.files.length,1);
    f.deck.slides[0].label='Updated';
    assert.notEqual(f.store.source('demo','s01').fingerprint,a.fingerprint);
    f.deck.slides[0].label='First';
    fs.writeFileSync(path.join(f.root,'demo','voice.wav'),'fake-voice-2');
    assert.notEqual(f.store.source('demo','s01').fingerprint,a.fingerprint);
    fs.writeFileSync(path.join(f.root,'demo','voice.wav'),'fake-voice-1');
    fs.writeFileSync(path.join(f.staticRoot,'app.js'),'console.log("v2")');
    assert.notEqual(f.store.source('demo','s01').fingerprint,a.fingerprint);
    f.deck.audio.file='../outside.wav';
    assert.throws(()=>f.store.source('demo','s01'),/Invalid audio provenance path/);
  }finally{f.cleanup()}
});
test('P08 immutable scene snapshots survive new edits, are not in public manifests, reject drift/tampering',{timeout:10000},()=>{
  const f=fixture();
  try{
    const first=f.store.source('demo','s01');
    const item=f.capture('job-one',first);
    assert.equal(item.source.fingerprint,first.fingerprint);
    assert.equal(Object.hasOwn(item.source,'snapshot'),false);
    const stored=f.store.readSource('demo','s01',item.version_id);
    assert.equal(stored.source.slide.label,'First');
    assert.equal(stored.source.assets.audio.sha256,first.audio_sha256);
    f.deck.slides[0].label='Changed after rendering';
    assert.equal(f.store.readSource('demo','s01',item.version_id).source.slide.label,'First');
    assert.throws(()=>f.capture('job-two',first),e=>e.status===409);
    const sourceFile=path.join(f.root,'demo','.scene-versions','s01',item.version_id+'.source.json');
    const corrupt=JSON.parse(fs.readFileSync(sourceFile,'utf8'));
    corrupt.slide.label='Modified by an attacker';
    fs.writeFileSync(sourceFile,JSON.stringify(corrupt));
    assert.throws(()=>f.store.readSource('demo','s01',item.version_id),e=>e.status===409);
  }finally{f.cleanup()}
});

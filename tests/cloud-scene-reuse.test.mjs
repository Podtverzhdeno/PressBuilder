import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sceneVersionStore} from '../server/scene-versions.mjs';
import {findReusableScene} from '../server/scene-reuse.mjs';
import {makeRenderQueue} from '../server/render-queue.mjs';

const until=async(fn)=>{
  for(let i=0;i<220;i++){
    const result=fn();if(result)return result;
    await new Promise(resolve=>setTimeout(resolve,12));
  }
  throw Error('Timed out waiting for scene render');
};
const create=()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-scene-reuse-')),
    root=path.join(dir,'decks'),out=path.join(dir,'out'),staticRoot=path.join(dir,'build');
  fs.mkdirSync(out,{recursive:true});
  fs.mkdirSync(staticRoot,{recursive:true});
  fs.mkdirSync(path.join(root,'demo'),{recursive:true});
  fs.writeFileSync(path.join(staticRoot,'app.js'),'console.log("render-v1")');
  const deck={id:'demo',style:'paper',format:{fps:24,height:720},
    slides:[{id:'s01',label:'Scene one',cues:[{id:'c01',say:'hello'}]}]};
  let fingerprint='a'.repeat(64),unresolved=false,renders=0;
  const versions=sceneVersionStore({root,out,staticRoot,getDeck:()=>deck,
    getScene3D:()=>({revision:0,spec:null}),
    getStyle:()=>({revision:0,contract:{enforce:false}})});
  const find=args=>findReusableScene({...args,versions,
    reviews:{unresolved:()=>unresolved},baseUrl:()=> 'https://example.test'});
  const q=makeRenderQueue({root:path.join(dir,'jobs'),outputDir:out,
    resolveDeck:()=>deck,baseUrl:()=> 'https://example.test',
    fingerprint:()=>fingerprint,outputNameForJob:(id,scene,job)=>id+'_'+scene+'_v'+versions.versionId(job),
    inspect:()=>({verdict:'PASS',issues:[]}),
    render:async({outputName})=>{
      renders++;
      fs.writeFileSync(path.join(out,outputName+'.mp4'),Buffer.alloc(1400,65));
      return {fps:24,height:720,duration:2};
    },
    publishScene:({job,file,rendered,qa})=>{
      const item=versions.capture({id:job.id,scene:job.slide_id,
        jobId:job.job_id,file,rendered,qa,expectedSource:versions.source(job.id,job.slide_id),
        renderFingerprint:job.source_fingerprint});
      return {version_id:item.version_id};
    },reuseScene:find});
  return {dir,out,root,versions,q,find,
    setFingerprint:x=>fingerprint=x,
    setUnresolved:x=>unresolved=x,
    getRenders:()=>renders,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
};

test('P02/P08: full pinned fingerprint reuses checksum-verified version; retry forces render',{
  timeout:12000
},async()=>{
  const f=create();
  try{
    f.q.start();
    f.q.enqueue('demo','s01');
    const first=await until(()=>f.q.get('demo','s01').status==='completed'?f.q.get('demo','s01'):null);
    assert.equal(first.cache_hit,false);
    assert.equal(f.getRenders(),1);
    assert.equal(f.versions.list('demo','s01').length,1);
    const cached=f.q.enqueue('demo','s01');
    assert.equal(cached.status,'completed');
    assert.equal(cached.cache_hit,true);
    assert.equal(cached.job_id,first.job_id);
    assert.ok(cached.request_id);
    assert.equal(cached.version_id,first.version_id);
    assert.equal(f.versions.list('demo','s01').length,1);
    assert.equal(f.getRenders(),1);
    const forced=f.q.retry('demo','s01',cached.job_id);
    assert.equal(forced.cache_hit,false);
    const second=await until(()=>f.q.get('demo','s01').status==='completed'&&
      f.q.get('demo','s01').job_id!==first.job_id?f.q.get('demo','s01'):null);
    assert.equal(f.getRenders(),2);
    assert.equal(f.versions.list('demo','s01').length,2);
    assert.equal(second.qa_report.verdict,'PASS');
  }finally{f.cleanup()}
});

test('P08: cached archive cannot bypass source drift, review reopen or tampering',{
  timeout:12000
},async()=>{
  const f=create();
  try{
    f.q.start();
    f.q.enqueue('demo','s01');
    const first=await until(()=>f.q.get('demo','s01').status==='completed'?f.q.get('demo','s01'):null);
    const args={id:'demo',slide_id:'s01',source_fingerprint:'a'.repeat(64)};
    assert.ok(f.find(args));
    f.setUnresolved(true);
    assert.equal(f.find(args),null,'Unresolved P07 issue blocks reusing a version');
    f.setUnresolved(false);
    f.setFingerprint('b'.repeat(64));
    assert.equal(f.find({...args,source_fingerprint:'b'.repeat(64)}),null);
    f.setFingerprint('a'.repeat(64));
    const manifest=path.join(f.root,'demo','.scene-versions','s01',first.version_id+'.source.json');
    const corrupt=JSON.parse(fs.readFileSync(manifest,'utf8'));
    corrupt.slide.label='tampered';
    fs.writeFileSync(manifest,JSON.stringify(corrupt));
    assert.equal(f.find(args),null,'P08 source archive tampering cannot hit the cache');
    const rerender=f.q.enqueue('demo','s01');
    assert.equal(rerender.cache_hit,false);
    await until(()=>f.getRenders()===2);
    const old=path.join(f.out,'demo_s01_v'+first.version_id+'.mp4');
    assert.equal(fs.existsSync(old),true,'Previous artifact remains immutable');
  }finally{f.cleanup()}
});

test('P08 rejects malformed full render fingerprints and legacy metadata is not reusable',()=>{
  const f=create();
  try{
    const snapshot=f.versions.source('demo','s01'),job='legacy-job';
    const id=f.versions.versionId(job),file=path.join(f.out,'demo_s01_v'+id+'.mp4');
    fs.writeFileSync(file,Buffer.alloc(1600,65));
    f.versions.capture({id:'demo',scene:'s01',jobId:job,file,
      expectedSource:snapshot,rendered:{duration:2,fps:24,height:720},
      qa:{verdict:'PASS',issues:[]}});
    assert.equal(f.find({id:'demo',slide_id:'s01',source_fingerprint:'a'.repeat(64)}),null);
    assert.throws(()=>f.versions.capture({id:'demo',scene:'s01',jobId:'other',
      file,expectedSource:snapshot,rendered:{duration:2,fps:24,height:720},
      qa:{verdict:'PASS'},renderFingerprint:'bad'}),/render fingerprint/);
  }finally{f.cleanup()}
});

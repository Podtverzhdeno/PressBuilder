import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sceneVersionStore} from '../server/scene-versions.mjs';
import {captureFrameEvidence} from '../server/frame-qa.mjs';
import {sceneComparisonService} from '../server/scene-comparison.mjs';

const ready=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{stdio:'ignore'}).status===0);
test('P11 real MP4 P08 version comparison: three diff images, pixel scores, cached reuse, integrity failure',{
  skip:!ready,timeout:75000
},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-compare-'));
  const out=path.join(dir,'out'),root=path.join(dir,'decks');
  fs.mkdirSync(out,{recursive:true});
  const deck={id:'demo',style:'paper',format:{fps:24,height:720},slides:[
    {id:'s01',cues:[{id:'c01',say:'Hi'}]}]};
  const versions=sceneVersionStore({root,out,getDeck:()=>deck,
    getScene3D:()=>({revision:0,spec:null}),
    getStyle:()=>({revision:0,contract:{enforce:false}})});
  const make=(job,color)=>{
    const version=versions.versionId(job),file=path.join(out,'demo_s01_v'+version+'.mp4');
    const f=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi',
      '-i','color=c='+color+':s=640x360:r=24:d=0.6','-t','0.6','-c:v','libx264',
      '-pix_fmt','yuv420p','-an',file],{encoding:'utf8',timeout:20000});
    assert.equal(f.status,0,f.stderr);
    const evidence=captureFrameEvidence({file,out,id:'demo',scene:'s01',version,duration:0.6,fps:24});
    return versions.capture({id:'demo',scene:'s01',jobId:job,file,
      rendered:{fps:24,height:360,duration:0.6},
      expectedSource:versions.source('demo','s01'),qa:{verdict:'PASS',issues:[]},
      frameEvidence:evidence});
  };
  try{
    const a=make('red-job','red'),b=make('blue-job','blue'),c=make('red-other-job','red');
    const service=sceneComparisonService({versions,out,baseUrl:()=> 'https://press.example.test'});
    const first=await service.compare('demo','s01',a.version_id,b.version_id);
    assert.equal(first.scope,'PIXEL_DIFFERENCE_ONLY');
    assert.equal(first.cache_hit,false);
    assert.equal(first.frames.length,3);
    assert.ok(first.mean_absolute_difference>5,JSON.stringify(first));
    assert.ok(first.frames.every(x=>x.changed_fraction>0.5));
    for(let i=0;i<3;i++){
      assert.match(first.frames[i].before_url,/\/out\/demo_s01_v/);
      assert.match(first.frames[i].difference_url,/\/api\/decks\/demo\/versions\/s01\/compare\//);
      const file=await service.frame('demo','s01',a.version_id,b.version_id,i);
      assert.ok(fs.statSync(file).size>100);
      assert.deepEqual(fs.readFileSync(file).subarray(0,2),Buffer.from([0xff,0xd8]));
    }
    const hit=await service.compare('demo','s01',a.version_id,b.version_id);
    assert.equal(hit.cache_hit,true);
    assert.equal(hit.mean_absolute_difference,first.mean_absolute_difference);
    const close=await service.compare('demo','s01',a.version_id,c.version_id);
    assert.ok(close.mean_absolute_difference<2,JSON.stringify(close));
    assert.notEqual(close.frames[0].difference_url,first.frames[0].difference_url);
    const tampered=await service.frame('demo','s01',a.version_id,b.version_id,1);
    fs.appendFileSync(tampered,'TAMPER');
    const regenerated=await service.compare('demo','s01',a.version_id,b.version_id);
    assert.equal(regenerated.cache_hit,false,'Corrupted cached diff is regenerated');
    assert.equal((await service.compare('demo','s01',a.version_id,b.version_id)).cache_hit,true);
    fs.appendFileSync(path.join(out,path.basename(a.file)),'TAMPER');
    await assert.rejects(service.compare('demo','s01',a.version_id,b.version_id),
      e=>e.status===409,'Corrupted source MP4 must invalidate even a cached diff');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('P11 identifiers and incomplete storyboard archives fail closed',{timeout:10000},async()=>{
  const service=sceneComparisonService({versions:{verified:()=>({qa:{verdict:'PASS'}})},out:'/tmp'});
  await assert.rejects(service.compare('../escape','s01','a'.repeat(16),'b'.repeat(16)),e=>e.status===400);
  await assert.rejects(service.compare('demo','s01','a'.repeat(16),'a'.repeat(16)),e=>e.status===400);
  await assert.rejects(service.compare('demo','s01','a'.repeat(16),'b'.repeat(16)),e=>e.status===409);
  await assert.rejects(service.frame('demo','s01','a'.repeat(16),'b'.repeat(16),4),e=>e.status===400);
});

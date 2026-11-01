import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sceneVersionStore,fileHash} from '../server/scene-versions.mjs';
import {sceneReviewStore} from '../server/scene-reviews.mjs';
import {sceneLeaseStore} from '../server/scene-leases.mjs';

const actor=(id,role)=>({id,role,projects:['demo'],scenes:['s01','s02']});
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-version-')),out=path.join(root,'out');
  fs.mkdirSync(out);
  const decks={demo:{id:'demo',format:{fps:24,height:720},style:'paper',slides:[{id:'s01',cues:[{id:'c01',say:'hello'}]},{id:'s02',cues:[{id:'c02',say:'world'}]}]}};
  const getDeck=id=>{if(!decks[id])throw Error('not found');return decks[id]};
  const v=sceneVersionStore({root,out,getDeck,
    getScene3D:(id,scene)=>({revision:0,spec:null}),
    getStyle:()=>({revision:0,contract:{enforce:false}})});
  const reviews=sceneReviewStore({root,getDeck,getVersion:(id,scene,version)=>v.read(id,scene,version)});
  const leases=sceneLeaseStore({root,getDeck});
  const render=(id,scene,jobId,bytes='demo video sample')=>{
    const vid=v.versionId(jobId);
    const file=path.join(out,id+'_'+scene+'_v'+vid+'.mp4');
    fs.writeFileSync(file,Buffer.from(bytes+'x'.repeat(1200)));
    const source=v.source(id,scene);
    const result=v.capture({id,scene,jobId,file,expectedSource:source,rendered:{duration:4.0,fps:24,height:720},
      qa:{verdict:'PASS',issues:[],metadata:{fps:24,height:720,duration:4.0}}});
    return result;
  };
  return {root,out,v,reviews,leases,getDeck,decks,render,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('P08 immutable versions, source fingerprint drift, approval and rollback preserve original MP4',{timeout:10000},()=>{
  const f=fixture(),director=actor('director','director');
  try{
    const v1=f.render('demo','s01','first-job','first');
    assert.equal(f.v.list('demo','s01').length,1);
    assert.equal(f.v.pointer('demo','s01').revision,0);
    assert.throws(()=>f.v.approve('demo','s01',v1.version_id,2,director),e=>e.status===409);
    const a=f.v.approve('demo','s01',v1.version_id,0,director);
    assert.equal(a.revision,1);
    const stable=path.join(f.out,'demo_s01.mp4');
    assert.equal(fileHash(stable),v1.sha256);
    const v2=f.render('demo','s01','second-job','second');
    f.v.publishPreview('demo','s01',v2);
    assert.equal(fileHash(stable),v1.sha256,'draft must not overwrite approved MP4');
    assert.throws(()=>f.v.restore('demo','s01',v2.version_id,1,director),e=>e.status===409);
    const a2=f.v.approve('demo','s01',v2.version_id,1,director);
    assert.equal(a2.revision,2);
    assert.equal(fileHash(stable),v2.sha256);
    const rolled=f.v.restore('demo','s01',v1.version_id,2,director);
    assert.equal(rolled.revision,3);assert.equal(fileHash(stable),v1.sha256);
    assert.equal(f.v.approved('demo','s01').artifact.version_id,v1.version_id);
    assert.throws(()=>f.v.approve('demo','s01',v2.version_id,2,director),e=>e.status===409);
    assert.equal(f.v.list('demo','s01').length,2);
    const id=f.v.versionId('third-job');
    const file=path.join(f.out,'demo_s01_v'+id+'.mp4');
    fs.writeFileSync(file,'third version');
    const source=f.v.source('demo','s01');
    f.decks.demo.slides[0].cues[0].say='changed during render';
    assert.throws(()=>f.v.capture({id:'demo',scene:'s01',jobId:'third-job',file,
      expectedSource:source,qa:{verdict:'PASS'},rendered:{duration:2,fps:24,height:720}}),e=>e.status===409);
    assert.equal(f.v.list('demo','s01').length,2);
    fs.appendFileSync(path.join(f.out,'demo_s01_v'+v1.version_id+'.mp4'),'corrupt');
    assert.throws(()=>f.v.approved('demo','s01'),e=>e.status===409);
  }finally{f.cleanup()}
});
test('P07 frame review checks version boundaries, role transitions, fencing and approval gate',{timeout:10000},()=>{
  const f=fixture(),director=actor('director','director'),reviewer=actor('rev','reviewer'),worker=actor('worker','worker');
  try{
    const v=f.render('demo','s01','job1');
    const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,2,3]).toString('base64');
    const c=f.reviews.create('demo','s01',{version_id:v.version_id,t:1.25,text:'Text overlaps the key visual',
      severity:'high',rect:{x:0.2,y:0.3,w:0.3,h:0.2},frame_evidence:jpeg},reviewer,0);
    assert.equal(c.item.frame,30);assert.equal(c.item.status,'OPEN');
    const list=f.reviews.list('demo','s01');
    assert.equal(list.items[0].has_frame_evidence,true);
    assert.equal(list.items[0].frame_evidence,undefined,'Bulk list never leaks large JPEG bytes');
    assert.equal(f.reviews.get('demo','s01',c.item.id).frame_evidence,jpeg);
    assert.throws(()=>f.reviews.create('demo','s01',{version_id:v.version_id,t:0.5,
      text:'Invalid JPG payload',severity:'high',frame_evidence:'data:image/jpeg;base64,SGVsbG8='},reviewer,1));

    assert.ok(f.reviews.unresolved('demo','s01',v.version_id));
    assert.throws(()=>f.v.approve('demo','s01',v.version_id,0,director,
      {unresolved:f.reviews.unresolved}),e=>e.status===409);
    assert.throws(()=>f.reviews.create('demo','s01',{version_id:v.version_id,t:4,
      text:'Outside the video',severity:'high'},reviewer,1));
    assert.throws(()=>f.reviews.create('demo','s01',{version_id:v.version_id,t:0,
      text:'Untrusted comment',severity:'high'},worker,1),e=>e.status===403);
    assert.throws(()=>f.reviews.transition('demo','s01',c.item.id,'VERIFIED','skip',reviewer,1),e=>e.status===409);
    const lease=f.leases.claim('demo','s01',worker,300);
    const fixed=f.reviews.transition('demo','s01',c.item.id,'FIXED','Fixed overlap',worker,1,
      {assertWorker:()=>f.leases.assertWrite('demo','s01',worker,lease.fence)});
    assert.equal(fixed.item.status,'FIXED');
    assert.throws(()=>f.reviews.transition('demo','s01',c.item.id,'VERIFIED','good',worker,2),e=>e.status===403);
    const done=f.reviews.transition('demo','s01',c.item.id,'VERIFIED','Checked on MP4',reviewer,2);
    assert.equal(done.item.history.length,3);
    assert.equal(f.reviews.unresolved('demo','s01',v.version_id),false);
    f.v.approve('demo','s01',v.version_id,0,director,{unresolved:f.reviews.unresolved});
    const reopened=f.reviews.transition('demo','s01',c.item.id,'REOPENED','Still visible',reviewer,3);
    assert.equal(reopened.item.status,'REOPENED');
    assert.throws(()=>f.reviews.transition('demo','s01',c.item.id,'FIXED','late',worker,3,
      {assertWorker:()=>{}}),e=>e.status===409);
    f.leases.release('demo','s01',worker,lease.fence);
    assert.throws(()=>f.reviews.transition('demo','s01',c.item.id,'FIXED','late',worker,4,
      {assertWorker:()=>f.leases.assertWrite('demo','s01',worker,lease.fence)}),e=>e.status===409);
    assert.equal(f.reviews.read('demo','s01').items.length,1);
  }finally{f.cleanup()}
});

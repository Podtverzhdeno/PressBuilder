import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sceneSyncStore} from '../server/scene-sync.mjs';
import {sceneVersionStore} from '../server/scene-versions.mjs';
import {scene3dStore} from '../server/scene-3d.mjs';

function setup(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-versions-'));
  const out=path.join(dir,'out');fs.mkdirSync(out,{recursive:true});
  const deck={id:'p1',title:'Versioning',text:'',target:null,style:'lines',
    format:{height:720,fps:24,bitrate:10},slides:[
      {id:'s01',label:'Intro',lead:0,tail:0,cues:[{id:'one',say:'Hello',dur:2},{id:'two',say:'World',dur:3}]},
      {id:'s02',label:'Outro',lead:0,tail:0,cues:[{id:'three',say:'Done',dur:4}]}
    ]};
  let live=structuredClone(deck);
  const getDeck=id=>{if(id!=='p1')throw Object.assign(new Error('not found'),{status:404});return structuredClone(live)};
  const putDeck=(_,d)=>{live=structuredClone(d)};
  const three=scene3dStore({root:dir,getDeck});
  const sync=sceneSyncStore({root:dir,getDeck});
  const versions=sceneVersionStore({root:dir,outDir:out,getDeck,putDeck,scene3d:three,syncStore:sync});
  return {dir,out,getDeck,putDeck,three,sync,versions,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
const beat={id:'beat-1',kind:'beat',anchor:{type:'cue_start',cue_id:'two',offset:.25},emphasis:.7,note:'Visual accent'};
const camera={id:'camera-cut',kind:'camera',anchor:{type:'scene',offset:1.5},duration:.3};
test('P09 cue anchors track narration and FPS with <= half-frame rounding drift',()=>{
  const s=setup();
  try{
    const first=s.sync.read('p1','s01');
    assert.equal(first.revision,0);
    assert.equal(first.timeline.cues[1].start,2);
    const saved=s.sync.put('p1','s01',[beat,camera],0);
    assert.equal(saved.revision,1);
    assert.equal(saved.timeline.events[0].local_time,2.25);
    assert.equal(saved.timeline.events[1].global_time,1.5);
    assert.throws(()=>s.sync.put('p1','s01',[beat],0),e=>e.status===409);
    const d=s.getDeck('p1');d.slides[0].cues[0].dur=4;d.format.fps=60;s.putDeck('p1',d);
    const shifted=s.sync.read('p1','s01');
    assert.equal(shifted.timeline.events[0].local_time,4.25);
    assert.equal(shifted.timeline.events[1].local_time,1.5);
    assert.equal(shifted.timeline.fps,60);
    assert.ok(Math.abs(shifted.timeline.events[0].snapped_time-shifted.timeline.events[0].global_time)<=1/(2*60)+1e-8);
    assert.equal(s.sync.read('p1','s02').revision,0);
    // A cue can be renamed by another editor: expose orphan markers so they
    // can be repaired, instead of making both GET and PUT unusable.
    const renamed=s.getDeck('p1');
    renamed.slides[0].cues[1].id='two-new';
    s.putDeck('p1',renamed);
    const orphan=s.sync.read('p1','s01');
    assert.match(orphan.validation_error,/Unknown cue_id/);
    assert.equal(orphan.revision,1);
    assert.equal(s.sync.put('p1','s01',[],1).revision,2);
    const repaired=s.sync.read('p1','s01');
    assert.equal(repaired.validation_error,null);
    // Subsequent rejection checks use the fresh optimistic revision.

    assert.throws(()=>s.sync.put('p1','s01',[{...beat,id:'bad',anchor:{type:'cue_start',cue_id:'unknown',offset:0}}],2),e=>e.status===409);
    assert.throws(()=>s.sync.put('p1','s01',[beat,beat],2),/duplicate/);
    assert.throws(()=>s.sync.put('p1','s01',[{...beat,inject:'eval'}],2),/Unknown marker/);
    assert.throws(()=>s.sync.put('p1','s01',[{...camera,anchor:{type:'scene',offset:500}}],2),/outside scene/);
    assert.throws(()=>s.sync.read('p1','../s02'),e=>e.status===400);
  }finally{s.cleanup()}
});
test('P08 captures immutable artifacts, rejects stale work and restores a scene without changing its neighbor',()=>{
  const s=setup();
  try{
    const render=(scene,label)=>{
      const source=s.versions.source('p1',scene);
      const p=path.join(s.out,'p1_'+scene+'.mp4');
      fs.writeFileSync(p,Buffer.alloc(2500,label));
      return {id:'p1',slide_id:scene,job_id:'job-'+label,status:'completed',
        render_fingerprint:source.fingerprint,result:{file:'out/p1_'+scene+'.mp4'},
        qa_report:{verdict:'PASS',metadata:{fps:24,duration:5}}};
    };
    const first=s.versions.capture('p1','s01',render('s01',11));
    const secondScene=s.versions.capture('p1','s02',render('s02',33));
    const original=s.versions.ensureArtifact('p1','s01',first.version_id);
    assert.equal(fs.readFileSync(original.file).at(0),11);
    assert.equal(s.versions.approve('p1','s01',first.version_id,0).revision,1);
    assert.throws(()=>s.versions.approve('p1','s01',first.version_id,0),e=>e.status===409);
    const d=s.getDeck('p1');d.slides[0].label='Revision 2';d.slides[0].cues[0].say='changed';s.putDeck('p1',d);
    const stale={...render('s01',22),render_fingerprint:first.source_sha256};
    assert.throws(()=>s.versions.capture('p1','s01',stale),e=>e.status===409);
    const second=s.versions.capture('p1','s01',render('s01',44));
    assert.notEqual(first.version_id,second.version_id);
    assert.equal(s.versions.list('p1','s01').versions.length,2);
    const diff=s.versions.compare('p1','s01',first.version_id,second.version_id);
    assert.deepEqual(diff.changed_cues,['one']);assert.equal(diff.scene3d_changed,false);
    assert.equal(s.versions.ensureArtifact('p1','s01',first.version_id).file,original.file);
    assert.equal(fs.readFileSync(original.file).at(0),11);
    assert.throws(()=>s.versions.restore('p1','s01',first.version_id,'wrong'),e=>e.status===409);
    const current=s.versions.source('p1','s01').fingerprint;
    const restored=s.versions.restore('p1','s01',first.version_id,current);
    assert.equal(restored.exact_render_input_match,true);
    assert.equal(s.getDeck('p1').slides[0].label,'Intro');
    assert.equal(s.getDeck('p1').slides[1].label,'Outro');
    assert.equal(s.versions.active('p1','s01').approved_version,first.version_id);
    assert.equal(s.versions.ensureArtifact('p1','s02',secondScene.version_id).doc.version_id,secondScene.version_id);
    assert.throws(()=>s.versions.restore('p1','s01',second.version_id,current),e=>e.status===409);
    const auditDir=path.join(s.dir,'p1','.scene-versions','s01','audit');
    assert.equal(fs.readdirSync(auditDir).length,2);
    fs.writeFileSync(original.file,Buffer.alloc(2500,55));
    assert.throws(()=>s.versions.ensureArtifact('p1','s01',first.version_id),e=>e.status===409);
  }finally{s.cleanup()}
});
test('P08 rollback retains and restores authored cue anchors and cleared 3D definitions',()=>{
  const s=setup();
  try{
    s.sync.put('p1','s01',[beat],0);
    const first=s.versions.source('p1','s01');
    const p=path.join(s.out,'p1_s01.mp4');fs.writeFileSync(p,Buffer.alloc(2048,4));
    const v=s.versions.capture('p1','s01',{id:'p1',slide_id:'s01',job_id:'x',status:'completed',
      render_fingerprint:first.fingerprint,result:{file:'out/p1_s01.mp4'},qa_report:{verdict:'PASS',metadata:{}}});
    s.sync.put('p1','s01',[],1);
    const current=s.versions.source('p1','s01').fingerprint;
    s.versions.restore('p1','s01',v.version_id,current);
    assert.deepEqual(s.sync.read('p1','s01').markers,[beat]);
    assert.equal(s.three.read('p1','s01').spec,null);
  }finally{s.cleanup()}
});

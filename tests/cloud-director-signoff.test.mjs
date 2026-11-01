import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {directorStore} from '../server/director.mjs';
import {sceneTaskStore} from '../server/scene-tasks.mjs';
import {projectReadmeStore} from '../server/project-readme.mjs';

const rejectStatus=(f,status)=>{
  assert.throws(f,e=>e.status===status,'expected HTTP '+status);
};
test('Director P10 release boundary: exact six approved tasks, evidence, job and MP4 digest',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-director-release-'));
  const out=path.join(root,'out');fs.mkdirSync(out,{recursive:true});
  const id='release-test';
  const deck={id,title:'Контрольный ролик',text:'Шесть сцен без выдумок.',
    style:'lines',target:42,format:{fps:24,height:720,bitrate:8},
    slides:Array.from({length:6},(_,i)=>({
      id:'s'+String(i+1).padStart(2,'0'),label:'Сцена '+(i+1),
      cues:[{id:'c'+String(i+1).padStart(2,'0'),say:'Реплика '+(i+1)}]
    }))};
  const getDeck=(key)=>{if(key!==id)throw Error('Not found');return deck};
  const tasks=sceneTaskStore({root,getDeck});
  const readmes=projectReadmeStore({root,getDeck});
  const styles={read:()=>({revision:0,contract:{schemaVersion:1,enforce:false}})};
  let job={id,status:'not_started'};
  const director=directorStore({root,getDeck,sceneTasks:tasks,projectReadmes:readmes,
    styles,getAssembly:()=>({get:()=>job}),out});
  try{
    const proposal=director.propose(id,{expected_revision:0,goal:'Сохранить смысл исходного текста'});
    assert.equal(proposal.status,'draft');
    assert.equal(director.approve(id,{expected_revision:proposal.revision,confirm:'APPROVE'}).status,'approved');
    // Visuals are expected to be authored after the director approves the script.
    deck.slides[0].visuals=[{id:'post-approval',kind:'text',x:20,y:20,text:'Title'}];
    const ids=deck.slides.map(s=>s.id);
    for(const slide of ids){
      const old=tasks.read(id,slide);
      const checkpoints=old.checkpoints.map(cp=>({...cp,done:true,
        note:['render','technical_qa','human_review'].includes(cp.id)?'Подтверждённый артефакт '+slide:cp.note}));
      tasks.put(id,slide,{status:'done',checkpoints},old.revision);
    }
    rejectStatus(()=>director.signoff(id,{confirm:'RELEASE',expected_plan_revision:2,
      assembly_job_id:'test-job'}),409);
    const file=path.join(out,id+'_final.mp4');
    fs.writeFileSync(file,Buffer.from('Synthetic handoff fixture, not a real MP4.'));
    const sha=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const inputs=ids.map(scene=>{
      const file=path.join(out,id+'_'+scene+'.mp4');
      fs.writeFileSync(file,Buffer.from('Synthetic input for '+scene));
      return {id:scene,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
    });
    const fakeManifest={project:id,job_id:'test-job',
      scenes:inputs,
      output:{sha256:sha,size:fs.statSync(file).size,qa:{verdict:'PASS'}}};
    job={id,status:'completed',job_id:'test-job',manifest:fakeManifest};
    rejectStatus(()=>director.signoff(id,{confirm:'RELEASE',expected_plan_revision:2,
      assembly_job_id:'wrong-job'}),409);
    fs.appendFileSync(file,'bad bytes');
    rejectStatus(()=>director.signoff(id,{confirm:'RELEASE',expected_plan_revision:2,
      assembly_job_id:'test-job'}),409);
    fs.writeFileSync(file,Buffer.from('Synthetic handoff fixture, not a real MP4.'));
    fs.appendFileSync(path.join(out,id+'_s05.mp4'),'tampered');
    rejectStatus(()=>director.signoff(id,{confirm:'RELEASE',expected_plan_revision:2,
      assembly_job_id:'test-job'}),409);
    fs.writeFileSync(path.join(out,id+'_s05.mp4'),Buffer.from('Synthetic input for s05'));
    deck.slides[0].lead=1.5; // Scene timing changed after approval.
    rejectStatus(()=>director.signoff(id,{confirm:'RELEASE',expected_plan_revision:2,
      assembly_job_id:'test-job'}),409);
    delete deck.slides[0].lead;
    const released=director.signoff(id,{confirm:'RELEASE',expected_plan_revision:2,
      assembly_job_id:'test-job'});
    assert.equal(released.status,'released');
    assert.equal(released.revision,3);
    assert.equal(released.progress.release_status,'signed_off');
    assert.equal(released.release_receipt.sha256,sha);
    assert.equal(released.release_receipt.assembly_job_id,'test-job');
    rejectStatus(()=>director.propose(id,{expected_revision:3,goal:'Overwrite'}),409);
    const original=fs.readFileSync(file);
    fs.writeFileSync(file,Buffer.alloc(original.length,0x58));
    assert.equal(director.read(id).progress.release_status,'artifact_changed',
      'same-sized corrupted MP4 must not be considered verified');
    fs.writeFileSync(file,original);
    assert.equal(director.read(id).progress.release_status,'signed_off');
    fs.rmSync(file);
    assert.equal(director.read(id).progress.release_status,'artifact_missing');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

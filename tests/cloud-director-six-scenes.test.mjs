import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {directorStore} from '../server/director.mjs';
import {sceneTaskStore} from '../server/scene-tasks.mjs';
import {projectReadmeStore} from '../server/project-readme.mjs';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';

const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ffmpeg=process.env.FFMPEG||'ffmpeg';
const ffprobe=process.env.FFPROBE||'ffprobe';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rejects=(fn,status=409)=>assert.throws(fn,e=>e.status===status);
test('P10 six real H.264 scenes: review, approved immutable P08 inputs, P05 assembly and signed release',{timeout:120000},async t=>{
  if(spawnSync(ffmpeg,['-version'],{stdio:'ignore'}).status!==0||
     spawnSync(ffprobe,['-version'],{stdio:'ignore'}).status!==0){
    t.skip('FFmpeg and FFprobe are needed for an actual-MP4 E2E');return;
  }
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-six-director-'));
  const out=path.join(root,'out');fs.mkdirSync(out,{recursive:true});
  const id='six-real',scenes=['s01','s02','s03','s04','s05','s06'];
  const deck={id,title:'Six-scene delivery',text:'Six real scene clips',style:'lines',
    format:{fps:24,height:720,bitrate:8},target:3,slides:scenes.map((scene,i)=>({
      id:scene,label:'Scene '+(i+1),cues:[{id:'c'+(i+1),say:'Narration '+(i+1)}]
    }))};
  const getDeck=value=>{if(value!==id)throw Error('Unknown deck');return deck};
  const taskStore=sceneTaskStore({root,getDeck});
  const readmeStore=projectReadmeStore({root,getDeck});
  const styles={read:()=>({revision:0,contract:{schemaVersion:1,enforce:false}})};
  const plans=assemblyPlanStore({root,getDeck,getStyle:id=>styles.read(id)});
  const approved=new Map();
  let assembly;
  const director=directorStore({root,getDeck,sceneTasks:taskStore,projectReadmes:readmeStore,
    styles,getAssembly:()=>assembly,getApproved:(project,scene)=>approved.get(scene),out});
  try{
    const draft=director.propose(id,{expected_revision:0,goal:'Publish a reproducible six-scene demonstration'});
    assert.equal(draft.scenes.length,6);
    const first=director.approve(id,{expected_revision:draft.revision,confirm:'APPROVE'});
    assert.equal(first.status,'approved');
    assert.equal(first.progress.checkpoints_total,36);
    const colors=['red','blue','green','yellow','purple','cyan'];
    for(let i=0;i<scenes.length;i++){
      const scene=scenes[i],version='abcdef012345'+String(i+1).padStart(4,'0');
      const file=path.join(out,id+'_'+scene+'_v'+version+'.mp4');
      const args=['-hide_banner','-loglevel','error','-y','-f','lavfi',
        '-i','color=c='+colors[i]+':s=1280x720:r=24:d=0.5'];
      if(i===0)args.push('-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.5');
      args.push('-t','0.5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
        ...(i===0?['-c:a','aac']:['-an']),'-movflags','+faststart',file);
      const run=spawnSync(ffmpeg,args,{encoding:'utf8',timeout:20000});
      assert.equal(run.status,0,run.stderr);
      assert.ok(fs.statSync(file).size>1000);
      approved.set(scene,{version_id:version,revision:1,artifact:{
        version_id:version,job_id:'render-'+scene,absolute_file:file,
        sha256:sha(file),qa:{verdict:'PASS'}
      }});
      const old=taskStore.read(id,scene);
      taskStore.put(id,scene,{status:'done',checkpoints:old.checkpoints.map(cp=>({
        ...cp,done:true,note:'Verified '+scene+' '+cp.id
      }))},old.revision);
    }
    assembly=assemblyService({out,getDeck,
      getRender:(project,scene)=>({status:'completed',job_id:'render-'+scene,qa_report:{verdict:'PASS'}}),
      getTask:(project,scene)=>taskStore.read(project,scene),
      getApproved:(project,scene)=>approved.get(scene),
      getPlan:id=>plans.read(id),getStyle:id=>styles.read(id),
      baseUrl:()=> 'https://example.test'});
    // Missing human-approved immutable version blocks assembly.
    const saved=approved.get('s03');
    approved.delete('s03');
    rejects(()=>assembly.start(id,scenes));
    approved.set('s03',saved);
    const started=assembly.start(id,scenes);
    assert.ok(['queued','running'].includes(started.status));
    let state;
    for(let i=0;i<400;i++){
      state=assembly.get(id);
      if(['completed','failed'].includes(state.status))break;
      await sleep(75);
    }
    assert.equal(state?.status,'completed',JSON.stringify(state));
    assert.equal(state.manifest.scenes.length,6);
    assert.ok(state.manifest.scenes.every(s=>s.approved_version_id));
    assert.equal(state.manifest.output.qa.verdict,'PASS');
    const final=assembly.download(id,state.result.release_id);
    assert.equal(sha(final),state.manifest.output.sha256);
    assert.equal(director.read(id).progress.release_status,'manual_review_required');
    const shifted=approved.get('s04');
    approved.set('s04',{...shifted,version_id:'1234567890abcdef'});
    rejects(()=>director.signoff(id,{confirm:'RELEASE',expected_plan_revision:2,
      assembly_job_id:state.job_id}));
    approved.set('s04',shifted);
    const inputFile=approved.get('s03').artifact.absolute_file;
    const inputBytes=fs.readFileSync(inputFile);
    fs.writeFileSync(inputFile,Buffer.alloc(inputBytes.length,'x'));
    rejects(()=>director.signoff(id,{confirm:'RELEASE',expected_plan_revision:2,
      assembly_job_id:state.job_id}));
    fs.writeFileSync(inputFile,inputBytes);
    const released=director.signoff(id,{confirm:'RELEASE',
      expected_plan_revision:2,assembly_job_id:state.job_id});
    assert.equal(released.status,'released');
    assert.equal(released.release_receipt.sha256,sha(final));
    assert.equal(released.release_receipt.assembly_job_id,state.job_id);
    assert.equal(released.progress.release_status,'signed_off');
    const metadata=fs.statSync(final);
    fs.writeFileSync(final,Buffer.alloc(metadata.size,'x'));
    fs.utimesSync(final,new Date(Date.now()-10000),new Date(Date.now()-10000));
    assert.equal(director.read(id).progress.release_status,'artifact_changed');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

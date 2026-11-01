import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {styleContractStore} from '../server/style-contract.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';
import {directorStore} from '../server/director.mjs';
import {sceneTaskStore} from '../server/scene-tasks.mjs';
import {projectReadmeStore} from '../server/project-readme.mjs';

const ffmpeg=process.env.FFMPEG||'ffmpeg';
const ffprobe=process.env.FFPROBE||'ffprobe';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function colorClip(out,color,withAudio){
  const args=['-hide_banner','-loglevel','error','-y','-f','lavfi',
    '-i','color=c='+color+':s=1280x720:r=24:d=0.65'];
  if(withAudio)args.push('-f','lavfi','-i','sine=frequency=550:sample_rate=48000:duration=0.65');
  args.push('-t','0.65','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
    ...(withAudio?['-c:a','aac']:['-an']),'-movflags','+faststart',out);
  const r=spawnSync(ffmpeg,args,{encoding:'utf8',timeout:30000});
  assert.equal(r.status,0,r.stderr);
}
test('P05 x P10: six real MP4s -> immutable montage -> tamper rejection -> human signoff after worker restart',{
  timeout:180000
},async t=>{
  if(spawnSync(ffmpeg,['-version'],{stdio:'ignore'}).status!==0||
     spawnSync(ffprobe,['-version'],{stdio:'ignore'}).status!==0){
    t.skip('Real FFmpeg/ffprobe required');return;
  }
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-cross-pr-'));
  const out=path.join(root,'out');fs.mkdirSync(out,{recursive:true});
  const id='p05-p10',scenes=Array.from({length:6},(_,i)=>'s0'+(i+1));
  const deck={id,title:'Six real clips',text:'Six narration cues',style:'lines',
    target:4,format:{fps:24,height:720,bitrate:8},
    slides:scenes.map((scene,i)=>({id:scene,label:'Scene '+(i+1),
      cues:[{id:'c'+(i+1),say:'Narration '+(i+1)}]}))};
  const getDeck=name=>{assert.equal(name,id);return deck};
  const tasks=sceneTaskStore({root,getDeck});
  const readmes=projectReadmeStore({root,getDeck});
  const styles=styleContractStore({root,getDeck});
  const plans=assemblyPlanStore({root,getDeck,getStyle:id=>styles.read(id)});
  const approved=new Map();
  let assembly;
  const director=directorStore({root,getDeck,sceneTasks:tasks,projectReadmes:readmes,
    styles,getAssembly:()=>assembly,getApproved:(_,scene)=>approved.get(scene),out});
  try{
    const proposal=director.propose(id,{expected_revision:0,goal:'Render a verifiable six-scene movie'});
    director.approve(id,{expected_revision:proposal.revision,confirm:'APPROVE'});
    const plan=structuredClone(plans.read(id).plan);
    plan.scenes[0].transition_after={type:'crossfade',duration:0.2};
    plans.put(id,plan,0);
    for(const [i,scene] of scenes.entries()){
      const version='abcdef012345'+String(i+1).padStart(4,'0');
      const file=path.join(out,id+'_'+scene+'_v'+version+'.mp4');
      colorClip(file,['red','blue','green','purple','yellow','cyan'][i],i===0);
      assert.ok(fs.statSync(file).size>1024);
      approved.set(scene,{revision:1,version_id:version,artifact:{
        version_id:version,job_id:'job-'+scene,absolute_file:file,qa:{verdict:'PASS'},
        sha256:sha(file)
      }});
      const task=tasks.read(id,scene);
      tasks.put(id,scene,{status:'done',checkpoints:task.checkpoints.map(cp=>({
        ...cp,done:true,note:'Reviewed evidence: '+scene+' '+cp.id
      }))},task.revision);
    }
    const actual=assemblyService({out,getDeck,getPlan:id=>plans.read(id),
      getStyle:id=>styles.read(id),
      getRender:(_id,scene)=>({status:'completed',job_id:'job-'+scene,qa_report:{verdict:'PASS'}}),
      getTask:(_id,scene)=>tasks.read(id,scene),
      getApproved:(_id,scene)=>approved.get(scene),baseUrl:()=>'https://example.test'});
    assembly=actual;
    const start=actual.start(id,scenes);
    assert.ok(['queued','running'].includes(start.status));
    let job;
    for(let i=0;i<600;i++){
      job=actual.get(id);
      if(['completed','failed','cancelled'].includes(job.status))break;
      await sleep(100);
    }
    assert.equal(job?.status,'completed',JSON.stringify(job));
    assert.equal(job.manifest.scenes.length,6);
    assert.equal(job.manifest.output.qa.verdict,'PASS');
    const releaseId=job.result.release_id;
    assert.ok(/^[0-9a-f-]{36}$/.test(releaseId));
    const mp4=actual.download(id,releaseId);
    assert.equal(sha(mp4),job.manifest.output.sha256);
    assert.equal(job.manifest.output.bytes,fs.statSync(mp4).size);
    assert.equal(actual.current(id).release_id,releaseId);
    const original=fs.readFileSync(mp4);
    // The active immutable artifact must be validated by both P05 and P10.
    const corrupted=Buffer.from(original);corrupted[100]^=1;
    fs.writeFileSync(mp4,corrupted);
    assert.throws(()=>actual.download(id,releaseId),/integrity check failed/);
    assert.equal(actual.get(id).current_release,null);
    assert.throws(()=>director.signoff(id,{expected_plan_revision:2,
      assembly_job_id:job.job_id,confirm:'RELEASE'}),e=>e.status===409);
    fs.writeFileSync(mp4,original);
    // A Railway restart clears in-memory worker jobs, but the release manifest
    // and checksum remain on the persistent volume.
    assembly={get:()=>({status:'not_started'}),current:actual.current,download:actual.download};
    const released=director.signoff(id,{expected_plan_revision:2,
      assembly_job_id:job.job_id,confirm:'RELEASE'});
    assert.equal(released.status,'released');
    assert.equal(released.release_receipt.release_id,releaseId);
    assert.equal(released.progress.release_status,'signed_off');
    assert.equal(released.release_receipt.file,'out/releases/'+id+'/'+releaseId+'/final.mp4');
    fs.writeFileSync(mp4,corrupted);
    assert.equal(director.read(id).progress.release_status,'artifact_changed');
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

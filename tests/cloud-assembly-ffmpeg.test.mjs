import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';
import {styleContractStore} from '../server/style-contract.mjs';
import {inspectMp4} from '../server/video-qa.mjs';

const ready=['ffmpeg','ffprobe'].every(cmd=>spawnSync(cmd,['-version'],{stdio:'ignore'}).status===0);
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const run=(args)=>{
  const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8',timeout:35000});
  assert.equal(p.status,0,p.stderr);
};
function clip(file,color,fps,voice){
  const args=['-f','lavfi','-i','color=c='+color+':s=160x90:r='+fps+':d=2'];
  if(voice)args.push('-f','lavfi','-i','sine=frequency=500:sample_rate=44100:duration=2');
  args.push('-c:v','libx264','-pix_fmt','yuv420p');
  if(voice)args.push('-c:a','aac','-shortest');
  args.push(file);run(args);
}
async function untilDone(get){
  for(let i=0;i<280;i++){
    const j=get();
    if(['completed','cancelled','failed'].includes(j.status))return j;
    await sleep(250);
  }
  throw new Error('Assembly did not finish within 70 seconds');
}
test('P05: FFmpeg montage, FPS normalization, silent audio, crossfade, immutable replacement and cancellation',{
  skip:!ready,timeout:150000
},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-assembly-'));
  const out=path.join(root,'out'),decks=path.join(root,'decks');
  fs.mkdirSync(out,{recursive:true});
  const deck={id:'demo',slides:[{id:'s01'},{id:'s02'}],format:{height:720,fps:24}};
  const getDeck=()=>deck;
  const styles=styleContractStore({root:decks,getDeck});
  const plans=assemblyPlanStore({root:decks,getDeck,getStyle:id=>styles.read(id)});
  const assembly=assemblyService({out,getDeck,getPlan:id=>plans.read(id),
    getStyle:id=>styles.read(id),getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
    getTask:()=>({status:'done'}),baseUrl:()=> 'https://example.test'});
  try{
    clip(path.join(out,'demo_s01.mp4'),'red',23,true);
    clip(path.join(out,'demo_s02.mp4'),'blue',30,false);
    const first=assembly.start('demo',['s01','s02']);
    assert.equal(first.status==='queued'||first.status==='running',true);
    const a=await untilDone(()=>assembly.get('demo'));
    assert.equal(a.status,'completed',a.error);
    const release1=a.result.release_id;
    const originalFile=assembly.download('demo',release1);
    const originalHash=a.manifest.output.sha256;
    assert.equal(inspectMp4(originalFile,{height:720,fps:24,audio_required:true}).verdict,'PASS');
    assert.equal(a.manifest.scenes[1].has_audio,false);
    assert.equal(a.current_release.release_id,release1);
    const startPlan=plans.read('demo');
    const revised=structuredClone(startPlan.plan);
    revised.scenes[0].transition_after={type:'crossfade',duration:0.4};
    assert.equal(plans.put('demo',revised,startPlan.revision).revision,1);
    clip(path.join(out,'demo_s02.mp4'),'green',25,false);
    assembly.start('demo',['s01','s02']);
    const b=await untilDone(()=>assembly.get('demo'));
    assert.equal(b.status,'completed',b.error);
    assert.notEqual(b.result.release_id,release1);
    assert.equal(fs.existsSync(originalFile),true);
    assert.equal(a.manifest.output.sha256,originalHash);
    assert.equal(b.current_release.release_id,b.result.release_id);
    const meta=inspectMp4(assembly.download('demo',b.result.release_id),{height:720,fps:24,audio_required:true,duration:3.6});
    assert.equal(meta.verdict,'PASS',JSON.stringify(meta.issues));
    assert.ok(Math.abs(meta.metadata.duration-3.6)<0.25);
    // Cancellation cannot replace a previously published version.
    const before=assembly.get('demo').current_release.release_id;
    assembly.start('demo',['s01','s02']);
    const requested=assembly.cancel('demo');
    assert.equal(requested.cancel_requested,true);
    const cancelled=await untilDone(()=>assembly.get('demo'));
    assert.equal(cancelled.status,'cancelled',cancelled.error);
    assert.equal(assembly.get('demo').current_release.release_id,before);
    assert.equal(fs.existsSync(assembly.download('demo',release1)),true);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

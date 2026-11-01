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
const sleep=ms=>new Promise(r=>setTimeout(r,80));
const clip=(file,color,voice=true)=>{
  const args=['-hide_banner','-loglevel','error','-y','-f','lavfi',
    '-i','color=c='+color+':s=160x90:r=24:d=1.5'];
  if(voice)args.push('-f','lavfi','-i','sine=frequency=500:sample_rate=48000:duration=1.5');
  args.push('-t','1.5','-c:v','libx264','-pix_fmt','yuv420p');
  if(voice)args.push('-c:a','aac','-b:a','128k');
  args.push(file);
  const p=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:25000});
  assert.equal(p.status,0,p.stderr);
};
async function done(service,id){
  for(let i=0;i<250;i++){
    const j=service.get(id);
    if(['completed','failed','cancelled'].includes(j.status))return j;
    await sleep();
  }
  throw Error('Timed out waiting for montage');
}
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p13-'));
  const out=path.join(root,'out'),decks=path.join(root,'decks');
  fs.mkdirSync(out,{recursive:true});
  const deck={id:'demo',slides:['s01','s02','s03'].map(id=>({id})),format:{height:720,fps:24}};
  const getDeck=()=>deck;
  const styles=styleContractStore({root:decks,getDeck});
  const plans=assemblyPlanStore({root:decks,getDeck,getStyle:id=>styles.read(id)});
  const opts={out,getDeck,getPlan:id=>plans.read(id),getStyle:id=>styles.read(id),
    getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
    getTask:()=>({status:'done'}),baseUrl:()=> 'https://example.test',incrementalHardCuts:true};
  return {root,out,opts,plans,styles,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('P13 three hard-cuts: first encode 3 segments, change middle scene reuses 2 with H264 streamcopy',{
  skip:!ready,timeout:100000
},async()=>{
  const f=fixture();
  try{
    clip(path.join(f.out,'demo_s01.mp4'),'red');
    clip(path.join(f.out,'demo_s02.mp4'),'blue',false);
    clip(path.join(f.out,'demo_s03.mp4'),'green');
    const service=assemblyService(f.opts);
    service.start('demo',['s01','s02','s03']);
    const first=await done(service,'demo');
    assert.equal(first.status,'completed',first.error);
    assert.equal(first.encode_strategy,'incremental-hardcut-v1',
      'Homogeneous hard cuts should use incremental path: '+first.incremental_fallback_reason);
    assert.equal(first.incremental.segments_encoded,3);
    assert.equal(first.incremental.segments_reused,0);
    assert.ok(first.timings_ms.encode>=0);
    const oldPath=service.download('demo',first.result.release_id);
    const oldSHA=first.manifest.output.sha256;
    const firstReport=inspectMp4(oldPath,{fps:24,height:720,audio_required:true,duration:4.5});
    assert.equal(firstReport.verdict,'PASS',JSON.stringify(firstReport.issues));
    clip(path.join(f.out,'demo_s02.mp4'),'white',false);
    service.start('demo',['s01','s02','s03']);
    const second=await done(service,'demo');
    assert.equal(second.status,'completed',second.error);
    assert.equal(second.encode_strategy,'incremental-hardcut-v1',second.incremental_fallback_reason);
    assert.equal(second.incremental.segments_reused,2);
    assert.equal(second.incremental.segments_encoded,1);
    assert.equal(second.manifest.segment_reuse.segments_reused,2);
    assert.notEqual(first.result.release_id,second.result.release_id);
    assert.equal(fs.existsSync(oldPath),true);
    assert.equal(first.manifest.output.sha256,oldSHA);
    assert.equal(service.current('demo').release_id,second.result.release_id);
    assert.equal(inspectMp4(service.download('demo',second.result.release_id),
      {fps:24,height:720,audio_required:true,duration:4.5}).verdict,'PASS');
    const dirs=fs.readdirSync(path.join(f.out,'assembly-segments','demo','s02')).filter(n=>n.endsWith('.mp4'));
    assert.equal(dirs.length,2,'Only changed scene should have two cached versions');
    console.log('P13_INCREMENTAL_BENCHMARK '+JSON.stringify({
      cold_ms:first.incremental.total_ms,
      after_change_ms:second.incremental.total_ms,
      segments_reused:second.incremental.segments_reused,
      segments_encoded:second.incremental.segments_encoded}));
  }finally{f.cleanup()}
});
test('P13 corrupted segment cache cannot be reused; forced and crossfade exports stay on original engine',{
  skip:!ready,timeout:100000
},async()=>{
  const f=fixture();
  try{
    for(const [scene,color] of [['s01','red'],['s02','blue'],['s03','green']])
      clip(path.join(f.out,'demo_'+scene+'.mp4'),color);
    const service=assemblyService(f.opts);
    service.start('demo',['s01','s02','s03']);
    const first=await done(service,'demo');
    assert.equal(first.status,'completed',first.error);
    assert.equal(first.encode_strategy,'incremental-hardcut-v1',first.incremental_fallback_reason);
    const dir=path.join(f.out,'assembly-segments','demo','s01');
    const segment=fs.readdirSync(dir).find(n=>n.endsWith('.mp4'));
    fs.appendFileSync(path.join(dir,segment),'corruption');
    // force:true explicitly uses legacy encoder without trusting caches.
    service.start('demo',['s01','s02','s03'],{force:true});
    const forced=await done(service,'demo');
    assert.equal(forced.status,'completed',forced.error);
    assert.equal(forced.encode_strategy,'full-filter');
    // New source does not trigger full-release hit; cache corruption is rebuilt.
    clip(path.join(f.out,'demo_s03.mp4'),'white');
    service.start('demo',['s01','s02','s03']);
    const repaired=await done(service,'demo');
    assert.equal(repaired.status,'completed',repaired.error);
    assert.equal(repaired.encode_strategy,'incremental-hardcut-v1',repaired.incremental_fallback_reason);
    assert.equal(repaired.incremental.segments_encoded,2,'Corrupted s01 and changed s03');
    const p=f.plans.read('demo'),change=structuredClone(p.plan);
    change.scenes[0].transition_after={type:'crossfade',duration:0.2};
    f.plans.put('demo',change,p.revision);
    service.start('demo',['s01','s02','s03']);
    const crossfade=await done(service,'demo');
    assert.equal(crossfade.status,'completed',crossfade.error);
    assert.equal(crossfade.encode_strategy,'full-filter');
    assert.equal(crossfade.incremental,undefined);
    assert.equal(service.current('demo').release_id,crossfade.result.release_id);
  }finally{f.cleanup()}
});

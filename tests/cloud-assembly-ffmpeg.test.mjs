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
function clip(file,color,fps,voice,duration=2,audioDuration=duration){
  const args=['-f','lavfi','-i','color=c='+color+':s=160x90:r='+fps+':d='+duration];
  if(voice)args.push('-f','lavfi','-i','sine=frequency=500:sample_rate=44100:duration='+audioDuration);
  args.push('-c:v','libx264','-pix_fmt','yuv420p');
  if(voice)args.push('-c:a','aac');
  args.push('-t',String(duration),file);run(args);
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
    // Same-size corruption must be detected using SHA-256, not only fs.stat.
    const approvedOld=fs.readFileSync(originalFile);
    const tamperedOld=Buffer.from(approvedOld);
    tamperedOld[100]^=0x01;
    fs.writeFileSync(originalFile,tamperedOld);
    assert.throws(()=>assembly.download('demo',release1),/integrity check failed/);
    assert.equal(assembly.get('demo').current_release.release_id,release1===before?release1:before,
      'corrupt older immutable release must not invalidate the current one');
    fs.writeFileSync(originalFile,approvedOld);
    assert.equal(assembly.download('demo',release1),originalFile);
    const currentFile=assembly.download('demo',before);
    const approvedCurrent=fs.readFileSync(currentFile);
    const tamperedCurrent=Buffer.from(approvedCurrent);
    tamperedCurrent[100]^=0x01;
    fs.writeFileSync(currentFile,tamperedCurrent);
    assert.equal(assembly.get('demo').current_release,null,
      'a corrupted active release must never be advertised as valid');
    assert.throws(()=>assembly.download('demo',before),/integrity check failed/);
    fs.writeFileSync(currentFile,approvedCurrent);
    assert.equal(assembly.get('demo').current_release.release_id,before);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('P05: six independent scenes, mixed FPS/audio, multiple crossfades and match-cut, replace s03 only',{
  skip:!ready,timeout:180000
},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-six-'));
  const out=path.join(root,'out');
  const deck={id:'six',slides:Array.from({length:6},(_,i)=>({id:'s0'+(i+1)})),
    format:{height:720,fps:24}};
  fs.mkdirSync(out,{recursive:true});
  const getDeck=()=>deck;
  const styles=styleContractStore({root:path.join(root,'decks'),getDeck});
  const plans=assemblyPlanStore({root:path.join(root,'decks'),getDeck,getStyle:id=>styles.read(id)});
  const approved=new Set(deck.slides.map(s=>s.id));
  const service=assemblyService({out,getDeck,getPlan:id=>plans.read(id),getStyle:id=>styles.read(id),
    getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
    getTask:(id,scene)=>({status:approved.has(scene)?'done':'review'}),baseUrl:()=> 'https://example.test'});
  try{
    const colors=['red','green','blue','yellow','purple','orange'];
    const frameRates=[23,24,25,30,50,24];
    for(let i=0;i<6;i++){
      clip(path.join(out,'six_s0'+(i+1)+'.mp4'),colors[i],frameRates[i],
        i%2===0,1.4,i===0?0.7:1.4);
    }
    const initial=plans.read('six');
    const plan=structuredClone(initial.plan);
    plan.scenes[0].transition_after={type:'crossfade',duration:0.3};
    plan.scenes[2].transition_after={type:'match-cut',duration:0};
    plan.scenes[2].exit_state={subject:'shared-object',background:'#112233',camera:[0.5,0.5],motion:'right'};
    plan.scenes[3].entry_state={subject:'shared-object',background:'#112233',camera:[0.52,0.5],motion:'right'};
    plan.scenes[3].transition_after={type:'crossfade',duration:0.2};
    plan.scenes[4].transition_after={type:'crossfade',duration:0.25};
    plans.put('six',plan,0);
    approved.delete('s04');
    assert.throws(()=>service.start('six',deck.slides.map(s=>s.id)),/Scene not approved/);
    approved.add('s04');
    assert.throws(()=>service.start('six',['s01','s03']),/consecutive/);
    const first=service.start('six',deck.slides.map(s=>s.id));
    assert.equal(first.scene_ids.length,6);
    const released=await untilDone(()=>service.get('six'));
    assert.equal(released.status,'completed',released.error);
    const manifest=released.manifest;
    assert.equal(manifest.scenes.length,6);
    assert.equal(manifest.scenes[0].transition_after.type,'crossfade');
    assert.equal(manifest.scenes[2].transition_after.type,'match-cut');
    assert.equal(manifest.scenes[3].has_audio,false);
    const target=6*1.4-0.3-0.2-0.25;
    const mp4=service.download('six',released.result.release_id);
    const qa=inspectMp4(mp4,{height:720,fps:24,duration:target,audio_required:true});
    assert.equal(qa.verdict,'PASS',JSON.stringify(qa.issues));
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,sample_rate,channels',
      '-of','json',mp4],{encoding:'utf8',timeout:15000});
    assert.equal(probe.status,0,probe.stderr);
    const audio=JSON.parse(probe.stdout).streams.find(s=>s.codec_type==='audio');
    assert.equal(audio.sample_rate,'48000');
    assert.equal(audio.channels,2);
    const v1=manifest.scenes.map(s=>s.sha256);
    clip(path.join(out,'six_s03.mp4'),'white',25,true,1.4,0.4);
    service.start('six',deck.slides.map(s=>s.id));
    const second=await untilDone(()=>service.get('six'));
    assert.equal(second.status,'completed',second.error);
    const v2=second.manifest.scenes.map(s=>s.sha256);
    assert.notEqual(v1[2],v2[2]);
    for(let i=0;i<6;i++)if(i!==2)assert.equal(v1[i],v2[i],'untouched scene '+i);
    assert.notEqual(second.result.release_id,released.result.release_id);
    assert.equal(fs.existsSync(mp4),true,'previous approved video remains immutable');
    assert.equal(service.get('six').current_release.release_id,second.result.release_id);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});


test('P05 refuses stale plan/style policy at publication without changing the active release',{
  skip:!ready,timeout:90000
},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-assembly-cas-'));
  const out=path.join(root,'out'),decks=path.join(root,'decks');
  fs.mkdirSync(out,{recursive:true});
  const deck={id:'demo',slides:[{id:'s01'},{id:'s02'}],format:{height:720,fps:24}};
  const getDeck=()=>deck;
  const styles=styleContractStore({root:decks,getDeck});
  const plans=assemblyPlanStore({root:decks,getDeck,getStyle:id=>styles.read(id)});
  const base={out,getDeck,getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
    getTask:()=>({status:'done'}),baseUrl:()=> 'https://example.test'};
  try{
    clip(path.join(out,'demo_s01.mp4'),'red',24,true,0.5);
    clip(path.join(out,'demo_s02.mp4'),'blue',24,false,0.5);
    const accepted=assemblyService({...base,getPlan:id=>plans.read(id),getStyle:id=>styles.read(id)});
    accepted.start('demo',['s01','s02']);
    const first=await untilDone(()=>accepted.get('demo'));
    assert.equal(first.status,'completed',first.error);
    const releaseId=first.result.release_id;
    const acceptedSha=first.manifest.output.sha256;

    let planReads=0;
    const planDrift=assemblyService({...base,
      getPlan:id=>{const record=plans.read(id);return {...record,
        revision:record.revision+(++planReads>=2?1:0)}},
      getStyle:id=>styles.read(id)});
    planDrift.start('demo',['s01','s02']);
    const rejectedPlan=await untilDone(()=>planDrift.get('demo'));
    assert.equal(rejectedPlan.status,'failed',JSON.stringify(rejectedPlan));
    assert.match(rejectedPlan.error,/Assembly plan, visual style or scene order changed/);
    assert.ok(planReads>=2);
    assert.equal(accepted.current('demo').release_id,releaseId);
    assert.equal(first.manifest.output.sha256,acceptedSha);

    let styleReads=0;
    const styleDrift=assemblyService({...base,getPlan:id=>plans.read(id),
      getStyle:id=>{const record=styles.read(id);return {...record,
        revision:record.revision+(++styleReads>=2?1:0)}}});
    styleDrift.start('demo',['s01','s02']);
    const rejectedStyle=await untilDone(()=>styleDrift.get('demo'));
    assert.equal(rejectedStyle.status,'failed',JSON.stringify(rejectedStyle));
    assert.match(rejectedStyle.error,/Assembly plan, visual style or scene order changed/);
    assert.ok(styleReads>=2);
    assert.equal(accepted.current('demo').release_id,releaseId);
    assert.equal(accepted.current('demo').manifest.output.sha256,acceptedSha);

    const changedDeck=assemblyService({...base,getPlan:id=>plans.read(id),
      getStyle:id=>styles.read(id)});
    changedDeck.start('demo',['s01','s02']);
    deck.slides.reverse();
    const rejectedOrder=await untilDone(()=>changedDeck.get('demo'));
    assert.equal(rejectedOrder.status,'failed',JSON.stringify(rejectedOrder));
    assert.match(rejectedOrder.error,/Assembly plan, visual style or scene order changed/);
    assert.equal(accepted.current('demo').release_id,releaseId);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

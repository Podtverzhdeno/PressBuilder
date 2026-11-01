/**
 * P14: real-media A/B of the unchanged full-filter and opt-in incremental
 * hard-cut montage. Objective decoded frames/PCM, not creative judgment.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';
import {styleContractStore} from '../server/style-contract.mjs';

const ready=['ffmpeg','ffprobe'].every(binary=>spawnSync(binary,['-version'],{stdio:'ignore'}).status===0);
function ffmpeg(args,limit=25000){
  const cp=spawnSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error',...args],
    {timeout:limit,maxBuffer:6*1024*1024});
  assert.equal(cp.status,0,String(cp.error?.message||cp.stderr));
  return cp.stdout;
}
function sourceClip(file,color,frequency){
  const args=['-y','-f','lavfi','-i','color=c='+color+':s=320x180:r=24:d=1.5'];
  if(frequency)args.push('-f','lavfi','-i',
    'sine=frequency='+frequency+':sample_rate=48000:duration=1.5');
  args.push('-t','1.5','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p');
  if(frequency)args.push('-c:a','aac','-b:a','160k');
  args.push(file);
  ffmpeg(args);
}
function createFixture(root,incrementalHardCuts){
  const out=path.join(root,'out'),decks=path.join(root,'decks');
  fs.mkdirSync(out,{recursive:true});
  const deck={id:'demo',slides:['s01','s02','s03'].map(id=>({id})),
    format:{height:720,fps:24}};
  const getDeck=()=>deck;
  const style=styleContractStore({root:decks,getDeck});
  const plan=assemblyPlanStore({root:decks,getDeck,getStyle:id=>style.read(id)});
  const service=assemblyService({out,getDeck,
    getPlan:id=>plan.read(id),getStyle:id=>style.read(id),
    getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
    getTask:()=>({status:'done'}),baseUrl:()=> 'https://example.test',
    incrementalHardCuts});
  return {out,service};
}
async function complete(service){
  for(let i=0;i<380;i++){
    const j=service.get('demo');
    if(['completed','failed','cancelled'].includes(j.status))return j;
    await new Promise(r=>setTimeout(r,60));
  }
  throw Error('Montage A/B timed out');
}
const W=64,H=36,BYTES=W*H*3,FPS=24,SAMPLE_RATE=48000;
function rgbFrames(file){
  const data=ffmpeg(['-i',file,'-map','0:v:0','-vf',
    'scale='+W+':'+H+':flags=area,format=rgb24','-pix_fmt','rgb24',
    '-f','rawvideo','pipe:1'],45000);
  assert.equal(data.length%BYTES,0,'Decoded RGB frames truncated');
  return data;
}
function audioPcm(file){
  const data=ffmpeg(['-i',file,'-map','0:a:0','-vn','-ac','1','-ar',
    String(SAMPLE_RATE),'-c:a','pcm_f32le','-f','f32le','pipe:1'],30000);
  assert.equal(data.length%4,0,'Decoded audio samples truncated');
  const values=new Float32Array(data.length/4);
  for(let i=0;i<values.length;i++)values[i]=data.readFloatLE(i*4);
  return values;
}
function maeAt(a,b,index){
  let sum=0;
  const offset=index*BYTES;
  for(let j=0;j<BYTES;j++)sum+=Math.abs(a[offset+j]-b[offset+j]);
  return Number((sum/BYTES).toFixed(3));
}
function rms(samples,t,window=0.085){
  const begin=Math.floor(t*SAMPLE_RATE),end=Math.min(samples.length,
    Math.ceil((t+window)*SAMPLE_RATE));
  assert.ok(begin>=0&&end>begin,'Invalid audio interval');
  let sum=0;
  for(let i=begin;i<end;i++)sum+=samples[i]*samples[i];
  return Math.sqrt(sum/(end-begin));
}
function checkVideoPackets(file){
  const p=spawnSync('ffprobe',['-v','error','-select_streams','v:0',
    '-show_entries','frame=best_effort_timestamp_time',
    '-of','csv=p=0',file],{encoding:'utf8',timeout:15000,maxBuffer:250000});
  assert.equal(p.status,0,p.stderr);
  const times=p.stdout.trim().split(/\s+/).map(Number);
  assert.ok(times.length>=105&&times.length<=110,'Unexpected frame count');
  for(let i=1;i<times.length;i++){
    const gap=times[i]-times[i-1];
    assert.ok(gap>0.038&&gap<0.046,
      'Discontinuous frame PTS around index '+i+': '+gap);
  }
  return times.length;
}
test('P14 A/B: after scene change, fast hard cuts retain source picture, time and audio',{
  skip:!ready,timeout:110000
},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-ab-'));
  const classic=createFixture(path.join(root,'classic'),false),
    fast=createFixture(path.join(root,'fast'),true);
  try{
    for(const [scene,color,tone] of [
      ['s01','red',440],['s02','blue',null],['s03','green',880]]){
      const a=path.join(classic.out,'demo_'+scene+'.mp4');
      sourceClip(a,color,tone);
      fs.copyFileSync(a,path.join(fast.out,path.basename(a)));
    }
    // Warm the source-addressed cache, creating a cold incremental release.
    fast.service.start('demo',['s01','s02','s03']);
    const cold=await complete(fast.service);
    assert.equal(cold.status,'completed',cold.error);
    assert.equal(cold.encode_strategy,'incremental-hardcut-v1',cold.incremental_fallback_reason);
    // Edit only the middle scene, byte-identically for both algorithms.
    const replacement=path.join(classic.out,'demo_s02.mp4');
    sourceClip(replacement,'white',null);
    fs.copyFileSync(replacement,path.join(fast.out,'demo_s02.mp4'));
    classic.service.start('demo',['s01','s02','s03']);
    fast.service.start('demo',['s01','s02','s03']);
    const [baseline,incremental]=await Promise.all([
      complete(classic.service),complete(fast.service)]);
    assert.equal(baseline.status,'completed',baseline.error);
    assert.equal(incremental.status,'completed',incremental.error);
    assert.equal(baseline.encode_strategy,'full-filter');
    assert.equal(incremental.encode_strategy,'incremental-hardcut-v1',
      incremental.incremental_fallback_reason);
    assert.equal(incremental.incremental.segments_reused,2);
    assert.equal(incremental.incremental.segments_encoded,1);
    const classicFile=classic.service.download('demo',baseline.result.release_id),
      fastFile=fast.service.download('demo',incremental.result.release_id);
    const [v1,v2]=[rgbFrames(classicFile),rgbFrames(fastFile)];
    const count1=checkVideoPackets(classicFile),count2=checkVideoPackets(fastFile);
    assert.equal(count1,count2,'Different frame counts after stream-copy');
    assert.equal(v1.length,v2.length,'Decoded video frames diverged');
    assert.equal(count1,v1.length/BYTES);
    assert.equal(count1,108,'Three 1.5-second clips must yield exactly 108 frames');
    const boundaryIndices=[0,1,34,35,36,37,38,70,71,72,73,74,106,107];
    const pixelErrors=boundaryIndices.map(i=>maeAt(v1,v2,i));
    const peak=Math.max(...pixelErrors);
    assert.ok(peak<15,'A/B decoded video diverged at a cut: '+JSON.stringify({peak,pixelErrors}));
    const [a1,a2]=[audioPcm(classicFile),audioPcm(fastFile)];
    assert.ok(Math.abs(a1.length-a2.length)<=0.08*SAMPLE_RATE,
      'Audio lengths diverge by >80 ms');
    assert.ok(Math.abs(a2.length/SAMPLE_RATE-4.5)<=0.09,
      'Incremental audio duration inconsistent with target');
    // Decode audio on both sides of both joins, and within the silent scene.
    const points=[0.5,1.34,1.56,2.3,2.85,3.10,4.05];
    const audioChecks=points.map(t=>({
      t,classic_rms:Number(rms(a1,t).toFixed(6)),
      fast_rms:Number(rms(a2,t).toFixed(6))
    }));
    for(const x of audioChecks)
      assert.ok(Math.abs(x.fast_rms-x.classic_rms)<0.035,
        'A/B loudness mismatch: '+JSON.stringify(x));
    for(const t of [1.56,2.3,2.85])
      assert.ok(rms(a2,t)<0.01,'Silence in scene 2 became audible: '+t);
    for(const t of [0.5,1.34,3.10,4.05])
      assert.ok(rms(a2,t)>0.025,'Expected tone missing: '+t);
    const report={
      scenario:'3x1.5s,24fps,720p,color/sine/silence,changed middle scene',
      frame_count:count2,
      boundary_video_mae_peak:peak,
      boundary_video_mae_mean:Number((pixelErrors.reduce((a,b)=>a+b,0)/pixelErrors.length).toFixed(3)),
      max_rms_delta:Number(Math.max(...audioChecks.map(x=>Math.abs(x.fast_rms-x.classic_rms))).toFixed(6)),
      audio_duration_delta_ms:Number((Math.abs(a1.length-a2.length)/SAMPLE_RATE*1000).toFixed(2)),
      classic_encode_ms:baseline.timings_ms.encode,
      incremental_encode_ms:incremental.timings_ms.encode,
      reused_segments:incremental.incremental.segments_reused
    };
    console.log('P14_MONTAGE_AB_QUALITY '+JSON.stringify(report));
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

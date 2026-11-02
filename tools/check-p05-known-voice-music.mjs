#!/usr/bin/env node
/** M58-R15: two *actual* P05 assemblies on synthetic, known audio stems.
 * A 110Hz background bed and 440Hz voice-surrogate are deliberately
 * controlled: we can check preservation of the source's intended mix.
 * This does NOT analyze real speech or approve commercial media.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';
import {styleContractStore} from '../server/style-contract.mjs';
import {inspectMp4} from '../server/video-qa.mjs';
import {analyzeKnownVoiceMusicPcm}
  from '../server/release-known-voice-music-qc.mjs';
import {analyzeOfflineSpokenVoicePcm}
  from '../server/release-offline-speech-qc.mjs';
import {createOfflineSpokenWav} from './probe-offline-speech.mjs';

const RATE=48000,SEC=3,IDS=['s01','s02','s03','s04','s05','s06'];
const PROJECT='m58-voice-music';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const nap=ms=>new Promise(ok=>setTimeout(ok,ms));
export function generateKnownVoiceMusicPcm({sceneIndex,missingVoice=false,
  unducked=false,spokenPcm=null}={}){
  if(!Number.isSafeInteger(sceneIndex)||sceneIndex<0||sceneIndex>5||
     typeof missingVoice!=='boolean'||typeof unducked!=='boolean'||
     (spokenPcm!==null&&(!Buffer.isBuffer(spokenPcm)||
       spokenPcm.length%4!==0||spokenPcm.length>5*RATE*4)))
    fail('M58_STEM_FIXTURE_POLICY_INVALID');
  const voice=[1,4].includes(sceneIndex)&&!missingVoice;
  const musicLevel=[1,4].includes(sceneIndex)&&!unducked?0.04:0.14;
  let spokenPeak=1;
  if(spokenPcm){
    spokenPeak=0;
    for(let pos=0;pos<spokenPcm.length;pos+=2)
      spokenPeak=Math.max(spokenPeak,Math.abs(spokenPcm.readInt16LE(pos)));
    if(spokenPeak<100)fail('M58_STEM_NATIVE_SPEECH_SILENT');
  }
  const b=Buffer.alloc(RATE*SEC*4);
  for(let frame=0;frame<RATE*SEC;frame++){
    const time=frame/RATE;
    const music=musicLevel*Math.sin(2*Math.PI*110*time);
    // 440Hz tone is a known synthetic VOICE SURROGATE, not actual speech.
    let spoken=voice?0.15*Math.sin(2*Math.PI*440*time):0;
    if(voice&&spokenPcm){
      const index=frame-Math.round(0.2*RATE);
      spoken=index>=0&&index<spokenPcm.length/4?
        .23*spokenPcm.readInt16LE(index*4)/spokenPeak:0;
    }
    const value=Math.round((music+spoken)*32767);
    b.writeInt16LE(value,frame*4);
    b.writeInt16LE(value,frame*4+2);
  }
  return b;
}
function encodeFile(out,index,options={}){
  const pcm=path.join(out,PROJECT+'_'+IDS[index]+'.pcm');
  const mp4=path.join(out,PROJECT+'_'+IDS[index]+'.mp4');
  fs.writeFileSync(pcm,generateKnownVoiceMusicPcm({sceneIndex:index,...options}));
  const result=spawnSync('ffmpeg',[
    '-hide_banner','-nostdin','-loglevel','error','-y',
    '-f','s16le','-ar','48000','-ac','2','-i',pcm,
    '-f','lavfi','-i',
    'testsrc2=size=160x90:rate='+(index%2===0?24:30)+':duration=3',
    '-map','1:v:0','-map','0:a:0','-t','3',
    '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','160k',mp4,
  ],{encoding:'utf8',timeout:40000,maxBuffer:131072,
    shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  if(result.error||result.status!==0||result.signal)
    fail('M58_STEM_FIXTURE_ENCODE_FAILED');
  fs.rmSync(pcm);
  return sha(mp4);
}
export function inspectKnownVoiceMusicMaster(file,{voiceSource='tone'}={}){
  const result=spawnSync('ffmpeg',[
    '-hide_banner','-nostats','-nostdin','-loglevel','error',
    '-xerror','-err_detect','explode','-i',file,
    '-map','0:a:0','-vn','-ac','2','-ar','48000',
    '-c:a','pcm_s16le','-f','s16le','-',
  ],{encoding:null,timeout:90000,maxBuffer:22*1024*1024,
    windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  if(result.error||result.status!==0||result.signal||
     !Buffer.isBuffer(result.stdout))
    fail('M58_STEM_FFMPEG_DECODE_FAILED');
  if(voiceSource==='tone')return analyzeKnownVoiceMusicPcm(result.stdout);
  if(voiceSource==='offline-speech')return analyzeOfflineSpokenVoicePcm(result.stdout);
  fail('M58_STEM_VOICE_SOURCE_INVALID');
}
async function completed(service){
  for(let i=0;i<600;i++){
    const job=service.get(PROJECT);
    if(['completed','failed','cancelled'].includes(job.status))
      return job;
    await nap(100);
  }
  fail('M58_STEM_P05_TIMEOUT');
}
export async function checkP05KnownVoiceMusic({voiceSource='tone'}={}){
  if(!['tone','offline-speech'].includes(voiceSource))
    fail('M58_STEM_VOICE_SOURCE_INVALID');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-stems-'));
  const out=path.join(root,'out'),decks=path.join(root,'decks');
  const deck={id:PROJECT,slides:IDS.map(id=>({id})),
    format:{height:720,fps:24}};
  fs.mkdirSync(out,{recursive:true});
  try{
    let spokenPcm=null,speechEngine=null;
    if(voiceSource==='offline-speech'){
      const wav=path.join(root,'original-spoken-words.wav');
      speechEngine=createOfflineSpokenWav(wav).engine;
      const result=spawnSync('ffmpeg',[
        '-hide_banner','-nostdin','-loglevel','error',
        '-i',wav,'-ac','2','-ar','48000',
        '-c:a','pcm_s16le','-f','s16le','-',
      ],{encoding:null,timeout:30000,maxBuffer:5*RATE*4,
        windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
      if(result.error||result.status!==0||!Buffer.isBuffer(result.stdout)||
         result.stdout.length<4000)fail('M58_STEM_NATIVE_SPEECH_DECODE_FAILED');
      spokenPcm=result.stdout;
    }
    const hashes=IDS.map((_,index)=>encodeFile(out,index,{spokenPcm}));
    const styles=styleContractStore({root:decks,getDeck:()=>deck});
    const plans=assemblyPlanStore({
      root:decks,getDeck:()=>deck,getStyle:()=>styles.read(PROJECT),
    });
    const rec=plans.read(PROJECT),plan=structuredClone(rec.plan);
    for(const index of [0,2,4])
      plan.scenes[index].transition_after={type:'crossfade',duration:0.3};
    plans.put(PROJECT,plan,rec.revision);
    const assembler=assemblyService({
      out,getDeck:()=>deck,getPlan:()=>plans.read(PROJECT),
      getStyle:()=>styles.read(PROJECT),
      getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
      getTask:()=>({status:'done'}),
      baseUrl:()=> 'https://local.invalid',
      incrementalHardCuts:false,benchmarkFfmpeg:true,
    });
    const cases=[];
    for(const label of ['normal','missing-voice-s05']){
      if(label==='missing-voice-s05'){
        const old=hashes[4];
        hashes[4]=encodeFile(out,4,{missingVoice:true,spokenPcm});
        if(hashes[4]===old)fail('M58_STEM_EXPECTED_CHANGE_MISSING');
      }
      assembler.start(PROJECT,IDS,{force:true});
      const job=await completed(assembler);
      if(job.status!=='completed'||job.cache_hit||
         job.encode_strategy!=='full-filter'||
         job.manifest?.scenes?.length!==6)
        fail('M58_STEM_P05_ASSEMBLY_FAILED');
      if(!job.manifest.scenes.every((s,i)=>s.sha256===hashes[i]))
        fail('M58_STEM_P05_SOURCE_SHA_MISMATCH');
      if(job.manifest.output?.qa?.verdict!=='PASS')
        fail('M58_STEM_P05_OUTPUT_QA_FAILED');
      const file=assembler.download(PROJECT,job.result.release_id);
      const qa=inspectMp4(file,{
        height:720,fps:24,audio_required:true,duration:17.1,
      });
      if(qa.verdict!=='PASS')fail('M58_STEM_P05_MP4_QA_FAILED');
      const measured=inspectKnownVoiceMusicMaster(file,{voiceSource});
      if(label==='normal'&&measured.manual_audio_review_required)
        fail('M58_STEM_P05_NORMAL_FALSE_REVIEW');
      if(label==='missing-voice-s05'&&
         !measured.issues.some(x=>x.scene_id==='s05'&&
           x.code===(voiceSource==='tone'?'VOICE_SURROGATE_MISSING':
             'SPOKEN_WORD_ENERGY_MISSING')))
        fail('M58_STEM_P05_FAILED_TO_FLAG_MISSING_VOICE');
      cases.push({
        label,release_id:job.result.release_id,
        master_sha256:job.manifest.output.sha256,
        audio_qc:measured,output_qa_verdict:qa.verdict,
        original_source_sha256:[...hashes],
      });
    }
    if(cases[0].release_id===cases[1].release_id)
      fail('M58_STEM_P05_REUSED_RELEASE');
    return {
      scope:voiceSource==='offline-speech'?
        'CONTROLLED_REAL_P05_AAC_OFFLINE_SPOKEN_WORDS_E2E':
        'CONTROLLED_REAL_P05_AAC_MUSIC_VOICE_SURROGATE_E2E',
      status:'TWO_REAL_P05_SYNTHETIC_RELEASES_VERIFIED',
      six_source_mp4s:true,unique_release_count:2,
      source_changed_only_scene:'s05',
      voice_source:voiceSource,
      original_spoken_words_engine:speechEngine,
      normal_review:false,missing_voice_review:true,
      cases,may_publish:false,may_deploy:false,
      caveat:voiceSource==='offline-speech'?
        'Generated music with locally synthesized original spoken words. Energy-presence checks cannot verify transcript, intelligibility, voice timbre, actual music stem or human editorial quality. No real licensed user recordings or production approvals.':
        'Generated music and voice-like tones, NOT real music, intelligible human speech or creative quality. Release approvals, production measurements and source licenses remain unverified.',
    };
  }finally{
    fs.rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
}
async function main(args){
  if(args.length===1&&args[0]==='--help'){
    process.stdout.write('Usage: node tools/check-p05-known-voice-music.mjs [--offline-speech]\n');
    return 0;
  }
  if(args.length>1||(args.length===1&&args[0]!=='--offline-speech')){
    process.stderr.write('M58_STEM_CLI_USAGE_INVALID\n');
    return 1;
  }
  try{
    process.stdout.write(JSON.stringify(await checkP05KnownVoiceMusic({voiceSource:args.length?'offline-speech':'tone'}),null,2)+'\n');
    return 0;
  }catch(e){
    process.stderr.write('M58_STEM_E2E_FAILED '+String(e?.message).slice(0,180)+'\n');
    return 2;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  process.exitCode=await main(process.argv.slice(2));

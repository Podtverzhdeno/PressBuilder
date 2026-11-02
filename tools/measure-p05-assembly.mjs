#!/usr/bin/env node
/**
 * M58-R09: 5+ full P05 six-scene assembly trials (non-production).
 * Six real H264/AAC clips are generated once, then P05's actual assembler
 * is forced to encode a NEW immutable release for EACH measured trial.
 * No existing projects, credentials, network, or real production releases.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';
import {styleContractStore} from '../server/style-contract.mjs';
import {inspectMp4} from '../server/video-qa.mjs';
import {summarizeFfmpegTrialSamples} from '../server/release-performance-samples.mjs';
import {inspectP05CrossfadeAudioMp4} from '../server/release-crossfade-audio-qc.mjs';

const projectId='m58-p05-benchmark';
const colors=['red','green','blue','yellow','magenta','cyan'];
const ids=colors.map((_,i)=>'s0'+(i+1));
const command=(binary,args,timeout=30000)=>{
  const r=spawnSync(binary,args,{encoding:'utf8',timeout,maxBuffer:131072,
    windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  if(r.error||r.status!==0||r.signal)
    throw new Error('BENCH_FFMPEG_STEP_FAILED: '+binary);
};
const round=n=>Number(n.toFixed(3));
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
async function untilDone(get){
  for(let i=0;i<600;i++){
    const job=get();
    if(['completed','cancelled','failed'].includes(job.status))return job;
    await sleep(100);
  }
  throw new Error('M58_P05_BENCH_ASSEMBLY_TIMEOUT');
}
function parse(args){
  if(args.length===1&&['--help','-h'].includes(args[0]))return {help:true};
  if(args.length===0)return {count:5};
  if(args.length===1&&/^--samples=(?:[5-9]|10)$/.test(args[0]))
    return {count:Number(args[0].split('=')[1])};
  return null;
}
export async function measureSixSceneP05({count=5,durationSec=0.75,
  transition='hard-cut',height=720}={}){
  if(!Number.isSafeInteger(count)||count<5||count>10)
    throw new Error('M58_P05_BENCH_SAMPLE_LIMIT');
  if(![0.75,3,4,5,6,7].includes(durationSec)||
     !['hard-cut','crossfade'].includes(transition)||
     ![720,1080].includes(height))
    throw new Error('M58_P05_BENCH_PROFILE_INVALID');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-p05-bench-'));
  const out=path.join(root,'out'),decks=path.join(root,'decks');
  const deck={id:projectId,slides:ids.map(id=>({id})),
    format:{height,fps:24}};
  const getDeck=()=>deck;
  fs.mkdirSync(out,{recursive:true});
  try{
    // Different FPS, some clips without original audio: exercises real P05
    // normalization and synthetic silence injection. Fixtures excluded from
    // measured P05 wall time, reported separately.
    const fixtureStarted=performance.now();
    const inputHashes=[];
    for(let i=0;i<6;i++){
      const file=path.join(out,projectId+'_'+ids[i]+'.mp4');
      const visual=durationSec===0.75?
        'color=c='+colors[i]+':s=160x90:r='+(i%2===0?'24':'30')+':d=0.75':
        'testsrc2=size=320x180:rate='+(i%2===0?'24':'30')+
          ':duration='+durationSec;
      const args=['-hide_banner','-nostdin','-loglevel','error','-y',
        '-f','lavfi','-i',visual];
      if(i%2===0)args.push('-f','lavfi','-i',
        'sine=frequency='+(500+i*50)+':sample_rate=48000:duration='+durationSec);
      args.push('-t',String(durationSec),'-c:v','libx264','-preset','ultrafast',
        '-pix_fmt','yuv420p');
      if(i%2===0)args.push('-c:a','aac','-b:a','96k');
      else args.push('-an');
      args.push(file);
      command('ffmpeg',args);
      inputHashes.push(createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    }
    const inputFingerprint=createHash('sha256').update(JSON.stringify(inputHashes)).digest('hex');
    const fixtureGenerationMs=round(performance.now()-fixtureStarted);
    const styles=styleContractStore({root:decks,getDeck});
    const plans=assemblyPlanStore({root:decks,getDeck,getStyle:id=>styles.read(id)});
    const crossfadeEdges=transition==='crossfade'?[0,2,4]:[];
    if(crossfadeEdges.length){
      const record=plans.read(projectId);
      const plan=structuredClone(record.plan);
      for(const edge of crossfadeEdges)
        plan.scenes[edge].transition_after={type:'crossfade',duration:0.3};
      plans.put(projectId,plan,record.revision);
    }
    const expectedDuration=6*durationSec-crossfadeEdges.length*0.3;
    const assembler=assemblyService({
      out,getDeck,getPlan:id=>plans.read(id),getStyle:id=>styles.read(id),
      getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
      getTask:()=>({status:'done'}),baseUrl:()=> 'https://local.example.invalid',
      benchmarkFfmpeg:true,incrementalHardCuts:false,
    });
    const raw=[],trials=[],seen=new Set();
    for(let n=0;n<count;n++){
      const started=performance.now();
      const startedJob=assembler.start(projectId,ids,{force:true});
      if(startedJob.cache_hit===true)
        throw new Error('M58_P05_BENCH_CACHE_BYPASS');
      const job=await untilDone(()=>assembler.get(projectId));
      if(job.status!=='completed')
        throw new Error('M58_P05_BENCH_ASSEMBLY_FAILED: '+String(job.error).slice(0,160));
      if(job.cache_hit===true||job.encode_strategy!=='full-filter')
        throw new Error('M58_P05_BENCH_UNEXPECTED_ENCODER');
      const elapsed=round(performance.now()-started);
      const release=job.result?.release_id;
      if(typeof release!=='string'||seen.has(release))
        throw new Error('M58_P05_BENCH_RELEASE_REUSED');
      seen.add(release);
      if(job.manifest?.scenes?.length!==6||job.manifest.output.qa?.verdict!=='PASS')
        throw new Error('M58_P05_BENCH_QA_MISSING');
      const file=assembler.download(projectId,release);
      const qa=inspectMp4(file,{height,fps:24,audio_required:true,
        duration:expectedDuration});
      if(qa.verdict!=='PASS')throw new Error('M58_P05_BENCH_OUTPUT_QA_FAILED');
      // Independent, read-only crossfade QC runs OUTSIDE timed P05 wall time.
      const crossfadeAudio=transition==='crossfade'?
        inspectP05CrossfadeAudioMp4(file,{sceneDurationSec:durationSec}):null;
      const encode=job.timings_ms?.encode;
      if(!Number.isFinite(encode)||encode<=0||encode>elapsed+200)
        throw new Error('M58_P05_BENCH_ENCODE_TIMING_INVALID');
      const memory=job.ffmpeg_benchmark?.max_rss_kib;
      const rss=Number.isSafeInteger(memory)&&memory>0?memory:null;
      raw.push({wall_ms:elapsed,child_maxrss_kib:rss});
      trials.push({trial:n+1,p05_wall_ms:elapsed,p05_encode_ms:encode,
        p05_qa_ms:job.timings_ms.qa,
        ffmpeg_child_wall_ms:job.ffmpeg_benchmark?.wall_ms??null,
        ffmpeg_child_cpu_user_ms:job.ffmpeg_benchmark?.cpu_user_ms??null,
        ffmpeg_child_cpu_system_ms:job.ffmpeg_benchmark?.cpu_system_ms??null,
        ffmpeg_child_maxrss_kib:rss,
        output_bytes:job.manifest.output.bytes,
        output_sha256:job.manifest.output.sha256,
        qa_verdict:qa.verdict,cache_hit:false,
        crossfade_audio:crossfadeAudio});
    }
    const summary=summarizeFfmpegTrialSamples(raw);
    const encodes=trials.map(t=>t.p05_encode_ms).sort((a,b)=>a-b);
    return {
      ...summary,
      scope:'SIX_SCENE_SYNTHETIC_REAL_P05_FULL_ASSEMBLY',
      status:'LOCAL_P05_MEASUREMENT_NOT_PRODUCTION_SLO',
      fixture_generation_ms:fixtureGenerationMs,
      project_fixture:durationSec===0.75?
        'six_generated_color_scenes_mixed_fps_aac_silence':
        'six_generated_animated_testsrc2_scenes_mixed_fps_aac_silence',
      input_fingerprint_sha256:inputFingerprint,
      input_sha256:inputHashes,
      scene_duration_sec:durationSec,
      total_output_duration_sec:expectedDuration,
      transition_profile:transition,
      crossfade_count:crossfadeEdges.length,
      crossfade_duration_sec:0.3,
      height,fps:24,
      p50_encode_ms:encodes[Math.ceil(encodes.length*0.5)-1],
      p95_encode_ms:encodes[Math.ceil(encodes.length*0.95)-1],
      unique_release_count:seen.size,
      all_trials_forced_full_encode:true,
      all_output_qa_passed:true,
      crossfade_audio_review_required:transition==='crossfade'?
        trials.some(t=>t.crossfade_audio?.manual_audio_review_required):null,
      crossfade_audio_review_trial_count:transition==='crossfade'?
        trials.filter(t=>t.crossfade_audio?.manual_audio_review_required).length:null,
      trials,
      cloud_cost_usd:null,production_p95_ms:null,baseline_ratio:null,
      may_publish:false,may_deploy:false,
      caveat:'Measured actual local P05 six-scene montage encode, source snapshot, QA and release writes on temporary generated MP4. Crossfade PCM QC (when enabled) is post-timing review-only. No browser/Chromium scene render, real licensed footage, production workers, cloud invoice, representative baseline or release SLO.',
    };
  }finally{
    fs.rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
}
async function main(args){
  const parsed=parse(args);
  if(parsed?.help){
    process.stdout.write('Usage: node tools/measure-p05-assembly.mjs [--samples=5..10]\n');
    return 0;
  }
  if(!parsed){process.stderr.write('M58_P05_BENCH_USAGE_INVALID\n');return 1}
  try{
    const result=await measureSixSceneP05(parsed);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return 0;
  }catch(error){
    process.stderr.write('M58_P05_BENCH_FAILED '+String(error?.message??'unknown').slice(0,200)+'\n');
    return 2;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.exitCode=await main(process.argv.slice(2));
}

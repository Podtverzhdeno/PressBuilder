#!/usr/bin/env node
/**
 * M58-R11: controlled six-scene P13 incremental-update versus full P05 rerender.
 * Every trial updates only scene s03 in a fresh, temporary synthetic project.
 * Validates exact source hashes and MP4 QA for both strategies. No prod paths.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';
import {styleContractStore} from '../server/style-contract.mjs';
import {inspectMp4} from '../server/video-qa.mjs';
import {summarizeFfmpegTrialSamples} from '../server/release-performance-samples.mjs';
import {parseFrameSsimStats,summarizeSeamFrameSsim} from '../server/release-seam-ssim.mjs';
import {measurePcmSeamWindows,comparePcmCutSeams} from '../server/release-audio-seam-qc.mjs';

const ID='m58-p13-comparison',SIDS=['s01','s02','s03','s04','s05','s06'];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hashFile=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const round=n=>Number(n.toFixed(3));
const error=message=>new Error('M58_P13_COMPARE_'+message);
const assert=(value,reason)=>{if(!value)throw error(reason)};
const command=args=>{
  const r=spawnSync('ffmpeg',[
    '-hide_banner','-nostdin','-loglevel','error','-y',...args,
  ],{encoding:'utf8',timeout:40000,maxBuffer:128*1024,
     windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  if(r.error||r.status!==0||r.signal)throw error('FFMPEG_SOURCE_FAILED');
};
async function done(service){
  for(let n=0;n<900;n++){
    const j=service.get(ID);
    if(['completed','failed','cancelled'].includes(j.status))return j;
    await pause(80);
  }
  throw error('ASSEMBLY_TIMEOUT');
}
function makeScene(out,index,variant,durationSec){
  const frameRate=index%2===0?24:30;
  const visual='testsrc2=size=320x180:rate='+frameRate+
    ':duration='+durationSec;
  const args=['-f','lavfi','-i',visual];
  if(index%2===0){
    args.push('-f','lavfi','-i','sine=frequency='+(420+index*70+variant*22)+
      ':sample_rate=48000:duration='+durationSec);
  }
  // Variant tints only the edited scene. Other five sources never change.
  args.push('-vf','hue=h='+String(variant*28)+':s=1','-t',String(durationSec),
    '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p');
  if(index%2===0)args.push('-c:a','aac','-b:a','96k');
  else args.push('-an');
  const file=path.join(out,ID+'_'+SIDS[index]+'.mp4');
  command([...args,file]);
  return hashFile(file);
}
function verified(service,job,expected,profile,durationSec){
  assert(job.status==='completed','ASSEMBLY_FAILED_'+String(job.error??'').slice(0,90));
  assert(job.cache_hit!==true,'UNEXPECTED_FULL_RELEASE_CACHE_HIT');
  assert(job.encode_strategy===profile,'WRONG_ENCODER_'+job.encode_strategy);
  assert(job.manifest?.scenes?.length===6,'INVALID_MANIFEST');
  for(let i=0;i<6;i++)
    assert(job.manifest.scenes[i].sha256===expected[i],'SOURCE_SHA_MISMATCH');
  assert(job.manifest.output?.qa?.verdict==='PASS','RELEASE_QA_FAILED');
  const file=service.download(ID,job.result.release_id);
  const qa=inspectMp4(file,{height:720,fps:24,
    duration:durationSec*6,audio_required:true});
  assert(qa.verdict==='PASS','INDEPENDENT_MP4_QA_FAILED');
  return {sha:job.manifest.output.sha256,bytes:job.manifest.output.bytes,
    release_id:job.result.release_id};
}
/** Independent decoded-video similarity. SSIM is not artistic approval. */
export function parseFfmpegSsim(stderr){
  if(typeof stderr!=='string'||stderr.length>262144)return null;
  const matches=[...stderr.matchAll(/SSIM Y:[^\r\n]* U:[^\r\n]* V:[^\r\n]* All:([0-9]+(?:\.[0-9]+)?)/g)];
  if(matches.length!==1)return null;
  const score=Number(matches[0][1]);
  return Number.isFinite(score)&&score>=0&&score<=1?
    Number(score.toFixed(6)):null;
}
export function compareVideoSimilarity(left,right,{durationSec=3}={}){
  const process=spawnSync('ffmpeg',[
    '-hide_banner','-nostats','-nostdin','-loglevel','info',
    '-i',left,'-i',right,
    '-filter_complex','[0:v:0][1:v:0]ssim=stats_file=-',
    '-an','-f','null','-',
  ],{encoding:'utf8',timeout:90000,maxBuffer:262144,
    windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
  if(process.error||process.status!==0||process.signal)
    throw error('SSIM_COMPARE_FAILED');
  const score=parseFfmpegSsim(process.stderr);
  if(score===null)throw error('SSIM_RESULT_MISSING');
  const frameScores=parseFrameSsimStats(process.stdout,{
    expectedFrames:6*durationSec*24,
  });
  const seam=summarizeSeamFrameSsim(frameScores,{
    fps:24,sceneCount:6,sceneDurationSec:durationSec,
  });
  return {overall:ssimRound(score),seam};
}
const ssimRound=n=>Number(n.toFixed(6));
/** Exact 48kHz stereo decoding, bounded in-memory, no side effects. */
export function measureAudioVideoSeams(incrementalMp4,fullMp4,{durationSec=3}={}){
  if(![3,4,5,6,7].includes(durationSec))
    throw error('AUDIO_SEAM_PROFILE_INVALID');
  const decode=file=>{
    const r=spawnSync('ffmpeg',[
      '-hide_banner','-nostats','-nostdin','-loglevel','error',
      '-xerror','-err_detect','explode','-i',file,
      '-map','0:a:0','-vn','-ac','2','-ar','48000',
      '-c:a','pcm_s16le','-f','s16le','-',
    ],{encoding:null,timeout:90000,maxBuffer:22*1024*1024,
       windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    if(r.error||r.status!==0||r.signal||!Buffer.isBuffer(r.stdout))
      throw error('AUDIO_SEAM_DECODE_FAILED');
    return measurePcmSeamWindows(r.stdout,{sceneDurationSec:durationSec});
  };
  // No production render mutation; compare both immutable MP4 release paths.
  return comparePcmCutSeams(decode(incrementalMp4),decode(fullMp4));
}
const sample=(job,wallMs,strategy)=>({
  wall_ms:round(wallMs),
  child_maxrss_kib:strategy==='incremental-hardcut-v1'?
    (job.incremental?.ffmpeg_benchmark?.peak_single_process_rss_kib??null):
    (job.ffmpeg_benchmark?.max_rss_kib??null),
});
export async function compareP13SingleSceneUpdate({
  cycles=5,durationSec=3,
}={}){
  if(!Number.isSafeInteger(cycles)||cycles!==5||
     ![3,4,5,6,7].includes(durationSec))
    throw error('POLICY_INVALID');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-p13-'));
  const out=path.join(root,'out'),decks=path.join(root,'decks');
  const deck={id:ID,slides:SIDS.map(id=>({id})),
    format:{height:720,fps:24}};
  const getDeck=()=>deck;
  fs.mkdirSync(out,{recursive:true});
  try{
    const inputHashes=SIDS.map((_,i)=>makeScene(out,i,0,durationSec));
    const initialUnchangedHashes=inputHashes.filter((_,i)=>i!==2);
    const style=styleContractStore({root:decks,getDeck});
    const plans=assemblyPlanStore({root:decks,getDeck,
      getStyle:id=>style.read(id)});
    const service=assemblyService({
      out,getDeck,getPlan:id=>plans.read(id),getStyle:id=>style.read(id),
      getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
      getTask:()=>({status:'done'}),
      baseUrl:()=> 'https://localhost.invalid',
      incrementalHardCuts:true,benchmarkFfmpeg:true,
    });
    const warmStart=performance.now();
    service.start(ID,SIDS);
    const warm=await done(service);
    const warmWallMs=round(performance.now()-warmStart);
    const warmRelease=verified(service,warm,inputHashes,
      'incremental-hardcut-v1',durationSec);
    assert(warm.incremental.segments_encoded===6&&
      warm.incremental.segments_reused===0,'COLD_CACHE_NOT_CREATED');
    const fresh=[],full=[],trials=[],seen=new Set([warmRelease.release_id]);
    for(let cycle=1;cycle<=cycles;cycle++){
      const oldSha=inputHashes[2];
      inputHashes[2]=makeScene(out,2,cycle,durationSec);
      assert(inputHashes[2]!==oldSha,'CHANGED_SCENE_SHA_UNCHANGED');
      assert(JSON.stringify(initialUnchangedHashes)===
        JSON.stringify(inputHashes.filter((_,i)=>i!==2)),
      'UNMODIFIED_SOURCE_CHANGED');
      const begin=performance.now();
      service.start(ID,SIDS);
      const delta=await done(service);
      const deltaMs=performance.now()-begin;
      const incRelease=verified(service,delta,inputHashes,
        'incremental-hardcut-v1',durationSec);
      assert(delta.incremental.segments_reused===5&&
        delta.incremental.segments_encoded===1,
      'REUSE_NOT_EXACTLY_FIVE');
      assert(!seen.has(incRelease.release_id),'RELEASE_ID_REUSED');
      seen.add(incRelease.release_id);
      // Same exact inputs, but force:true explicitly disables P13 optimization.
      const fullBegin=performance.now();
      service.start(ID,SIDS,{force:true});
      const rebuilt=await done(service);
      const fullMs=performance.now()-fullBegin;
      const fullRelease=verified(service,rebuilt,inputHashes,
        'full-filter',durationSec);
      assert(!seen.has(fullRelease.release_id),'RELEASE_ID_REUSED');
      seen.add(fullRelease.release_id);
      // Compare decoded video after both timed jobs; similarity overhead
      // is deliberately excluded from P05 assembly latency samples.
      const incrementalMp4=service.download(ID,incRelease.release_id);
      const fullMp4=service.download(ID,fullRelease.release_id);
      const videoQuality=compareVideoSimilarity(
        incrementalMp4,fullMp4,{durationSec});
      const audioQuality=measureAudioVideoSeams(
        incrementalMp4,fullMp4,{durationSec});
      fresh.push(sample(delta,deltaMs,'incremental-hardcut-v1'));
      full.push(sample(rebuilt,fullMs,'full-filter'));
      trials.push({trial:cycle,updated_scene:'s03',
        video_ssim_all:videoQuality.overall,
        video_ssim_seams:videoQuality.seam,
        audio_seams:audioQuality,
        unchanged_source_count:5,segments_reused:5,segments_encoded:1,
        incremental_wall_ms:round(deltaMs),full_wall_ms:round(fullMs),
        incremental_output_sha256:incRelease.sha,
        full_output_sha256:fullRelease.sha,
        incremental_output_bytes:incRelease.bytes,
        full_output_bytes:fullRelease.bytes,
        source_sha256:inputHashes[2],
        both_outputs_qa_passed:true,
        incremental_strategy:'incremental-hardcut-v1',
        full_strategy:'full-filter',
      });
    }
    const incremental=summarizeFfmpegTrialSamples(fresh);
    const baseline=summarizeFfmpegTrialSamples(full);
    incremental.scope='SIX_SCENE_P13_INCREMENTAL_P05_WALL_TIME';
    baseline.scope='SIX_SCENE_P05_FORCED_FULL_WALL_TIME';
    incremental.caveat='5 actual P05/P13 six-scene incremental wall-time samples; not production workload.';
    baseline.caveat='5 actual P05 forced full-filter six-scene wall-time samples; not production workload.';
    const minVideoSsim=Math.min(...trials.map(t=>t.video_ssim_all));
    const minSeamSsim=Math.min(...trials.map(t=>t.video_ssim_seams.min_seam_window_ssim));
    const seamReview=trials.some(t=>t.video_ssim_seams.manual_visual_review_required);
    const audioReview=trials.some(t=>t.audio_seams.manual_audio_review_required);
    return {
      schema_version:1,
      scope:'SIX_SCENE_SYNTHETIC_P13_SINGLE_SCENE_EDIT_BENCHMARK',
      status:'MEASURED_LOCAL_NONPRODUCTION_COMPARISON',
      scene_count:6,scene_duration_sec:durationSec,edited_scene:'s03',
      fixture_source:'six_animated_h264_aac_mixed_fps',
      samples_per_profile:cycles,
      baseline_full_filter:baseline,
      optimized_incremental:incremental,
      warmup_wall_ms:warmWallMs,
      distinct_immutable_releases:seen.size,
      source_fingerprint_sha256:createHash('sha256').
        update(JSON.stringify(initialUnchangedHashes)).digest('hex'),
      p95_incremental_to_full_ratio:round(
        incremental.p95_wall_ms/baseline.p95_wall_ms),
      min_video_ssim_all:minVideoSsim,
      min_seam_window_ssim:minSeamSsim,
      cut_seam_review_required:seamReview,
      video_ssim_measurement:'DECODED_FRAME_SSIM_AND_FIVE_P05_CUT_WINDOWS',
      manual_visual_comparison_required:minVideoSsim<0.95||seamReview,
      manual_audio_review_required:audioReview,
      audio_cut_review_trial_count:trials.filter(
        t=>t.audio_seams.manual_audio_review_required).length,
      audio_cut_measurement:'RELATIVE_48K_PCM_CLICK_DROPOUT_AND_TIMELINE',
      trials,
      production_p95_ms:null,cloud_cost_usd:null,
      baseline_slo_accepted:false,may_publish:false,may_deploy:false,
      caveat:'Sequential local synthetic 720p P05 comparison. Incremental runs precede forced full runs; scheduling, thermal and storage caches can confound ratios. QA checks format and SHA provenance; decoded-video global/cut SSIM and relative PCM seam metrics are technical diagnostics, not perceptual equivalence or rights approval. No source rights, real agent render, production representative SLO, or deployment.',
    };
  }finally{fs.rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
}
function parse(args){
  if(args.length===1&&['--help','-h'].includes(args[0]))return {help:true};
  if(args.length===0)return {durationSec:3};
  if(args.length===1&&/^--seconds=[3-7]$/.test(args[0]))
    return {durationSec:Number(args[0].slice('--seconds='.length))};
  return null;
}
async function main(args){
  const options=parse(args);
  if(options?.help){
    process.stdout.write('Usage: node tools/compare-p13-single-edit.mjs [--seconds=3..7]\n');
    return 0;
  }
  if(!options){process.stderr.write('M58_P13_COMPARE_USAGE_INVALID\n');return 1}
  try{
    process.stdout.write(JSON.stringify(
      await compareP13SingleSceneUpdate(options),null,2)+'\n');
    return 0;
  }catch(e){
    process.stderr.write(String(e?.message??'M58_P13_COMPARE_FAILED').slice(0,180)+'\n');
    return 2;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  process.exitCode=await main(process.argv.slice(2));

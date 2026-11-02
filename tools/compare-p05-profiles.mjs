#!/usr/bin/env node
/** M58-R10: apples-to-apples local P05 profiles, never a production SLO.
 * Six real animated MP4 scenes (3–7s); comparison does not claim causality.
 * Independent hard-cut and crossfade scenarios run in isolated temp roots.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {measureSixSceneP05} from './measure-p05-assembly.mjs';

const round=x=>Number(x.toFixed(4));
const fail=(code)=>{throw Object.assign(new Error(code),{code})};
const availableSeconds=new Set([3,4,5,6,7]);
const availableHeights=new Set([720,1080]);

export async function compareP05TransitionProfiles({
  count=5,durationSec=3,height=720,
}={}){
  if(!Number.isSafeInteger(count)||count<5||count>10||
    !availableSeconds.has(durationSec)||!availableHeights.has(height))
    fail('M58_P05_COMPARISON_POLICY_INVALID');
  const hard=await measureSixSceneP05({
    count,durationSec,height,transition:'hard-cut',
  });
  const fade=await measureSixSceneP05({
    count,durationSec,height,transition:'crossfade',
  });
  const sameSource=hard.input_fingerprint_sha256===
    fade.input_fingerprint_sha256;
  // On nondeterministic FFmpeg outputs no valid controlled comparison exists.
  // Retain individual observations but never compute an ungrounded ratio.
  const ratio=sameSource?
    round(fade.p95_wall_ms/hard.p95_wall_ms):null;
  return {
    schema_version:1,
    scope:'SIX_SCENE_SYNTHETIC_P05_HARDCUT_VS_CROSSFADE_COMPARISON',
    status:sameSource?'MEASURED_NONPRODUCTION_COMPARISON':
      'INCOMPARABLE_SOURCE_HASHES',
    samples_per_profile:count,scene_count:6,
    scene_duration_sec:durationSec,height,fps:24,
    source_fingerprint_matches:sameSource,
    hard_cut:hard,crossfade:fade,
    p95_crossfade_to_hardcut_ratio:ratio,
    production_p95_ms:null,production_baseline:null,
    cloud_cost_usd:null,
    may_publish:false,may_deploy:false,
    caveat:'Actual P05 six-scene MP4 assembly on self-generated animated testsrc2 sources. Five+ fresh uncached outputs per profile. Sequential non-randomized runs are sensitive to host load, thermal effects and cache; ratio is descriptive only. No approved authored footage, browser render, production load, cost or release authorization.',
  };
}
function parse(args){
  if(args.length===1&&['-h','--help'].includes(args[0]))return {help:true};
  const options={count:5,durationSec:3,height:720},seen=new Set();
  for(const arg of args){
    const match=/^--(samples|seconds|height)=([0-9]+)$/.exec(arg);
    if(!match||seen.has(match[1]))return null;
    seen.add(match[1]);
    const n=Number(match[2]);
    if(match[1]==='samples')options.count=n;
    if(match[1]==='seconds')options.durationSec=n;
    if(match[1]==='height')options.height=n;
  }
  if(!Number.isSafeInteger(options.count)||options.count<5||
    options.count>10||!availableSeconds.has(options.durationSec)||
    !availableHeights.has(options.height))return null;
  return options;
}
async function main(args){
  const config=parse(args);
  if(config?.help){
    process.stdout.write(
      'Usage: node tools/compare-p05-profiles.mjs [--samples=5..10] [--seconds=3..7] [--height=720|1080]\n');
    return 0;
  }
  if(!config){
    process.stderr.write('M58_P05_COMPARISON_USAGE_INVALID\n');
    return 1;
  }
  try{
    const result=await compareP05TransitionProfiles(config);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return result.status==='MEASURED_NONPRODUCTION_COMPARISON'?0:2;
  }catch(error){
    process.stderr.write(
      'M58_P05_COMPARISON_FAILED '+String(error?.message??'unknown').slice(0,180)+'\n');
    return 2;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  process.exitCode=await main(process.argv.slice(2));

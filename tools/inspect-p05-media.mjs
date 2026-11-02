#!/usr/bin/env node
/** Zero-config, read-only P05 diagnostics. Never authorizes publication. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {inspectP05DecodedMedia} from '../server/release-media-decode.mjs';
import {discoverP05ActiveReleases} from '../server/release-discovery.mjs';

const PROJECT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DEFAULT_OUT=path.join(PROJECT_ROOT,'out');
const usage='Usage: node tools/inspect-p05-media.mjs [--list [out-dir] | --self-test | out-dir project-id [expected-sha256]]\n';
function fail(code){
  process.stderr.write(code+'\n');
  return 2;
}
function selfTest(){
  const env={...process.env};
  // Node test-runner children inherit NODE_TEST_CONTEXT; nested smoke runs
  // must be a fresh top-level process, not another runner worker.
  delete env.NODE_TEST_CONTEXT;
  const test=spawnSync(process.execPath,[
    '--test','--test-reporter=tap','tests/cloud-release-six-scene-decode.test.mjs',
  ],{cwd:PROJECT_ROOT,encoding:'utf8',timeout:180000,maxBuffer:512*1024,
     windowsHide:true,shell:false,env});
  if(test.error||test.status!==0||
     !/(?:^|\n)# pass [1-9]\d*(?:\r?\n|$)/.test(test.stdout??'')||
     !/(?:^|\n)# skipped 0(?:\r?\n|$)/.test(test.stdout??'')){
    process.stderr.write('M58_SYNTHETIC_SELF_TEST_FAILED\n');
    return 2;
  }
  process.stdout.write(JSON.stringify({
    status:'SYNTHETIC_SELF_TEST_PASSED',
    source:'TEMPORARY_SIX_SCENE_FFMPEG_FIXTURE',
    real_release_found:false,
    may_publish:false,may_deploy:false,
    caveat:'Synthetic fixture, temporary MP4 and PCM. Not real production footage.',
  },null,2)+'\n');
  return 0;
}
function diagnose(rootOut,projectId,expectedMasterSha256){
  const report=inspectP05DecodedMedia({rootOut,projectId,expectedMasterSha256});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  return 0;
}
function main(args){
  if(args.length===1&&['--help','-h'].includes(args[0])){
    process.stdout.write(usage);
    return 0;
  }
  if(args.length===1&&args[0]==='--self-test')return selfTest();
  try{
    if(args[0]==='--list'&&args.length<=2){
      const list=discoverP05ActiveReleases({rootOut:path.resolve(args[1]??DEFAULT_OUT)});
      process.stdout.write(JSON.stringify(list,null,2)+'\n');
      return 0;
    }
    if(args.length===0){
      const list=discoverP05ActiveReleases({rootOut:DEFAULT_OUT});
      const selected=list.projects.find(p=>p.status==='CANDIDATE_UNVERIFIED');
      if(!selected&&list.status==='NO_RELEASES')return selfTest();
      if(!selected)return fail('M58_P05_NO_VALID_ACTIVE_RELEASE');
      return diagnose(DEFAULT_OUT,selected.project_id,null);
    }
    if(args.length>=2&&args.length<=3&&args.every(a=>!a.startsWith('--')))
      return diagnose(path.resolve(args[0]),args[1],args[2]??null);
    process.stderr.write('M58_DECODE_USAGE_INVALID\n'+usage);
    return 1;
  }catch(error){
    const code=typeof error?.code==='string'&&/^M58_(?:DECODE|P05|DISCOVERY)_[A-Z_]+$/.test(error.code)
      ?error.code:'M58_DECODE_INSPECTION_FAILED';
    return fail(code);
  }
}
process.exitCode=main(process.argv.slice(2));

#!/usr/bin/env node
/** M58-R02 local P05 byte-integrity inspector, no release capability. */
import path from 'node:path';
import {inspectP05ActiveRelease} from '../server/release-media-integrity.mjs';

function main(args){
  if(args.length===1&&['--help','-h'].includes(args[0])){
    process.stdout.write('Usage: node tools/inspect-p05-release.mjs <out-dir> <project-id> [expected-master-sha256]\n');
    return 0;
  }
  if(args.length<2||args.length>3){
    process.stderr.write('M58_P05_USAGE_INVALID\n');
    return 1;
  }
  try{
    const report=inspectP05ActiveRelease({
      rootOut:path.resolve(args[0]),
      projectId:args[1],
      expectedMasterSha256:args[2]??null,
    });
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    return 0;
  }catch(error){
    const code=typeof error?.code==='string'&&/^M58_P05_[A-Z_]+$/.test(error.code)
      ?error.code:'M58_P05_INSPECTION_FAILED';
    process.stderr.write(code+'\n');
    return 2;
  }
}
process.exitCode=main(process.argv.slice(2));

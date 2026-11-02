#!/usr/bin/env node
/** Read-only M58 diagnostic CLI. It never supplies a receipt verifier. */
import fs from 'node:fs';
import path from 'node:path';
import {inspectReleaseEvidence} from '../server/release-evidence-preflight.mjs';

function main(args){
  if(args.length!==1||args[0]==='--help'||args[0]==='-h'){
    process.stdout.write('Usage: node tools/release-preflight.mjs <manifest.json>\n');
    return args.length===1?0:1;
  }
  const file=path.resolve(args[0]);
  let stat;
  try{stat=fs.lstatSync(file)}
  catch{process.stderr.write('M58_INPUT_UNREADABLE\n');return 1}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>128*1024||stat.size===0){
    process.stderr.write('M58_INPUT_UNSAFE_OR_TOO_LARGE\n');return 1;
  }
  let manifest;
  try{manifest=JSON.parse(fs.readFileSync(file,'utf8'))}
  catch{process.stderr.write('M58_INVALID_JSON\n');return 1}
  try{
    const result=inspectReleaseEvidence(manifest);
    // No trusted server callback is ever accepted on the CLI: PASS is only a claim.
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return result.verdict==='BLOCKED'?2:1;
  }catch(e){
    process.stderr.write((typeof e?.code==='string'&&e.code.startsWith('M58_')?e.code:'M58_PREFLIGHT_ERROR')+'\n');
    return 1;
  }
}
process.exitCode=main(process.argv.slice(2));

#!/usr/bin/env node
/** M58-R08. Repeatable synthetic FFmpeg wall-time measurement.
 * Read-only: lavfi source -> H.264 -> null muxer; no output MP4.
 */
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {summarizeFfmpegTrialSamples,parseFfmpegChildMaxRss}
  from '../server/release-performance-samples.mjs';

const help='Usage: node tools/measure-m58-performance.mjs [--samples=5..15]\n';
function main(args){
  if(args.length===1&&['--help','-h'].includes(args[0])){
    process.stdout.write(help);
    return 0;
  }
  const input=args.length===0?'5':
    args.length===1&&args[0].startsWith('--samples=')?
      args[0].slice('--samples='.length):null;
  if(input===null||!/^(?:[5-9]|1[0-5])$/.test(input)){
    process.stderr.write('M58_BENCH_USAGE_INVALID\n'+help);
    return 1;
  }
  const count=Number(input);
  const samples=[];
  for(let i=0;i<count;i++){
    const started=performance.now();
    const r=spawnSync('ffmpeg',[
      '-hide_banner','-nostats','-nostdin','-loglevel','info',
      '-benchmark','-f','lavfi',
      '-i','testsrc2=size=320x180:rate=24:duration=2',
      '-map','0:v:0','-frames:v','48','-an',
      '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
      '-f','null','-',
    ],{
      encoding:'utf8',timeout:30000,maxBuffer:262144,
      windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],
    });
    const elapsed=performance.now()-started;
    if(r.error||r.status!==0||r.signal||!Number.isFinite(elapsed)){
      process.stderr.write('M58_BENCH_FFMPEG_FAILED\n');
      return 2;
    }
    samples.push({wall_ms:Number(elapsed.toFixed(3)),
      child_maxrss_kib:parseFfmpegChildMaxRss(r.stderr)});
  }
  try{
    const report=summarizeFfmpegTrialSamples(samples);
    process.stdout.write(JSON.stringify({
      ...report,codec:'libx264',input:'lavfi:testsrc2',
      width:320,height:180,frame_rate:24,frames_per_sample:48,
      trial_wall_ms:samples.map(x=>x.wall_ms),
    },null,2)+'\n');
    return 0;
  }catch{
    process.stderr.write('M58_BENCH_INVALID_RESULT\n');
    return 2;
  }
}
process.exitCode=main(process.argv.slice(2));

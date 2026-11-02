import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateVideoProbe,inspectMp4} from '../tools/mp4-quality.mjs';

const thisDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(thisDir,'..');
const probe={format:{duration:'1.041667',size:'230000'},streams:[
  {codec_type:'video',codec_name:'h264',width:1280,height:720,
    r_frame_rate:'24/1',avg_frame_rate:'24/1'},
  {codec_type:'audio',codec_name:'aac'},
]};
const expected={height:720,fps:24,duration:1,audio_required:true};
test('MP4 QA: H.264 16:9, matching FPS/duration and required audio pass',()=>{
  const r=evaluateVideoProbe(probe,expected);
  assert.equal(r.verdict,'PASS',JSON.stringify(r.issues));
  assert.equal(r.metadata.fps,24);
  assert.equal(r.metadata.has_audio,true);
  assert.equal(r.scope,'TECHNICAL_ONLY');
});
test('MP4 QA: missing video, invalid metadata and undersized files fail',()=>{
  const r=evaluateVideoProbe({format:{size:'100'},streams:[]},expected);
  assert.equal(r.verdict,'FAIL');
  for(const id of ['VIDEO_STREAM_MISSING','FPS_INVALID','DURATION_INVALID','FILE_TOO_SMALL','AUDIO_MISSING'])
    assert.ok(r.issues.some(i=>i.id===id),id);
});
test('MP4 QA: codec, aspect, height, FPS, audio and duration mismatch detected',()=>{
  const r=evaluateVideoProbe({format:{duration:'4',size:'20000'},streams:[
    {codec_type:'video',codec_name:'hevc',width:800,height:600,
      avg_frame_rate:'30/1',r_frame_rate:'24/1'},
  ]},expected);
  assert.equal(r.verdict,'FAIL');
  for(const id of ['VIDEO_CODEC','ASPECT_RATIO','HEIGHT_MISMATCH',
    'FPS_MISMATCH','DURATION_MISMATCH','AUDIO_MISSING'])
    assert.ok(r.issues.some(i=>i.id===id),id);
});
test('MP4 QA: no finite FPS or duration can be mistaken for success',()=>{
  const r=evaluateVideoProbe({format:{duration:'NaN',size:'20000'},streams:[
    {codec_type:'video',codec_name:'h264',width:1280,height:720,
      avg_frame_rate:'0/0',r_frame_rate:'0/0'},
  ]});
  assert.equal(r.verdict,'FAIL');
  assert.ok(r.issues.some(i=>i.id==='FPS_INVALID'));
  assert.ok(r.issues.some(i=>i.id==='DURATION_INVALID'));
});
test('MP4 QA: missing and corrupt output fail closed',()=>{
  assert.equal(inspectMp4(path.join(os.tmpdir(),'pb-absent-qa-file.mp4')).issues[0].id,'FILE_MISSING');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-qa-'));
  try{
    const file=path.join(dir,'bad.mp4');fs.writeFileSync(file,'invalid');
    assert.equal(inspectMp4(file).issues[0].id,'FILE_TOO_SMALL');
    fs.writeFileSync(file,Buffer.alloc(4096,7));
    assert.equal(inspectMp4(file).issues[0].id,'FFPROBE_FAILED');
    assert.equal(inspectMp4(file,{},'/definitely/not/installed/ffprobe').issues[0].id,'FFPROBE_FAILED');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
const ffmpegOk=spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0;
const ffprobeOk=spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status===0;
test('MP4 QA: real 24fps H.264/AAC video and CLI JSON smoke', {skip:!(ffmpegOk&&ffprobeOk)},()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-real-qa-'));
  try{
    const file=path.join(dir,'sample.mp4');
    const cmd=spawnSync('ffmpeg',[
      '-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=1.25',
      '-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','1.25',
      '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',file,
    ],{encoding:'utf8',timeout:20000});
    assert.equal(cmd.status,0,cmd.stderr);
    const success=inspectMp4(file,{height:180,fps:24,duration:1.25,audio_required:true});
    assert.equal(success.verdict,'PASS',JSON.stringify(success.issues));
    const wrong=inspectMp4(file,{height:720,fps:25,duration:5});
    assert.equal(wrong.verdict,'FAIL');
    for(const id of ['HEIGHT_MISMATCH','FPS_MISMATCH','DURATION_MISMATCH'])
      assert.ok(wrong.issues.some(x=>x.id===id),id);
    const cli=spawnSync(process.execPath,['tools/verify-mp4.mjs',file,'--json'],{
      cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(cli.status,0,cli.stderr);
    const value=JSON.parse(cli.stdout);
    assert.equal(value.report.verdict,'PASS');
    assert.equal(value.report.scope,'TECHNICAL_ONLY');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('MP4 QA CLI: missing export returns 1, bad usage returns 2',()=>{
  const missing=spawnSync(process.execPath,['tools/verify-mp4.mjs',
    path.join(os.tmpdir(),'pb-qa-nonexistent-export.mp4'),'--json'],{
    cwd:root,encoding:'utf8'});
  assert.equal(missing.status,1,missing.stderr);
  assert.equal(JSON.parse(missing.stdout).report.issues[0].id,'FILE_MISSING');
  const usage=spawnSync(process.execPath,['tools/verify-mp4.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(usage.status,2);
});

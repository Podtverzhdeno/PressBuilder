import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {captureFrameEvidence} from '../server/frame-qa.mjs';

const hasFFmpeg=['ffmpeg','ffprobe'].every(tool=>spawnSync(tool,['-version'],{stdio:'ignore'}).status===0);
function video(dir,name,source){
  const file=path.join(dir,name+'.mp4');
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi',
    '-i',source,'-t','0.6','-c:v','libx264','-pix_fmt','yuv420p','-an',file],
    {timeout:20000,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return file;
}
test('P03 extracts real immutable storyboard JPEG frames, verifies hashes and flags dark frames without creative auto-rejection',{timeout:30000},t=>{
  if(!hasFFmpeg){t.skip('FFmpeg/ffprobe not installed');return}
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-frames-'));
  try{
    const input=video(out,'black','color=c=black:s=640x360:r=24:d=0.6');
    const result=captureFrameEvidence({file:input,out,id:'demo',scene:'s01',
      version:'0123456789abcdef',duration:0.6,fps:24});
    assert.equal(result.scope,'FRAME_HEURISTICS_ONLY');
    assert.equal(result.verdict,'CAPTURED');
    assert.equal(result.frames.length,3);
    assert.ok(result.warnings.includes('DARK_FRAME'));
    assert.ok(result.warnings.includes('SIMILAR_TO_PREVIOUS_SAMPLE'));
    for(let i=0;i<3;i++){
      const info=result.frames[i];
      assert.equal(info.index,i);
      assert.ok(info.frame>=0&&info.t>=0&&info.t<0.6);
      const image=fs.readFileSync(path.join(out,path.basename(info.file)));
      assert.equal(image[0],0xff);
      assert.equal(image[1],0xd8);
      assert.equal(image.at(-2),0xff);
      assert.equal(image.at(-1),0xd9);
      assert.equal(createHash('sha256').update(image).digest('hex'),info.sha256);
      assert.equal(image.length,info.size);
      assert.ok(!Object.hasOwn(info,'_gray'));
    }
    assert.throws(()=>captureFrameEvidence({file:input,out,id:'demo',scene:'s01',
      version:'0123456789abcdef',duration:0.6,fps:24}),e=>e.status===409);
    assert.equal(fs.readdirSync(out).filter(name=>name.includes('.partial')).length,0);
  }finally{fs.rmSync(out,{recursive:true,force:true})}
});
test('P03 stores varied-frame evidence without making unsupported artistic judgments',{timeout:30000},t=>{
  if(!hasFFmpeg){t.skip('FFmpeg/ffprobe not installed');return}
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-testsrc-'));
  try{
    const input=video(out,'moving','testsrc2=s=640x360:r=24:d=0.6');
    const report=captureFrameEvidence({file:input,out,id:'demo',scene:'s01',
      version:'fedcba9876543210',duration:0.6,fps:24});
    assert.equal(report.frames.length,3);
    assert.ok(report.frames.some(frame=>frame.mean_luma>9));
    assert.equal(report.differences.length,2);
    assert.equal(report.note.includes('not a substitute for visual review'),true);
    assert.throws(()=>captureFrameEvidence({file:input,out,id:'../escape',scene:'s01',
      version:'fedcba9876543210',duration:0.6,fps:24}),e=>e.status===400);
  }finally{fs.rmSync(out,{recursive:true,force:true})}
});

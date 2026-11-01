import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {continuityBoundaryService} from '../server/continuity-boundary.mjs';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const bad=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);
const hasMediaTools=spawnSync('ffmpeg',['-version']).status===0&&spawnSync('ffprobe',['-version']).status===0;
test('P17 real FFmpeg boundary frames: proof, CAS, no unauthenticated media paths or publication',{timeout:45000,skip:!hasMediaTools?'FFmpeg/ffprobe unavailable on host; Docker runs required media test':false},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p17-'));
 try{
  const files=[];
  for(let i=0;i<2;i++){
    const f=path.join(dir,'s0'+(i+1)+'.mp4');
    const result=spawnSync('ffmpeg',['-v','error','-f','lavfi',
      '-i','testsrc2=size=320x180:rate=24','-t','1','-c:v','libx264',
      '-pix_fmt','yuv420p','-y',f],{timeout:15000});
    assert.equal(result.status,0,result.stderr?.toString());files.push(f);
  }
  const records=files.map((file,i)=>({version_id:'a'.repeat(15)+(i+1),
    sha256:hash(file),qa:{verdict:'PASS'},absolute_file:file,
    size:fs.statSync(file).size,fps:24,duration:1}));
  const pointers=records.map(a=>({revision:2,version_id:a.version_id,artifact:a}));
  const versions={approved:(_id,scene)=>pointers[scene==='s01'?0:1]};
  bad('CONTINUITY_PREVIEW_DISABLED',()=>continuityBoundaryService({versions}).context('deck','s01','s02'));
  const svc=continuityBoundaryService({versions,enabled:true});
  const c=svc.context('deck','s01','s02');
  assert.equal(c.left.frames,24);assert.equal(c.right.frames,24);
  assert.equal(c.left.entry.frame,0);assert.equal(c.left.exit.frame,23);
  assert.match(c.left.entry.image_sha256,/^[a-f0-9]{64}$/);
  assert.equal(c.left.mp4_sha256,hash(files[0]));
  const input={left_scene_id:'s01',right_scene_id:'s02',
    expected_pair_sha256:c.source_pair_sha256,transition:'hard_cut'};
  const p=svc.preview('deck',input);
  assert.equal(p.status,'REVIEW');assert.equal(p.publication_allowed,false);
  assert.equal(p.video_left_last_frame,23);
  bad('BOUNDARY_AUDIO_MOTION_NOT_ATTESTED',()=>svc.preview('deck',{...input,transition:'j_cut'}));
  bad('BOUNDARY_REQUEST_INVALID',()=>svc.preview('deck',{...input,file:'/etc/passwd'}));
  bad('BOUNDARY_SCENE_IDS_INVALID',()=>svc.context('deck','../etc','s02'));
  pointers[0]={...pointers[0],revision:3};
  bad('BOUNDARY_SOURCE_STALE',()=>svc.preview('deck',input));
  pointers[0]={...pointers[0],revision:2};
  pointers[1]={...pointers[1],artifact:{...pointers[1].artifact,qa:{verdict:'FAIL'}}};
  bad('BOUNDARY_SCENE_NOT_APPROVED',()=>svc.context('deck','s01','s02'));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

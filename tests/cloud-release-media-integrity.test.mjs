import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inspectP05ActiveRelease} from '../server/release-media-integrity.mjs';

const RELEASE_ID='01234567-89ab-cdef-0123-456789abcdef';
const hash=v=>createHash('sha256').update(v).digest('hex');
const reject=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);

function fixture(t){
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-p05-'));
  t.after(()=>fs.rmSync(out,{recursive:true,force:true}));
  const dir=path.join(out,'releases','montage');
  const release=path.join(dir,RELEASE_ID);
  fs.mkdirSync(release,{recursive:true});
  const bytes=Buffer.alloc(2048,0x42); // Not a decoded MP4; byte-integrity fixture ONLY.
  const master=path.join(release,'final.mp4');
  fs.writeFileSync(master,bytes);
  const manifest={
    schemaVersion:1,project:'montage',release_id:RELEASE_ID,
    scenes:[{
      id:'s01',sha256:'a'.repeat(64),duration:3,
      approved_version_id:'0123456789abcdef',approved_revision:1
    },{
      id:'s02',sha256:'b'.repeat(64),duration:4,
      approved_version_id:null,approved_revision:null
    }],
    output:{sha256:hash(bytes),bytes:bytes.length,qa:{verdict:'PASS'}},
  };
  const save=()=>fs.writeFileSync(path.join(release,'manifest.json'),JSON.stringify(manifest));
  save();
  fs.writeFileSync(path.join(dir,'current.json'),JSON.stringify({release_id:RELEASE_ID}));
  const inspect=(expectedMasterSha256=null)=>inspectP05ActiveRelease({
    rootOut:out,projectId:'montage',expectedMasterSha256,
  });
  return {out,dir,release,master,manifest,save,inspect,bytes};
}

test('M58 confirms actual bytes match P05 active release and expected M58 hash',t=>{
  const f=fixture(t);
  const result=f.inspect(hash(f.bytes));
  assert.equal(result.status,'BYTES_VERIFIED');
  assert.equal(result.scope,'P05_ACTIVE_MASTER_BYTE_INTEGRITY_ONLY');
  assert.equal(result.scenes,2);
  assert.equal(result.scenes_with_p08_approval,1);
  assert.equal(result.master_sha256,hash(f.bytes));
  assert.equal(result.p05_recorded_qa_verdict,'PASS');
  assert.equal(result.decoded_media_verified,false);
  assert.equal(result.source_approvals_reverified,false);
  assert.equal(result.licensing_verified,false);
  assert.equal(result.may_publish,false);
  assert.equal(result.may_deploy,false);
  assert.deepEqual(result,f.inspect(hash(f.bytes)));
});

test('M58 rejects changed master bytes, expected SHA mismatch and truncation',t=>{
  const f=fixture(t);
  reject('M58_P05_EXPECTED_MASTER_MISMATCH',()=>f.inspect('f'.repeat(64)));
  fs.writeFileSync(f.master,Buffer.alloc(2048,0x44));
  reject('M58_P05_MASTER_SHA_MISMATCH',()=>f.inspect());
  fs.truncateSync(f.master,1500);
  reject('M58_P05_VIDEO_SIZE_MISMATCH',()=>f.inspect());
});

test('M58 rejects stale or corrupted P05 current pointer and manifest',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.dir,'current.json'),'{bad-json');
  reject('M58_P05_POINTER_MALFORMED',()=>f.inspect());
  fs.writeFileSync(path.join(f.dir,'current.json'),JSON.stringify({release_id:'../../bad'}));
  reject('M58_P05_POINTER_INVALID',()=>f.inspect());
  fs.writeFileSync(path.join(f.dir,'current.json'),JSON.stringify({release_id:RELEASE_ID}));
  f.manifest.output.qa.verdict='FAIL';f.save();
  reject('M58_P05_MANIFEST_INVALID',()=>f.inspect());
  f.manifest.output.qa.verdict='PASS';f.manifest.release_id='different';f.save();
  reject('M58_P05_MANIFEST_INVALID',()=>f.inspect());
});

test('M58 rejects unknown scene, invalid approvals and duplicate scenes',t=>{
  const f=fixture(t);
  f.manifest.scenes[1].id='s01';f.save();
  reject('M58_P05_SCENES_INVALID',()=>f.inspect());
  f.manifest.scenes[1].id='s02';
  f.manifest.scenes[0].approved_revision=-1;f.save();
  reject('M58_P05_SCENES_INVALID',()=>f.inspect());
  f.manifest.scenes[0].approved_revision=1;f.save();
  assert.equal(f.inspect().scenes_with_p08_approval,1);
});

test('M58 rejects path traversal and missing files without writing anything',t=>{
  const f=fixture(t);
  reject('M58_P05_PROJECT_INVALID',()=>inspectP05ActiveRelease({rootOut:f.out,projectId:'../escape'}));
  reject('M58_P05_ROOT_INVALID',()=>inspectP05ActiveRelease({rootOut:'./out',projectId:'montage'}));
  reject('M58_P05_EXPECTED_SHA_INVALID',()=>f.inspect('../not-a-sha'));
  const before=fs.readdirSync(f.release).sort();
  assert.deepEqual(before,['final.mp4','manifest.json']);
  fs.rmSync(f.master);
  reject('M58_P05_VIDEO_MISSING',()=>f.inspect());
  assert.deepEqual(fs.readdirSync(f.release),['manifest.json']);
});

test('M58 rejects local hardlinked artifacts and symlinks where supported',t=>{
  const f=fixture(t);
  const linked=path.join(f.release,'duplicate.mp4');
  fs.linkSync(f.master,linked);
  reject('M58_P05_VIDEO_UNSAFE',()=>f.inspect());
  fs.rmSync(linked);
  const real=path.join(f.release,'source.mp4');
  fs.renameSync(f.master,real);
  try {
    fs.symlinkSync(real,f.master,'file');
  }catch(e){
    if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return;
    throw e;
  }
  reject('M58_P05_VIDEO_UNSAFE',()=>f.inspect());
});

test('M58 rejects enormous or malformed manifest before inspecting video bytes',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.release,'manifest.json'),'x'.repeat(300000));
  reject('M58_P05_MANIFEST_UNSAFE',()=>f.inspect());
  fs.writeFileSync(path.join(f.release,'manifest.json'),'{corrupted');
  reject('M58_P05_MANIFEST_MALFORMED',()=>f.inspect());
});

test('M58 P05 CLI checks local fixture without publishing and returns a stable code',t=>{
  const f=fixture(t);
  const run=(...args)=>spawnSync(process.execPath,
    ['tools/inspect-p05-release.mjs',...args],{
      cwd:process.cwd(),encoding:'utf8',timeout:15000,maxBuffer:128*1024
    });
  let result=run(f.out,'montage',hash(f.bytes));
  assert.equal(result.status,0,result.stderr);
  let report=JSON.parse(result.stdout);
  assert.equal(report.status,'BYTES_VERIFIED');
  assert.equal(report.may_publish,false);
  assert.equal(report.decoded_media_verified,false);
  result=run(f.out,'montage','f'.repeat(64));
  assert.equal(result.status,2);
  assert.match(result.stderr,/M58_P05_EXPECTED_MASTER_MISMATCH/);
  assert.equal(result.stdout,'');
  result=run(f.out,'../escape');
  assert.equal(result.status,2);
  assert.match(result.stderr,/M58_P05_PROJECT_INVALID/);
  const help=run('--help');
  assert.equal(help.status,0);
  assert.match(help.stdout,/Usage:/);
});

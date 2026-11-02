import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {discoverP05ActiveReleases} from '../server/release-discovery.mjs';

const releaseId='00000000-1111-2222-3333-444444444444';
const ffmpegReady=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{timeout:4000,stdio:'ignore'}).status===0);
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-discover-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {root,out:path.join(root,'out')};
}
const throws=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);
const run=(...args)=>spawnSync(process.execPath,[
  'tools/inspect-p05-media.mjs',...args,
],{cwd:process.cwd(),encoding:'utf8',timeout:180000,maxBuffer:512*1024});

test('M58 discovery: empty out and empty releases are explicit, no invented project',t=>{
  const f=fixture(t);
  let result=discoverP05ActiveReleases({rootOut:f.out});
  assert.equal(result.status,'NO_RELEASES');
  assert.deepEqual(result.projects,[]);
  assert.equal(result.may_publish,false);
  fs.mkdirSync(path.join(f.out,'releases'),{recursive:true});
  result=discoverP05ActiveReleases({rootOut:f.out});
  assert.equal(result.status,'NO_RELEASES');
});

test('M58 discovery: bounded list, no SHA verification claims or mutations',t=>{
  const f=fixture(t);
  const base=path.join(f.out,'releases');
  for(const id of ['alpha','beta']){
    const project=path.join(base,id);
    fs.mkdirSync(path.join(project,releaseId),{recursive:true});
    fs.writeFileSync(path.join(project,'current.json'),JSON.stringify({release_id:releaseId}));
  }
  const before=fs.readdirSync(path.join(base,'alpha'));
  const result=discoverP05ActiveReleases({rootOut:f.out});
  assert.equal(result.status,'FOUND_CANDIDATES');
  assert.deepEqual(result.projects.map(x=>x.project_id).sort(),['alpha','beta']);
  for(const project of result.projects){
    assert.equal(project.status,'CANDIDATE_UNVERIFIED');
    assert.equal(project.release_id,releaseId);
  }
  assert.deepEqual(fs.readdirSync(path.join(base,'alpha')),before);
  const listing=run('--list',f.out);
  assert.equal(listing.status,0,listing.stderr);
  assert.deepEqual(JSON.parse(listing.stdout).projects.map(p=>p.project_id).sort(),['alpha','beta']);
});

test('M58 discovery reports broken pointer without pretending release exists',t=>{
  const f=fixture(t),root=path.join(f.out,'releases','alpha');
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'current.json'),'{bad-json');
  let r=discoverP05ActiveReleases({rootOut:f.out});
  assert.equal(r.projects[0].status,'INVALID_POINTER');
  fs.writeFileSync(path.join(root,'current.json'),JSON.stringify({release_id:releaseId}));
  r=discoverP05ActiveReleases({rootOut:f.out});
  assert.equal(r.projects[0].status,'MISSING_RELEASE');
  const listed=run('--list',f.out);
  assert.equal(listed.status,0);
  assert.equal(JSON.parse(listed.stdout).projects[0].status,'MISSING_RELEASE');
});

test('M58 discovery rejects traversal and unexpected release directory content',t=>{
  const f=fixture(t);
  throws('M58_DISCOVERY_ROOT_INVALID',()=>discoverP05ActiveReleases({rootOut:'relative/path'}));
  throws('M58_DISCOVERY_LIMIT_INVALID',()=>discoverP05ActiveReleases({rootOut:f.out,maxProjects:0}));
  const releases=path.join(f.out,'releases');
  fs.mkdirSync(releases,{recursive:true});
  fs.writeFileSync(path.join(releases,'unexpected.txt'),'x');
  throws('M58_DISCOVERY_UNSAFE_ENTRY',()=>discoverP05ActiveReleases({rootOut:f.out}));
  fs.rmSync(path.join(releases,'unexpected.txt'));
  for(let i=0;i<3;i++)fs.mkdirSync(path.join(releases,'test'+i));
  throws('M58_DISCOVERY_TOO_MANY_ENTRIES',()=>discoverP05ActiveReleases({rootOut:f.out,maxProjects:2}));
});

test('M58 --self-test executes real synthetic P05 six-scene pipeline without shipping a release',{
  skip:!ffmpegReady,timeout:180000,
},()=>{
  const r=run('--self-test');
  assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(r.stdout);
  assert.equal(report.status,'SYNTHETIC_SELF_TEST_PASSED');
  assert.equal(report.real_release_found,false);
  assert.equal(report.may_publish,false);
  assert.equal(report.may_deploy,false);
});

test('M58 CLI help, explicit missing out path and unknown arguments are safe',()=>{
  const help=run('--help');
  assert.equal(help.status,0);
  assert.match(help.stdout,/Usage:/);
  const unknown=run('--invalid');
  assert.equal(unknown.status,1);
  assert.match(unknown.stderr,/M58_DECODE_USAGE_INVALID/);
});

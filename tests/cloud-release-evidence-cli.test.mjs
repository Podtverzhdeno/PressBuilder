import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function setup(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-cli-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'evidence.json');
  const run=(target=file)=>spawnSync(process.execPath,['tools/release-preflight.mjs',target],{
    cwd:process.cwd(),encoding:'utf8',timeout:15000,maxBuffer:128*1024,
  });
  return {dir,file,run};
}
const sample=()=>({
  schema_version:1,project_id:'test-project',submitted_by:'worker-1',
  build:{commit_sha:'a'.repeat(40),image_sha256:'b'.repeat(64),master_sha256:'c'.repeat(64)},
  metrics:{
    baseline:{sample_count:10,p95_render_ms:120000,peak_rss_mib:768,cost_usd:1.5},
    candidate:{sample_count:10,p95_render_ms:119000,peak_rss_mib:750,cost_usd:1.4},
    limits:{max_p95_ratio:1.1,max_rss_ratio:1.1,max_cost_ratio:1.1},
  },
  receipts:[],
});

test('M58 diagnostic CLI identifies missing evidence; never issues release approval',t=>{
  const {file,run}=setup(t);
  fs.writeFileSync(file,JSON.stringify(sample()));
  const r=run();
  assert.equal(r.status,2,r.stderr);
  const out=JSON.parse(r.stdout);
  assert.equal(out.verdict,'BLOCKED');
  assert.equal(out.may_publish,false);
  assert.equal(out.may_deploy,false);
  assert.equal(out.checks.length,12);
  assert.ok(out.blockers.includes('real_media_e2e:MISSING'));
  assert.ok(out.blockers.includes('rollback:MISSING'));
  assert.equal(r.stderr,'');
});

test('M58 CLI rejects malformed JSON, schema errors and oversized files without leaking content',t=>{
  const {file,run}=setup(t);
  fs.writeFileSync(file,'{secret: bad-json}');
  let r=run();
  assert.equal(r.status,1);
  assert.match(r.stderr,/M58_INVALID_JSON/);
  assert.ok(!r.stderr.includes('secret'));
  fs.writeFileSync(file,'{}');
  r=run();
  assert.equal(r.status,1);
  assert.match(r.stderr,/M58_SCHEMA_VERSION_INVALID/);
  fs.writeFileSync(file,'x'.repeat(140000));
  r=run();
  assert.equal(r.status,1);
  assert.match(r.stderr,/M58_INPUT_UNSAFE_OR_TOO_LARGE/);
});

test('M58 CLI refuses missing input and supports --help',t=>{
  const {dir,run}=setup(t);
  const missing=run(path.join(dir,'missing.json'));
  assert.equal(missing.status,1);
  assert.match(missing.stderr,/M58_INPUT_UNREADABLE/);
  const help=spawnSync(process.execPath,['tools/release-preflight.mjs','--help'],{
    cwd:process.cwd(),encoding:'utf8',timeout:15000,
  });
  assert.equal(help.status,0);
  assert.match(help.stdout,/Usage:/);
});

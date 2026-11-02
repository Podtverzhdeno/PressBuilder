import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {measureSixSceneP05} from '../tools/measure-p05-assembly.mjs';

const mediaReady=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{timeout:4000,stdio:'ignore'}).status===0);

test('M58-R09: 5 real forced P05 six-scene montage encodes, distinct immutable releases and verified QA', {
  skip:!mediaReady,timeout:240000,
},async()=>{
  const m=await measureSixSceneP05({count:5});
  assert.equal(m.scope,'SIX_SCENE_SYNTHETIC_REAL_P05_FULL_ASSEMBLY');
  assert.equal(m.sample_count,5);
  assert.equal(m.trials.length,5);
  assert.equal(m.unique_release_count,5);
  assert.equal(m.all_trials_forced_full_encode,true);
  assert.equal(m.all_output_qa_passed,true);
  assert.ok(m.p95_wall_ms>=m.p50_wall_ms&&m.p50_wall_ms>0);
  assert.ok(m.p95_encode_ms>=m.p50_encode_ms&&m.p50_encode_ms>0);
  assert.ok(m.fixture_generation_ms>0);
  assert.equal(m.cloud_cost_usd,null);
  assert.equal(m.production_p95_ms,null);
  assert.equal(m.baseline_ratio,null);
  assert.equal(m.may_publish,false);
  assert.equal(m.may_deploy,false);
  assert.equal(m.samples_sha256.length,64);
  const shas=new Set();
  for(const trial of m.trials){
    assert.ok(trial.p05_wall_ms>0);
    assert.ok(trial.p05_encode_ms>0);
    assert.ok(trial.output_bytes>1024);
    assert.match(trial.output_sha256,/^[a-f0-9]{64}$/);
    assert.equal(trial.qa_verdict,'PASS');
    assert.equal(trial.cache_hit,false);
    assert.ok(trial.ffmpeg_child_wall_ms===null||
      trial.ffmpeg_child_wall_ms>0);
    shas.add(trial.output_sha256);
  }
  // Identical sources can have identical output bytes across independent
  // release UUIDs. Unique releases are asserted by the benchmark itself.
  assert.ok(shas.size>=1&&shas.size<=5);
});

test('M58-R09 rejects small sample counts and CLI invalid arguments',async()=>{
  await assert.rejects(()=>measureSixSceneP05({count:4}),
    /M58_P05_BENCH_SAMPLE_LIMIT/);
  const help=spawnSync(process.execPath,
    ['tools/measure-p05-assembly.mjs','--help'],{
      encoding:'utf8',timeout:10000,
    });
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/--samples=5/);
  const bad=spawnSync(process.execPath,
    ['tools/measure-p05-assembly.mjs','--samples=4'],{
      encoding:'utf8',timeout:10000,
    });
  assert.equal(bad.status,1);
  assert.match(bad.stderr,/M58_P05_BENCH_USAGE_INVALID/);
});

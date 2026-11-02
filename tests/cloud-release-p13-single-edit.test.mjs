import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {compareP13SingleSceneUpdate}
  from '../tools/compare-p13-single-edit.mjs';

const ready=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{timeout:4000,stdio:'ignore'}).status===0);

test('M58-R11: five authentic s03-only updates reuse 5 cached P13 scenes versus uncached full P05', {
  skip:!ready,timeout:300000,
},async()=>{
  const report=await compareP13SingleSceneUpdate({cycles:5,durationSec:3});
  assert.equal(report.scope,'SIX_SCENE_SYNTHETIC_P13_SINGLE_SCENE_EDIT_BENCHMARK');
  assert.equal(report.status,'MEASURED_LOCAL_NONPRODUCTION_COMPARISON');
  assert.equal(report.samples_per_profile,5);
  assert.equal(report.scene_count,6);
  assert.equal(report.edited_scene,'s03');
  assert.equal(report.distinct_immutable_releases,11);
  assert.ok(report.warmup_wall_ms>0);
  assert.equal(report.optimized_incremental.sample_count,5);
  assert.equal(report.baseline_full_filter.sample_count,5);
  assert.ok(report.optimized_incremental.p95_wall_ms>0);
  assert.ok(report.baseline_full_filter.p95_wall_ms>0);
  assert.ok(report.p95_incremental_to_full_ratio>0);
  assert.equal(report.production_p95_ms,null);
  assert.equal(report.cloud_cost_usd,null);
  assert.equal(report.baseline_slo_accepted,false);
  assert.equal(report.may_publish,false);
  assert.equal(report.may_deploy,false);
  assert.match(report.source_fingerprint_sha256,/^[0-9a-f]{64}$/);
  const changedSources=new Set();
  for(const t of report.trials){
    assert.equal(t.updated_scene,'s03');
    assert.equal(t.unchanged_source_count,5);
    assert.equal(t.segments_reused,5);
    assert.equal(t.segments_encoded,1);
    assert.equal(t.both_outputs_qa_passed,true);
    assert.ok(t.incremental_wall_ms>0);
    assert.ok(t.full_wall_ms>0);
    assert.match(t.incremental_output_sha256,/^[0-9a-f]{64}$/);
    assert.match(t.full_output_sha256,/^[0-9a-f]{64}$/);
    assert.ok(t.incremental_output_bytes>1024);
    assert.ok(t.full_output_bytes>1024);
    changedSources.add(t.source_sha256);
  }
  assert.equal(changedSources.size,5);
});

test('M58-R11 invalid profiles and CLI cannot run unbounded synthetic benchmarks',async()=>{
  for(const config of [
    {cycles:0,durationSec:3},
    {cycles:4,durationSec:3},
    {cycles:6,durationSec:3},
    {cycles:5,durationSec:0.75},
    {cycles:5,durationSec:20},
  ])await assert.rejects(()=>compareP13SingleSceneUpdate(config),
    /M58_P13_COMPARE_POLICY_INVALID/);
  const help=spawnSync(process.execPath,
    ['tools/compare-p13-single-edit.mjs','--help'],{
      encoding:'utf8',timeout:10000,
    });
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/--seconds=3/);
  for(const arg of ['--seconds=8','--cycles=500','../../secrets']){
    const bad=spawnSync(process.execPath,
      ['tools/compare-p13-single-edit.mjs',arg],{
        encoding:'utf8',timeout:10000,
      });
    assert.equal(bad.status,1);
    assert.match(bad.stderr,/M58_P13_COMPARE_USAGE_INVALID/);
  }
});

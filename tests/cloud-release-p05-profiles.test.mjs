import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {compareP05TransitionProfiles} from '../tools/compare-p05-profiles.mjs';

const ffmpegReady=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{stdio:'ignore',timeout:4000}).status===0);

test('M58-R10: 3-second animated scene profiles, real P05 hard cuts and crossfades', {
  timeout:480000,skip:!ffmpegReady,
},async()=>{
  const r=await compareP05TransitionProfiles({count:5,durationSec:3,height:720});
  assert.equal(r.scope,'SIX_SCENE_SYNTHETIC_P05_HARDCUT_VS_CROSSFADE_COMPARISON');
  assert.equal(r.status,'MEASURED_NONPRODUCTION_COMPARISON');
  assert.equal(r.samples_per_profile,5);
  assert.equal(r.scene_count,6);
  assert.equal(r.scene_duration_sec,3);
  assert.equal(r.hard_cut.transition_profile,'hard-cut');
  assert.equal(r.crossfade.transition_profile,'crossfade');
  assert.equal(r.hard_cut.crossfade_count,0);
  assert.equal(r.crossfade.crossfade_count,3);
  assert.ok(Math.abs(r.hard_cut.total_output_duration_sec-18)<0.01);
  assert.ok(Math.abs(r.crossfade.total_output_duration_sec-17.1)<0.01);
  assert.equal(r.source_fingerprint_matches,true);
  assert.match(r.hard_cut.input_fingerprint_sha256,/^[a-f0-9]{64}$/);
  assert.equal(r.hard_cut.input_fingerprint_sha256,r.crossfade.input_fingerprint_sha256);
  assert.equal(r.hard_cut.unique_release_count,5);
  assert.equal(r.crossfade.unique_release_count,5);
  assert.equal(r.hard_cut.all_output_qa_passed,true);
  assert.equal(r.crossfade.all_output_qa_passed,true);
  assert.equal(r.hard_cut.crossfade_audio_review_required,null);
  assert.equal(r.crossfade.crossfade_audio_review_required,
    r.crossfade.crossfade_audio_review_trial_count>0);
  assert.ok(r.crossfade.crossfade_audio_review_trial_count>=0&&
    r.crossfade.crossfade_audio_review_trial_count<=5);
  assert.equal(r.crossfade.crossfade_audio_review_trial_count,0,
    'Intended synthetic fade into empty audio tracks must not be mislabeled as a dropout');
  for(const t of r.crossfade.trials){
    assert.equal(t.crossfade_audio?.scope,
      'P05_SYNTHETIC_CROSSFADE_PCM_ENVELOPE_48KHZ_STEREO');
    assert.equal(t.crossfade_audio.boundaries.length,3);
    assert.equal(t.crossfade_audio.expected_duration_sec,17.1);
    assert.equal(t.crossfade_audio.may_publish,false);
    assert.equal(t.crossfade_audio.may_deploy,false);
  }
  assert.ok(r.hard_cut.p95_wall_ms>=r.hard_cut.p50_wall_ms);
  assert.ok(r.crossfade.p95_wall_ms>=r.crossfade.p50_wall_ms);
  assert.ok(r.p95_crossfade_to_hardcut_ratio>0);
  assert.equal(r.cloud_cost_usd,null);
  assert.equal(r.production_p95_ms,null);
  assert.equal(r.production_baseline,null);
  assert.equal(r.may_publish,false);
  assert.equal(r.may_deploy,false);
  for(const profile of [r.hard_cut,r.crossfade]){
    assert.equal(profile.trials.length,5);
    assert.ok(profile.trials.every(t=>t.cache_hit===false&&t.qa_verdict==='PASS'));
  }
});

test('M58-R10 refuses unsafe long-running benchmark parameters',async()=>{
  for(const options of [
    {count:4,durationSec:3,height:720},
    {count:5,durationSec:2,height:720},
    {count:5,durationSec:3,height:1440},
    {count:11,durationSec:3,height:720},
  ])await assert.rejects(()=>compareP05TransitionProfiles(options),
    e=>e.code==='M58_P05_COMPARISON_POLICY_INVALID');
  const help=spawnSync(process.execPath,
    ['tools/compare-p05-profiles.mjs','--help'],{encoding:'utf8',timeout:10000});
  assert.equal(help.status,0,help.stderr);
  const invalid=spawnSync(process.execPath,
    ['tools/compare-p05-profiles.mjs','--seconds=2'],{encoding:'utf8',timeout:10000});
  assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/M58_P05_COMPARISON_USAGE_INVALID/);
});

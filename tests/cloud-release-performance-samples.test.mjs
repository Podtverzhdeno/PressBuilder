import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {summarizeFfmpegTrialSamples,parseFfmpegChildMaxRss}
  from '../server/release-performance-samples.mjs';

const fail=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);
const ffmpegReady=spawnSync('ffmpeg',['-version'],{
  stdio:'ignore',timeout:4000,
}).status===0;

test('M58 performance p50 and p95 use actual nearest-rank samples, not averages',()=>{
  const samples=[10,11,12,14,25].map(wall_ms=>({
    wall_ms,child_maxrss_kib:null,
  }));
  const r=summarizeFfmpegTrialSamples(samples);
  assert.equal(r.sample_count,5);
  assert.equal(r.p50_wall_ms,12);
  assert.equal(r.p95_wall_ms,25);
  assert.equal(r.mean_wall_ms,14.4);
  assert.equal(r.min_wall_ms,10);
  assert.equal(r.max_wall_ms,25);
  assert.equal(r.max_child_rss_mib,null);
  assert.equal(r.cloud_cost_usd,null);
  assert.equal(r.production_p95_ms,null);
  assert.equal(r.baseline_ratio,null);
  assert.equal(r.samples_sha256.length,64);
  assert.equal(r.status,'LOCAL_MEASUREMENT_NOT_PRODUCTION_SLO');
  assert.equal(r.may_publish,false);
  assert.equal(r.may_deploy,false);
});

test('M58 performance must not convert partial/missing RSS to zero',()=>{
  const partial=[{wall_ms:10,child_maxrss_kib:10000},
    ...Array.from({length:4},()=>({wall_ms:12,child_maxrss_kib:null}))];
  const result=summarizeFfmpegTrialSamples(partial);
  assert.equal(result.child_rss_sample_count,1);
  assert.equal(result.max_child_rss_mib,null);
  const complete=partial.map(x=>({...x,child_maxrss_kib:12288}));
  assert.equal(summarizeFfmpegTrialSamples(complete).max_child_rss_mib,12);
  assert.equal(summarizeFfmpegTrialSamples(complete).child_rss_sample_count,5);
});

test('M58 performance rejects fabricated, invalid or insufficient samples',()=>{
  fail('M58_BENCH_SAMPLE_COUNT_INVALID',()=>summarizeFfmpegTrialSamples(
    Array.from({length:4},()=>({wall_ms:5}))));
  fail('M58_BENCH_WALL_INVALID',()=>summarizeFfmpegTrialSamples(
    Array.from({length:5},()=>({wall_ms:0}))));
  fail('M58_BENCH_WALL_INVALID',()=>summarizeFfmpegTrialSamples(
    Array.from({length:5},()=>({wall_ms:NaN}))));
  fail('M58_BENCH_RSS_INVALID',()=>summarizeFfmpegTrialSamples(
    Array.from({length:5},()=>({wall_ms:10,child_maxrss_kib:-1}))));
  fail('M58_BENCH_SAMPLE_INVALID',()=>summarizeFfmpegTrialSamples(
    Array.from({length:5},()=>({wall_ms:10,cloud_cost_usd:0}))));
});

test('M58 FFmpeg benchmark maxrss parser ignores untrusted and ambiguous logs',()=>{
  assert.equal(parseFfmpegChildMaxRss('bench: utime=1.0s maxrss=22000kB'),22000);
  assert.equal(parseFfmpegChildMaxRss('missing'),null);
  assert.equal(parseFfmpegChildMaxRss('maxrss=0kB'),null);
  assert.equal(parseFfmpegChildMaxRss('maxrss=22000kB maxrss=22200kB'),null);
  assert.equal(parseFfmpegChildMaxRss('x'.repeat(262145)),null);
});

test('M58 CLI runs five REAL libx264 trials, no invented cost or full P05 SLO',{
  skip:!ffmpegReady,timeout:120000,
},()=>{
  const r=spawnSync(process.execPath,
    ['tools/measure-m58-performance.mjs','--samples=5'],{
      encoding:'utf8',timeout:120000,maxBuffer:128*1024,
    });
  assert.equal(r.status,0,r.stderr);
  const j=JSON.parse(r.stdout);
  assert.equal(j.sample_count,5);
  assert.equal(j.trial_wall_ms.length,5);
  assert.ok(j.p95_wall_ms>=j.p50_wall_ms);
  assert.ok(j.p50_wall_ms>0);
  assert.equal(j.cloud_cost_usd,null);
  assert.equal(j.production_p95_ms,null);
  assert.equal(j.may_publish,false);
  assert.equal(j.scope,'SYNTHETIC_FFMPEG_MICROBENCHMARK_ONLY');
  const bad=spawnSync(process.execPath,
    ['tools/measure-m58-performance.mjs','--samples=4'],{
      encoding:'utf8',timeout:10000,
    });
  assert.equal(bad.status,1);
  assert.match(bad.stderr,/M58_BENCH_USAGE_INVALID/);
});

/** M58-R08: measured microbenchmark summaries, never production SLO.
 * Five or more actual independent FFmpeg wall-time samples are required.
 * Missing child RSS or real cloud invoices remain null, never fabricated 0.
 */
import {createHash} from 'node:crypto';

const fail=code=>{throw Object.assign(new Error(code),{code,status:422})};
const round=(n,p=3)=>Number(n.toFixed(p));
const pct=(sorted,p)=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];

export function summarizeFfmpegTrialSamples(samples){
  if(!Array.isArray(samples)||samples.length<5||samples.length>100)
    fail('M58_BENCH_SAMPLE_COUNT_INVALID');
  const wall=[],rss=[];
  for(const sample of samples){
    if(!sample||typeof sample!=='object'||Array.isArray(sample)||
      Object.keys(sample).some(k=>!['wall_ms','child_maxrss_kib'].includes(k)))
      fail('M58_BENCH_SAMPLE_INVALID');
    if(typeof sample.wall_ms!=='number'||!Number.isFinite(sample.wall_ms)||
      sample.wall_ms<=0||sample.wall_ms>600000)
      fail('M58_BENCH_WALL_INVALID');
    wall.push(sample.wall_ms);
    if(sample.child_maxrss_kib!==null&&sample.child_maxrss_kib!==undefined){
      const v=sample.child_maxrss_kib;
      if(typeof v!=='number'||!Number.isSafeInteger(v)||v<=0||v>134217728)
        fail('M58_BENCH_RSS_INVALID');
      rss.push(v);
    }
  }
  const ordered=[...wall].sort((a,b)=>a-b);
  const completeRss=rss.length===samples.length;
  const sha=createHash('sha256').update(JSON.stringify(samples)).digest('hex');
  return {
    schema_version:1,scope:'SYNTHETIC_FFMPEG_MICROBENCHMARK_ONLY',
    status:'LOCAL_MEASUREMENT_NOT_PRODUCTION_SLO',
    sample_count:samples.length,
    p50_wall_ms:round(pct(ordered,0.5)),
    p95_wall_ms:round(pct(ordered,0.95)),
    min_wall_ms:round(ordered[0]),
    max_wall_ms:round(ordered[ordered.length-1]),
    mean_wall_ms:round(wall.reduce((a,b)=>a+b,0)/wall.length),
    child_rss_sample_count:rss.length,
    max_child_rss_mib:completeRss?round(Math.max(...rss)/1024):null,
    cloud_cost_usd:null,
    production_p95_ms:null,
    baseline_ratio:null,
    samples_sha256:sha,
    may_publish:false,may_deploy:false,
    caveat:'Actual local FFmpeg lavfi microbenchmark. No real P05 worker/media pipeline, cloud cost, production baseline, or claimed release SLO.',
  };
}

export function parseFfmpegChildMaxRss(log){
  if(typeof log!=='string'||log.length>262144)return null;
  const matches=[...log.matchAll(/\bmaxrss=(\d+)kB\b/g)];
  if(matches.length!==1)return null;
  const n=Number(matches[0][1]);
  return Number.isSafeInteger(n)&&n>0&&n<=134217728?n:null;
}

/** M58-R12: frame-localized decoded-video SSIM near P05 hard-cut seams.
 * This is an independent diagnostic, not a P13 or P05 release authorization.
 * Average SSIM alone can conceal one bad frame near a transition.
 */
const invalid=code=>{throw Object.assign(new Error(code),{code,status:422})};
const round=n=>Number(n.toFixed(6));

/** FFmpeg ssim=stats_file=- emits one line per pair of decoded frames.
 * Require a complete, monotonic 1-indexed frame series: partial, duplicated,
 * reordered, invalid, oversized or non-numeric measurements fail closed.
 */
export function parseFrameSsimStats(raw,{expectedFrames}={}){
  if(!Number.isSafeInteger(expectedFrames)||expectedFrames<24||
    expectedFrames>1100||typeof raw!=='string'||!raw.length||
    raw.length>262144)invalid('M58_SEAM_STATS_INVALID');
  const lines=raw.trim().split(/\r?\n/);
  if(lines.length!==expectedFrames)invalid('M58_SEAM_FRAME_COUNT_MISMATCH');
  const result=[];
  for(let i=0;i<lines.length;i++){
    const match=/^n:\s*(\d+)\s+Y:(?:\d+(?:\.\d+)?)\s+U:(?:\d+(?:\.\d+)?)\s+V:(?:\d+(?:\.\d+)?)\s+All:(\d+(?:\.\d+)?)(?:\s+\((?:inf|-?inf|-?\d+(?:\.\d+)?)\))?\s*$/.exec(lines[i]);
    if(!match||Number(match[1])!==i+1)
      invalid('M58_SEAM_STATS_MALFORMED');
    const score=Number(match[2]);
    if(!Number.isFinite(score)||score<0||score>1)
      invalid('M58_SEAM_SCORE_INVALID');
    result.push(score);
  }
  return result;
}

export function summarizeSeamFrameSsim(scores,{
  fps=24,sceneCount=6,sceneDurationSec=3,windowFrames=2,
  reviewBelow=0.9,
}={}){
  if(!Array.isArray(scores)||!Number.isSafeInteger(fps)||
    fps!==24||sceneCount!==6||![3,4,5,6,7].includes(sceneDurationSec)||
    !Number.isSafeInteger(windowFrames)||windowFrames<1||
    windowFrames>5||typeof reviewBelow!=='number'||
    !Number.isFinite(reviewBelow)||reviewBelow<0.5||reviewBelow>0.99)
    invalid('M58_SEAM_POLICY_INVALID');
  const expectedFrames=sceneCount*sceneDurationSec*fps;
  if(scores.length!==expectedFrames||scores.some(x=>typeof x!=='number'||
    !Number.isFinite(x)||x<0||x>1))
    invalid('M58_SEAM_FRAME_COUNT_MISMATCH');
  const boundaries=[];
  for(let boundary=1;boundary<sceneCount;boundary++){
    const beforeFrame=boundary*sceneDurationSec*fps;
    const from=beforeFrame-windowFrames+1;
    const to=beforeFrame+windowFrames;
    const values=scores.slice(from-1,to);
    if(values.length!==2*windowFrames)
      invalid('M58_SEAM_BOUNDARY_MISSING');
    const score=Math.min(...values);
    boundaries.push({
      boundary_after_scene:boundary,
      frame_before_seam:beforeFrame,
      from_frame:from,to_frame:to,
      min_ssim:round(score),
      review_required:score<reviewBelow,
    });
  }
  const minBoundary=Math.min(...boundaries.map(x=>x.min_ssim));
  return {
    schema_version:1,
    scope:'DECODED_FRAME_SSIM_P05_HARDCUT_BOUNDARIES',
    frame_count:scores.length,scene_count:sceneCount,
    fps,scene_duration_sec:sceneDurationSec,
    window_frames_each_side:windowFrames,
    review_below_ssim:reviewBelow,
    full_video_mean_frame_ssim:round(scores.reduce((a,b)=>a+b,0)/scores.length),
    full_video_min_frame_ssim:round(Math.min(...scores)),
    min_seam_window_ssim:round(minBoundary),
    boundaries,
    manual_visual_review_required:boundaries.some(x=>x.review_required),
    release_authorization:false,
    may_publish:false,may_deploy:false,
    caveat:'Decoded frame-level SSIM around five P05 cuts; not temporal-motion smoothness, optical-flow correctness, audience perception, lip sync, source rights or release approval.',
  };
}

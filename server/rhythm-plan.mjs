/** P15-C02 offline, deterministic rhythm preview.
 * Pure calculation: no files, network, permissions, persistence or publishing.
 * These are draft suggestions, never an approved montage edit.
 */
import { createHash } from 'node:crypto';

const FPS = new Set(['24/1','25/1','30/1','60/1','24000/1001','30000/1001']);
const IDENT = /^[a-zA-Z0-9_-]{1,96}$/;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HASH = /^[a-f0-9]{64}$/;
const MICROS = 1_000_000n;

export class RhythmInputError extends Error {
  constructor(code) { super(code); this.name = 'RhythmInputError'; this.code = code; }
}
const reject = (code) => { throw new RhythmInputError(code); };
const obj = (value, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) reject(code);
  return value;
};
const keys = (value, allowed, code) => {
  if (Object.keys(value).some((key) => !allowed.includes(key))) reject(code);
};
const boundedInt = (value, min, max, code) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) reject(code);
  return value;
};
const ident = (value, code) => {
  if (typeof value !== 'string' || !IDENT.test(value)) reject(code);
  return value;
};
const sha = (value, code) => {
  if (typeof value !== 'string' || !HASH.test(value)) reject(code);
  return value;
};
const array = (value, cap, code) => {
  if (!Array.isArray(value) || value.length > cap) reject(code);
  return value;
};
const orderedSpans = (spans, label, durationUs) => {
  let end = 0;
  return spans.map((s, index) => {
    obj(s, 'INVALID_' + label);
    const allowed = label === 'WORDS'
      ? ['id', 'cue_id', 'start_us', 'end_us', 'protected']
      : label === 'PAUSES' ? ['start_us', 'end_us', 'cue_id'] : ['start_us', 'end_us'];
    keys(s, allowed, 'INVALID_' + label);
    const start = boundedInt(s.start_us, 0, durationUs, 'INVALID_' + label);
    const finish = boundedInt(s.end_us, 1, durationUs, 'INVALID_' + label);
    if (finish <= start || (index && start < end)) reject('OVERLAPPING_' + label);
    end = finish;
    if (label === 'WORDS') {
      ident(s.id, 'INVALID_WORD_ID');
      ident(s.cue_id, 'INVALID_CUE_ID');
      if (s.protected !== undefined && typeof s.protected !== 'boolean') reject('INVALID_PROTECTED');
    } else if (label === 'PAUSES') ident(s.cue_id, 'INVALID_CUE_ID');
    return { ...s, start_us: start, end_us: finish };
  });
};
const frameAt = (timeUs, num, den) => {
  // Nearest output frame. BigInt avoids float drift at fractional rates.
  const numerator = BigInt(timeUs) * BigInt(num);
  const denominator = MICROS * BigInt(den);
  return Number((numerator * 2n + denominator) / (2n * denominator));
};
const fingerprint = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

function validate(input) {
  const p = obj(input, 'INVALID_MANIFEST');
  keys(p, ['schema_version','project_id','voice_source_sha256','alignment_revision',
    'timebase_revision','expected_alignment_revision','expected_timebase_revision',
    'frame_rate','duration_us','words','pauses','beats','music','protected_spans',
    'manual_cut_frames','policy'], 'UNKNOWN_FIELD');
  if (p.schema_version !== 1 || typeof p.project_id !== 'string' ||
      !PROJECT.test(p.project_id)) reject('INVALID_HEADER');
  sha(p.voice_source_sha256, 'INVALID_SOURCE_SHA');
  for (const field of ['alignment_revision','timebase_revision',
    'expected_alignment_revision','expected_timebase_revision']) ident(p[field], 'INVALID_REVISION');
  const fps = obj(p.frame_rate, 'INVALID_FPS');
  keys(fps, ['num','den'], 'INVALID_FPS');
  boundedInt(fps.num, 1, 60000, 'INVALID_FPS');
  boundedInt(fps.den, 1, 1001, 'INVALID_FPS');
  if (!FPS.has(fps.num + '/' + fps.den)) reject('UNSUPPORTED_FPS');
  const durationUs = boundedInt(p.duration_us, 1_000, 3_600_000_000, 'INVALID_DURATION');
  const endFrame = frameAt(durationUs, fps.num, fps.den);
  if (endFrame < 2) reject('INVALID_DURATION');
  const words = orderedSpans(array(p.words, 2500, 'INVALID_WORDS'), 'WORDS', durationUs);
  const pauses = orderedSpans(array(p.pauses, 500, 'INVALID_PAUSES'), 'PAUSES', durationUs);
  const protectedSpans = orderedSpans(array(p.protected_spans ?? [], 500, 'INVALID_SPANS'), 'SPANS', durationUs);
  const wordIds = new Set(), cueIds = new Set();
  for (const word of words) {
    if (wordIds.has(word.id)) reject('DUPLICATE_WORD_ID');
    wordIds.add(word.id); cueIds.add(word.cue_id);
  }
  for (const pause of pauses) {
    if (!cueIds.has(pause.cue_id)) reject('ORPHAN_PAUSE_CUE');
    if (words.some(w => pause.start_us < w.end_us && pause.end_us > w.start_us)) {
      reject('PAUSE_OVERLAPS_WORD');
    }
  }
  const beats = array(p.beats ?? [], 5000, 'INVALID_BEATS').map(b => {
    obj(b, 'INVALID_BEAT'); keys(b, ['frame'], 'INVALID_BEAT');
    return boundedInt(b.frame, 0, endFrame, 'INVALID_BEAT');
  });
  if (beats.length) {
    obj(p.music, 'UNVERIFIED_MUSIC');
    keys(p.music, ['source_sha256','license_ref','licensed'], 'UNVERIFIED_MUSIC');
    sha(p.music.source_sha256, 'UNVERIFIED_MUSIC');
    if (p.music.licensed !== true ||
        typeof p.music.license_ref !== 'string' || !identSafeLicense(p.music.license_ref)) reject('UNVERIFIED_MUSIC');
  } else if (p.music !== undefined) {
    obj(p.music, 'UNVERIFIED_MUSIC');
    keys(p.music, ['source_sha256','license_ref','licensed'], 'UNVERIFIED_MUSIC');
    sha(p.music.source_sha256, 'UNVERIFIED_MUSIC');
    if (p.music.licensed !== true || !identSafeLicense(p.music.license_ref)) reject('UNVERIFIED_MUSIC');
  }
  const manual = array(p.manual_cut_frames ?? [], 100, 'INVALID_MANUAL_CUTS')
    .map(v => boundedInt(v, 0, endFrame, 'INVALID_MANUAL_CUT'));
  if (new Set(manual).size !== manual.length) reject('DUPLICATE_MANUAL_CUT');
  const policy = obj(p.policy, 'INVALID_POLICY');
  keys(policy, ['min_shot_frames','max_cuts_per_10s','max_cuts'], 'INVALID_POLICY');
  boundedInt(policy.min_shot_frames, 1, 6000, 'INVALID_POLICY');
  boundedInt(policy.max_cuts_per_10s, 1, 30, 'INVALID_POLICY');
  boundedInt(policy.max_cuts, 1, 100, 'INVALID_POLICY');
  return {p, fps, endFrame, words, pauses, protectedSpans, beats, manual, policy};
}
function identSafeLicense(s) {
  return typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(s)
    && !s.includes('..') && !s.includes('://');
}
function cutoffReason(frame, {words, protectedSpans, fps, endFrame, policy}) {
  if (frame < policy.min_shot_frames || frame > endFrame - policy.min_shot_frames) return 'BOUNDARY_MIN_SHOT';
  if (words.some(w => frame > frameAt(w.start_us, fps.num, fps.den) &&
                      frame < frameAt(w.end_us, fps.num, fps.den))) return 'CUT_THROUGH_WORD';
  if ([...protectedSpans, ...words.filter(w => w.protected)].some(s =>
    frame >= frameAt(s.start_us, fps.num, fps.den) &&
    frame <= frameAt(s.end_us, fps.num, fps.den))) return 'PROTECTED_NARRATION';
  return null;
}
function anchorCue(frame, words, fps) {
  const position = Number(frame);
  let prior;
  for (const word of words) {
    if (frameAt(word.end_us, fps.num, fps.den) <= position) prior = word;
    else break;
  }
  return prior?.cue_id ?? words[0]?.cue_id ?? null;
}
function review(p, code, endFrame) {
  return { schema_version: 1, project_id:p.project_id, status:'REVIEW',
    source_sha256:p.voice_source_sha256, alignment_revision:p.alignment_revision,
    timebase_revision:p.timebase_revision, duration_frames:endFrame,
    cuts:[], discarded:[], issues:[code], approved:false, persisted:false };
}

/** Propose (never apply) exact-frame rhythm cuts with strictly pinned inputs. */
export function proposeRhythmCuts(input) {
  let state;
  try {
    state = validate(input);
  } catch (err) {
    // Absent, overlapping or inconsistent alignment is missing *evidence*,
    // not permission to guess a cut. Preserve a REVIEW-only result while
    // malformed top-level/header or resource-policy input still throws.
    if (err instanceof RhythmInputError &&
        ['INVALID_WORDS','OVERLAPPING_WORDS','PAUSE_OVERLAPS_WORD','ORPHAN_PAUSE_CUE'].includes(err.code) &&
        input && typeof input === 'object' && !Array.isArray(input) &&
        PROJECT.test(input.project_id) && HASH.test(input.voice_source_sha256) &&
        input.frame_rate && FPS.has(input.frame_rate.num + '/' + input.frame_rate.den) &&
        Number.isSafeInteger(input.duration_us) &&
        input.duration_us >= 1_000 && input.duration_us <= 3_600_000_000 &&
        typeof input.alignment_revision === 'string' &&
        typeof input.timebase_revision === 'string') {
      return review(input, 'INVALID_ALIGNMENT_' + err.code,
        frameAt(input.duration_us, input.frame_rate.num, input.frame_rate.den));
    }
    throw err;
  }
  const {p, fps, endFrame, words, pauses, beats, manual, policy} = state;
  if (p.expected_alignment_revision !== p.alignment_revision ||
      p.expected_timebase_revision !== p.timebase_revision) return review(p, 'STALE_REVISION', endFrame);
  if (!words.length) return review(p, 'MISSING_ALIGNMENT', endFrame);
  if (!pauses.length && !beats.length && !manual.length) return review(p, 'NO_RHYTHM_EVIDENCE', endFrame);
  const contenders = [];
  for (const frame of manual) contenders.push({frame, reason:'manual', rank:0,
    cue_id:anchorCue(frame,words,fps)});
  for (const pause of pauses) {
    const frame = frameAt(Math.floor((pause.start_us+pause.end_us)/2),fps.num,fps.den);
    contenders.push({frame, reason:'pause', rank:1, cue_id:pause.cue_id});
  }
  for (const frame of beats) contenders.push({frame, reason:'licensed_beat', rank:2,
    cue_id:anchorCue(frame,words,fps)});
  // Manual cuts consume slots first; auto suggestions never displace them.
  contenders.sort((a,b)=>a.rank-b.rank || a.frame-b.frame || a.reason.localeCompare(b.reason));
  const cuts=[], discarded=[];
  const maxSpanFrames = frameAt(10_000_000, fps.num, fps.den);
  for (const candidate of contenders) {
    let why=cutoffReason(candidate.frame,state);
    if (!why && cuts.some(x => Math.abs(x.frame - candidate.frame) < policy.min_shot_frames)) why='MIN_SHOT_GAP';
    if (!why && cuts.length >= policy.max_cuts) why='MAX_CUTS';
    if (!why && cuts.filter(x => Math.abs(x.frame-candidate.frame) < maxSpanFrames).length >=
        policy.max_cuts_per_10s) why='DENSITY_LIMIT';
    if (why) {
      // Invalid manual changes require fresh human plan, never silently ignored.
      if (candidate.reason === 'manual') return review(p, 'MANUAL_CUT_' + why, endFrame);
      discarded.push({frame:candidate.frame, reason:candidate.reason, violation:why});
    } else cuts.push(candidate);
  }
  cuts.sort((a,b)=>a.frame-b.frame);
  discarded.sort((a,b)=>a.frame-b.frame || a.reason.localeCompare(b.reason));
  if (!cuts.length) return { ...review(p,'NO_ELIGIBLE_CUTS',endFrame), discarded };
  const planBase={schema_version:1, project_id:p.project_id, source_sha256:p.voice_source_sha256,
    music_source_sha256:p.music?.source_sha256??null,
    alignment_revision:p.alignment_revision, timebase_revision:p.timebase_revision,
    frame_rate:{num:fps.num,den:fps.den}, duration_frames:endFrame, policy:{...policy},
    cuts:cuts.map(({frame,reason,cue_id})=>({frame,reason,cue_id,
      confidence:'source_marker_unverified', source_sha256:p.voice_source_sha256}))};
  const planSha=fingerprint(planBase);
  return {...planBase, status:'READY_FOR_REVIEW',
    plan_sha256:planSha, cuts:planBase.cuts.map((cut,index)=>({
      id:'cut_'+String(index+1).padStart(3,'0')+'_'+String(cut.frame),...cut
    })), discarded, issues:[], approved:false, persisted:false};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeRhythmCuts, RhythmInputError } from '../server/rhythm-plan.mjs';
import { readFileSync } from 'node:fs';

const sha = 'a'.repeat(64);
const musicSha = 'b'.repeat(64);
function example(overrides={}) {
  return {
    schema_version:1,project_id:'demo-six-scenes',voice_source_sha256:sha,
    alignment_revision:'align-r3',expected_alignment_revision:'align-r3',
    timebase_revision:'clock-r1',expected_timebase_revision:'clock-r1',
    frame_rate:{num:24,den:1},duration_us:9_000_000,
    words:[
      {id:'w1',cue_id:'c1',start_us:0,end_us:1_000_000},
      {id:'w2',cue_id:'c2',start_us:3_000_000,end_us:4_000_000},
      {id:'w3',cue_id:'c3',start_us:5_000_000,end_us:6_000_000},
    ],
    pauses:[{start_us:1_500_000,end_us:2_500_000,cue_id:'c1'},
            {start_us:4_300_000,end_us:4_800_000,cue_id:'c2'}],
    beats:[{frame:168}],music:{source_sha256:musicSha,license_ref:'owned/beat-1',licensed:true},
    protected_spans:[],manual_cut_frames:[],
    policy:{min_shot_frames:12,max_cuts_per_10s:6,max_cuts:5},
    ...overrides,
  };
}
const failure=(code,fn)=>assert.throws(fn,e=>e instanceof RhythmInputError && e.code===code);
test('P15 deterministic pause and licensed beat markers, source/cue/plan provenance',()=>{
 const request=example();
 const before=JSON.stringify(request);
 const a=proposeRhythmCuts(request),b=proposeRhythmCuts(request);
 assert.deepEqual(a,b);
 assert.equal(JSON.stringify(request),before);
 assert.equal(a.status,'READY_FOR_REVIEW');
 assert.deepEqual(a.cuts.map(c=>c.frame),[48,109,168]); // 4.55s rounds to frame 109
 assert.deepEqual(a.cuts.map(c=>c.reason),['pause','pause','licensed_beat']);
 assert.deepEqual(a.cuts.map(c=>c.cue_id),['c1','c2','c3']);
 assert.equal(a.approved,false);assert.equal(a.persisted,false);
 assert.match(a.plan_sha256,/^[a-f0-9]{64}$/);
 assert.ok(a.cuts.every(c=>c.source_sha256===sha && c.confidence==='source_marker_unverified'));
});
test('manual cuts are prioritised and auto cuts never override manual',()=>{
 const a=proposeRhythmCuts(example({manual_cut_frames:[48]}));
 assert.equal(a.cuts.filter(c=>c.frame===48).length,1);
 assert.equal(a.cuts.find(c=>c.frame===48).reason,'manual');
 assert.ok(a.discarded.some(x=>x.frame===48 && x.violation==='MIN_SHOT_GAP'));
});
test('manual cut inside a word forces REVIEW, not silent acceptance',()=>{
 const a=proposeRhythmCuts(example({manual_cut_frames:[16]}));
 assert.equal(a.status,'REVIEW');assert.deepEqual(a.cuts,[]);
 assert.deepEqual(a.issues,['MANUAL_CUT_CUT_THROUGH_WORD']);
});
test('protected phrase prevents pause cut and does not publish',()=>{
 const a=proposeRhythmCuts(example({protected_spans:[{start_us:1_600_000,end_us:2_400_000}]}));
 assert.ok(a.discarded.some(c=>c.frame===48 && c.violation==='PROTECTED_NARRATION'));
 assert.ok(!a.cuts.some(c=>c.frame===48));assert.equal(a.approved,false);
});
test('protected aligned word prevents manual cut on its boundary',()=>{
 const a=proposeRhythmCuts(example({words:example().words.map((w,i)=>i===0?{...w,protected:true}:w),
    manual_cut_frames:[24]}));
 assert.deepEqual(a.issues,['MANUAL_CUT_PROTECTED_NARRATION']);
});
test('stale alignment and stale timebase require REVIEW',()=>{
 for(const edit of [
   {expected_alignment_revision:'align-old'},
   {expected_timebase_revision:'clock-old'},
 ]) {
  const a=proposeRhythmCuts(example(edit));
  assert.equal(a.status,'REVIEW');assert.deepEqual(a.cuts,[]);
  assert.deepEqual(a.issues,['STALE_REVISION']);
 }
});
test('missing word alignment and no evidence return REVIEW',()=>{
 const a=proposeRhythmCuts(example({words:[],pauses:[],beats:[],music:undefined}));
 assert.deepEqual(a.issues,['MISSING_ALIGNMENT']);
 const b=proposeRhythmCuts(example({pauses:[],beats:[],music:undefined}));
 assert.deepEqual(b.issues,['NO_RHYTHM_EVIDENCE']);
});
test('unlicensed or missing music cannot drive beat edits',()=>{
 failure('UNVERIFIED_MUSIC',()=>proposeRhythmCuts(example({music:undefined})));
 failure('UNVERIFIED_MUSIC',()=>proposeRhythmCuts(example({music:{source_sha256:musicSha,license_ref:'',licensed:true}})));
 failure('UNVERIFIED_MUSIC',()=>proposeRhythmCuts(example({music:{source_sha256:musicSha,license_ref:'owned/beat',licensed:false}})));
 failure('UNVERIFIED_MUSIC',()=>proposeRhythmCuts(example({music:{source_sha256:musicSha,license_ref:'https://evil.test/asset',licensed:true}})));
});
test('beat on active spoken word is discarded',()=>{
 const a=proposeRhythmCuts(example({beats:[{frame:78}]}));
 assert.ok(a.discarded.some(x=>x.violation==='CUT_THROUGH_WORD' && x.frame===78));
});
test('incorrect FPS and fraction are fail-closed',()=>{
 for(const fps of [{num:29,den:1},{num:30000,den:1000},{num:30.5,den:1},{num:0,den:1}]){
  failure('UNSUPPORTED_FPS',()=>proposeRhythmCuts(example({frame_rate:fps}))); // nonfinite/zero gives INVALID_FPS
 }
});
test('fractional NTSC conversion uses integer rational arithmetic',()=>{
 const a=proposeRhythmCuts(example({
    frame_rate:{num:30000,den:1001},pauses:[{start_us:1_500_000,end_us:2_500_000,cue_id:'c1'}],beats:[],music:undefined,
 }));
 assert.equal(a.cuts[0].frame,60);
 assert.equal(a.duration_frames,270);
});
test('overlap or inconsistent timing never proposes edits',()=>{
 failure('OVERLAPPING_WORDS',()=>proposeRhythmCuts(example({
   words:[{id:'w1',cue_id:'c1',start_us:0,end_us:1_200_000},
          {id:'w2',cue_id:'c2',start_us:1_000_000,end_us:1_400_000}]})));
 failure('PAUSE_OVERLAPS_WORD',()=>proposeRhythmCuts(example({
   pauses:[{start_us:500_000,end_us:1_500_000,cue_id:'c1'}]})));
 failure('INVALID_WORDS',()=>proposeRhythmCuts(example({
   words:[{id:'w1',cue_id:'c1',start_us:2_000_000}]})));
});
test('duplicate IDs and orphan pauses rejected',()=>{
 failure('DUPLICATE_WORD_ID',()=>proposeRhythmCuts(example({
   words:[{id:'duplicate',cue_id:'c1',start_us:0,end_us:1_000_000},
          {id:'duplicate',cue_id:'c2',start_us:3_000_000,end_us:4_000_000}]})));
 failure('ORPHAN_PAUSE_CUE',()=>proposeRhythmCuts(example({
   pauses:[{start_us:1_500_000,end_us:2_500_000,cue_id:'fake'}]})));
});
test('minimum shot and maximum cut count are enforced',()=>{
 const short=proposeRhythmCuts(example({policy:{min_shot_frames:70,max_cuts_per_10s:6,max_cuts:5}}));
 assert.ok(short.discarded.some(x=>x.violation==='BOUNDARY_MIN_SHOT'));
 const max=proposeRhythmCuts(example({policy:{min_shot_frames:1,max_cuts_per_10s:30,max_cuts:1}}));
 assert.equal(max.cuts.length,1);
 assert.ok(max.discarded.every(x=>x.violation==='MAX_CUTS'));
});
test('overdense cuts are refused at configured density',()=>{
 const a=proposeRhythmCuts(example({policy:{min_shot_frames:1,max_cuts_per_10s:1,max_cuts:5}}));
 assert.equal(a.cuts.length,1);assert.ok(a.discarded.some(x=>x.violation==='DENSITY_LIMIT'));
});
test('source SHA drift changes plan identity and never changes an approved release',()=>{
 const a=proposeRhythmCuts(example()),b=proposeRhythmCuts(example({voice_source_sha256:'f'.repeat(64)}));
 assert.notEqual(a.plan_sha256,b.plan_sha256);
 assert.equal(a.persisted,false);assert.equal(b.persisted,false);
});
test('malformed inputs, unbounded list and unknown fields rejected',()=>{
 failure('INVALID_MANIFEST',()=>proposeRhythmCuts([]));
 failure('INVALID_SOURCE_SHA',()=>proposeRhythmCuts(example({voice_source_sha256:'not-a-hash'})));
 failure('UNKNOWN_FIELD',()=>proposeRhythmCuts(example({shell_command:'rm -rf /'})));
 failure('INVALID_BEATS',()=>proposeRhythmCuts(example({beats:Array.from({length:5001},()=>({frame:1}))})));
 failure('INVALID_MANUAL_CUTS',()=>proposeRhythmCuts(example({manual_cut_frames:Array.from({length:101},()=>1)})));
});
test('schema fields and status are proposed contracts, not actor authentication',()=>{
 const schema=JSON.parse(readFileSync(new URL('../schemas/montage/rhythm-v1.schema.json',import.meta.url),'utf8'));
 assert.equal(schema.properties.schema_version.const,1);
 assert.ok(schema.required.includes('voice_source_sha256'));
 assert.ok(schema.properties.words.maxItems<=2500);
 const p=proposeRhythmCuts(example());
 assert.equal(p.approved,false);
 assert.equal(p.persisted,false);
 assert.equal(p.cuts[0].confidence,'source_marker_unverified');
});

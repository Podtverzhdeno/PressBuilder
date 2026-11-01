import test from 'node:test';
import assert from 'node:assert/strict';
import {creativeStoryboardService,approvedScriptFingerprint} from '../server/creative-storyboard.mjs';

function fixture(){
 const id='six-story';
 const deck={id,title:'B2B pipeline',text:'Narration only',style:'terevo',
  format:{fps:24,height:1080},lead:0,tail:0,target:6,
  slides:Array.from({length:6},(_,i)=>({
   id:'s0'+(i+1),label:'Scene '+(i+1),lead:0,tail:0,
   cues:[{id:'c01',say:['Request initiated','Search for partners',
     'Three offers arrive','Permissions are validated',
     'Bank confirms settlement','The transaction is closed'][i],dur:1}]
  }))};
 const approved={id,status:'approved',revision:2,
   script_fingerprint:approvedScriptFingerprint(deck)};
 const service=creativeStoryboardService({getDeck:()=>deck,getDirectorPlan:()=>approved,
   enabled:true});
 return {id,deck,approved,service};
}
const bad=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);
test('P16 requires approved current P10 script and exactly six scenes',()=>{
 const x=fixture();
 const disabled=creativeStoryboardService({getDeck:()=>x.deck,getDirectorPlan:()=>x.approved});
 bad('CREATIVE_STORYBOARD_DISABLED',()=>disabled.context(x.id));
 x.approved.status='draft';
 bad('STORY_SOURCE_NOT_APPROVED',()=>x.service.context(x.id));
 x.approved.status='approved';
 x.deck.slides.pop();
 bad('STORY_SOURCE_STALE',()=>x.service.context(x.id));
});
test('P16 produces two distinct complete narrative orders without invented claims',()=>{
 const x=fixture();
 const context=x.service.context(x.id);
 const original=JSON.stringify(x.deck);
 const r=x.service.preview(x.id,{expected_plan_revision:2,
   expected_source_sha256:context.source_sha256});
 assert.equal(r.status,'READY_FOR_REVIEW');
 assert.equal(r.candidates.length,2);
 assert.deepEqual(r.candidates[0].order,['s01','s02','s03','s04','s05','s06']);
 assert.deepEqual(r.candidates[1].order,['s05','s01','s02','s03','s04','s06']);
 assert.notEqual(r.candidates[0].plan_sha256,r.candidates[1].plan_sha256);
 assert.equal(r.coverage.claim_sources,6);
 for(const candidate of r.candidates){
  assert.equal(candidate.publication_allowed,false);
  assert.equal(candidate.downstream_eligible,false);
  assert.equal(candidate.beats.length,6);
  assert.equal(new Set(candidate.beats.map(b=>b.scene_id)).size,6);
  assert.equal(candidate.estimated_duration_us,6_000_000);
  assert.equal(candidate.beats.flatMap(b=>b.cue_anchors).length,6);
  for(const beat of candidate.beats){
   const anchored=x.deck.slides.find(s=>s.id===beat.scene_id).cues[0];
   assert.equal(beat.cue_anchors[0].text,anchored.say);
  }
 }
 assert.equal(r.publication_allowed,false);
 assert.equal(r.approved,false);assert.equal(r.applied,false);
 assert.equal(JSON.stringify(x.deck),original);
});
test('P16 rejects stale plan/replaced approved script, arbitrary instructions and hallucinated anchors',()=>{
 const x=fixture(),c=x.service.context(x.id);
 const args={expected_plan_revision:2,expected_source_sha256:c.source_sha256};
 bad('STORY_REVISION_CONFLICT',()=>x.service.preview(x.id,{...args,expected_plan_revision:1}));
 bad('STORY_REVISION_CONFLICT',()=>x.service.preview(x.id,{...args,
  expected_source_sha256:'f'.repeat(64)}));
 bad('STORY_REQUEST_INVALID',()=>x.service.preview(x.id,{...args,
  narrative_instruction:'Invent more attractive product claims'}));
 x.deck.slides[0].cues[0].say='Mutated after approval';
 bad('STORY_SOURCE_STALE',()=>x.service.preview(x.id,args));
});
test('P16 rejects too few distinct source facts, duplicated IDs and empty narration',()=>{
 const x=fixture();
 for(const scene of x.deck.slides)scene.cues[0].say='Same';
 x.approved.script_fingerprint=approvedScriptFingerprint(x.deck);
 bad('STORY_INSUFFICIENT_DISTINCT_EVIDENCE',()=>x.service.context(x.id));
 x.deck.slides[2].cues[0].say='Different';
 x.deck.slides[3].cues[0].say='Third';
 x.deck.slides[0].id='s02';
 x.approved.script_fingerprint=approvedScriptFingerprint(x.deck);
 bad('STORY_SCENE_IDS_INVALID',()=>x.service.context(x.id));
 x.deck.slides[0].id='s01';x.deck.slides[5].cues[0].say='';
 x.approved.script_fingerprint=approvedScriptFingerprint(x.deck);
 bad('STORY_CUE_EMPTY_OR_TOO_LONG',()=>x.service.context(x.id));
});
test('P16 storyboard source hash invalidates any revised human P10 plan',()=>{
 const x=fixture(),old=x.service.context(x.id);
 x.approved.revision++;
 const next=x.service.context(x.id);
 assert.notEqual(next.source_sha256,old.source_sha256);
 bad('STORY_REVISION_CONFLICT',()=>x.service.preview(x.id,{
  expected_plan_revision:old.plan_revision,expected_source_sha256:old.source_sha256}));
});

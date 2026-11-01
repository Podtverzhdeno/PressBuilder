/**
 * P16-C01/C02: source-pinned creative storyboard alternatives.
 * NEVER rewrites, reorders or approves a deck, P10 plan or published video.
 * A preview is NOT legal/factual or editorial approval.
 */
import {createHash} from 'node:crypto';
import {buildSchedule} from '../src/engine/schedule.ts';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const SHA=/^[a-f0-9]{64}$/;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};

export function approvedScriptFingerprint(deck){
  return digest({id:deck.id,title:deck.title,text:deck.text,
    style:deck.style,format:deck.format,target:deck.target,
    lead:deck.lead,tail:deck.tail,
    slides:(deck.slides||[]).map(s=>({
      id:s.id,label:s.label,lead:s.lead,tail:s.tail,cues:s.cues
    }))});
}
function approvedContext(id,deck,plan){
  if(!deck||!plan||!['approved','released'].includes(plan.status))
    fail('STORY_SOURCE_NOT_APPROVED',409);
  if(plan.id!==id||!Number.isSafeInteger(plan.revision)||plan.revision<1||
     !SHA.test(plan.script_fingerprint)||approvedScriptFingerprint(deck)!==plan.script_fingerprint)
    fail('STORY_SOURCE_STALE',409);
  if(!Array.isArray(deck.slides)||deck.slides.length!==6)
    fail('STORY_REQUIRES_SIX_SCENES',422);
  const ids=deck.slides.map(s=>s.id);
  if(ids.some(x=>typeof x!=='string'||!SLUG.test(x))||new Set(ids).size!==6)
    fail('STORY_SCENE_IDS_INVALID',422);
  const schedule=buildSchedule(deck);
  if(!Number.isFinite(schedule.duration)||schedule.duration<=0||
     schedule.duration>3600)fail('STORY_DURATION_INVALID',422);
  const scenes=schedule.slides.map((scene,i)=>{
    const cues=scene.cues.map(c=>{
      if(typeof c.say!=='string'||!c.say.trim()||c.say.length>10_000||
         typeof c.id!=='string'||!c.id)
        fail('STORY_CUE_EMPTY_OR_TOO_LONG',422);
      return {cue_id:c.id,text:c.say,
        source_sha256:digest({scene_id:scene.slide.id,cue_id:c.id,text:c.say}),
        start_us:Math.round((scene.start+c.start)*1_000_000),
        end_us:Math.round((scene.start+c.start+c.dur)*1_000_000)};
    });
    if(!cues.length||cues.length>250)fail('STORY_CUE_COUNT_INVALID',422);
    return {scene_id:scene.slide.id,source_index:i,
      label:String(scene.slide.label||'Scene '+(i+1)).slice(0,180),
      source_start_us:Math.round(scene.start*1_000_000),
      duration_us:Math.round(scene.dur*1_000_000),
      cue_anchors:cues};
  });
  if(new Set(scenes.flatMap(s=>s.cue_anchors.map(c=>c.text.trim()))).size<3)
    fail('STORY_INSUFFICIENT_DISTINCT_EVIDENCE',422);
  const source_sha256=digest({script_fingerprint:plan.script_fingerprint,
    plan_revision:plan.revision,scenes});
  return {project_id:id,plan_revision:plan.revision,
    script_fingerprint:plan.script_fingerprint,source_sha256,
    fps:deck.format?.fps??null,duration_us:Math.round(schedule.duration*1_000_000),
    scenes};
}
const narrativeRoles=['hook','exposition','demonstration','tension','climax','payoff'];
function candidate(label,order,source,why){
  const byId=new Map(source.scenes.map(s=>[s.scene_id,s]));
  const beats=order.map((id,i)=>{
    const scene=byId.get(id);
    return {beat_index:i+1,narrative_role:narrativeRoles[i],scene_id:id,
      source_index:scene.source_index,source_start_us:scene.source_start_us,
      estimated_duration_us:scene.duration_us,
      cue_anchors:scene.cue_anchors.map(c=>({
        cue_id:c.cue_id,source_sha256:c.source_sha256,
        source_start_us:c.start_us,source_end_us:c.end_us,text:c.text
      })),
      editorial_note:i===0?
        'Use the exact scene narration as the opening; do not add a factual claim':
        i===5?'Preserve the exact final source scene as the payoff':
        'Keep this scene grounded in its original cue text'};
  });
  const estimated_duration_us=beats.reduce((n,b)=>n+b.estimated_duration_us,0);
  return {candidate_id:label,order,reason:why,beats,estimated_duration_us,
    source_sha256:source.source_sha256,
    approved:false,downstream_eligible:false,publication_allowed:false,
    plan_sha256:digest({label,order,source:source.source_sha256})};
}
export function creativeStoryboardService({getDeck,getDirectorPlan,enabled=false}){
  function context(id){
    if(!enabled)fail('CREATIVE_STORYBOARD_DISABLED',501);
    if(typeof id!=='string'||!SLUG.test(id))fail('STORY_PROJECT_INVALID',400);
    return approvedContext(id,getDeck(id),getDirectorPlan(id));
  }
  function preview(id,input){
    if(!input||typeof input!=='object'||Array.isArray(input)||
       Object.keys(input).some(x=>!['expected_plan_revision','expected_source_sha256'].includes(x)))
      fail('STORY_REQUEST_INVALID',400);
    const c=context(id);
    if(!Number.isSafeInteger(input.expected_plan_revision)||
       input.expected_plan_revision!==c.plan_revision||
       input.expected_source_sha256!==c.source_sha256)
      fail('STORY_REVISION_CONFLICT',409);
    const original=c.scenes.map(x=>x.scene_id);
    // Explicitly change the hook but preserve the final payoff scene.
    // These are distinct editorial alternatives, NOT automatic approved reorder.
    const teaser=[original[4],...original.slice(0,4),original[5]];
    if(teaser.join('|')===original.join('|'))
      fail('STORY_ALTERNATIVES_NOT_DISTINCT',422);
    const candidates=[
      candidate('source_arc',original,c,
        'Retain verified script order: opening context, sequence of developments, final payoff'),
      candidate('cold_open',teaser,c,
        'Preview scene five as a cold-open teaser, return to original setup, keep final payoff last')
    ];
    return {schema_version:1,status:'READY_FOR_REVIEW',
      project_id:id,plan_revision:c.plan_revision,
      source_sha256:c.source_sha256,script_fingerprint:c.script_fingerprint,
      candidates,coverage:{scenes:6,variants:2,
        claim_sources:c.scenes.reduce((n,s)=>n+s.cue_anchors.length,0),
        source_facts_rewritten:0},
      require_human_storyboard_approval:true,
      applied:false,approved:false,downstream_eligible:false,
      publication_allowed:false,
      limitations:[
        'Candidate order is a storyboard preview, not edited audio or a P10 approved plan',
        'Source-text anchors do not independently verify the truth of claims',
        'P10 scene dependencies and voice timeline need separate approval before reorder',
        'No scene lease, README, task or video output is changed'
      ]};
  }
  return {context,preview};
}

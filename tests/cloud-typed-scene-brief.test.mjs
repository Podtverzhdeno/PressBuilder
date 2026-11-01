import {test} from 'node:test';
import assert from 'node:assert/strict';
import {typedSceneBriefService} from '../server/typed-scene-brief.mjs';
import {fingerprint} from '../server/director.mjs';

function fixture(){
 const deck={id:'six',title:'Сделка',text:'Первая компания проверяет данные.',
  style:'terevo',format:{fps:24,height:1080},target:42,lead:0,tail:0,
  slides:[{id:'s01',label:'Начало',lead:0,tail:0,cues:[
   {id:'c1',say:'Первая компания проверяет данные.',show:'Проверка.'}
  ]}]};
 const task={scene_id:'s01',title:'Начало',assignee:'agent-01',brief:'Объяснить только исходное сообщение.',
  status:'todo',deliverables:'MP4 с отчётом',revision:3,
  checkpoints:[{id:'render',title:'Отрендерить сцену',done:false,note:''},
   {id:'human_review',title:'Получить решение',done:false,note:''}]};
 const plan={id:'six',status:'approved',revision:2,plan_id:'12345678-aaaa-bbbb-cccc-123456789abc',
  script_fingerprint:fingerprint(deck),style_contract_revision:4,goal:'Шесть сцен про проверку.',
  scenes:[{scene_id:'s01',depends_on:[],task:{title:'Начало'}}]};
 const styles={read:()=>({revision:4})};
 const bindings={getDeck:()=>deck,directorPlan:{read:()=>plan},sceneTasks:{read:()=>task},
   styles,enabled:true};
 return {deck,task,plan,styles,bindings};
}
const denies=(code,fn)=>assert.throws(fn,x=>x?.code===code,code);

test('M40 typed brief compiles only approved narration, deterministic SHA and no release authority',()=>{
 const {bindings,deck,task}=fixture(),svc=typedSceneBriefService(bindings);
 const one=svc.read('six','s01'),two=svc.read('six','s01');
 assert.deepEqual(one,two);
 assert.equal(one.schema_version,2);
 assert.match(one.brief_sha256,/^[a-f0-9]{64}$/);
 assert.equal(one.script_sha256,fingerprint(deck));
 assert.equal(one.task_revision,3);
 assert.deepEqual(one.factual_integrity.mandatory_source_cue_ids,['c1']);
 assert.equal(one.factual_integrity.claims_evidence_status,'UNVERIFIED');
 assert.equal(one.acceptance.approved_mp4_proven,false);
 assert.equal(one.acceptance.publication_allowed,false);
 assert.equal(one.acceptance.human_independent_review_required,true);
 assert.equal(one.authorizations.lease_token,'REQUIRED_FOR_ANY_WRITE');
 assert.equal(one.source_cues[0].spoken_text,'Первая компания проверяет данные.');
 task.revision=4;
 const changed=svc.read('six','s01');assert.notEqual(changed.brief_sha256,one.brief_sha256);
});
test('M40 fails closed on drafts, source/plan drift, malformed assignments and style change',()=>{
 const f=fixture(),svc=typedSceneBriefService(f.bindings);
 f.plan.status='draft';denies('TYPED_BRIEF_DIRECTOR_APPROVAL_REQUIRED',()=>svc.read('six','s01'));
 f.plan.status='approved';
 f.deck.slides[0].cues[0].say='Подменённая реплика';
 denies('TYPED_BRIEF_SCRIPT_DRIFT',()=>svc.read('six','s01'));
 f.deck.slides[0].cues[0].say='Первая компания проверяет данные.';
 f.styles.read=()=>({revision:5});
 denies('TYPED_BRIEF_STYLE_DRIFT',()=>svc.read('six','s01'));
 f.styles.read=()=>({revision:4});
 f.task.assignee='';
 denies('TYPED_BRIEF_TASK_INVALID',()=>svc.read('six','s01'));
 f.task.assignee='agent-01';
 f.task.checkpoints[0].done='true';
 denies('TYPED_BRIEF_CHECKPOINT_INVALID',()=>svc.read('six','s01'));
 f.task.checkpoints[0].done=false;
 denies('TYPED_BRIEF_SCENE_NOT_IN_APPROVED_PLAN',()=>svc.read('six','s02'));
 denies('TYPED_BRIEF_INVALID_ID',()=>svc.read('six','../s01'));
 denies('TYPED_SCENE_BRIEFS_DISABLED',()=>typedSceneBriefService({...f.bindings,enabled:false}).read('six','s01'));
});
test('M40 snapshot read rejects plan revision and task revision races, without any writes',()=>{
 const f=fixture();let reads=0;
 const base=f.plan;
 const svc=typedSceneBriefService({...f.bindings,directorPlan:{read:()=>{reads++;return reads>1?{...base,revision:3}:base}}});
 denies('TYPED_BRIEF_SOURCE_CHANGED_DURING_READ',()=>svc.read('six','s01'));
 let count=0;
 const svc2=typedSceneBriefService({...f.bindings,sceneTasks:{read:()=>{count++;return count>1?{...f.task,revision:4}:f.task}}});
 denies('TYPED_BRIEF_SOURCE_CHANGED_DURING_READ',()=>svc2.read('six','s01'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const expected = [
 ['P15', 'rhythm-engine', ['Aligned timebase','Pacing constraints','Determinism and review']],
 ['P16', 'creative-director', ['Narrative alternatives','Human story approval','Constrained replan']],
 ['P17', 'cinematic-continuity', ['Entry and exit scene state','Frame-safe cuts','Reviewer boundary compare']],
 ['P18', 'professional-motion', ['Bounded animated properties','Motion blur and speed ramp','Performance and accessibility']],
 ['P19', 'sound-design', ['Versioned audio bus model','Ducking and loudness','Audio/video sync and recovery']],
 ['P20', 'kinetic-typography', ['Word-level typography cues','Real glyph geometry','Readable and accessible motion']],
 ['P21', 'color-lighting', ['Color-managed source transform','Cross-scene exposure match','Safety and rollout']],
 ['P22', 'smart-b-roll', ['Rights-aware catalog only','Semantic and timing fit','Attribution, fingerprint and change control']],
 ['P23', 'creative-montage-qa', ['Separated severity semantics','Timecoded multi-modal evidence','Calibration and reviewer signoff']],
 ['P24', 'professional-timeline', ['Revisioned canonical edit graph','Interchange with loss report','Safe delivery and reproducibility']],
];
const change='openspec/changes/professional-montage-p15-p24';
const sdd='specs/002-professional-montage';
const registry=JSON.parse(read('docs/pro-montage-checkpoints.json'));
const sddTasks=read(sdd+'/tasks.md');
const osTasks=read(change+'/tasks.md');
const specText=read(sdd+'/spec.md');
const legalStates=new Set(['TODO','IN_PROGRESS','IMPLEMENTED','TESTED','REVIEWED','ACCEPTED','BLOCKED','REWORK']);
const regexCount=(text,regex)=>[...text.matchAll(regex)].length;

test('10 OpenSpec capabilities, 30 SHALL requirements and 60 WHEN/THEN scenarios',()=>{
  let reqCount=0,scenarioCount=0;
  for(const [id,slug,names] of expected){
    const path=change+'/specs/'+slug+'/spec.md';
    assert.ok(existsSync(join(root,path)),path);
    const data=read(path);
    assert.match(data,/^## ADDED Requirements$/m,id);
    const requirements=[...data.matchAll(/^### Requirement: (.+)$/gm)].map(x=>x[1]);
    assert.deepEqual(requirements,names,id+' required names');
    const scenarios=regexCount(data,/^#### Scenario: /gm);
    assert.equal(scenarios,6,id+' needs one success and one failure per requirement');
    assert.equal(regexCount(data,/^- \*\*WHEN\*\* /gm),6);
    assert.equal(regexCount(data,/^- \*\*THEN\*\* /gm),6);
    assert.equal(regexCount(data,/\bSHALL\b/g),3);
    reqCount+=requirements.length; scenarioCount+=scenarios;
  }
  assert.equal(reqCount,30);assert.equal(scenarioCount,60);
});

test('SDD FR-101..FR-130 maps to exact canonical OpenSpec names',()=>{
 let fr=101;
 for(const [,slug,requirements] of expected){
  for(const name of requirements){
    const row=specText.split('\n').find(line=>line.includes('| FR-'+fr+' |'));
    assert.ok(row,'missing FR-'+fr);
    assert.ok(row.includes(slug+' / '+name),'stale FR target '+fr);
    fr++;
  }
 }
 assert.equal(fr,131);
 assert.equal(regexCount(specText,/^\| FR-\d{3} \|/gm),30);
});

test('All 60 checkpoint IDs are unique and each exists in both task documents',()=>{
  assert.equal(registry.checkpoints.length,60);
  const ids=registry.checkpoints.map(x=>x.id);
  assert.equal(new Set(ids).size,60);
  const expectedIds=new Set(expected.flatMap(([id])=>Array.from({length:6},(_,i)=>id+'-C0'+(i+1))));
  assert.deepEqual(new Set(ids),expectedIds);
  for(const id of ids){
    assert.equal(regexCount(sddTasks,new RegExp('^#### '+id+' — ','gm')),1,'SDD duplicate/missing '+id);
    assert.equal(regexCount(osTasks,new RegExp('^- \\[.\\] '+id+' — ','gm')),1,'OpenSpec duplicate/missing '+id);
  }
});

test('Machine checkpoint entries have constrained status, dependencies, explicit evidence',()=>{
 const ids=new Set(registry.checkpoints.map(x=>x.id));
 assert.equal(registry.schema_version,1);
 assert.equal(registry.change,'professional-montage-p15-p24');
 for(const item of registry.checkpoints){
  assert.ok(legalStates.has(item.status),item.id);
  assert.ok(item.id.startsWith(item.feature+'-'));
  assert.ok(item.capability && item.planned_output && item.implementation_steps?.length>=3);
  assert.ok(item.acceptance?.length>=2 && item.negative_tests?.length>20);
  assert.ok(Array.isArray(item.dependencies));
  assert.ok(Array.isArray(item.evidence),item.id);
  assert.equal(new Set(item.dependencies).size,item.dependencies.length);
  for(const dep of item.dependencies) assert.ok(ids.has(dep),item.id+' references nonexistent '+dep);
  assert.ok(!item.dependencies.includes(item.id));
  if(item.status==='ACCEPTED'){
   assert.ok(item.reviewer && item.completed_at,item.id+' missing independent signoff');
   assert.ok(item.evidence.some(e=>e.commit_sha && e.run_url && e.exit_code===0),
             item.id+' missing observed acceptance proof');
  } else {
   assert.notEqual(item.release_eligible,true,item.id+' cannot release unaccepted work');
  }
  const checked='- [x] '+item.id+' —';
  assert.equal(sddTasks.includes(checked),item.status==='ACCEPTED',
               item.id+' markdown differs from machine acceptance');
  assert.equal(osTasks.includes(checked),item.status==='ACCEPTED',
               item.id+' OpenSpec task differs from machine acceptance');
 }
});

test('Directed dependency graph is acyclic and all stage dependencies are earlier',()=>{
 const values=new Map(registry.checkpoints.map(x=>[x.id,x]));
 const seen=new Set(),ongoing=new Set();
 function visit(id){
  if(ongoing.has(id))throw new Error('cycle '+id);
  if(seen.has(id))return;
  ongoing.add(id);
  for(const dep of values.get(id).dependencies)visit(dep);
  ongoing.delete(id);seen.add(id);
 }
 for(const item of registry.checkpoints)visit(item.id);
 assert.equal(seen.size,60);
});

test('Canonical docs and onboarding exist without asserting implementation',()=>{
 for(const path of [
  'openspec/config.yaml',change+'/.openspec.yaml',change+'/proposal.md',
  change+'/design.md',sdd+'/spec.md',sdd+'/plan.md',
  'docs/PRO_MONTAGE_AGENTS.md']){
  assert.ok(existsSync(join(root,path)),path);
 }
 assert.match(read('docs/PRO_MONTAGE_AGENTS.md'),/not.*(grant|deploy)|do not.*deploy/i);
 assert.match(read(change+'/proposal.md'),/Out of Scope/);
 assert.match(read(sdd+'/spec.md'),/NOT IMPLEMENTED/);
});

test('every SDD status matches machine registry and TESTED has observed CI evidence',()=>{
 for(const item of registry.checkpoints){
  const match=sddTasks.match(new RegExp('^- \\[([ x])\\] '+item.id+' — ([A-Z_]+)\\b','m'));
  assert.ok(match,item.id+' missing explicit SDD status');
  assert.equal(match[2],item.status,item.id+' status drift in SDD');
  assert.equal(match[1],item.status==='ACCEPTED'?'x':' ',item.id+' acceptance drift');
  if(item.status==='TESTED'){
   assert.match(item.source_commit_sha||'',/^[a-f0-9]{40}$/);
   assert.ok(item.evidence.some(e=>
      e.exit_code===0 && e.command && e.commit_sha===item.source_commit_sha &&
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(e.run_url)
   ),item.id+' missing genuine CI source reference');
   assert.equal(item.release_eligible,false);
   assert.equal(item.reviewer,null,'TESTED cannot self-claim independent reviewer');
  }
 }
});

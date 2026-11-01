/** Safety/coverage guard for the spec-first M01..M60 change. It does not assert any feature is implemented. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dir=path.join(process.cwd(),'openspec/changes/video-quality-top60');
const read=p=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
const registry=JSON.parse(read('docs/top60-montage-registry.json'));
const score=p=>{const s=p.scores;return Math.round((.30*s.quality_gain+.25*s.edit_time_gain+.20*s.feasibility+
 .10*s.tco_efficiency+.10*s.safety_reliability+.05*s.platform_leverage)*100)/100};
const groups=['editorial','audio','visual','content','pipeline','quality'];
test('M01..M60: unique source spec, six exact domains, strict ranking and no fake shipped states',()=>{
 assert.equal(registry.schema_version,1);
 assert.equal(registry.status,'SPECIFICATION_ONLY');
 assert.equal(registry.items.length,60);
 assert.equal(new Set(registry.items.map(x=>x.id)).size,60);
 assert.equal(new Set(registry.items.map(x=>x.title)).size,60);
 const copies=[];
 for(const cat of groups){
  const doc=read('openspec/changes/video-quality-top60/specs/'+cat+'/spec.md');
  const ids=[...doc.matchAll(/^### Requirement (M\d{2}) — ([^\n]+)/gm)];
  assert.equal(ids.length,10,cat);
  for(const [i,m] of ids.entries()){
   const from=m.index,until=i+1<ids.length?ids[i+1].index:doc.length;
   const section=doc.slice(from,until);
   assert.match(section,/\*\*статус:\*\* PROPOSED/);
   assert.match(section,/\*\*зависимости:\*\*/);
   assert.match(section,/\*\*оценки Q\/E\/F\/C\/S\/L:\*\*/);
   assert.match(section,/DoD|Проверяемые критерии|Проверка эффекта|Acceptance/);
   assert.match(section,/Негативн|Риски|риск|сценарии|отрицательн|trade-off/i);
   copies.push(m[1]);
  }
 }
 assert.equal(new Set(copies).size,60);
 assert.deepEqual([...copies].sort(),Array.from({length:60},(_,i)=>'M'+String(i+1).padStart(2,'0')));
 const sorted=[...registry.items].sort((a,b)=>b.score-a.score||
  b.scores.quality_gain-a.scores.quality_gain||
  b.scores.edit_time_gain-a.scores.edit_time_gain||
  b.scores.feasibility-a.scores.feasibility||
  a.id.localeCompare(b.id));
 assert.deepEqual(registry.items.map(x=>x.id),sorted.map(x=>x.id));
 for(const [index,x] of registry.items.entries()){
  assert.equal(x.rank,index+1);
  assert.equal(x.score,score(x));
  assert.equal(x.status,'PROPOSED');
  assert.equal(x.implementation_verified,false);
  assert.equal(x.production_enabled,false);
  assert.ok(x.depends_on.length>0);
  assert.ok(['W0','W1','W2','W3','W4'].includes(x.wave));
  assert.equal(x.tier,x.score>=9.4?'S':x.score>=8.8?'A':x.score>=8.2?'B':'C');
 }
});
test('M01..M60 SDD: precisely 480 planned checkpoints, no false acceptance',()=>{
 const tasks=fs.readFileSync(path.join(dir,'tasks.md'),'utf8');
 const index=read('docs/TOP60_MONTAGE_RANKING.md');
 for(const x of registry.items){
  assert.ok(tasks.includes('### '+x.id+' — '+x.title),x.id);
  assert.ok(index.includes('['+x.id+']('),x.id);
  assert.ok(tasks.includes(x.id+'-C08'),x.id);
  for(let i=1;i<=8;i++){
   assert.equal((tasks.match(new RegExp('- \\[ \\] \\*\\*'+x.id+'-C0'+i+'\\b','g'))||[]).length,1,x.id+' C0'+i);
  }
 }
 assert.equal((tasks.match(/^- \[ \] \*\*M\d{2}-C0[1-8]\b/gm)||[]).length,480);
 assert.equal((tasks.match(/^- \[x\]/gmi)||[]).length,0);
 assert.match(index,/взвешенн|взвеш|0\.30 Q/);
});

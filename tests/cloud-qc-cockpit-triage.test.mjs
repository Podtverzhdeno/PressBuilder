import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {qcEventTitle,qcDispositionLabel,qcSeverityLabel,
  qcFilterEvents,qcNeedsAttention,qcTriageCounts}
  from '../src/editor/qc-feedback.ts';

const event=(id,overrides={})=>({
 id,source:'P07_REVIEW',scene_id:'s01',issue_code:'HUMAN_REVIEW',
 message:'Review',severity:'high',disposition:'OPEN',
 global_seconds:1.2,requires_human_review:true,...overrides,
});
test('M51-R02 actionable triage counts and filters preserve verified/unlocated findings',()=>{
 const cases=[
  event('open'),
  event('fixed',{disposition:'FIXED'}),
  event('verified',{disposition:'VERIFIED',requires_human_review:false}),
  event('untimed',{source:'P05_OUTPUT_QA_UNTIMED',scene_id:null,
   global_seconds:null,issue_code:'AUDIO_CODEC',disposition:'UNLOCATED'}),
  event('second',{scene_id:'s02',disposition:'REOPENED'}),
 ];
 const count=qcTriageCounts(cases);
 assert.deepEqual(count,{all:5,attention:4,unlocated:1,verified:1});
 assert.deepEqual(qcFilterEvents(cases,'attention').map(x=>x.id),
  ['open','fixed','untimed','second']);
 assert.deepEqual(qcFilterEvents(cases,'verified').map(x=>x.id),['verified']);
 assert.deepEqual(qcFilterEvents(cases,'unlocated').map(x=>x.id),['untimed']);
 assert.deepEqual(qcFilterEvents(cases,'attention','s01').map(x=>x.id),
  ['open','fixed']);
 assert.deepEqual(qcFilterEvents(cases,'all','s02').map(x=>x.id),['second']);
 assert.equal(cases.some(x=>qcNeedsAttention(x)&&x.id==='verified'),false);
 assert.equal(qcFilterEvents(cases,'all').length,5);
});
test('M51-R02 explanations avoid pretending unlocated QA has a timestamp or verified outcome',()=>{
 const human=event('human');
 const untimed=event('codec',{source:'P05_OUTPUT_QA_UNTIMED',
  issue_code:'VIDEO_CODEC',global_seconds:null,disposition:'UNLOCATED'});
 const unknown=event('unknown',{source:'P05_OUTPUT_QA_UNTIMED',
  issue_code:'FOO_UNKNOWN',global_seconds:null,disposition:'WEIRD'});
 assert.equal(qcEventTitle(human),'Замечание к сцене');
 assert.equal(qcEventTitle(untimed),'Проверить формат видео');
 assert.equal(qcEventTitle(unknown),'Техническое замечание');
 assert.equal(qcDispositionLabel('VERIFIED'),'Подтверждено ревьюером');
 assert.equal(qcDispositionLabel('FIXED'),'Исправлено, ожидает подтверждения');
 assert.equal(qcDispositionLabel('WEIRD'),'Статус не определён');
 assert.equal(qcSeverityLabel('blocking'),'Блокирующее');
 assert.equal(qcSeverityLabel('technical'),'Техническая');
 assert.equal(qcSeverityLabel('unknown'),'Неизвестная важность');
 assert.equal(qcNeedsAttention(untimed),true);
 assert.equal(qcNeedsAttention(unknown),true);
});
test('M51-R02 UI never auto-publishes or turns M58 synthetic report into a real finding',()=>{
 const panel=fs.readFileSync(new URL('../src/editor/QcCockpitPanel.tsx',import.meta.url),'utf8');
 assert.match(panel,/requestVersion\.current\+\+/);
 assert.match(panel,/data\?\.project_id===projectId/);
 assert.match(panel,/Не удалось загрузить MP4/);
 assert.match(panel,/не содержат результаты отдельного M58 аудиоанализа/);
 assert.match(panel,/Публикация запрещена/);
 assert.doesNotMatch(panel,/setDisposition|setPublicationAllowed|approveRelease/);
 assert.match(panel,/event.key!=='Escape'/);
 assert.match(panel,/document.fullscreenElement/);
 const app=fs.readFileSync(new URL('../src/editor/App.tsx',import.meta.url),'utf8');
 assert.match(app,/modal === 'qc-cockpit'\) return;/,
  'global undo/redo/save shortcuts must not run behind QC modal');
});

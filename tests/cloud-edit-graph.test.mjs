import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {editGraphService,frameClock,snapFrame,TICKS_PER_SECOND} from '../server/edit-graph.mjs';

const deny=(fn,code)=>assert.throws(fn,e=>e?.code===code||e?.message===code,code);
const director={id:'web-director',role:'director'};
const worker={id:'agent-01',role:'worker'};
const sha=x=>String(x).repeat(64).slice(0,64);
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m01-'));
 fs.mkdirSync(path.join(root,'demo'),{recursive:true});
 const deck={id:'demo',title:'Test',text:'Hello world',style:'paper',
  target:null,lead:0,tail:0,format:{fps:24,height:720,bitrate:8},
  slides:[{id:'s01',label:'A',cues:[{id:'c01',say:'Intro',dur:2}]},
    {id:'s02',label:'B',cues:[{id:'c02',say:'Outro',dur:2}]}]};
 const assembly={revision:2,plan:{scenes:deck.slides.map((x,i)=>({
  scene_id:x.id,transition_after:{type:i===1?'hard-cut':'crossfade',
   duration:i===1?0:0.25}}))}};
 const state={s01:{revision:1,markers:[{id:'beat1',kind:'beat'}],
   timeline:{events:[{id:'beat1',kind:'beat',global_time:0.75,out_of_range:false}]}},
  s02:{revision:0,markers:[],timeline:{events:[]}}};
 let sourceOn=true,sourceSha=sha('a');
 const versions={approved:(id,scene)=>{
  if(scene!=='s01'||!sourceOn)return {version_id:null,revision:0,artifact:null};
  return {version_id:'1234567890abcdef',revision:1,artifact:{
   version_id:'1234567890abcdef',sha256:sourceSha,duration:2,fps:24,qa:{verdict:'PASS'}}};
 }};
 const args={root,getDeck:id=>{if(id!=='demo')throw Error('Project missing');return deck},
  sceneSync:{read:(id,scene)=>state[scene]},assemblyPlans:{read:()=>assembly},versions,enabled:true};
 const edit=editGraphService(args);
 return {root,deck,state,assembly,edit,versions,args,disableSource:()=>sourceOn=false,
  changeSha:()=>sourceSha=sha('b'),
  cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('M01 exact 24/29.97/23.976 tick step and no accumulated fractional frame drift',()=>{
 assert.equal(TICKS_PER_SECOND,240000);
 assert.deepEqual(frameClock(24),{num:24,den:1,frame_ticks:10000});
 assert.equal(frameClock(30000/1001).frame_ticks,8008);
 assert.equal(frameClock(29.97).frame_ticks,8008);
 assert.equal(frameClock(24000/1001).frame_ticks,10010);
 assert.equal(48000*5,TICKS_PER_SECOND);
 const c=frameClock({num:30000,den:1001});
 for(let n=0;n<10000;n+=71){
  const time=n*1001/30000;
  assert.equal(snapFrame(time,c),n);
  assert.equal(snapFrame(time,c)*c.frame_ticks,n*8008);
 }
 deny(()=>frameClock(23.123),'EDITGRAPH_FPS_UNSUPPORTED');
 deny(()=>frameClock(Number.NaN),'EDITGRAPH_FPS_UNSUPPORTED');
 deny(()=>snapFrame(Infinity,frameClock(24)),'EDITGRAPH_TIME_OUT_OF_BOUNDS');
});
test('M01 baseline exposes deterministic pinned source cues, P09 markers and declared P05 transitions',()=>{
 const f=fixture();try{
  const a=f.edit.read('demo'),b=f.edit.read('demo');
  assert.deepEqual(a,b);
  assert.equal(a.duration_tick,4*TICKS_PER_SECOND);
  assert.deepEqual(a.scenes.map(x=>[x.scene_id,x.start_tick,x.end_tick]),[
   ['s01',0,2*TICKS_PER_SECOND],['s02',2*TICKS_PER_SECOND,4*TICKS_PER_SECOND]]);
  assert.equal(a.scenes[0].cues[0].source_type,'P01_SCHEDULE');
  assert.equal(a.scenes[0].cues[0].start_tick,0);
  assert.equal(a.markers[0].pts_tick,180000);
  assert.equal(a.scenes[0].transition_after.type,'crossfade');
  assert.equal(a.scenes[0].transition_after.overlap_applied,false);
  assert.equal(a.scenes[0].source_media.version_id,'1234567890abcdef');
  assert.equal(a.scenes[1].source_media,null);
  assert.equal(a.publication_allowed,false);
  assert.equal(a.candidate_may_render,false);
  const filtered=f.edit.read('demo',{sceneId:'s01'});
  assert.equal(filtered.scenes.length,1);assert.equal(filtered.markers.length,1);
  assert.equal(filtered.candidate,null);
  deny(()=>f.edit.read('demo',{sceneId:'outside'}),'EDITGRAPH_SCENE_NOT_FOUND');
 }finally{f.cleanup()}
});
test('M01 director CAS trim proposal is source-pinned, nonrenderable and never changes P01/P05/P08',()=>{
 const f=fixture();try{
  const baseline=f.edit.read('demo');
  const result=f.edit.propose('demo',director,{
   expected_revision:0,expected_source_sha256:baseline.source_sha256,
   trims:[{scene_id:'s01',source_in_frame:2,source_out_frame:42}]});
  assert.equal(result.candidate_revision,1);
  assert.equal(result.candidate.status,'REVIEW_ONLY');
  assert.equal(result.candidate.changes[0].source_sha256,sha('a'));
  assert.equal(result.candidate.render_allowed,false);
  assert.equal(result.candidate.publication_allowed,false);
  assert.equal(f.deck.slides[0].cues[0].dur,2);
  assert.equal(f.assembly.revision,2);
  assert.equal(f.edit.read('demo').candidate_state,'PROPOSED');
  deny(()=>f.edit.propose('demo',director,{expected_revision:0,
   expected_source_sha256:baseline.source_sha256,trims:[{scene_id:'s01',source_in_frame:0,source_out_frame:2}]}),'EDITGRAPH_CAS_CONFLICT');
  deny(()=>f.edit.propose('demo',worker,{expected_revision:1,
   expected_source_sha256:baseline.source_sha256,trims:[]}), 'EDITGRAPH_DIRECTOR_REQUIRED');
  f.state.s01.revision++;
  assert.equal(f.edit.read('demo').candidate_state,'STALE_SOURCE');
  deny(()=>f.edit.propose('demo',director,{expected_revision:1,
   expected_source_sha256:baseline.source_sha256,
   trims:[{scene_id:'s01',source_in_frame:0,source_out_frame:40}]}),'EDITGRAPH_SOURCE_STALE');
 }finally{f.cleanup()}
});
test('M01 strictly rejects invalid trims, missing P08, wrong source duration and unsafe state',()=>{
 const f=fixture();try{
  const baseline=f.edit.read('demo');
  const req=trims=>({expected_revision:0,expected_source_sha256:baseline.source_sha256,trims});
  deny(()=>f.edit.propose('demo',director,req([{scene_id:'s01',source_in_frame:0,source_out_frame:0}])),
   'EDITGRAPH_INVALID_TRIM_BOUNDS');
  deny(()=>f.edit.propose('demo',director,req([{scene_id:'s01',source_in_frame:0,source_out_frame:49}])),
   'EDITGRAPH_INVALID_TRIM_BOUNDS');
  deny(()=>f.edit.propose('demo',director,req([{scene_id:'s02',source_in_frame:0,source_out_frame:20}])),
   'EDITGRAPH_APPROVED_MP4_REQUIRED');
  deny(()=>f.edit.propose('demo',director,req([{scene_id:'s01',source_in_frame:0,source_out_frame:20},
    {scene_id:'s01',source_in_frame:20,source_out_frame:42}])), 'EDITGRAPH_INVALID_TRIM_SCENE');
  deny(()=>f.edit.propose('demo',director,{...req([{scene_id:'s01',source_in_frame:0,source_out_frame:20}]),
    path:'/etc/passwd'}),'EDITGRAPH_INVALID_FIELDS');
  f.state.s01.timeline.events[0].out_of_range=true;
  deny(()=>f.edit.read('demo'),'EDITGRAPH_SYNC_INVALID');
  f.state.s01.timeline.events[0].out_of_range=false;
  f.deck.slides[1].cues.push({...f.deck.slides[1].cues[0]});
  deny(()=>f.edit.read('demo'),'EDITGRAPH_DUPLICATE_OR_INVALID_CUE');
  f.deck.slides[1].cues.pop();
  const d=editGraphService({...f.args,enabled:false});
  deny(()=>d.read('demo'),'EDITGRAPH_DISABLED');
  const dir=path.join(f.root,'demo','.editgraph');
  fs.symlinkSync('/etc',dir);
  deny(()=>f.edit.read('demo'),'EDITGRAPH_UNSAFE_STORAGE');
 }finally{f.cleanup()}
});

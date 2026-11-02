import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {editGraphService} from '../server/edit-graph.mjs';
import {applyEditOperation,compileEditPreview,editOperationService,initialEditNodes} from '../server/edit-operations.mjs';
const reject=(fn,code)=>assert.throws(fn,e=>e?.code===code||e?.message===code,code);
const director={id:'d-1',role:'director'};
const worker={id:'agent',role:'worker'};
const sha='a'.repeat(64);
function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pressbuilder-editops-'));
 fs.mkdirSync(path.join(root,'demo'));
 const deck={id:'demo',title:'test',text:'test',target:null,lead:0,tail:0,
  format:{height:720,bitrate:8,fps:24},slides:[
   {id:'s01',label:'one',cues:[{id:'c01',say:'One',dur:2}]},
   {id:'s02',label:'two',cues:[{id:'c02',say:'Two',dur:2}]}]};
 let pointerSha=sha;
 const versions={approved:(_id,scene)=>({version_id:scene==='s01'?'1111111111111111':'2222222222222222',
  revision:1,artifact:{sha256:pointerSha,qa:{verdict:'PASS'},duration:2,fps:24}})};
 const editGraph=editGraphService({root,getDeck:()=>deck,versions,enabled:true});
 const ops=editOperationService({root,editGraph,enabled:true});
 const cleanup=()=>fs.rmSync(root,{recursive:true,force:true});
 return {root,deck,editGraph,ops,cleanup,revise:()=>{pointerSha='b'.repeat(64)}};
}
test('M01-R02 reversible pure TRIM SPLIT MOVE deterministic exact frame boundaries and source pin',()=>{
 const f=setup();
 try{
  const src=f.editGraph.read('demo'),initial=compileEditPreview(src);
  assert.deepEqual(initialEditNodes(src).map(n=>n.clip_id),['s01','s02']);
  assert.equal(initial.duration_tick,4*240000);
  assert.equal(initial.render_allowed,false);
  const o1={type:'SPLIT',clip_id:'s01',at_source_frame:18};
  const a=compileEditPreview(src,[o1]),right=a.clips[1];
  assert.equal(a.clips.length,3);
  assert.equal(a.clips[0].source_out_frame,18);
  assert.equal(right.source_in_frame,18);
  assert.ok(/^c[a-f0-9]{24}$/.test(right.clip_id));
  const o2={type:'TRIM',clip_id:right.clip_id,source_in_frame:20,source_out_frame:43};
  const b=compileEditPreview(src,[o1,o2]);
  assert.equal(b.duration_tick,(18+23+48)*10000);
  const o3={type:'MOVE',clip_id:'s02',before_clip_id:'s01'};
  const c=compileEditPreview(src,[o1,o2,o3]);
  assert.equal(c.clips[0].clip_id,'s02');
  assert.equal(c.clips[1].timeline_start_tick,480000);
  assert.equal(c.clips[2].timeline_end_tick,c.duration_tick);
  assert.equal(c.graph_sha256,compileEditPreview(src,[o1,o2,o3]).graph_sha256);
  assert.equal(compileEditPreview(src,[o1,o2],2).graph_sha256,b.graph_sha256);
  assert.equal(compileEditPreview(src,[o1,o2,o3],0).graph_sha256,initial.graph_sha256);
  for(const clip of c.clips)assert.equal(clip.timeline_start_tick%10000,0);
  reject(()=>compileEditPreview(src,[{type:'SPLIT',clip_id:'s01',at_source_frame:0}]),'EDITOPS_INVALID_SPLIT');
  reject(()=>compileEditPreview(src,[{type:'TRIM',clip_id:'s01',source_in_frame:20,source_out_frame:80}]),'EDITOPS_INVALID_TRIM');
  reject(()=>compileEditPreview(src,[{type:'MOVE',clip_id:'s01',before_clip_id:'s01'}]),'EDITOPS_INVALID_MOVE');
  reject(()=>applyEditOperation(src,initialEditNodes(src),{type:'EXEC',clip_id:'s01'},0),'EDITOPS_UNKNOWN_OPERATION');
 }finally{f.cleanup()}
});
test('M01-R02 1000 reversible operations recover EXACT byte-identical graph and no drift',()=>{
 const f=setup();try{
  const src=f.editGraph.read('demo'),empty=compileEditPreview(src);
  const ops=Array.from({length:1000},(_,i)=>({type:'MOVE',clip_id:i%2?'s02':'s01',before_clip_id:null}));
  const end=compileEditPreview(src,ops);
  assert.equal(end.duration_tick,empty.duration_tick);
  const undone=compileEditPreview(src,ops,0);
  assert.equal(JSON.stringify(undone),JSON.stringify(empty));
  assert.equal(undone.graph_sha256,empty.graph_sha256);
  const redone=compileEditPreview(src,ops,1000);
  assert.equal(JSON.stringify(redone),JSON.stringify(end));
  assert.equal(redone.graph_sha256,end.graph_sha256);
  reject(()=>compileEditPreview(src,ops.concat(ops[0])),'EDITOPS_INVALID_HISTORY');
 }finally{f.cleanup()}
});
test('M01-R02 persisted CAS/restart/UNDO/REDO/branch-from-undo fail-closed and strict ACL',()=>{
 const f=setup();try{
  const source=f.editGraph.read('demo'),base=f.ops.read('demo');
  assert.equal(base.state,'EMPTY');assert.equal(base.revision,0);
  assert.equal(base.preview.duration_tick,960000);
  const request=(expected_revision,action,operation)=>({expected_revision,
   expected_source_sha256:source.source_sha256,action,...(operation?{operation}:{})});
  const one=f.ops.change('demo',director,request(0,'APPLY',{type:'SPLIT',clip_id:'s01',at_source_frame:18}));
  assert.equal(one.revision,1);assert.equal(one.cursor,1);assert.equal(one.preview.clips.length,3);
  const rightId=one.preview.clips[1].clip_id;
  const two=f.ops.change('demo',director,request(1,'APPLY',{type:'TRIM',clip_id:rightId,
   source_in_frame:20,source_out_frame:40}));
  assert.equal(two.preview.clips[1].source_out_frame,40);
  const restarted=editOperationService({root:f.root,editGraph:f.editGraph,enabled:true});
  assert.deepEqual(restarted.read('demo'),two);
  const undo=restarted.change('demo',director,request(2,'UNDO'));
  assert.equal(undo.preview.clips[1].source_in_frame,18);
  assert.equal(undo.cursor,1);assert.equal(undo.operation_count,2);
  const redo=restarted.change('demo',director,request(3,'REDO'));
  assert.deepEqual(redo.preview.clips,two.preview.clips);
  assert.equal(redo.preview.graph_sha256,two.preview.graph_sha256);
  const again=restarted.change('demo',director,request(4,'UNDO'));
  const branched=restarted.change('demo',director,request(5,'APPLY',{type:'MOVE',
   clip_id:'s02',before_clip_id:'s01'}));
  assert.equal(branched.operation_count,2);assert.equal(branched.cursor,2);
  assert.notEqual(branched.preview.graph_sha256,two.preview.graph_sha256);
  reject(()=>restarted.change('demo',director,request(6,'REDO')),'EDITOPS_NOTHING_TO_REDO');
  reject(()=>f.ops.change('demo',director,request(1,'UNDO')),'EDITOPS_CAS_CONFLICT');
  reject(()=>f.ops.change('demo',worker,request(6,'UNDO')),'EDITOPS_DIRECTOR_REQUIRED');
  reject(()=>f.ops.change('demo',director,{...request(6,'UNDO'),extra:'/tmp'}),'EDITOPS_INVALID_FIELDS');
  f.revise();
  assert.equal(f.ops.read('demo').state,'STALE_SOURCE');
  assert.equal(f.ops.read('demo').preview,null);
  reject(()=>f.ops.change('demo',director,request(6,'UNDO')),'EDITOPS_SOURCE_STALE');
 }finally{f.cleanup()}
});
test('M01-R02 rejects symlinked journal, nonexistent scene, unauthenticated and disabled',()=>{
 const f=setup();try{
  reject(()=>f.ops.change('demo',null,{action:'UNDO'}),'EDITOPS_DIRECTOR_REQUIRED');
  reject(()=>compileEditPreview(f.editGraph.read('demo'),[{type:'TRIM',clip_id:'absent',source_in_frame:0,source_out_frame:3}]),'EDITOPS_CLIP_NOT_FOUND');
  const disabled=editOperationService({root:f.root,editGraph:f.editGraph,enabled:false});
  reject(()=>disabled.read('demo'),'EDITOPS_DISABLED');
  const folder=path.join(f.root,'demo','.editgraph');
  fs.mkdirSync(folder,{recursive:true});
  fs.symlinkSync('/etc/passwd',path.join(folder,'operations.json'));
  reject(()=>f.ops.read('demo'),'EDITOPS_UNSAFE_JOURNAL');
 }finally{f.cleanup()}
});

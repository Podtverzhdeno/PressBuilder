import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'pressbuilder-test-'));
process.env.PB_DATA_DIR=root;
const core=await import('../server/cloud-core.mjs');
const { makeMcp }=await import('../server/mcp.mjs');
after(()=>fs.rmSync(root,{recursive:true,force:true}));

test('create script-based project with stable cue IDs',()=>{
  const d=core.createDeck({id:'my-test-video',title:'Demo',text:'Первое предложение. Второе предложение. Третье предложение.',slide_count:2,style:'paper'});
  assert.equal(d.id,'my-test-video');
  const deck=core.getDeck('my-test-video');
  assert.equal(deck.slides.length,2);
  assert.equal(deck.slides.flatMap(x=>x.cues).length,3);
  assert.equal(new Set(deck.slides.flatMap(x=>x.cues.map(c=>c.id))).size,3);
  assert.equal(deck.style,'paper');
});

test('safe partial edits and slide ordering survive persistence',()=>{
  let d=core.getDeck('my-test-video');
  const s=d.slides[0],cue=s.cues[0];
  core.patchCue(d.id,s.id,cue.id,{show:'Привет',dur:1.5});
  core.patchSlide(d.id,s.id,{label:'Завязка',lead:0.5});
  core.patchObject(d.id,s.id,'title',{x:100,y:250,scale:1.2,text:'Новый заголовок'});
  core.patchDeck(d.id,{fps:24,height:720,target:15});
  d=core.getDeck(d.id);
  assert.equal(d.slides[0].cues[0].show,'Привет');
  assert.equal(d.slides[0].objects.title.x,100);
  assert.equal(d.format.fps,24);
  const reversed=d.slides.map(x=>x.id).reverse();
  core.reorderSlides(d.id,reversed);
  assert.deepEqual(core.getDeck(d.id).slides.map(x=>x.id),reversed);
});

test('invalid paths and unexpected values are rejected',()=>{
  assert.throws(()=>core.getDeck('../../etc'),/Invalid deck id/);
  assert.throws(()=>core.createDeck({id:'UPPER',text:'Text',title:'x'}),/Invalid deck id/);
  assert.throws(()=>core.patchDeck('my-test-video',{height:4096}),/Invalid video height/);
  assert.throws(()=>core.reorderSlides('my-test-video',['s01','s01']),/exactly once/);
});

test('MCP initialize, list and tool responses',async()=>{
  const handler=makeMcp({startRender:(id)=>({id,status:'queued'}),getRender:(id)=>({id,status:'not_started'}),baseUrl:()=> 'https://example.com'});
  const init=await handler({jsonrpc:'2.0',id:1,method:'initialize',params:{}});
  assert.equal(init.result.serverInfo.name,'pressbuilder-cloud');
  const listed=await handler({jsonrpc:'2.0',id:2,method:'tools/list'});
  assert.ok(listed.result.tools.some(x=>x.name==='create_deck'));
  const deck=await handler({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'get_deck',arguments:{id:'my-test-video'}}});
  assert.equal(deck.result.isError,false);
  assert.equal(JSON.parse(deck.result.content[0].text).id,'my-test-video');
  const error=await handler({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'get_deck',arguments:{id:'../'}}});
  assert.equal(error.result.isError,true);
});


test('MCP-authored motion graphics persist and reject unsafe shapes',()=>{
  const d=core.getDeck('my-test-video');
  const s=d.slides[0];
  const cue=s.cues[0];
  const v=[
    {id:'headline',kind:'text',x:160,y:220,text:'Агентный монтаж',size:85,color:'h1',effect:'rise',cue_id:cue.id},
    {id:'underline',kind:'bar',x:170,y:360,w:1000,h:18,color:'accent',effect:'fade',duration:0.6}
  ];
  assert.equal(core.setVisuals(d.id,s.id,v).elements,2);
  const saved=core.getDeck(d.id).slides.find(x=>x.id===s.id);
  assert.equal(saved.visuals[0].text,'Агентный монтаж');
  assert.throws(()=>core.setVisuals(d.id,s.id,[{id:'headline',kind:'script',x:0,y:0}]),/Invalid visual kind/);
  assert.throws(()=>core.setVisuals(d.id,s.id,[{id:'head',kind:'text',x:0,y:0,text:'x',evil:true}]),/Unknown visual field/);
  assert.throws(()=>core.setVisuals(d.id,s.id,[{id:'head',kind:'text',x:0,y:0,text:'x',cue_id:'unknown'}]),/Unknown cue_id/);
});

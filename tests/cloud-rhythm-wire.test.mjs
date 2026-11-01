import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('P15 live cloud HTTP + MCP: real-source context, role checks and read-only preview',{timeout:55_000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-rhythm-wire-'));
 const p=await port(),url='http://127.0.0.1:'+p;
 const mcpKey=randomBytes(32).toString('hex'),viewerKey=randomBytes(32).toString('hex');
 const auth='Basic '+Buffer.from('editor:longDirectorSecret987654').toString('base64');
 const id='rhythm-clip';
 const child=spawn(process.execPath,['server/cloud.mjs'],{
  cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(p),PB_DATA_DIR:root,MCP_API_KEY:mcpKey,
   PB_WEB_USER:'editor',PB_WEB_PASSWORD:'longDirectorSecret987654',
   PB_RHYTHM_PREVIEW:'1',
   PB_AGENT_KEYS_JSON:JSON.stringify([{id:'view-1',role:'viewer',token:viewerKey,projects:[id],scenes:['s01','s02']}])
  }
 });
 let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);
 const http=async(route,method='GET',body,token=auth)=>{
  const r=await fetch(url+route,{method,headers:{
    ...(token?{Authorization:token}:{}),
    ...(body===undefined?{}:{'Content-Type':'application/json'})
  },...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,body:await r.json().catch(()=>null)};
 };
 const rpc=async(name,args={},token=mcpKey)=>{
  const res=await fetch(url+'/mcp',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:7,method:'tools/call',
      params:{name,arguments:args}})});
  assert.equal(res.status,200);
  const value=(await res.json()).result;
  return {isError:value.isError,text:value.content[0].text,
    data:value.isError?null:JSON.parse(value.content[0].text)};
 };
 try{
  let ready=false;for(let i=0;i<95;i++){
   if(child.exitCode!==null)throw new Error('server exited '+logs);
   try{if((await fetch(url+'/health')).ok){ready=true;break}}catch{}
   await pause(120);
  }
  assert.ok(ready,'health not ready '+logs);
  const make={
    id,title:'Rhythm project',text:'Hello again',format:{fps:24,height:1080,bitrate:8000000},
    style:'terevo',lead:0,tail:0,target:4,audio:{file:'voice.wav',offset:0,volume:1},
    slides:[
      {id:'s01',label:'One',lead:0,tail:0,cues:[{id:'c01',say:'Hello',dur:2}]},
      {id:'s02',label:'Two',lead:0,tail:0,cues:[{id:'c01',say:'Again',dur:2}]}
    ]
  };
  const created=await http('/api/decks','POST',make);
  assert.equal(created.status,200,JSON.stringify(created.body));
  const uploaded=await fetch(url+'/api/decks/'+id+'/audio?name=voice.wav',{
   method:'PUT',headers:{Authorization:auth,'Content-Type':'audio/wav'},
   body:Buffer.from('RIFF P15 synthetic fixture; not decoded audio')});
  assert.equal(uploaded.status,200,await uploaded.text());
  assert.equal((await http('/api/decks/'+id+'/rhythm/context','GET',undefined,null)).status,401);
  const context=(await http('/api/decks/'+id+'/rhythm/context')).body;
  assert.equal(context.cues.length,2);
  assert.equal(context.duration_us,4_000_000);
  const fixture={
   schema_version:1,project_id:id,
   voice_source_sha256:context.voice_source_sha256,
   alignment_revision:context.alignment_revision,
   expected_alignment_revision:context.alignment_revision,
   timebase_revision:context.timebase_revision,
   expected_timebase_revision:context.timebase_revision,
   frame_rate:context.frame_rate,duration_us:context.duration_us,
   words:[
    {id:'w1',scene_id:'s01',cue_id:'c01',start_us:0,end_us:800_000},
    {id:'w2',scene_id:'s02',cue_id:'c01',start_us:2_000_000,end_us:2_800_000}
   ],
   pauses:[
    {scene_id:'s01',cue_id:'c01',start_us:900_000,end_us:1_400_000},
    {scene_id:'s02',cue_id:'c01',start_us:2_900_000,end_us:3_400_000}
   ],beats:[],policy:{min_shot_frames:4,max_cuts_per_10s:6,max_cuts:5}
  };
  const deckBefore=(await http('/api/decks/'+id)).body;
  const preview=(await http('/api/decks/'+id+'/rhythm/preview','POST',{manifest:fixture}));
  assert.equal(preview.status,200,JSON.stringify(preview.body));
  assert.equal(preview.body.status,'READY_FOR_REVIEW');
  assert.equal(preview.body.publication_allowed,false);
  assert.equal(preview.body.approved,false);
  assert.deepEqual(preview.body.cuts.map(c=>c.reason),['pause','pause']);
  assert.deepEqual((await http('/api/decks/'+id)).body,deckBefore);
  const ctxRpc=await rpc('get_rhythm_context',{id});
  assert.equal(ctxRpc.isError,false,ctxRpc.text);
  assert.equal(ctxRpc.data.voice_source_sha256,context.voice_source_sha256);
  const previewRpc=await rpc('preview_rhythm_cuts',{id,manifest:fixture});
  assert.equal(previewRpc.isError,false,previewRpc.text);
  assert.deepEqual(previewRpc.data.cuts,preview.body.cuts);
  const viewer=await rpc('get_rhythm_context',{id},viewerKey);
  assert.equal(viewer.isError,true);
  assert.match(viewer.text,/Role cannot perform this action/);
  const forbidden=await rpc('preview_rhythm_cuts',{id,manifest:fixture},viewerKey);
  assert.equal(forbidden.isError,true);
  assert.equal((await http('/api/decks/'+id+'/rhythm/preview','POST',{manifest:fixture},null)).status,401);
  const ambiguous=structuredClone(fixture);
  delete ambiguous.words[0].scene_id;
  assert.equal((await http('/api/decks/'+id+'/rhythm/preview','POST',{manifest:ambiguous})).status,409);
  const stale={...fixture,voice_source_sha256:'c'.repeat(64)};
  assert.equal((await http('/api/decks/'+id+'/rhythm/preview','POST',{manifest:stale})).status,409);
  // Preview is not a write operation and does not create montage metadata.
  assert.equal(fs.existsSync(path.join(root,'decks',id,'montage')),false);
 }finally{
  if(child.exitCode===null){const closing=once(child,'close');child.kill('SIGTERM');await closing}
  fs.rmSync(root,{recursive:true,force:true});
 }
});

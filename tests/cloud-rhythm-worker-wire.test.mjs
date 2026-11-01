import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

const ffmpeg=spawnSync('ffmpeg',['-version'],{timeout:2000}).status===0;
const delay=t=>new Promise(r=>setTimeout(r,t));
async function freePort(){
 const s=net.createServer();
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 const p=s.address().port;
 await new Promise(r=>s.close(r));
 return p;
}
function wav(){
 const pcm=Buffer.alloc(4*8000*2);
 for(let i=0;i<32000;i++){
  const v=i%8000<4000?Math.round(Math.sin(i*2*Math.PI*330/8000)*8800):0;
  pcm.writeInt16LE(v,i*2);
 }
 const b=Buffer.alloc(44+pcm.length);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
 b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);
 b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);
 pcm.copy(b,44);return b;
}
test('P15 live cloud HTTP+MCP async FFmpeg preview and CAS submit do not block /health',
 {skip:!ffmpeg,timeout:50_000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'p15-worker-wire-'));
 const p=await freePort(),base='http://127.0.0.1:'+p,id='audio-four';
 const key=randomBytes(32).toString('hex');
 const auth='Basic '+Buffer.from('editor:passwordForAudioWorkerTests123').toString('base64');
 const child=spawn(process.execPath,['server/cloud.mjs'],{
  cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(p),PB_DATA_DIR:root,MCP_API_KEY:key,
   PB_WEB_USER:'editor',PB_WEB_PASSWORD:'passwordForAudioWorkerTests123',
   PB_RHYTHM_PREVIEW:'1',PB_RHYTHM_AUDIO_VERIFY:'1'}
 });
 let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 const req=async(route,method='GET',body,headers={})=>{
  const r=await fetch(base+route,{method,headers:{Authorization:auth,...headers},
   ...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body),
      ...(!Buffer.isBuffer(body)?{headers:{Authorization:auth,
        'Content-Type':'application/json',...headers}}:{})})});
  return {status:r.status,data:await r.json().catch(()=>null)};
 };
 try{
  let ready=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('Cloud exited: '+logs.slice(-1000));
   try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
   await delay(100);
  }
  assert.ok(ready,'Cloud did not start: '+logs.slice(-1000));
  const deck={id,title:'Real audio worker',text:'four scenes',
   format:{fps:24,height:1080,bitrate:8000000},style:'terevo',lead:0,tail:0,
   target:4,audio:{file:'voice.wav',offset:0,volume:1},
   slides:Array.from({length:4},(_,i)=>({id:'s0'+(i+1),lead:0,tail:0,
    label:'Scene '+i,cues:[{id:'c01',say:'narration '+i,dur:1}]}))};
  const created=await req('/api/decks','POST',deck);
  assert.equal(created.status,200,JSON.stringify(created.data));
  const uploaded=await req('/api/decks/'+id+'/audio?name=voice.wav','PUT',wav(),{'Content-Type':'audio/wav'});
  assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
  const c=await req('/api/decks/'+id+'/rhythm/context');
  assert.equal(c.status,200,JSON.stringify(c.data));
  const meta=c.data;
  const m={schema_version:1,project_id:id,voice_source_sha256:meta.voice_source_sha256,
    alignment_revision:meta.alignment_revision,expected_alignment_revision:meta.alignment_revision,
    timebase_revision:meta.timebase_revision,expected_timebase_revision:meta.timebase_revision,
    frame_rate:meta.frame_rate,duration_us:meta.duration_us,
    words:Array.from({length:4},(_,i)=>({id:'w'+i,scene_id:'s0'+(i+1),cue_id:'c01',
      start_us:i*1_000_000,end_us:i*1_000_000+380_000})),
    pauses:Array.from({length:4},(_,i)=>({scene_id:'s0'+(i+1),cue_id:'c01',
      start_us:i*1_000_000+650_000,end_us:i*1_000_000+900_000})),
    beats:[],policy:{min_shot_frames:4,max_cuts_per_10s:8,max_cuts:8}};
  const previewPromise=req('/api/decks/'+id+'/rhythm/preview','POST',{manifest:m});
  const healthPromise=fetch(base+'/health').then(r=>r.status);
  const [preview,health]=await Promise.all([previewPromise,healthPromise]);
  assert.equal(health,200);
  assert.equal(preview.status,200,JSON.stringify(preview.data));
  assert.equal(preview.data.status,'READY_FOR_REVIEW',JSON.stringify(preview.data.issues));
  assert.equal(preview.data.provenance.pause_audio_verified,true);
  assert.equal(preview.data.publication_allowed,false);
  const draft=await req('/api/decks/'+id+'/rhythm/draft','POST',{
    manifest:m,expected_revision:0,note:'Non-publishable source-checked test draft'});
  assert.equal(draft.status,200,JSON.stringify(draft.data));
  assert.equal(draft.data.status,'submitted');
  assert.equal(draft.data.publication_allowed,false);
  const rpc=await fetch(base+'/mcp',{method:'POST',headers:{
   Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'preview_rhythm_cuts',arguments:{id,manifest:m}}})});
  assert.equal(rpc.status,200);
  const val=(await rpc.json()).result;
  assert.equal(val.isError,false,JSON.stringify(val));
  assert.equal(JSON.parse(val.content[0].text).provenance.pause_audio_verified,true);
  const audioBefore=fs.readFileSync(path.join(root,'decks',id,'voice.wav'));
  assert.deepEqual(audioBefore,wav());
  assert.equal(fs.existsSync(path.join(root,'decks',id,'montage')),false);
 }finally{
  if(child.exitCode===null){const closing=once(child,'close');child.kill('SIGTERM');await closing}
  fs.rmSync(root,{recursive:true,force:true});
 }
});

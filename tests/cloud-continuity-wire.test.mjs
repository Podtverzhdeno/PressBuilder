import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';

const enabled=spawnSync('ffmpeg',['-version']).status===0&&spawnSync('ffprobe',['-version']).status===0;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
 const s=net.createServer();
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const port=s.address().port;await new Promise(resolve=>s.close(resolve));return port;
}
test('P17 real approved MP4 REST/MCP: director only, SHA-pinned, nonpublishing and stale rejection',
 {timeout:70000,skip:!enabled?'FFmpeg/ffprobe not available; mandatory Docker media test':false},async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p17-wire-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const id='p17wire',token=randomBytes(32).toString('hex'),viewer=randomBytes(32).toString('hex');
 const basic='Basic '+Buffer.from('editor:veryLongEditorPassword1234567').toString('base64');
 const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(port),PB_DATA_DIR:tmp,PB_CONTINUITY_REVIEW:'1',
    MCP_API_KEY:token,PB_WEB_USER:'editor',PB_WEB_PASSWORD:'veryLongEditorPassword1234567',
    PB_AGENT_KEYS_JSON:JSON.stringify([{id:'viewer01',role:'viewer',token:viewer,projects:[id],scenes:['s01','s02']}])}});
 let output='';child.stdout.on('data',x=>output+=x.toString());child.stderr.on('data',x=>output+=x.toString());
 const http=async(url,method='GET',payload,auth=true,headers={})=>{
  const r=await fetch(base+url,{method,headers:{...(auth?{Authorization:basic}:{}),
    ...(payload?{'Content-Type':'application/json'}:{}),...headers},
    ...(payload?{body:JSON.stringify(payload)}:{})});
  return {status:r.status,body:await r.json().catch(()=>null)};
 };
 const rpc=async(t,name,args={})=>{
  const r=await fetch(base+'/mcp',{method:'POST',headers:{
    Authorization:'Bearer '+t,'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}})});
  return {status:r.status,result:(await r.json()).result};
 };
 try{
  let ready=false;
  for(let n=0;n<100;n++){
   if(child.exitCode!==null)throw Error('Server exited: '+output);
   try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
   await sleep(100);
  }
  assert.ok(ready,output);
  const created=await rpc(token,'create_deck',{id,title:'P17 Boundary',text:'Первая сцена. Вторая сцена.',slide_count:2});
  assert.equal(created.status,200);
  assert.equal(created.result.isError,false,JSON.stringify(created.result));
  const deck=(await http('/api/decks/'+id)).body;
  const scenes=deck.slides.map(s=>s.id);
  assert.equal(scenes.length,2);const [left,right]=scenes;
  const approvals=[];
  for(let n=0;n<2;n++){
   const scene=scenes[n],version=String(n+1).repeat(16);
   const file=id+'_'+scene+'_v'+version+'.mp4';
   const dest=path.join(tmp,'out',file);
   fs.mkdirSync(path.dirname(dest),{recursive:true});
   const ff=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i',
     'testsrc2=size=320x180:rate=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-y',dest],{timeout:15000});
   assert.equal(ff.status,0,ff.stderr?.toString());
   const sha=createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
   const dir=path.join(tmp,'decks',id,'.scene-versions',scene);
   fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(path.join(dir,version+'.json'),JSON.stringify({
     version_id:version,project:id,scene_id:scene,job_id:'test-'+scene,
     file:'out/'+file,sha256:sha,size:fs.statSync(dest).size,
     fps:24,duration:1,height:180,qa:{verdict:'PASS'}
   }));
   const pointer={project:id,scene_id:scene,revision:1,version_id:version};
   fs.writeFileSync(path.join(dir,'approved.json'),JSON.stringify(pointer));
   approvals.push({dir,pointer,file:dest,sha});
  }
  const contextPath='/api/decks/'+id+'/continuity/context?left='+left+'&right='+right;
  const noAuth=await http(contextPath,'GET',undefined,false);
  assert.equal(noAuth.status,401);
  const c=await http(contextPath);
  assert.equal(c.status,200,JSON.stringify(c.body));
  assert.equal(c.body.left.exit.frame,23);
  assert.equal(c.body.right.entry.frame,0);
  assert.match(c.body.source_pair_sha256,/^[a-f0-9]{64}$/);
  const request={left_scene_id:left,right_scene_id:right,
   expected_pair_sha256:c.body.source_pair_sha256,transition:'hard_cut'};
  const preview=await http('/api/decks/'+id+'/continuity/preview','POST',request);
  assert.equal(preview.status,200,JSON.stringify(preview.body));
  assert.equal(preview.body.status,'REVIEW');
  assert.equal(preview.body.publication_allowed,false);
  assert.equal((await http('/api/decks/'+id+'/continuity/preview','POST',request,true,
    {Origin:'https://untrusted.example'})).status,403);
  const denied=await rpc(viewer,'get_continuity_boundary_context',{id,left_scene_id:left,right_scene_id:right});
  assert.equal(denied.status,200);
  assert.equal(denied.result.isError,true);
  const allowed=await rpc(token,'preview_continuity_hard_cut',{id,manifest:request});
  assert.equal(allowed.result.isError,false,JSON.stringify(allowed.result));
  assert.equal(JSON.parse(allowed.result.content[0].text).approved,false);
  const bad=await http('/api/decks/'+id+'/continuity/preview','POST',{...request,transition:'j_cut'});
  assert.equal(bad.status,422);
  const same=await http('/api/decks/'+id+'/continuity/preview','POST',{...request,expected_pair_sha256:'0'.repeat(64)});
  assert.equal(same.status,409);
  const first=approvals[0],ptr={...first.pointer,revision:2};
  fs.writeFileSync(path.join(first.dir,'approved.json'),JSON.stringify(ptr));
  const stale=await http('/api/decks/'+id+'/continuity/preview','POST',request);
  assert.equal(stale.status,409);
  for(const a of approvals)assert.equal(createHash('sha256').update(fs.readFileSync(a.file)).digest('hex'),a.sha);
 }finally{
  child.kill('SIGTERM');
  await Promise.race([new Promise(r=>child.once('exit',r)),sleep(3000)]);
  if(child.exitCode===null)child.kill('SIGKILL');
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});

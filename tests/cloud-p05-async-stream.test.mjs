import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {assemblyService} from '../server/assemble-scenes.mjs';

const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){
 const server=net.createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const result=server.address().port;
 await new Promise(resolve=>server.close(resolve));return result;
}
async function until(check,timeout=12000){
 const deadline=Date.now()+timeout;
 for(;;){
  const value=await check();
  if(value)return value;
  if(Date.now()>deadline)throw Error('P05_R26_TIMEOUT');
  await sleep(90);
 }
}
function fixture(root,id,bytes=3*1024*1024){
 const rid=randomUUID(),dir=path.join(root,'out','releases',id,rid);
 fs.mkdirSync(dir,{recursive:true});
 const master=path.join(dir,'final.mp4'),buffer=Buffer.alloc(bytes,0x5a);
 // Test fixture is intentionally NOT playable: P05 download validates bytes
 // against the release manifest; playback capability is tested elsewhere.
 fs.writeFileSync(master,buffer);
 const manifest={schemaVersion:1,project:id,release_id:rid,target_fps:24,
  scenes:[{id:'s01',duration:1.2,sha256:'1'.repeat(64),approved_version_id:'v1'},
   {id:'s02',duration:1.2,sha256:'2'.repeat(64),approved_version_id:'v2'}],
  output:{sha256:hash(buffer),bytes:buffer.length,
   qa:{verdict:'PASS',issues:[],metadata:{duration:2.4}}}};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,'out','releases',id,'current.json'),
  JSON.stringify({release_id:rid}));
 return {rid,master,buffer,manifest};
}
const makeAssembly=out=>assemblyService({out,baseUrl:()=> 'http://localhost',
 getDeck:()=>({id:'p05-r26'}),getRender:()=>({}),
 getTask:()=>({}),getPlan:()=>({}),getStyle:()=>({}),
 acquireResource:async()=>()=>{}});
test('P05-R26 pinned verified handle reads original inode even after path rename/replacement',{
 timeout:30000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p05-r26-fd-'));
 try{
  const f=fixture(root,'p05-r26');
  const assembly=makeAssembly(path.join(root,'out'));
  const verified=await assembly.downloadHandleAsync('p05-r26',f.rid);
  const changed=Buffer.alloc(f.buffer.length,0x32);
  fs.renameSync(f.master,f.master+'.original');
  fs.writeFileSync(f.master,changed);
  let payload;
  try{payload=await verified.handle.readFile()}
  finally{await verified.handle.close()}
  assert.equal(hash(payload),f.manifest.output.sha256,
   'response must read already verified master inode, not replacement pathname');
  assert.equal(hash(fs.readFileSync(f.master)),hash(changed));
  await assert.rejects(()=>assembly.downloadHandleAsync('p05-r26',f.rid),
   e=>e?.status===409);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('P05-R26 Basic-auth HTTP GET/HEAD/ranges and MCP assembly status use async full-SHA',{
 timeout:50000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p05-r26-http-'));
 const serverPort=await port(),base='http://127.0.0.1:'+serverPort;
 const secret=randomBytes(24).toString('hex');
 const user='reviewer',password='test-only-strong-password-012345';
 const auth='Basic '+Buffer.from(user+':'+password).toString('base64');
 let child=null,logs='';
 try{
  child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),
   stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(serverPort),
    PB_DATA_DIR:root,PB_WEB_USER:user,PB_WEB_PASSWORD:password,
    MCP_API_KEY:secret,PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:'1'}});
  child.stdout.on('data',b=>logs+=b.toString());
  child.stderr.on('data',b=>logs+=b.toString());
  await until(async()=>{
   if(child.exitCode!==null)throw Error('P05_R26_CLOUD_EXIT '+logs);
   try{return (await fetch(base+'/health',{signal:AbortSignal.timeout(800)})).ok}
   catch{return false}
  });
  const rpc=async(name,args)=>{
   const response=await fetch(base+'/mcp',{method:'POST',
    headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
     params:{name,arguments:args}}),signal:AbortSignal.timeout(7000)});
   const json=await response.json();
   assert.equal(json.result?.isError,false,JSON.stringify(json).slice(0,500));
   return JSON.parse(json.result.content[0].text);
  };
  const id='p05-r26';
  await rpc('create_deck',{id,title:'R26 Async Status',
   text:'First scene. Second scene.',style:'paper',slide_count:2,target:8});
  const f=fixture(root,id);
  const asset='/api/decks/'+id+'/assembly/releases/'+f.rid+'/final.mp4';
  const req=(suffix,options={})=>fetch(base+suffix,{...options,
   headers:{Authorization:auth,...options.headers},signal:AbortSignal.timeout(12000)});
  assert.equal((await fetch(base+asset)).status,401);
  const status=await req('/api/decks/'+id+'/assemble');
  assert.equal(status.status,200);
  const response=await status.json();
  assert.equal(response.current_release.release_id,f.rid);
  assert.equal(response.current_release.manifest.output.sha256,f.manifest.output.sha256);
  assert.equal(response.review_valid,true);
  const mcp=await rpc('get_assembly_status',{id});
  assert.equal(mcp.current_release.release_id,f.rid);

  const head=await req(asset,{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-length'),String(f.buffer.length));
  assert.equal(head.headers.get('accept-ranges'),'bytes');
  assert.equal((await head.arrayBuffer()).byteLength,0);
  const responseMp4=await req(asset);
  assert.equal(responseMp4.status,200);
  assert.equal(responseMp4.headers.get('content-type'),'video/mp4');
  assert.equal(hash(Buffer.from(await responseMp4.arrayBuffer())),f.manifest.output.sha256);

  const range=await req(asset,{headers:{Range:'bytes=104-135'}});
  assert.equal(range.status,206);
  assert.equal(range.headers.get('content-range'),
   'bytes 104-135/'+f.buffer.length);
  const partial=Buffer.from(await range.arrayBuffer());
  assert.equal(partial.length,32);
  assert.deepEqual(partial,f.buffer.subarray(104,136));
  const openRange=await req(asset,{headers:{Range:'bytes=100-'}});
  assert.equal(openRange.status,206);
  assert.equal(Buffer.from(await openRange.arrayBuffer()).length,
   f.buffer.length-100);

  for(const invalid of ['bytes=999999999-','bytes=100-50','bytes=0-99999999']){
   const result=await req(asset,{headers:{Range:invalid}});
   assert.equal(result.status,416,invalid);
   assert.equal(result.headers.get('content-range'),'bytes */'+f.buffer.length);
  }
  const headRange=await req(asset,{method:'HEAD',headers:{Range:'bytes=0-15'}});
  assert.equal(headRange.status,206);
  assert.equal(headRange.headers.get('content-length'),'16');

  // No response may be served from the previous validated release after
  // in-place corruption, even when the path and declared release ID match.
  fs.appendFileSync(f.master,'tampered');
  assert.equal((await req(asset)).status,409);
  const broken=await req('/api/decks/'+id+'/assemble');
  assert.equal(broken.status,200);
  assert.equal((await broken.json()).current_release,null);
  const failed=await rpc('get_assembly_status',{id});
  assert.equal(failed.current_release,null);
  const health=await fetch(base+'/health',{signal:AbortSignal.timeout(1200)});
  assert.equal(health.status,200,'unrelated health remains responsive');
 }finally{
  if(child){
   child.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(1400)]);
   if(child.exitCode===null)child.kill('SIGKILL');
  }
  fs.rmSync(root,{recursive:true,force:true});
 }
});

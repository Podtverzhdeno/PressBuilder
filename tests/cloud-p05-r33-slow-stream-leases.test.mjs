import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';

const digest=x=>createHash('sha256').update(x).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
 const server=net.createServer();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const p=server.address().port;
 await new Promise(r=>server.close(r));return p;
}
function fixture(root,id,bytes=32*1024*1024){
 const rid=randomUUID(),dir=path.join(root,'out','releases',id,rid);
 fs.mkdirSync(dir,{recursive:true});
 const buffer=Buffer.alloc(bytes,0x52),sha=digest(buffer);
 const master=path.join(dir,'final.mp4');
 fs.writeFileSync(master,buffer);
 const manifest={schemaVersion:1,project:id,release_id:rid,target_fps:24,
  scenes:[{id:'s01',sha256:'1'.repeat(64),duration:1.2},
   {id:'s02',sha256:'2'.repeat(64),duration:1.2}],
  output:{sha256:sha,bytes,qa:{verdict:'PASS',issues:[],
   metadata:{duration:2.4}}}};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,'out','releases',id,'current.json'),
  JSON.stringify({release_id:rid}));
 return {rid,sha,master,bytes};
}
test('P05-R33 8 pinned MP4 slow-reader leases bound active FDs; denied GET precedes SHA; HEAD/abort/tamper recover',{
 timeout:100000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r33-stream-leases-'));
 const p=await freePort(),base='http://127.0.0.1:'+p,id='slow-reader-r33';
 const user='stream-review',pass='test-only-very-long-secret-012345';
 const basic='Basic '+Buffer.from(user+':'+pass).toString('base64');
 const token=randomBytes(24).toString('hex');
 let child=null,logs='';const held=[];
 try{
  child=spawn(process.execPath,['server/cloud.mjs'],{
   cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
   env:{...process.env,PORT:String(p),PB_DATA_DIR:root,
    PB_WEB_USER:user,PB_WEB_PASSWORD:pass,MCP_API_KEY:token,
    PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:'0'}});
  child.stdout.on('data',b=>logs+=b.toString());
  child.stderr.on('data',b=>logs+=b.toString());
  let ready=false;
  for(let i=0;i<110;i++){
   if(child.exitCode!==null)throw Error('P05_R33_SERVER_EXIT '+logs.slice(-800));
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(750)})).ok){
    ready=true;break}}catch{}
   await sleep(80);
  }
  assert.equal(ready,true,logs.slice(-800));
  const created=await fetch(base+'/mcp',{method:'POST',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'create_deck',arguments:{
     id,title:'Slow Reader R33',text:'One. Two.',
     style:'paper',slide_count:2,target:8}}}),
   signal:AbortSignal.timeout(12000)});
  assert.equal(created.status,200);
  assert.equal((await created.json()).result?.isError,false);
  const f=fixture(root,id),uri='/api/decks/'+id+
   '/assembly/releases/'+f.rid+'/final.mp4';
  const authReq=(uri,options={})=>fetch(base+uri,{
   ...options,headers:{Authorization:basic,...options.headers},
   signal:options.signal??AbortSignal.timeout(20000)});

  // Use node:http paused IncomingMessage (rather than fetch) so
  // clients retain live sockets without reading full 32 MiB bodies.
  // The server MUST retain the verified FD until each socket closes.
  function hold(){
   return new Promise((resolve,reject)=>{
    const request=http.get(base+uri,{headers:{Authorization:basic}},response=>{
     response.pause();
     resolve({request,response,close:()=>{
      response.destroy();request.destroy();
     }});
    });
    request.once('error',reject);
    request.setTimeout(18000,()=>request.destroy(Error('R33_HELD_TIMEOUT')));
   });
  }
  for(let i=0;i<8;i++){
   const response=await hold();
   held.push(response);
   assert.equal(response.response.statusCode,200,
    'each of eight permitted clients must retain one validated stream');
   assert.equal(response.response.headers['content-length'],String(f.bytes));
  }
  const head=await authReq(uri,{method:'HEAD'});
  assert.equal(head.status,200,'HEAD must not consume long-lived GET stream budget');
  assert.equal(head.headers.get('content-length'),String(f.bytes));
  // Prove admission happens before full SHA: a corrupt master must
  // still get an explicit stream capacity 429, not an integrity 409,
  // while all 8 preexisting streams hold their FD leases.
  fs.appendFileSync(f.master,'tampered');
  const full=await authReq(uri);
  assert.equal(full.status,429,'ninth paused GET exceeds per-process FD lease cap');
  assert.equal((await full.json()).error,'Resource queue is full');
  assert.match(full.headers.get('retry-after')??'',/^[1-9][0-9]*$/);
  const badHead=await authReq(uri,{method:'HEAD'});
  assert.equal(badHead.status,409,'HEAD must still verify full MP4 while GET is overloaded');
  // Restore original bytes. A revoked client must free exactly its FD
  // lease; the next GET should succeed while seven others remain open.
  fs.truncateSync(f.master,f.bytes);
  held.shift().close();
  let recovered=null;
  for(let i=0;i<16;i++){
   const probe=await authReq(uri,{headers:{Range:'bytes=0-63'}});
   if(probe.status===206){recovered=probe;break}
   assert.equal(probe.status,429,'an unreleased lease may only cause 429');
   await sleep(70);
  }
  assert.ok(recovered,'disconnect must free one stream permit');
  assert.equal(recovered.headers.get('content-range'),'bytes 0-63/'+f.bytes);
  assert.equal((await recovered.arrayBuffer()).byteLength,64);
  const health=await fetch(base+'/health',{signal:AbortSignal.timeout(3000)});
  assert.equal(health.status,200,'eight stalled clients must not block health');

  // Releasing the remaining seven must free all stream slots.
  for(const h of held.splice(0))h.close();
  await sleep(130);
  fs.appendFileSync(f.master,'corrupt');
  for(let i=0;i<9;i++){
   const failed=await authReq(uri,{headers:{Range:'bytes=0-7'}});
   assert.equal(failed.status,409,
    'each failed SHA check must close FD + stream lease, never turn into 429');
  }
  fs.truncateSync(f.master,f.bytes);
  const final=await authReq(uri,{headers:{Range:'bytes=0-127'}});
  assert.equal(final.status,206);
  assert.equal((await final.arrayBuffer()).byteLength,128);
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{
  for(const h of held)h.close();
  if(child){
   child.kill('SIGTERM');
   await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1700)]);
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  }
  fs.rmSync(root,{recursive:true,force:true});
 }
});

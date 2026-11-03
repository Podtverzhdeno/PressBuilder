import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';

const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function freePort(){
 const server=net.createServer();
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const port=server.address().port;
 await new Promise(ok=>server.close(ok));return port;
}
test('P05-R35 static compiled assets cap at 16 paused FDs without borrowing media slots; abort, symlink, range and zero-byte recovery',{
 timeout:110000,
},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r35-static-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const staticDir=path.join(process.cwd(),'build');
 assert.ok(fs.existsSync(path.join(staticDir,'index.html')),
  'run npm run build before R35 HTTP integration test');
 const uniq='r35_'+randomBytes(8).toString('hex');
 const assetName=uniq+'.js',zeroName=uniq+'_empty.js',
  linkName=uniq+'_symlink.js';
 const asset=path.join(staticDir,assetName),
  zero=path.join(staticDir,zeroName),
  link=path.join(staticDir,linkName);
 const media=path.join(root,'out','r35_media.mp4');
 const privateFile=path.join(root,'private-r35.txt');
 const bytes=32*1024*1024,user='static-owner',
  pass='synthetic-password-static-2026-0123';
 const basic='Basic '+Buffer.from(user+':'+pass).toString('base64');
 const token=randomBytes(24).toString('hex');
 let child=null,logs='';const held=[];
 const close=entry=>{entry.response.destroy();entry.request.destroy()};
 const request=(uri,opts={})=>fetch(base+uri,{
  ...opts,headers:{Authorization:basic,...opts.headers},
  signal:opts.signal??AbortSignal.timeout(15000)});
 const hold=uri=>new Promise((resolve,reject)=>{
  const req=http.get(base+uri,{headers:{Authorization:basic}},response=>{
   response.pause();resolve({request:req,response});
  });
  req.once('error',reject);
  req.setTimeout(25000,()=>req.destroy(Error('R35_PAUSED_STATIC_TIMEOUT')));
 });
 try{
  // Unique build/ asset avoids clobbering editor JS or other tests.
  // Synthetic 32 MiB file is large enough to fill socket buffers.
  fs.writeFileSync(asset,Buffer.alloc(bytes,0x6a));
  fs.writeFileSync(zero,'');
  fs.writeFileSync(privateFile,'PRIVATE_TEST_STATIC_NEVER_SERVE');
  fs.mkdirSync(path.dirname(media),{recursive:true});
  fs.writeFileSync(media,Buffer.alloc(1024,0x53));
  child=spawn(process.execPath,['server/cloud.mjs'],{
   cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
   env:{...process.env,PORT:String(port),PB_DATA_DIR:root,
    MCP_API_KEY:token,PB_WEB_USER:user,PB_WEB_PASSWORD:pass,
    PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:'0'}});
  child.stdout.on('data',b=>logs+=b.toString());
  child.stderr.on('data',b=>logs+=b.toString());
  let ready=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('R35_SERVER_EXIT '+logs.slice(-1600));
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(800)})).ok){
    ready=true;break}}catch{}
   await sleep(80);
  }
  assert.equal(ready,true,logs.slice(-1600));
  const uri='/'+assetName;
  assert.equal((await fetch(base+uri)).status,401);
  assert.equal((await request(uri,{method:'POST'})).status,405);
  const page=await request('/');
  assert.equal(page.status,200);
  assert.match(await page.text(),/PresBuilder|PressBuilder|<html/i);

  // 16 paused real HTTP socket readers retain 16 server-side
  // FileHandle streams, no matter how quickly headers are sent.
  for(let i=0;i<16;i++){
   const entry=await hold(uri);
   assert.equal(entry.response.statusCode,200,'static reader '+i);
   assert.equal(entry.response.headers['content-length'],String(bytes));
   assert.match(entry.response.headers['content-type'],/javascript/);
   held.push(entry);
  }
  const extra=await request(uri,{headers:{Range:'bytes=0-31'}});
  assert.equal(extra.status,429,'17th static reader must fail before opening a new file');
  assert.equal((await extra.json()).error,'Resource queue is full');
  assert.match(extra.headers.get('retry-after')??'',/^[1-9][0-9]*$/);

  // A saturated static budget must not consume P05/voice/export
  // media slots or turn the whole app's health response into 429.
  const availableMedia=await request('/out/r35_media.mp4',{
   headers:{Range:'bytes=0-31'}});
  assert.equal(availableMedia.status,206);
  assert.equal((await availableMedia.arrayBuffer()).byteLength,32);
  const head=await request(uri,{method:'HEAD'});
  assert.equal(head.status,200,'HEAD never retains stream capacity');
  assert.equal(head.headers.get('content-length'),String(bytes));
  assert.equal((await fetch(base+'/health')).status,200);

  // Disconnect one paused socket: a verified, inode-pinned static
  // partial read must reuse that capacity without server restart.
  close(held.shift());
  let resumed=null;
  for(let i=0;i<24;i++){
   const response=await request(uri,{headers:{Range:'bytes=0-63'}});
   if(response.status===206){resumed=response;break}
   assert.equal(response.status,429,'pending stream closure may temporarily retain slot');
   await sleep(50);
  }
  assert.ok(resumed,'static FD lease must recover after reader disconnect');
  assert.equal(resumed.headers.get('content-range'),'bytes 0-63/'+bytes);
  assert.equal((await resumed.arrayBuffer()).byteLength,64);

  held.splice(0).forEach(close);
  await sleep(150);
  for(let i=0;i<24;i++){
   const invalid=await request(uri,{headers:{Range:'bytes=9999999999-'}});
   assert.equal(invalid.status,416,'invalid ranges must not leak static permits');
   assert.equal(invalid.headers.get('content-range'),'bytes */'+bytes);
   await invalid.arrayBuffer();
  }
  const after416=await request(uri,{headers:{Range:'bytes=8-15'}});
  assert.equal(after416.status,206);
  assert.equal((await after416.arrayBuffer()).byteLength,8);

  // Never follow an attacker-created final-component symlink even
  // when its name resembles a compiled asset; serve SPA index only.
  fs.symlinkSync(privateFile,link);
  const denied=await request('/'+linkName);
  assert.equal(denied.status,200);
  const html=await denied.text();
  assert.match(html,/PresBuilder|PressBuilder|<html/i);
  assert.doesNotMatch(html,/PRIVATE_TEST_STATIC_NEVER_SERVE/);
  const empty=await request('/'+zeroName);
  assert.equal(empty.status,200);
  assert.equal(empty.headers.get('content-length'),'0');
  assert.equal((await empty.arrayBuffer()).byteLength,0);
  const missing=await request('/'+uniq+'_missing.js');
  assert.equal(missing.status,200,'unknown SPA route must fall back to the editor index');
  assert.match(await missing.text(),/PresBuilder|PressBuilder|<html/i);
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{
  for(const entry of held)close(entry);
  if(child){
   child.kill('SIGTERM');
   await Promise.race([new Promise(ok=>child.once('exit',ok)),sleep(1800)]);
   if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  }
  for(const file of [asset,zero,link]){
   try{fs.rmSync(file,{force:true})}catch{}
  }
  fs.rmSync(root,{recursive:true,force:true});
 }
});

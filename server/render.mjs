/** Headless Chromium exporter using CDP with no extra npm dependencies.
 * Render follows the editor's existing ?export=1 -> WebCodecs -> FFmpeg flow.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function waitUntil(fn,ms,onWait) {
  const end=Date.now()+ms;
  while(Date.now()<end){
    const result=await fn();
    if(result)return result;
    if(onWait)onWait();
    await sleep(250);
  }
  throw new Error('Chromium startup timed out');
}
async function browserClient(wsUrl) {
  const socket=new WebSocket(wsUrl);
  await new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(new Error('CDP websocket timeout')),10000);
    socket.addEventListener('open',()=>{clearTimeout(t);resolve()}, {once:true});
    socket.addEventListener('error',()=>{clearTimeout(t);reject(new Error('CDP websocket connection failed'))}, {once:true});
  });
  let next=0;
  const pending=new Map();
  socket.addEventListener('message',(event)=>{
    let m;try{m=JSON.parse(event.data)}catch{return}
    const job=pending.get(m.id);
    if(!job)return;
    pending.delete(m.id);
    if(m.error)job.reject(new Error(m.error.message||'CDP error'));
    else job.resolve(m.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++next;
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP method timeout: '+method))},20000);
    pending.set(id,{resolve:(x)=>{clearTimeout(timeout);resolve(x)},reject:(e)=>{clearTimeout(timeout);reject(e)}});
    socket.send(JSON.stringify({id,method,params}));
  });
  return {socket,send};
}
export async function renderWithChrome({id,port,username,password,timeoutMs=900000}) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pb-render-'));
  const exe=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
  const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling',
    '--disable-renderer-backgrounding','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+temp,'about:blank'];
  const child=spawn(exe,args,{stdio:['ignore','ignore','pipe']});
  let logs='';
  child.stderr.on('data',(x)=>logs=(logs+x.toString()).slice(-1800));
  let exited=false;
  child.on('exit',()=>exited=true);
  let client=null;
  try {
    const portFile=path.join(temp,'DevToolsActivePort');
    const devPort=await waitUntil(()=>fs.existsSync(portFile)?Number(fs.readFileSync(portFile,'utf8').split('\n')[0]):0,15000,()=>{
      if(exited)throw new Error('Chromium quit: '+logs);
    });
    const target=await fetch('http://127.0.0.1:'+devPort+'/json/new?about:blank',{method:'PUT'}).then((r)=>r.json());
    if(!target.webSocketDebuggerUrl)throw new Error('Chromium CDP target unavailable');
    client=await browserClient(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    const basic=Buffer.from(username+':'+password).toString('base64');
    await client.send('Network.setExtraHTTPHeaders',{headers:{Authorization:'Basic '+basic}});
    await client.send('Page.navigate',{url:'http://127.0.0.1:'+port+'/?deck='+encodeURIComponent(id)+'&export=1'});
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      if(exited)throw new Error('Chromium exited unexpectedly: '+logs);
      const result=await client.send('Runtime.evaluate',{
        expression:"(()=>{const ok=document.querySelector('.notice.is-ok b');const bad=document.querySelector('.notice.is-error');const warn=document.querySelector('.notice.is-warn');return JSON.stringify({done:ok?.textContent||'',error:bad?.textContent||'',warning:warn?.textContent||'',title:document.title})})()",
        returnByValue:true
      });
      let state={};try{state=JSON.parse(result?.result?.value||'{}')}catch{}
      if(state.error)throw new Error('Browser render error: '+state.error.slice(0,500));
      if(state.warning && state.warning.includes('ffmpeg'))throw new Error('Browser cannot find FFmpeg');
      if(state.done && state.done.includes('.mp4'))return {ok:true};
      await sleep(1400);
    }
    throw new Error('Render job exceeded '+Math.round(timeoutMs/1000)+' seconds. '+logs);
  } finally {
    if(client)try{client.socket.close()}catch{}
    if(!exited)child.kill('SIGKILL');
    await sleep(300);
    fs.rmSync(temp,{recursive:true,force:true});
  }
}

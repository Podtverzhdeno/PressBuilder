/**
 * Server-side renderer: deterministic Canvas 2D frames via Chromium DevTools
 * to FFmpeg (PNG image pipe -> H.264 MP4). Unlike browser WebCodecs, this
 * works even when Linux Chromium has no AVC hardware/software encoder.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getDeck, DECKS, OUT } from './cloud-core.mjs';

const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function waitUntil(fn,ms,onWait,signal) {
  const end=Date.now()+ms;
  while(Date.now()<end){
    signal?.throwIfAborted();
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
  let next=0;const pending=new Map();
  socket.addEventListener('message',(event)=>{
    let m;try{m=JSON.parse(event.data)}catch{return}
    const job=pending.get(m.id);if(!job)return;
    pending.delete(m.id);
    if(m.error)job.reject(new Error(m.error.message||'CDP error'));
    else job.resolve(m.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++next;
    const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method))},25000);
    pending.set(id,{resolve:(x)=>{clearTimeout(timeout);resolve(x)},reject:(e)=>{clearTimeout(timeout);reject(e)}});
    socket.send(JSON.stringify({id,method,params}));
  });
  return {socket,send};
}
function abortable(task,signal){
  if(!signal)return task;
  signal.throwIfAborted();
  let cancel;
  const aborted=new Promise((_,reject)=>{
    cancel=()=>reject(signal.reason instanceof Error?signal.reason:new Error('Render cancelled'));
    signal.addEventListener('abort',cancel,{once:true});
  });
  return Promise.race([task,aborted]).finally(()=>signal.removeEventListener('abort',cancel));
}
async function evalBrowser(client,expression,awaitPromise=false,signal){
  const reply=await abortable(client.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise}),signal);
  if(reply?.exceptionDetails)throw new Error('Browser exception: '+(reply.exceptionDetails.text||'unknown'));
  return reply?.result?.value;
}
function getVoice(d) {
  const a=d.audio;
  if(!a?.file)return null;
  if(!/^voice\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(a.file))throw new Error('Unsafe voice file name');
  const file=path.join(DECKS,d.id,a.file);
  if(!fs.existsSync(file))throw new Error('Voice audio is missing: '+a.file);
  return {file,offset:Number(a.offset||0),volume:Number(a.volume??1)};
}
async function encode(client,{id,fps,height,duration,from=0,outputName=id,onProgress,signal}) {
  if(!/^[a-z0-9][a-z0-9_-]{0,100}$/.test(outputName))throw new Error('Unsafe render filename');
  signal?.throwIfAborted();
  const deck=getDeck(id);
  const voice=getVoice(deck);
  const output=path.join(OUT,outputName+'.mp4');
  const staging=path.join(OUT,outputName+'.'+process.pid+'.partial.mp4');
  const args=['-y','-v','error','-f','image2pipe','-framerate',String(fps),'-vcodec','png','-i','pipe:0'];
  const voiceShift=voice?voice.offset-from:0;
  if(voice){
    if(voiceShift<0)args.push('-ss',String(-voiceShift));
    args.push('-i',voice.file);
  }
  args.push('-map','0:v:0','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p');
  if(voice){
    args.push('-map','1:a:0','-c:a','aac','-b:a','192k');
    const filters=[];
    if(voiceShift>0)filters.push('adelay='+Math.round(voiceShift*1000)+':all=1');
    if(voice.volume!==1)filters.push('volume='+voice.volume);
    if(filters.length)args.push('-af',filters.join(','));
  }
  args.push('-t',String(duration),'-movflags','+faststart',staging);
  const ff=spawn(process.env.FFMPEG||'ffmpeg',args,{stdio:['pipe','ignore','pipe']});
  const stop=()=>{ff.stdin.destroy();ff.kill('SIGKILL')};
  signal?.addEventListener('abort',stop,{once:true});
  let logs='',failed=null;
  ff.stderr.on('data',(x)=>logs=(logs+x.toString()).slice(-2000));
  ff.on('error',(e)=>{failed=e});
  ff.stdin.on('error',(e)=>{failed=e});
  const count=Math.ceil(duration*fps);
  if(count<=0||count>24000)throw new Error('Render requires 1..24000 frames');
  try {
    for(let i=0;i<count;i++){
      signal?.throwIfAborted();
      if(failed)throw failed;
      const png=await evalBrowser(client,'window.__PB_CLOUD_FRAME__('+(from+i/fps)+','+height+')',false,signal);
      if(typeof png!=='string'||png.length<100)throw new Error('Canvas capture failed at frame '+i);
      const bytes=Buffer.from(png,'base64');
      if(!ff.stdin.write(bytes))await abortable(new Promise((resolve,reject)=>{
        const cleanup=()=>{ff.stdin.off('drain',onDrain);ff.stdin.off('error',onError)};
        const onDrain=()=>{cleanup();resolve()};
        const onError=e=>{cleanup();reject(e)};
        ff.stdin.once('drain',onDrain);
        ff.stdin.once('error',onError);
      }),signal);
      if(i%10===0)onProgress?.(i/count);
    }
    signal?.throwIfAborted();
    ff.stdin.end();
    const code=await new Promise((resolve,reject)=>{
      ff.once('close',resolve);ff.once('error',reject);
    });
    signal?.throwIfAborted();
    if(code!==0)throw new Error('FFmpeg failed (code '+code+'): '+logs);
    fs.renameSync(staging,output);
    onProgress?.(1);
    return {file:output,size:fs.statSync(output).size,fps,height,duration};
  } finally {
    signal?.removeEventListener('abort',stop);
    if(!ff.killed && ff.exitCode===null)ff.kill('SIGKILL');
    fs.rmSync(staging,{force:true});
  }
}
export async function renderWithChrome({id,slideId=null,outputName=null,outputNameOverride=null,port,username,password,timeoutMs=900000,onProgress,signal}) {
  signal?.throwIfAborted();
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pb-render-'));
  const exe=process.env.CHROMIUM_PATH||'/usr/bin/chromium';
  const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--disable-background-timer-throttling','--disable-renderer-backgrounding',
    '--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
    '--user-data-dir='+temp,'about:blank'];
  const child=spawn(exe,args,{stdio:['ignore','ignore','pipe']});
  const stop=()=>child.kill('SIGKILL');
  signal?.addEventListener('abort',stop,{once:true});
  let logs='',exited=false;
  child.stderr.on('data',(x)=>logs=(logs+x.toString()).slice(-1800));
  child.on('error',(e)=>logs+=' '+e.message);
  child.on('exit',()=>exited=true);
  let client=null;
  try {
    const portFile=path.join(temp,'DevToolsActivePort');
    const devPort=await waitUntil(()=>fs.existsSync(portFile)?Number(fs.readFileSync(portFile,'utf8').split('\n')[0]):0,15000,()=>{
      if(exited)throw new Error('Chromium exited: '+logs);
    },signal);
    const target=await fetch('http://127.0.0.1:'+devPort+'/json/new?about:blank',{method:'PUT'}).then((r)=>r.json());
    if(!target.webSocketDebuggerUrl)throw new Error('Chromium debug target missing');
    client=await browserClient(target.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    const basic=Buffer.from(username+':'+password).toString('base64');
    await client.send('Network.setExtraHTTPHeaders',{headers:{Authorization:'Basic '+basic}});
    await client.send('Page.navigate',{url:'http://127.0.0.1:'+port+'/?deck='+encodeURIComponent(id)});
    const deadline=Date.now()+timeoutMs;
    let info;
    while(Date.now()<deadline) {
      signal?.throwIfAborted();
      if(exited)throw new Error('Chromium exited: '+logs);
      try {info=await evalBrowser(client,'window.__PB_CLOUD_INFO__?.()',true,signal);if(info?.duration>0)break;}catch(e){if(signal?.aborted)throw e;}
      await sleep(500);
    }
    if(!info?.duration)throw new Error('Video timeline failed to load');
    const d=getDeck(id);
    const fps=d.format.fps;
    const height=d.format.height;
    if(![24,25,30,50,60].includes(fps))throw new Error('Unsupported fps; choose 24/25/30/50/60');
    if(![720,1080,1440,2160].includes(height))throw new Error('Unsupported height');
    const scene=slideId?info.slides?.find(s=>s.id===slideId):null;
    if(slideId&&!scene)throw new Error('Requested render scene is not on the timeline: '+slideId);
    const clipStart=scene?.start??0;
    const clipDuration=scene?.dur??info.duration;
    if(clipDuration<=0||clipDuration>600)throw new Error('Render clip limited to 10 minutes');
    if(!Number.isFinite(clipStart)||clipStart<0)throw new Error('Invalid scene start time');
    // Structural text audit and three representative actual rendered frames.
    // These hooks run trusted application code only, never data-supplied JS.
    const auditExpression='window.__PB_CLOUD_VISUAL_QA__?.('+JSON.stringify(slideId)+')';
    const visualAudit=await evalBrowser(client,auditExpression,false,signal);
    const frameSamples=[];
    for(const fraction of [.22,.5,.78]){
      const at=Number((clipStart+clipDuration*fraction).toFixed(6));
      const stats=await evalBrowser(client,'window.__PB_CLOUD_FRAME_STATS__?.('+at+')',false,signal);
      if(stats)frameSamples.push(stats);
    }
    const destination=outputName||outputNameOverride||(slideId?id+'_'+slideId:id);
    const result=await encode(client,{id,outputName:destination,from:clipStart,
      fps,height,duration:clipDuration,onProgress,signal});
    return {...result,visualAudit,frameSamples};
  } finally {
    signal?.removeEventListener('abort',stop);
    if(client)try{client.socket.close()}catch{}
    if(!exited)child.kill('SIGKILL');
    await sleep(250);
    fs.rmSync(temp,{recursive:true,force:true});
  }
}

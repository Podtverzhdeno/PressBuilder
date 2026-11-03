import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
const chromium=process.env.CHROMIUM_PATH||'chromium';
const toolsAvailable=['ffmpeg','ffprobe'].every(x=>
 spawnSync(x,['-version'],{stdio:'ignore',timeout:4000}).status===0);
const browserAvailable=spawnSync(chromium,['--version'],{
 stdio:'ignore',timeout:4000}).status===0;
const ready=toolsAvailable&&browserAvailable;
// Docker image sets CHROMIUM_PATH: a missing dependency is a hard FAIL,
// not a green build with a silently skipped browser test.
const requiredInContainer=!!process.env.CHROMIUM_PATH;
async function freePort(){
 const s=net.createServer();
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const port=s.address().port;
 await new Promise(resolve=>s.close(resolve));return port;
}
async function until(fn,{timeout=16000}={}){
 const end=Date.now()+timeout;
 for(;;){try{const result=await fn();if(result)return result}catch{}
  if(Date.now()>end)throw Error('M51_R05_BROWSER_TIMEOUT');
  await pause(110);
 }
}
function cdp(wsUrl){
 return new Promise((resolve,reject)=>{
  const socket=new WebSocket(wsUrl),waiting=new Map();
  let next=0;
  const connect=setTimeout(()=>reject(Error('CDP_CONNECT_TIMEOUT')),12000);
  socket.addEventListener('error',()=>reject(Error('CDP_WEBSOCKET_FAILED')),{once:true});
  socket.addEventListener('message',event=>{
   let data;try{data=JSON.parse(event.data)}catch{return}
   const pending=waiting.get(data.id);if(!pending)return;
   waiting.delete(data.id);
   clearTimeout(pending.timer);
   if(data.error)pending.reject(Error(data.error.message||'CDP_COMMAND_FAILED'));
   else pending.resolve(data.result);
  });
  socket.addEventListener('open',()=>{
   clearTimeout(connect);
   resolve({socket,send:(method,params={})=>new Promise((ok,bad)=>{
    const id=++next;
    const timer=setTimeout(()=>{waiting.delete(id);bad(Error('CDP_TIMEOUT_'+method))},20000);
    waiting.set(id,{resolve:ok,reject:bad,timer});
    socket.send(JSON.stringify({id,method,params}));
   })});
  },{once:true});
 });
}
const evalJs=async(client,expression)=>{
 const response=await client.send('Runtime.evaluate',{
  expression,returnByValue:true,awaitPromise:false});
 if(response?.exceptionDetails)
  throw Error('CDP_PAGE_EXCEPTION_'+response.exceptionDetails.text);
 return response?.result?.value;
};
function createMaster(root,project){
 const rid=randomUUID();
 const folder=path.join(root,'out','releases',project,rid);
 fs.mkdirSync(folder,{recursive:true});
 const mp4=path.join(folder,'final.mp4'),raw=path.join(root,'pcm.raw');
 const pcm=Buffer.alloc(Math.round(2.4*48000)*4);
 for(let frame=0;frame<pcm.length/4;frame++){
  const t=frame/48000;
  const wave=Math.round(.15*32767*Math.sin(2*Math.PI*330*t));
  pcm.writeInt16LE(wave,frame*4);
  pcm.writeInt16LE(t>=.6&&t<1.5?-wave:wave,frame*4+2);
 }
 fs.writeFileSync(raw,pcm);
 const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',
  '-f','s16le','-ar','48000','-ac','2','-i',raw,
  '-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=2.4',
  '-map','1:v:0','-map','0:a:0','-t','2.4',
  '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','160k',mp4],{encoding:'utf8',timeout:35000});
 assert.equal(ff.status,0,String(ff.stderr).slice(-500));
 fs.rmSync(raw,{force:true});
 const sha=createHash('sha256').update(fs.readFileSync(mp4)).digest('hex');
 const manifest={schemaVersion:1,project,release_id:rid,target_fps:24,
  scenes:[{id:'s01',sha256:'1'.repeat(64),duration:1.2,
    approved_version_id:'v1',transition_after:{type:'hard-cut',duration:0}},
   {id:'s02',sha256:'2'.repeat(64),duration:1.2,
    approved_version_id:'v2',transition_after:{type:'hard-cut',duration:0}}],
  output:{sha256:sha,bytes:fs.statSync(mp4).size,
   qa:{verdict:'PASS',issues:[],metadata:{duration:2.4}}}};
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,'out','releases',project,'current.json'),
  JSON.stringify({release_id:rid}));
 return {rid,sha};
}

test('M51-R05 real Chromium opens QC modal, manually starts SHA-pinned audio review, captures screenshot',{
 timeout:150000,skip:!ready&&!requiredInContainer,
},async()=>{
 assert.ok(ready,'Docker browser smoke requires Chromium, ffmpeg and ffprobe');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-r05-browser-'));
 const profile=path.join(root,'chromium-profile');
 const [appPort,debugPort]=await Promise.all([freePort(),freePort()]);
 const app='http://127.0.0.1:'+appPort,project='browser-audio-demo';
 const webUser='browser-owner',webPass='long-browser-audio-password-12345';
 const basic='Basic '+Buffer.from(webUser+':'+webPass).toString('base64');
 const mcpKey=randomBytes(24).toString('hex');
 let server=null,browser=null,client=null,serverLogs='';
 try{
  server=spawn(process.execPath,['server/cloud.mjs'],{
   cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
   env:{...process.env,PORT:String(appPort),PB_DATA_DIR:root,
    PB_WEB_USER:webUser,PB_WEB_PASSWORD:webPass,MCP_API_KEY:mcpKey,
    PB_QC_COCKPIT:'1',PB_REAL_AUDIO_AUDIT:'1'}});
  server.stdout.on('data',b=>{serverLogs+=b.toString()});
  server.stderr.on('data',b=>{serverLogs+=b.toString()});
  await until(async()=>{
   if(server.exitCode!==null)throw Error(serverLogs);
   return (await fetch(app+'/health',{signal:AbortSignal.timeout(700)})).ok;
  });
  const created=await fetch(app+'/mcp',{method:'POST',
   headers:{Authorization:'Bearer '+mcpKey,'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'create_deck',arguments:{id:project,title:'Browser M51 QC',
     text:'Audio one. Audio two.',style:'paper',slide_count:2,target:8}}})});
  const createdBody=await created.json();
  assert.equal(createdBody?.result?.isError,false,JSON.stringify(createdBody).slice(0,500));
  const release=createMaster(root,project);
  browser=spawn(chromium,[
   '--headless=new','--no-sandbox','--disable-dev-shm-usage',
   '--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check',
   '--remote-allow-origins=*','--remote-debugging-port='+debugPort,
   '--user-data-dir='+profile,'--window-size=1280,960','about:blank'],
   {stdio:'ignore'});
  const page=await until(async()=>{
   const resp=await fetch('http://127.0.0.1:'+debugPort+'/json/list',{
    signal:AbortSignal.timeout(750)});
   const targets=await resp.json();
   return targets.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
  },{timeout:18000});
  client=await cdp(page.webSocketDebuggerUrl);
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Network.setExtraHTTPHeaders',{headers:{Authorization:basic}});
  await client.send('Page.navigate',{url:app+'/'});
  await until(()=>evalJs(client,"!!document.querySelector('.deck-card')"));
  assert.equal(await evalJs(client, "document.querySelector('.deck-card')?.textContent.includes('Browser M51 QC')"),true);
  await evalJs(client,"document.querySelector('.deck-card').click();true");
  await until(()=>evalJs(client,"!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('QC-кокпит'))"));
  await evalJs(client, "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('QC-кокпит')).click();true");
  await until(()=>evalJs(client, "!!document.querySelector('[aria-label=\"Проверка звука реального MP4\"]')"));
  const initial=await evalJs(client,`(()=>{
   const dialog=document.querySelector('[role="dialog"][aria-label="M51 проверка качества монтажа"]');
   const section=document.querySelector('[aria-label="Проверка звука реального MP4"]');
   const button=Array.from(section.querySelectorAll('button')).find(x=>
    x.textContent.includes('Проверить звук текущего MP4'));
   const rect=dialog?.querySelector('.task-window')?.getBoundingClientRect();
   return {dialogVisible:!!dialog&&rect?.width>300&&rect?.height>250,
    hasManualStart:!!button&&!button.disabled,
    hasReviewWarning:section.textContent.includes('не подтверждает качество'),
    containsPublishControl:!!section.querySelector('[title="Опубликовать"]'),
    rect:{width:rect?.width,height:rect?.height,x:rect?.x,y:rect?.y}};
  })()`);
  assert.equal(initial.dialogVisible,true,JSON.stringify(initial));
  assert.equal(initial.hasManualStart,true,JSON.stringify(initial));
  assert.equal(initial.hasReviewWarning,true);
  assert.equal(initial.containsPublishControl,false);
  assert.ok(initial.rect.x>=-5&&initial.rect.width<=1285,JSON.stringify(initial.rect));
  // Only this explicit click may submit the CAS-bound asynchronous POST.
  await evalJs(client,`(()=>{
   Array.from(document.querySelectorAll('[aria-label="Проверка звука реального MP4"] button'))
    .find(b=>b.textContent.includes('Проверить звук текущего MP4')).click();return true;
  })()`);
  const endpoint=app+'/api/decks/'+project+'/audio-audit';
  const final=await until(async()=>{
   const r=await fetch(endpoint,{headers:{Authorization:basic},
    signal:AbortSignal.timeout(1500)});
   const x=await r.json();
   return x.job?.status==='completed'?x:null;
  },{timeout:20000});
  assert.equal(final.receipt?.report?.release_sha256,release.sha);
  assert.equal(final.receipt?.report?.may_publish,false);
  const queuedJob=final.job;
  assert.equal(queuedJob.release_id,release.rid);
  // If the async update was queued before completion, explicitly refresh UI.
  await evalJs(client,`(()=>{
   const button=Array.from(document.querySelectorAll('button'))
    .find(b=>b.textContent.includes('Обновить по текущему выпуску'));
   button?.click();return !!button;
  })()`);
  await until(()=>evalJs(client,`(()=>{
   const section=document.querySelector('[aria-label="Проверка звука реального MP4"]');
   return !!section?.textContent.includes('Возможна потеря звука при сведении в моно');
  })()`),{timeout:15000});
  const displayed=await evalJs(client,`(()=>{
   const section=document.querySelector('[aria-label="Проверка звука реального MP4"]');
   const modal=document.querySelector('[role="dialog"]');
   const lines=section?.textContent||'';
   const buttons=Array.from(section.querySelectorAll('button'));
   return {hasRisk:lines.includes('Возможна потеря звука при сведении в моно'),
    hasApproxPtsWarning:lines.includes('PCM приблизительное'),
    hasNoAutoPublish:modal?.textContent.includes('Публикация запрещена'),
    seekButtons:buttons.filter(b=>b.title.includes('приблизительному началу окна')).length,
    hasManualStart:buttons.some(b=>b.textContent.includes('Проверить звук текущего MP4'))};
  })()`);
  assert.equal(displayed.hasRisk,true,JSON.stringify(displayed));
  assert.equal(displayed.hasApproxPtsWarning,true);
  assert.equal(displayed.hasNoAutoPublish,true);
  assert.ok(displayed.seekButtons>=1,JSON.stringify(displayed));
  assert.equal(displayed.hasManualStart,false,'completed release is cached and not requeued');
  // Capture static synthetic-media UI only: never include credentials, source
  // customer footage or private P05 paths in visual CI artifacts.
  const evidenceDir=process.env.PB_QC_EVIDENCE_DIR||null;
  function screenshotFile(name,bytes){
   if(!evidenceDir)return;
   fs.mkdirSync(evidenceDir,{recursive:true});
   fs.writeFileSync(path.join(evidenceDir,name),bytes,{mode:0o600});
  }
  const capture=await client.send('Page.captureScreenshot',{format:'png',fromSurface:true});
  const png=Buffer.from(capture.data||'','base64');
  assert.ok(png.length>14000,'desktop screenshot is not blank');
  assert.equal(png.subarray(1,4).toString('ascii'),'PNG');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.ok(width>=1100&&height>=700,JSON.stringify({width,height}));
  screenshotFile('qc-audio-desktop-1280.png',png);

  // Mobile viewport: the modal must fit horizontally, keep audio review
  // controls reachable and render warnings without invented PTS/signoff.
  await client.send('Emulation.setDeviceMetricsOverride',{
   width:390,height:844,deviceScaleFactor:1,mobile:true,
   screenWidth:390,screenHeight:844,
  });
  await until(()=>evalJs(client,"document.documentElement.clientWidth<=390"));
  const mobile=await evalJs(client,`(()=>{
   const dialog=document.querySelector('[role="dialog"][aria-label="M51 проверка качества монтажа"]');
   const modalWindow=dialog?.querySelector('.task-window');
   const section=document.querySelector('[aria-label="Проверка звука реального MP4"]');
   const detail=dialog?.querySelector('.task-detail');
   section?.scrollIntoView({block:'start',behavior:'instant'});
   const r=modalWindow?.getBoundingClientRect(),s=section?.getBoundingClientRect();
   const overlay=dialog?.getBoundingClientRect();
   return {viewport:document.documentElement.clientWidth,
    innerWidth:window.innerWidth,visualWidth:window.visualViewport?.width,
    mobileCss:window.matchMedia('(max-width:850px)').matches,
    overlay:overlay?{left:overlay.left,width:overlay.width,right:overlay.right}:null,
    bounds:r?{left:r.left,right:r.right,width:r.width,height:r.height}:null,
    audioBounds:s?{left:s.left,right:s.right,width:s.width}:null,
    audioVisible:!!s&&s.width>150&&s.left>=-2&&s.right<=392,
    warningVisible:!!section?.textContent.includes('PCM приблизительное'),
    reviewOnly:!!dialog?.textContent.includes('Публикация запрещена'),
    detailScrollable:!!detail&&detail.scrollHeight>detail.clientHeight,
    horizontalOverflow:!!modalWindow&&(modalWindow.scrollWidth>modalWindow.clientWidth+3),
    visibleCloseButton:!!dialog?.querySelector('.task-header button'),
   };
  })()`);
  assert.ok(mobile.viewport<=390&&mobile.viewport>=370,JSON.stringify(mobile));
  assert.ok(mobile.bounds&&mobile.bounds.width>=320&&
   mobile.bounds.left>=-2&&mobile.bounds.right<=392,JSON.stringify(mobile));
  assert.ok(mobile.audioVisible&&mobile.warningVisible&&mobile.reviewOnly,
   JSON.stringify(mobile));
  assert.equal(mobile.horizontalOverflow,false,'mobile QC modal overflows horizontally');
  assert.equal(mobile.detailScrollable,true,'long report must remain scrollable');
  assert.equal(mobile.visibleCloseButton,true);
  // Focusable control for keyboard use; this does not imply a full WCAG audit.
  const focus=await evalJs(client,`(()=>{
   const button=document.querySelector('[role="dialog"] .task-header button');
   button?.focus();return !!button&&document.activeElement===button;
  })()`);
  assert.equal(focus,true,'close control is keyboard-focusable on mobile');
  await pause(120);
  const mobileCapture=await client.send('Page.captureScreenshot',
   {format:'png',fromSurface:true});
  const mobilePng=Buffer.from(mobileCapture.data||'','base64');
  assert.equal(mobilePng.subarray(1,4).toString('ascii'),'PNG');
  assert.equal(mobilePng.readUInt32BE(16),390);
  assert.equal(mobilePng.readUInt32BE(20),844);
  assert.ok(mobilePng.length>10000,'mobile screenshot is not blank');
  screenshotFile('qc-audio-mobile-390.png',mobilePng);
  const witness={schema_version:1,scope:'SYNTHETIC_P05_QC_BROWSER_SCREENSHOTS_ONLY',
   viewport_desktop:{width,height},viewport_mobile:{width:390,height:844},
   screenshot_bytes:{desktop:png.length,mobile:mobilePng.length},
   real_ffmpeg_fixture:true,manual_button_clicked:true,
   findings:displayed.seekButtons,approximate_pcm_time_only:true,
   issuer_signature:false,publication_allowed:false,requires_human_visual_review:true};
  if(evidenceDir){
   fs.writeFileSync(path.join(evidenceDir,'qc-audio-visual-evidence.json'),
    JSON.stringify(witness,null,2)+'\n',{mode:0o600});
  }
  console.log('M51-R06 Chromium QC visual evidence desktop/mobile',JSON.stringify(witness));
 }finally{
  client?.socket.close();
  if(browser){browser.kill('SIGKILL')}
  if(server){server.kill('SIGTERM');await Promise.race([
    new Promise(resolve=>server.once('exit',resolve)),pause(1700)]);
   if(server.exitCode===null)server.kill('SIGKILL')}
  fs.rmSync(root,{recursive:true,force:true});
 }
});

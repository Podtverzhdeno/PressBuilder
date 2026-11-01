/**
 * Production HTTP server for PressBuilder: protected editor + REST + MCP.
 * Static assets are compiled with Vite; projects and exported MP4 live on /data.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { timingSafeEqual, createHash } from 'node:crypto';
import { DATA, DECKS, OUT, UserError, createDeck, deckId, getDeck, hasDeck, listDecks, putDeck } from './cloud-core.mjs';
import { makeMcp } from './mcp.mjs';
import {rhythmPreviewService} from './rhythm-preview.mjs';
import {rhythmDraftStore} from './rhythm-drafts.mjs';
import { projectReadmeStore } from './project-readme.mjs';
import { scene3dStore } from './scene-3d.mjs';
import { sceneTaskStore } from './scene-tasks.mjs';
import {directorStore} from './director.mjs';
import {directorDispatchStore} from './director-dispatch.mjs';
import { sceneSyncStore } from './scene-sync.mjs';
import { createOAuth } from './oauth.mjs';
import { renderWithChrome } from './render.mjs';
import { inspectMp4, mergeVisualQA } from './video-qa.mjs';
import { makeRenderQueue } from './render-queue.mjs';
import {createResourceGovernor} from './resource-governor.mjs';
import {findReusableScene} from './scene-reuse.mjs';
import {styleContractStore,enforceScene3D,enforceVisuals} from './style-contract.mjs';
import {styleById} from '../src/engine/styles.ts';
import {assemblyPlanStore} from './assembly-plan.mjs';
import {sceneLeaseStore,agentDirectory} from './scene-leases.mjs';
import {assemblyService} from './assemble-scenes.mjs';
import {sceneVersionStore} from './scene-versions.mjs';
import {sceneReviewStore} from './scene-reviews.mjs';
import {captureFrameEvidence} from './frame-qa.mjs';
import {sceneComparisonService} from './scene-comparison.mjs';
import {scenePreviewService} from './scene-preview.mjs';
import {randomUUID} from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const STATIC = path.join(process.cwd(), 'build');
const ORIGIN = process.env.PUBLIC_URL || '';
const MCP_SECRET = process.env.MCP_API_KEY || '';
const WEB_USER = process.env.PB_WEB_USER || '';
const WEB_PASS = process.env.PB_WEB_PASSWORD || '';
if (!MCP_SECRET || MCP_SECRET.length < 24 || !WEB_USER || !WEB_PASS || WEB_PASS.length < 16) {
  throw new Error('Set MCP_API_KEY (24+ chars), PB_WEB_USER and PB_WEB_PASSWORD (16+ chars) in Railway.');
}
fs.mkdirSync(DECKS, {recursive:true});
fs.mkdirSync(OUT, {recursive:true});
const sceneTasks=sceneTaskStore({root:DECKS,seedRoot:path.join(process.cwd(),'src','decks'),getDeck});
const projectReadmes=projectReadmeStore({root:DECKS,seedRoot:path.join(process.cwd(),'src','decks'),getDeck});
const scene3d=scene3dStore({root:DECKS,seedRoot:path.join(process.cwd(),'src','decks'),getDeck});
const sceneSync=sceneSyncStore({root:DECKS,seedRoot:path.join(process.cwd(),'src','decks'),getDeck});
const rhythmPreview=rhythmPreviewService({root:DECKS,getDeck,enabled:process.env.PB_RHYTHM_PREVIEW==='1'});
const rhythmDrafts=rhythmDraftStore({root:DECKS,getDeck,previewService:rhythmPreview});
const styles=styleContractStore({root:DECKS,getDeck});
const assemblyPlans=assemblyPlanStore({root:DECKS,getDeck,getStyle:id=>styles.read(id)});
const directorPlan=directorStore({root:DECKS,getDeck,sceneTasks,projectReadmes,styles,
  getAssembly:()=>assembly,getApproved:(id,scene)=>versions.approved(id,scene),out:OUT});
const leases=sceneLeaseStore({root:DECKS,getDeck});
const agents=agentDirectory();
const director={id:'web-director',role:'director'};
const versions=sceneVersionStore({root:DECKS,out:OUT,getDeck,getScene3D:(id,scene)=>scene3d.read(id,scene),
  getStyle:id=>styles.read(id),getSceneSync:(id,scene)=>sceneSync.read(id,scene),
  restoreSceneSync:(id,scene,markers,revision)=>sceneSync.put(id,scene,markers,revision),restoreScene3D:(id,scene,spec,rev)=>scene3d.restore(id,scene,spec,rev),
  restoreSlide:(id,scene,slide)=>{
    const deck=getDeck(id),index=deck.slides.findIndex(s=>s.id===scene);
    if(index<0||slide.id!==scene)throw new UserError('Scene source restore mismatch',409);
    deck.slides[index]=slide;
    putDeck(id,deck);
  }});
const reviews=sceneReviewStore({root:DECKS,getDeck,getVersion:(id,scene,version)=>versions.read(id,scene,version)});
const dispatch=directorDispatchStore({root:DECKS,director:directorPlan,sceneTasks,leases,
  getRender:(id,scene)=>getRender(id,scene),versions,out:OUT});

function secureEq(a,b) {
  const aa=Buffer.from(String(a)), bb=Buffer.from(String(b));
  return aa.length===bb.length && timingSafeEqual(aa,bb);
}
function authMcp(req) {
  const header=req.headers.authorization || '';
  return header.startsWith('Bearer ') && secureEq(header.slice(7),MCP_SECRET);
}
function authWeb(req) {
  const h=req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  try {
    const plain=Buffer.from(h.slice(6),'base64').toString('utf8');
    const i=plain.indexOf(':');
    return i>0 && secureEq(plain.slice(0,i),WEB_USER) && secureEq(plain.slice(i+1),WEB_PASS);
  } catch { return false; }
}
const oauth=createOAuth({
  publicUrl:ORIGIN || 'http://localhost:'+PORT,
  clientId:process.env.OAUTH_CLIENT_ID,
  clientSecret:process.env.OAUTH_CLIENT_SECRET,
  dataDir:DATA,
  authWeb,
  redirectUris:process.env.OAUTH_REDIRECT_URIS
});
function send(res,status,body,contentType='application/json; charset=utf-8',head={}) {
  const buf=Buffer.isBuffer(body)?body:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
  res.writeHead(status,{'Content-Type':contentType,'Content-Length':buf.length,'Cache-Control':'no-store',...head});
  res.end(buf);
}
const json=(res,status,payload)=>send(res,status,payload);
const error=(res,e)=>json(res,e?.status>=400&&e?.status<=599?e.status:500,{error:e instanceof Error?e.message:'Internal error'});
function readBody(req, max=1024*1024) {
  return new Promise((resolve,reject)=>{
    const chunks=[]; let len=0;
    req.on('data',(c)=>{len+=c.length;if(len>max){reject(new UserError('Request too large',413));req.destroy();}else chunks.push(c);});
    req.on('end',()=>resolve(Buffer.concat(chunks)));
    req.on('error',reject);
  });
}
async function readJson(req) {
  const buf=await readBody(req);
  try {return JSON.parse(buf.toString('utf8'));} catch { throw new UserError('Malformed JSON'); }
}
const escaped=(v)=>{try{return decodeURIComponent(v)}catch{throw new UserError('Invalid encoding')}};
function inside(dir, rel) {
  if (rel.includes('\0')) return null;
  const file=path.resolve(dir,rel);
  return (file===dir || file.startsWith(dir+path.sep))?file:null;
}
function fileResponse(req,res,file) {
  const st=fs.statSync(file);
  if (!st.isFile()) throw new UserError('Not a file',404);
  const type=({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
    '.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg',
    '.jpeg':'image/jpeg','.ttf':'font/ttf','.woff2':'font/woff2','.ico':'image/x-icon','.mp4':'video/mp4',
    '.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.webm':'audio/webm'})[path.extname(file).toLowerCase()]||'application/octet-stream';
  let start=0,end=st.size-1,status=200;
  const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if(match){
    start=Number(match[1]); end=match[2]?Number(match[2]):end;
    if(start>=st.size || end>=st.size || start>end){res.writeHead(416,{'Content-Range':'bytes */'+st.size});res.end();return;}
    status=206;
  }
  const headers={'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff',
    'Cache-Control':'private, no-store'};
  if(status===206) headers['Content-Range']='bytes '+start+'-'+end+'/'+st.size;
  res.writeHead(status,headers);
  fs.createReadStream(file,{start,end}).pipe(res);
}
let exportSession=null;
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
function voiceOptions(voice){
  if (!voice) return {inputs:[],outputs:[]};
  const skip=voice.from-voice.offset;
  const filters=[...(skip < -0.001 ? ['adelay='+Math.round(-skip*1000)+':all=1']:[]),
    ...(voice.volume!==1?['volume='+voice.volume]:[])];
  return {
    inputs:[...(skip>0.001?['-ss',skip.toFixed(3)]:[]),'-i',voice.file],
    outputs:['-map','1:a:0','-c:a','aac','-b:a','192k',
      ...(filters.length?['-af',filters.join(',')]:[]),...(voice.dur>0?['-t',voice.dur.toFixed(3)]:[])]
  };
}
function mux(session) {
  return new Promise((resolve,reject)=>{
    const a=voiceOptions(session.voice);const ts=session.fps+'*TB';
    const argv=['-y','-f','h264','-framerate',String(session.fps),'-i',session.raw,...a.inputs,
      '-map','0:v:0','-c:v','copy','-bsf:v','setts=pts=N/('+ts+'):dts=N/('+ts+'):duration=1/('+ts+')',
      ...a.outputs,'-movflags','+faststart',session.mp4];
    let stderr='';
    const p=spawn(ffmpeg,argv,{stdio:['ignore','ignore','pipe']});
    p.stderr.on('data',(x)=>{stderr=(stderr+x.toString()).slice(-1400)});
    p.on('error',reject);
    p.on('close',(code)=>{
      if(code!==0)return reject(new Error('FFmpeg exit '+code+': '+stderr));
      fs.rmSync(session.raw,{force:true});
      resolve({file:'out/'+path.basename(session.mp4),size:fs.statSync(session.mp4).size});
    });
  });
}
async function api(req,res,url) {
  const p=url.pathname,method=req.method;
  if(p==='/api/decks' || p==='/api/decks/') {
    if(method==='GET')return json(res,200,listDecks());
    if(method==='POST') {
      const d=await readJson(req);
      if(!d?.id || typeof d.id!=='string')throw new UserError('Missing deck id');
      if(hasDeck(d.id))throw new UserError('Deck already exists',409);
      if(!Array.isArray(d.slides) || !d.slides.length)throw new UserError('Missing slides');
      if(JSON.stringify(d).length>1024*1024)throw new UserError('Deck exceeds 1 MiB');
      // Build from the canonical parser, then retain the editor's own slide layout.
      createDeck({id:d.id,title:d.title,text:d.text,style:d.style,slide_count:d.slides.length,target:d.target??null});
      putDeck(d.id,d);
      projectReadmes.ensure(d.id);
      return json(res,200,{ok:true});
    }
    throw new UserError('Method not allowed',405);
  }
  const audioMatch=/^\/api\/decks\/([^/]+)\/audio$/.exec(p);
  if(audioMatch) {
    const id=deckId(escaped(audioMatch[1]));
    if(method!=='PUT') throw new UserError('Method not allowed',405);
    getDeck(id);
    const name=url.searchParams.get('name')||'';
    const ext=/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.exec(name)?.[1]?.toLowerCase();
    if(!ext)throw new UserError('Unsupported audio extension');
    const b=await readBody(req,100*1024*1024);
    if(!b.length)throw new UserError('Empty audio file');
    const dir=path.join(DECKS,id);
    fs.mkdirSync(dir,{recursive:true});
    for(const f of fs.readdirSync(dir))if(/^voice\./.test(f))fs.rmSync(path.join(dir,f),{force:true});
    const f='voice.'+ext;
    fs.writeFileSync(path.join(dir,f),b);
    return json(res,200,{file:f,size:b.length});
  }
  // Per-scene assignments live apart from deck.json to support parallel agents.
  const rhythmDraftMatch=/^\/api\/decks\/([^/]+)\/rhythm\/draft$/.exec(p);
  if(rhythmDraftMatch){
    const id=deckId(escaped(rhythmDraftMatch[1]));
    if(method==='GET')return json(res,200,rhythmDrafts.status(id,director));
    if(method==='POST'){
      const body=await readJson(req);
      return json(res,200,rhythmDrafts.submit(id,director,body?.manifest,
        body?.expected_revision,body?.note));
    }
    throw new UserError('Method not allowed',405);
  }
  const rhythmMatch=/^\/api\/decks\/([^/]+)\/rhythm\/(context|preview|silence)$/.exec(p);
  if(rhythmMatch){
    const id=deckId(escaped(rhythmMatch[1]));
    if(rhythmMatch[2]==='silence' && method==='GET')
      return json(res,200,rhythmPreview.measuredSilence(id));
    if(rhythmMatch[2]==='context' && method==='GET')
      return json(res,200,rhythmPreview.context(id));
    if(rhythmMatch[2]==='preview' && method==='POST'){
      const body=await readJson(req);
      return json(res,200,rhythmPreview.preview(id,body?.manifest));
    }
    throw new UserError('Method not allowed',405);
  }
  const readmeMatch=/^\/api\/decks\/([^/]+)\/readme$/.exec(p);
  if(readmeMatch) {
    const id=deckId(escaped(readmeMatch[1]));
    if(method==='GET')return json(res,200,projectReadmes.read(id));
    if(method==='PUT') {
      const body=await readJson(req);
      return json(res,200,projectReadmes.write(id,body?.content,body?.expected_revision));
    }
    throw new UserError('Method not allowed',405);
  }
  const styleMatch=/^\/api\/decks\/([^/]+)\/style-contract$/.exec(p);
  if(styleMatch){
    const id=deckId(escaped(styleMatch[1]));
    if(method==='GET')return json(res,200,styles.read(id));
    if(method==='PUT'){
      const body=await readJson(req);
      return json(res,200,styles.put(id,body?.contract,body?.expected_revision));
    }
    throw new UserError('Method not allowed',405);
  }
  const leaseMatch=/^\/api\/decks\/([^/]+)\/leases\/([^/]+)$/.exec(p);
  if(leaseMatch){
    const id=deckId(escaped(leaseMatch[1])),scene=escaped(leaseMatch[2]);
    if(method==='GET')return json(res,200,leases.read(id,scene));
    if(method==='POST'){
      const body=await readJson(req);
      if(body?.action==='claim')return json(res,200,leases.claim(id,scene,director,body?.ttl??300));
      if(body?.action==='release')return json(res,200,leases.release(id,scene,director,body?.fence_token));
      throw new UserError('Unknown lease action');
    }
    throw new UserError('Method not allowed',405);
  }
  const planMatch=/^\/api\/decks\/([^/]+)\/assembly-plan$/.exec(p);
  if(planMatch){
    const id=deckId(escaped(planMatch[1]));
    if(method==='GET')return json(res,200,assemblyPlans.read(id));
    if(method==='PUT'){
      const body=await readJson(req);
      return json(res,200,assemblyPlans.put(id,body?.plan,body?.expected_revision));
    }
    throw new UserError('Method not allowed',405);
  }
  const releaseMatch=/^\/api\/decks\/([^/]+)\/assembly\/releases\/([^/]+)\/final\.mp4$/.exec(p);
  if(releaseMatch){
    if(method!=='GET'&&method!=='HEAD')throw new UserError('Method not allowed',405);
    const id=deckId(escaped(releaseMatch[1])),releaseId=escaped(releaseMatch[2]);
    return fileResponse(req,res,assembly.download(id,releaseId));
  }
  const cancelAssembly=/^\/api\/decks\/([^/]+)\/assemble\/cancel$/.exec(p);
  if(cancelAssembly){
    if(method!=='POST')throw new UserError('Method not allowed',405);
    return json(res,200,assembly.cancel(deckId(escaped(cancelAssembly[1]))));
  }
  const assembleMatch=/^\/api\/decks\/([^/]+)\/assemble$/.exec(p);
  if(assembleMatch){
    const id=deckId(escaped(assembleMatch[1]));
    if(method==='GET')return json(res,200,assembly.get(id));
    if(method==='POST'){
      const body=await readJson(req);
      return json(res,202,assembly.start(id,body?.scene_ids,{force:body?.force??false}));
    }
    throw new UserError('Method not allowed',405);
  }
  // P11 comparison is read-only from the user's perspective. Its FFmpeg
  // computation is serialized with Chromium and montage by the governor.
  const previewFileMatch=/^\/api\/decks\/([^/]+)\/preview\/([^/]+)\/([012])\.png$/.exec(p);
  if(previewFileMatch){
    if(method!=='GET'&&method!=='HEAD')throw new UserError('Method not allowed',405);
    const id=deckId(escaped(previewFileMatch[1])),scene=deckId(escaped(previewFileMatch[2]));
    return fileResponse(req,res,previews.frame(id,scene,Number(previewFileMatch[3])));
  }
  const previewMatch=/^\/api\/decks\/([^/]+)\/preview\/([^/]+)(\/cancel)?$/.exec(p);
  if(previewMatch){
    const id=deckId(escaped(previewMatch[1])),scene=deckId(escaped(previewMatch[2]));
    if(method==='GET'&&!previewMatch[3])return json(res,200,previews.get(id,scene));
    if(method==='POST'&&previewMatch[3]==='/cancel')return json(res,200,previews.cancel(id,scene));
    if(method==='POST'&&!previewMatch[3])return json(res,202,previews.start(id,scene));
    throw new UserError('Method not allowed',405);
  }
  const diffMatch=/^\/api\/decks\/([^/]+)\/versions\/([^/]+)\/compare\/([0-9a-f]{16})\/([0-9a-f]{16})(?:\/([012])\.jpg)?$/.exec(p);
  if(diffMatch){
    if(method!=='GET'&&method!=='HEAD')throw new UserError('Method not allowed',405);
    const id=deckId(escaped(diffMatch[1])),scene=deckId(escaped(diffMatch[2])),
      before=diffMatch[3],after=diffMatch[4];
    if(diffMatch[5]!==undefined)return fileResponse(req,res,await comparisons.frame(id,scene,before,after,Number(diffMatch[5])));
    return json(res,200,await comparisons.compare(id,scene,before,after));
  }
  const sourceStateMatch=/^\/api\/decks\/([^/]+)\/versions\/([^/]+)\/source-state$/.exec(p);
  if(sourceStateMatch){
    if(method!=='GET')throw new UserError('Method not allowed',405);
    const id=deckId(escaped(sourceStateMatch[1])),scene=deckId(escaped(sourceStateMatch[2]));
    const {snapshot,...current}=versions.source(id,scene);
    return json(res,200,current);
  }
  const sourceMatch=/^\/api\/decks\/([^/]+)\/versions\/([^/]+)\/([a-f0-9]{16})\/source$/.exec(p);
  if(sourceMatch){
    const id=deckId(escaped(sourceMatch[1])),scene=deckId(escaped(sourceMatch[2])),version=sourceMatch[3];
    if(method==='GET')return json(res,200,versions.readSource(id,scene,version));
    if(method==='POST'){
      const body=await readJson(req);
      return json(res,200,versions.restoreSource(id,scene,version,
        body?.expected_fingerprint,body?.expected_scene3d_revision,director));
    }
    throw new UserError('Method not allowed',405);
  }
  const versionMatch=/^\/api\/decks\/([^/]+)\/versions\/([^/]+)(?:\/([^/]+))?$/.exec(p);
  if(versionMatch){
    const id=deckId(escaped(versionMatch[1])),scene=deckId(escaped(versionMatch[2])),action=versionMatch[3]||'';
    if(method==='GET'&&!action)return json(res,200,{versions:versions.list(id,scene),approved:versions.pointer(id,scene)});
    if(method==='POST'&&(action==='approve'||action==='restore')){
      const body=await readJson(req);
      if(action==='approve'&&sceneTasks.read(id,scene).status!=='done')throw new UserError('Scene must be marked done before approval',409);
      const fn=action==='restore'?versions.restore:versions.approve;
      return json(res,200,fn(id,scene,body?.version_id,body?.expected_revision,director,{unresolved:reviews.unresolved}));
    }
    throw new UserError('Method not allowed',405);
  }
  const reviewMatch=/^\/api\/decks\/([^/]+)\/reviews\/([^/]+)(?:\/([^/]+))?$/.exec(p);
  if(reviewMatch){
    const id=deckId(escaped(reviewMatch[1])),scene=deckId(escaped(reviewMatch[2])),itemId=reviewMatch[3]||'';
    if(method==='GET'&&!itemId)return json(res,200,reviews.list(id,scene));
    if(method==='GET'&&itemId)return json(res,200,reviews.get(id,scene,escaped(itemId)));
    if(method==='POST'&&!itemId){
      const body=await readJson(req);
      return json(res,200,reviews.create(id,scene,body?.item,director,body?.expected_revision));
    }
    if(method==='PATCH'&&itemId){
      const body=await readJson(req);
      return json(res,200,reviews.transition(id,scene,escaped(itemId),body?.status,body?.note,director,body?.expected_revision));
    }
    throw new UserError('Method not allowed',405);
  }
  const syncMatch=/^\/api\/decks\/([^/]+)\/sync\/([^/]+)$/.exec(p);
  if(syncMatch){
    const id=deckId(escaped(syncMatch[1])),scene=deckId(escaped(syncMatch[2]));
    if(method==='GET')return json(res,200,sceneSync.read(id,scene));
    if(method==='PUT'){
      const body=await readJson(req);
      return json(res,200,sceneSync.put(id,scene,body?.markers,body?.expected_revision));
    }
    throw new UserError('Method not allowed',405);
  }
  const scene3dMatch=/^\/api\/decks\/([^/]+)\/scene3d(?:\/([^/]+))?$/.exec(p);
  if(scene3dMatch){
    const id=deckId(escaped(scene3dMatch[1]));
    const slideId=scene3dMatch[2]&&escaped(scene3dMatch[2]);
    if(!slideId){
      if(method!=='GET')throw new UserError('Method not allowed',405);
      return json(res,200,scene3d.list(id));
    }
    if(method==='GET')return json(res,200,scene3d.read(id,slideId));
    if(method==='PUT'){
      const payload=await readJson(req);
      enforceScene3D(styles.read(id).contract,payload?.spec,slideId);
      const saved=scene3d.put(id,slideId,payload?.spec,payload?.expected_revision);
      leases.logWrite(id,slideId,director,saved.revision,'write_3d');
      return json(res,200,saved);
    }
    throw new UserError('Method not allowed',405);
  }
  const directorMatch=/^\/api\/decks\/([^/]+)\/director\/(plan|approve)$/.exec(p);
  if(directorMatch){
    const id=deckId(escaped(directorMatch[1]));
    if(directorMatch[2]==='plan'&&method==='GET')return json(res,200,directorPlan.read(id));
    if(directorMatch[2]==='plan'&&method==='POST')return json(res,200,directorPlan.propose(id,await readJson(req)));
    if(directorMatch[2]==='approve'&&method==='POST')return json(res,200,directorPlan.approve(id,await readJson(req)));
    throw new UserError('Method not allowed',405);
  }
  const directorReplan=/^\/api\/decks\/([^/]+)\/director\/replan\/([^/]+)$/.exec(p);
  if(directorReplan){
    if(method!=='POST')throw new UserError('Method not allowed',405);
    return json(res,200,directorPlan.replan(
      deckId(escaped(directorReplan[1])),escaped(directorReplan[2]),await readJson(req)));
  }
  const directorSignoff=/^\/api\/decks\/([^/]+)\/director\/signoff$/.exec(p);
  if(directorSignoff){
    if(method!=='POST')throw new UserError('Method not allowed',405);
    return json(res,200,directorPlan.signoff(
      deckId(escaped(directorSignoff[1])),await readJson(req)));
  }
  const dispatchMatch=/^\/api\/decks\/([^/]+)\/director\/work$/.exec(p);
  if(dispatchMatch){
    if(method!=='GET')throw new UserError('Method not allowed',405);
    return json(res,200,dispatch.snapshot(deckId(escaped(dispatchMatch[1])),director));
  }
  const taskMatch=/^\/api\/decks\/([^/]+)\/tasks(?:\/([^/]+)(?:\/checkpoints\/([^/]+))?)?$/.exec(p);
  if(taskMatch){
    const id=deckId(escaped(taskMatch[1]));
    const scene=taskMatch[2]&&escaped(taskMatch[2]);
    const cp=taskMatch[3]&&escaped(taskMatch[3]);
    if(!scene){
      if(method!=='GET')throw new UserError('Method not allowed',405);
      return json(res,200,sceneTasks.list(id));
    }
    if(cp){
      if(method!=='PATCH')throw new UserError('Method not allowed',405);
      return json(res,200,sceneTasks.checkpoint(id,scene,cp,await readJson(req)));
    }
    if(method==='GET')return json(res,200,sceneTasks.read(id,scene));
    if(method==='PUT'){
      const body=await readJson(req);
      const {expected_revision,...patch}=body||{};
      return json(res,200,sceneTasks.put(id,scene,patch,expected_revision));
    }
    throw new UserError('Method not allowed',405);
  }
  const deckMatch=/^\/api\/decks\/([^/]+)$/.exec(p);
  if(deckMatch){
    const id=deckId(escaped(deckMatch[1]));
    if(method==='GET')return json(res,200,getDeck(id));
    if(method==='PUT'){
      const payload=await readJson(req);
      const contract=styles.read(id).contract;
      for(const slide of payload?.slides??[]){
        if(slide?.visuals?.length)enforceVisuals(contract,slide.visuals,slide.id,styleById(payload.style).colors);
      }
      return json(res,200,putDeck(id,payload));
    }
    if(method==='DELETE'){
      const f=path.join(DECKS,id);
      if(!fs.existsSync(f))throw new UserError('Only cloud-created decks may be deleted',403);
      const dest=path.join(DATA,'trash',id+'-'+Date.now());
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      fs.renameSync(f,dest);
      return json(res,200,{ok:true});
    }
    throw new UserError('Method not allowed',405);
  }
  if(p==='/api/config'){
    if(method!=='GET') throw new UserError('Cloud FFmpeg configuration is read-only',403);
    return json(res,200,{ffmpeg,ffmpegOk:spawnSync(ffmpeg,['-version'],{stdio:'ignore',timeout:4000}).status===0});
  }
  if(p==='/api/reveal')return json(res,200,{ok:true,note:'Cloud files are downloaded through /out'});
  if(p.startsWith('/api/export/')){
    if(method!=='POST')throw new UserError('Method not allowed',405);
    const action=p.slice('/api/export/'.length);
    if(action==='start'){
      if(exportSession)throw new UserError('Another render is running',409);
      const fps=Number(url.searchParams.get('fps')||60);
      if(![24,25,30,50,60].includes(fps))throw new UserError('Unsupported fps');
      const name=deckId(url.searchParams.get('name')||'presentation');
      let voice=null;
      const audio=url.searchParams.get('audio');
      if(audio){
        const match=/^([a-z0-9_-]+)\/(voice\.(?:mp3|wav|m4a|aac|ogg|oga|opus|flac|webm))$/i.exec(audio);
        if(!match)throw new UserError('Invalid voice file');
        const f=inside(DECKS,audio);
        if(!f || !fs.existsSync(f))throw new UserError('Audio not found',404);
        const n=(key,fallback)=>{const v=Number(url.searchParams.get(key)??fallback);if(!Number.isFinite(v))throw new UserError('Invalid '+key);return v};
        voice={file:f,offset:n('offset',0),volume:n('volume',1),from:n('from',0),dur:n('dur',0)};
      }
      const raw=path.join(OUT,name+'.h264'),mp4=path.join(OUT,name+'.mp4');
      const stream=fs.createWriteStream(raw);
      exportSession={fps,raw,mp4,voice,stream,bytes:0,name};
      return json(res,200,{ok:true});
    }
    if(action==='cancel'){
      const s=exportSession;exportSession=null;
      if(s){await new Promise((resolve)=>s.stream.end(resolve));fs.rmSync(s.raw,{force:true})}
      return json(res,200,{ok:true});
    }
    const s=exportSession;
    if(!s)throw new UserError('No active render',409);
    if(action==='chunk'){
      const b=await readBody(req,8*1024*1024);
      s.bytes+=b.length;
      if(s.bytes>2*1024*1024*1024)throw new UserError('Render exceeds 2 GiB',413);
      await new Promise((resolve,reject)=>s.stream.write(b,(err)=>err?reject(err):resolve()));
      return json(res,200,{ok:true});
    }
    if(action==='finish'){
      exportSession=null;
      await new Promise((resolve)=>s.stream.end(resolve));
      return json(res,200,await mux(s));
    }
    throw new UserError('Unknown export action',404);
  }
  throw new UserError('Unknown API endpoint',404);
}
// Single-worker durable queue: scene jobs are isolated and every approved MP4
// is immutable. All mutable state is persisted on the Railway data volume.
const baseUrl=()=>ORIGIN||'http://localhost:'+PORT;
const RENDER_ENGINE_BUILD_ID=(()=>{
  const entry=path.join(STATIC,'index.html');
  return fs.existsSync(entry)
    ? createHash('sha256').update(fs.readFileSync(entry)).digest('hex')
    : 'local-dev-unbuilt';
})();
function sourceFingerprint(id,slideId){
  const d=getDeck(id);
  // A scene's schedule depends on the whole deck, not just its own slide.
  // The compiled render engine must also be pinned across Railway deployments.
  const payload={deck:d,render_engine_build_id:RENDER_ENGINE_BUILD_ID,
    scene3d:slideId?scene3d.read(id,slideId).spec:scene3d.list(id).map(s=>({scene:s.scene_id,spec:s.spec})),
    style_contract:styles.read(id).contract,
    // Pin the canonical P08 source snapshot as well as the complete schedule:
    // future sync/audio/provenance extensions of P08 automatically enter
    // the queue fingerprint without a second, divergent policy.
    p08_sources:(slideId?[slideId]:d.slides.map(s=>s.id))
      .map(scene=>({scene,source:versions.source(id,scene).fingerprint}))};
  const voice=d.audio?.file;
  if(voice&&/^voice\.(?:mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(voice)){
    const local=path.join(DECKS,id,voice);
    const seed=path.join(process.cwd(),'src','decks',id,voice);
    const file=fs.existsSync(local)?local:(fs.existsSync(seed)?seed:null);
    // Same-size/same-mtime overwrites must also invalidate queued renders.
    payload.audio=file?{
      sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      size:fs.statSync(file).size,
    }:{missing:true};
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
const resources=createResourceGovernor({capacity:1,maxWaiting:64});
const comparisons=sceneComparisonService({versions,out:OUT,baseUrl,
  acquireResource:options=>resources.acquire(options)});
const previews=scenePreviewService({out:OUT,getDeck,fingerprint:sourceFingerprint,baseUrl,
  acquireResource:options=>resources.acquire(options),
  render:args=>renderWithChrome({...args,port:PORT,username:WEB_USER,password:WEB_PASS,
    timeoutMs:30000,previewOnly:true})});
const renderJobs=makeRenderQueue({
  root:path.join(DATA,'render-jobs'),outputDir:OUT,
  resolveDeck:getDeck,baseUrl,
  fingerprint:sourceFingerprint,
  acquireResource:options=>resources.acquire(options),
  reuseScene:args=>findReusableScene({...args,versions,reviews,baseUrl}),
  render:args=>renderWithChrome({...args,port:PORT,username:WEB_USER,password:WEB_PASS,timeoutMs:900000}),
  outputNameForJob:(id,scene,jobId)=>scene
    ? id+'_'+scene+'_v'+versions.versionId(jobId)
    : id+'_'+jobId,
  publishScene:({job,file,rendered,qa})=>{
    const scene=job.slide_id;
    if(job.source_fingerprint!==sourceFingerprint(job.id,scene))
      throw new UserError('Scene source changed before version capture',409);
    const snapshot=versions.source(job.id,scene);
    const evidence=captureFrameEvidence({file,out:OUT,id:job.id,scene,
      version:versions.versionId(job.job_id),duration:rendered.duration,fps:rendered.fps});
    const record=versions.capture({id:job.id,scene,jobId:job.job_id,file,rendered,qa,
      expectedSource:snapshot,renderFingerprint:job.source_fingerprint,
      frameEvidence:evidence});
    try{versions.publishPreview(job.id,scene,record)}
    catch(e){console.warn('Draft preview update failed:',String(e))}
    return {version_id:record.version_id};
  },
  recoverCompleted:(job)=>{
    const versionId=versions.versionId(job.job_id);
    try{
      const artifact=versions.verified(job.id,job.slide_id,versionId);
      if(artifact.job_id!==job.job_id||artifact.qa?.verdict!=='PASS')return null;
      return {version_id:versionId,result:{
        file:artifact.file,size:artifact.size,
        download_url:baseUrl().replace(/\/$/,'')+'/out/'+path.basename(artifact.file),
      }};
    }catch{return null}
  },
  inspect:(file,{visualAudit,frameSamples,...expected})=>
    mergeVisualQA(inspectMp4(file,expected),visualAudit,frameSamples),
});
const getRender=(id,slideId=null)=>renderJobs.get(id,slideId);
const startRender=(id,slideId=null)=>renderJobs.enqueue(id,slideId);
const cancelRender=(id,slideId,jobId)=>renderJobs.cancel(id,slideId,jobId);
const retryRender=(id,slideId,jobId)=>renderJobs.retry(id,slideId,jobId);
const assembly=assemblyService({out:OUT,getDeck,getRender,
  acquireResource:options=>resources.acquire(options),
  getTask:(id,scene)=>sceneTasks.read(id,scene),
  getApproved:(id,scene)=>versions.approved(id,scene),
  reviewUnresolved:(id,scene,version)=>reviews.unresolved(id,scene,version),baseUrl,
  getPlan:id=>assemblyPlans.read(id),getStyle:id=>styles.read(id),
  // Fail closed by default; enable after validating real deployment clips.
  incrementalHardCuts:process.env.PB_INCREMENTAL_HARDCUT==='1',
  benchmarkFfmpeg:process.env.PB_FFMPEG_BENCHMARK==='1'});
const mcp=makeMcp({startRender,getRender,cancelRender,retryRender,baseUrl,
  assembly,assemblyPlans,versions,reviews,sceneSync,directorPlan,dispatch,comparisons,previews,rhythmPreview,rhythmDrafts});
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/', 'http://localhost');
    const p=url.pathname;
    if(p==='/health' && req.method==='GET')return json(res,200,{status:'ok',service:'pressbuilder-cloud'});
    if(oauth.enabled && oauth.canHandle(p))return await oauth.handle(req,res,url);
    if(p==='/mcp'){
      const bearer=String(req.headers.authorization||'').startsWith('Bearer ') ? String(req.headers.authorization).slice(7) : '';
      const actor=authMcp(req)||oauth.verifyToken(bearer)?{id:'mcp-director',role:'director'}:agents.authenticate(bearer);
      if(!actor)return send(res,401,{error:'Unauthorized'},'application/json; charset=utf-8',
        {'WWW-Authenticate':oauth.enabled?oauth.challenge:'Bearer realm="PressBuilder MCP"'});
      if(req.method!=='POST')return json(res,405,{error:'Streamable HTTP supports POST' });
      const msg=await readJson(req);
      const reply=await mcp(msg,actor);
      if(reply===null){res.writeHead(202);res.end();return}
      return json(res,200,reply);
    }
    if(!authWeb(req))return send(res,401,'Authentication required','text/plain; charset=utf-8',{'WWW-Authenticate':'Basic realm="PressBuilder"'});
    if(p.startsWith('/api/')){
      if(req.method!=='GET' && req.method!=='HEAD'){
        if(req.headers['sec-fetch-site']==='cross-site')throw new UserError('Cross-site write blocked',403);
        if(req.headers.origin){
          let origin;try{origin=new URL(req.headers.origin)}catch{throw new UserError('Bad Origin',403)}
          if(origin.host!==req.headers.host)throw new UserError('Cross-origin write blocked',403);
        }
      }
      return await api(req,res,url);
    }
    if(p.startsWith('/out/')){
      const name=escaped(p.slice('/out/'.length));
      const validMp4=/^[a-z0-9][a-z0-9_-]{0,125}\.mp4$/.test(name);
      const validEvidence=/^[a-z0-9][a-z0-9_-]{0,40}_[a-z0-9][a-z0-9_-]{0,40}_v[0-9a-f]{16}_f[012]\.jpg$/.test(name);
      if(!validMp4&&!validEvidence)throw new UserError('Invalid filename');
      const file=inside(OUT,name);
      if(!file || !fs.existsSync(file))throw new UserError('Video not found',404);
      return fileResponse(req,res,file);
    }
    if(p.startsWith('/src/decks/')){
      const match=/^\/src\/decks\/([a-z0-9_-]+)\/(voice\.[a-z0-9]+)$/.exec(p);
      if(!match)throw new UserError('Media not found',404);
      const file=inside(DECKS,match[1]+'/'+match[2]);
      if(!file || !fs.existsSync(file))throw new UserError('Media not found',404);
      return fileResponse(req,res,file);
    }
    if(req.method!=='GET' && req.method!=='HEAD')throw new UserError('Method not allowed',405);
    const relative=escaped(p.replace(/^\/+/,'')||'index.html');
    let file=inside(STATIC,relative);
    if(!file || !fs.existsSync(file) || !fs.statSync(file).isFile())file=path.join(STATIC,'index.html');
    return fileResponse(req,res,file);
  }catch(e){if(!res.headersSent)error(res,e);else res.destroy();}
});
server.listen(PORT,HOST,()=>{console.log('PressBuilder cloud listening on '+PORT);renderJobs.start();});

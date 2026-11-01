import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {sceneVersionStore} from '../server/scene-versions.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
 const sock=net.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));
 const port=sock.address().port;await new Promise(r=>sock.close(r));return port;
}
test('M32 protected REST/MCP: real P08 version identity, human attest/revoke, actor scope, no publishing',{timeout:55000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m32-http-'));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const key=randomBytes(32).toString('hex'),workerKey=randomBytes(32).toString('hex');
 const basic='Basic '+Buffer.from('owner:password-123456789').toString('base64');
 const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(port),PB_DATA_DIR:root,MCP_API_KEY:key,
   PB_WEB_USER:'owner',PB_WEB_PASSWORD:'password-123456789',
   PB_MEDIA_CATALOG:'1',PB_AGENT_KEYS_JSON:JSON.stringify([
    {id:'agent-02',role:'worker',token:workerKey,projects:['media-demo'],scenes:['s02']}
   ])}});
 let logs='';child.stdout.on('data',x=>logs+=x.toString());child.stderr.on('data',x=>logs+=x.toString());
 const http=async(route,method='GET',data,auth=true,extra={})=>{
  const response=await fetch(base+route,{method,headers:{...(auth?{Authorization:basic}:{}),
   ...(data===undefined?{}:{'Content-Type':'application/json'}),...extra},
   ...(data===undefined?{}:{body:JSON.stringify(data)})});
  return {status:response.status,body:await response.json().catch(()=>null)};
 };
 const rpc=async(token,name,args={})=>{
  const res=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,
   'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:20,
    method:'tools/call',params:{name,arguments:args}})});
  assert.equal(res.status,200);
  return (await res.json()).result;
 };
 try{
  let ready=false;
  for(let k=0;k<90;k++){if(child.exitCode!==null)throw Error('Server exited '+logs);
   try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await sleep(130)}
  assert.ok(ready,logs);
  const created=await rpc(key,'create_deck',{id:'media-demo',title:'M32 test',
   text:'Первая сцена описывает безопасное изображение. Вторая сцена показывает пример.',
   slide_count:2,style:'paper',target:8});
  assert.equal(created.isError,false,JSON.stringify(created));
  const deckResponse=await http('/api/decks/media-demo'),deck=deckResponse.body;
  assert.equal(deck.slides.length,2);
  const sourceScene=deck.slides[0].id,targetScene=deck.slides[1].id;
  assert.equal(sourceScene,'s01');assert.equal(targetScene,'s02');
  const out=path.join(root,'out');
  const versions=sceneVersionStore({root:path.join(root,'decks'),out,getDeck:()=>deck,
   getScene3D:()=>({revision:0,spec:null}),
   getStyle:()=>({revision:0,contract:{enforce:false}})});
  const job='m32-http-source',version=versions.versionId(job);
  const file=path.join(out,'media-demo_s01_v'+version+'.mp4');
  fs.writeFileSync(file,Buffer.from('Synthetic P08 QA fixture only x'.repeat(60)));
  const source=versions.source('media-demo','s01');
  const stored=versions.capture({id:'media-demo',scene:'s01',jobId:job,file,expectedSource:source,
   rendered:{duration:3,fps:24,height:720},qa:{verdict:'PASS',metadata:{fps:24,height:720,duration:3},issues:[]}});
  versions.approve('media-demo','s01',stored.version_id,0,{id:'director',role:'director'});
  const approved=versions.approved('media-demo','s01');
  const proposal={expected_revision:0,asset_id:'fixture-broll',
   source_scene_id:'s01',source_version_id:approved.version_id,
   source_sha256:approved.artifact.sha256,source_approval_revision:approved.revision,
   label:'Synthetic owned scene',rights_holder:'fixture-studio',
   license_ref:'owned/asset-001',evidence_ref:'evidence/fixture-001',
   expires_at:'2027-12-31T23:59:59.000Z',allowed_uses:['b_roll'],
   allowed_scenes:['s02'],attribution:'NONE'};
  assert.equal((await http('/api/decks/media-demo/media-catalog')).body.revision,0);
  assert.equal((await http('/api/decks/media-demo/media-catalog','POST',proposal,false)).status,401);
  assert.equal((await http('/api/decks/media-demo/media-catalog','POST',proposal,true,
   {Origin:'https://hostile.example'})).status,403);
  const result=await http('/api/decks/media-demo/media-catalog','POST',proposal);
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.asset.status,'PENDING_ATTESTATION');
  const unauthorized=await rpc(workerKey,'propose_media_asset',{id:'media-demo',...proposal});
  assert.equal(unauthorized.isError,true);
  let list=await rpc(workerKey,'list_media_assets',{id:'media-demo',slide_id:'s02'});
  assert.equal(list.isError,false,JSON.stringify(list));
  assert.equal(JSON.parse(list.content[0].text).assets.length,1);
  const forbidden=await rpc(workerKey,'list_media_assets',{id:'media-demo',slide_id:'s01'});
  assert.equal(forbidden.isError,true);
  let check=await rpc(workerKey,'verify_media_asset',{id:'media-demo',slide_id:'s02',
   asset_id:'fixture-broll',use:'b_roll'});
  assert.equal(JSON.parse(check.content[0].text).proposal_allowed,false);
  const attest=await http('/api/decks/media-demo/media-catalog/fixture-broll/attest','POST',
   {expected_revision:1,expected_asset_revision:1,source_sha256:approved.artifact.sha256,confirm:'ATTEST_RIGHTS'});
  assert.equal(attest.status,200,JSON.stringify(attest.body));
  check=await rpc(workerKey,'verify_media_asset',{id:'media-demo',slide_id:'s02',
   asset_id:'fixture-broll',use:'b_roll'});
  assert.equal(check.isError,false,JSON.stringify(check));
  const proof=JSON.parse(check.content[0].text);
  assert.equal(proof.status,'ATTESTED_FOR_PROPOSAL');
  assert.equal(proof.proposal_allowed,true);
  assert.equal(proof.render_allowed,false);
  assert.equal(proof.publication_allowed,false);
  const remove=await http('/api/decks/media-demo/media-catalog/fixture-broll/revoke','POST',
   {expected_revision:2,expected_asset_revision:2,reason:'permission revoked',confirm:'REVOKE_RIGHTS'});
  assert.equal(remove.status,200,JSON.stringify(remove.body));
  const after=await http('/api/decks/media-demo/media-catalog/fixture-broll/verify?scene=s02&use=b_roll');
  assert.deepEqual(after.body.reason_codes,['NOT_ATTESTED_OR_REVOKED']);
  assert.equal((await http('/api/decks/media-demo/media-catalog','POST',{...proposal,expected_revision:0})).status,409);
 }finally{
  child.kill('SIGTERM');
  await new Promise(r=>child.once('exit',r));
  fs.rmSync(root,{recursive:true,force:true});
 }
});

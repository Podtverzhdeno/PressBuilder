import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {styleContractStore,enforceScene3D,enforceVisuals} from '../server/style-contract.mjs';
import {sceneLeaseStore,agentDirectory} from '../server/scene-leases.mjs';
import {assemblyService} from '../server/assemble-scenes.mjs';
const temp=prefix=>fs.mkdtempSync(path.join(os.tmpdir(),prefix));
const cleanup=dir=>fs.rmSync(dir,{recursive:true,force:true});
const sleep=t=>new Promise(r=>setTimeout(r,t));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}

test('P04 strict style contract, optimistic revision, camera/palette and safe area',{timeout:10000},()=>{
  const root=temp('pb-style-'),getDeck=id=>({id,slides:[{id:'s01'}]});
  try {
    const s=styleContractStore({root,getDeck});
    const baseline=s.read('example');assert.equal(baseline.revision,0);
    const contract={...baseline.contract,enforce:true,palette:['#aabbcc','#ffffff'],
      camera:{maxYawSpeed:0.3,maxPitchSpeed:0.1},motion:{maxSpin:0.2}};
    const saved=s.put('example',contract,0);assert.equal(saved.revision,1);
    assert.deepEqual(saved.contract.palette,['#AABBCC','#FFFFFF']);
    assert.throws(()=>s.put('example',contract,0),e=>e.status===409);
    assert.throws(()=>s.put('example',{...contract,safeArea:{left:-1,right:0,top:0,bottom:0}},1));
    const spec={camera:{yaw_speed:0,pitch_speed:0},objects:[{color:'#AABBCC',edge_color:null,spin:[0,0,0]}]};
    assert.doesNotThrow(()=>enforceScene3D(saved.contract,spec));
    assert.throws(()=>enforceScene3D(saved.contract,{...spec,objects:[{...spec.objects[0],color:'#FF0000'}]}),e=>e.status===422);
    assert.throws(()=>enforceScene3D(saved.contract,{...spec,camera:{yaw_speed:0.5,pitch_speed:0}}),e=>e.status===422);
    assert.throws(()=>enforceVisuals(saved.contract,[{kind:'text',x:2,y:60,text:'ok',size:30}]),e=>e.status===422);
    assert.doesNotThrow(()=>enforceVisuals(saved.contract,[{kind:'text',x:200,y:200,text:'ok',font:'sans',size:40}]));
  }finally{cleanup(root)}
});
test('P06 fenced leases, expiry, foreign actors, scope, audit, role validation',{timeout:10000},()=>{
  const root=temp('pb-lease-');let clock=100000;
  const getDeck=id=>({id,slides:[{id:'s01'},{id:'s02'}]});
  const worker={id:'agent1',role:'worker',projects:['demo'],scenes:['s01']};
  const other={id:'agent2',role:'worker',projects:['demo'],scenes:['s01']};
  try{
    const l=sceneLeaseStore({root,getDeck,now:()=>clock});
    const c=l.claim('demo','s01',worker,30);assert.equal(c.fence,1);
    assert.doesNotThrow(()=>l.assertWrite('demo','s01',worker,1));
    assert.throws(()=>l.assertWrite('demo','s01',worker,0),e=>e.status===409);
    assert.throws(()=>l.assertWrite('demo','s01',other,1),e=>e.status===409);
    assert.throws(()=>l.claim('demo','s01',other,30),e=>e.status===409);
    assert.throws(()=>l.claim('demo','s02',worker,30),e=>e.status===403);
    clock+=31000;
    assert.throws(()=>l.assertWrite('demo','s01',worker,1),e=>e.status===409);
    const n=l.claim('demo','s01',other,60);assert.equal(n.fence,2);
    assert.throws(()=>l.renew('demo','s01',worker,1,30),e=>e.status===409);
    l.renew('demo','s01',other,2,30);
    const r=l.release('demo','s01',other,2);assert.equal(r.fence,3);assert.equal(r.holder,null);
    assert.throws(()=>l.assertWrite('demo','s01',other,2),e=>e.status===409);
    l.logWrite('demo','s01',other,3,'write_3d');
    const audit=fs.readFileSync(path.join(root,'demo','.scene-leases','audit.jsonl'),'utf8').trim().split('\n');
    assert.ok(audit.length>=5);assert.equal(JSON.parse(audit.at(-1)).event,'write_3d');
    const dir=agentDirectory(JSON.stringify([{id:'agent1',token:'a'.repeat(32),role:'worker',projects:['demo'],scenes:['s01']}]));
    assert.equal(dir.authenticate('a'.repeat(32)).id,'agent1');assert.equal(dir.authenticate('b'.repeat(32)),null);
    assert.throws(()=>agentDirectory(JSON.stringify([{id:'x',token:'short',role:'worker',projects:['demo'],scenes:['s01']}])));
  }finally{cleanup(root)}
});
test('P05 hard-cut assembly enforces approval, original hash and silent audio',{timeout:30000},async(t)=>{
  if(spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0||spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status!==0){t.skip('FFmpeg/ffprobe not installed');return}
  const root=temp('pb-assembly-');const format={fps:24,height:720};
  const create=(name,withAudio)=>{
    const args=['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=red:s=1280x720:r=24:d=0.5'];
    if(withAudio)args.push('-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.5');
    args.push('-t','0.5','-c:v','libx264','-pix_fmt','yuv420p',...(withAudio?['-c:a','aac']:['-an']),path.join(root,'demo_'+name+'.mp4'));
    const out=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:12000});assert.equal(out.status,0,out.stderr);
  };
  try{
    create('s01',true);create('s02',false);
    let approved=false;
    const svc=assemblyService({out:root,getDeck:()=>({slides:[{id:'s01'},{id:'s02'}],format}),
      getRender:(id,scene)=>({status:'completed',qa_report:{verdict:'PASS'}}),
      getTask:()=>({status:approved?'done':'review'}),baseUrl:()=> 'https://example.test'});
    assert.throws(()=>svc.start('demo',['s01','s02']),e=>e.status===409);
    approved=true;
    const first=svc.start('demo',['s01','s02']);assert.ok(['queued','running'].includes(first.status));
    let last;
    for(let i=0;i<200;i++){last=svc.get('demo');if(['completed','failed'].includes(last.status))break;await sleep(80)}
    assert.equal(last.status,'completed',JSON.stringify(last));
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'demo_final.manifest.json'),'utf8'));
    assert.equal(manifest.scenes.length,2);assert.equal(manifest.output.qa.verdict,'PASS');
    assert.equal(manifest.output.qa.metadata.has_audio,true);
    assert.ok(fs.existsSync(path.join(root,'demo_final.mp4')));
    const recovered=assemblyService({out:root,getDeck:()=>({slides:[{id:'s01'},{id:'s02'}],format}),
      getRender:()=>({status:'not_started'}),getTask:()=>({status:'review'}),
      baseUrl:()=> 'https://example.test'});
    assert.equal(recovered.get('demo').status,'completed');
    assert.equal(recovered.get('demo').recovered,true);
    const oldHash=manifest.output.sha256;
    // Failure must keep the accepted previous release and manifest unchanged.
    fs.rmSync(path.join(root,'demo_s02.mp4'));
    assert.throws(()=>svc.start('demo',['s01','s02']),e=>e.status===409);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'demo_final.manifest.json'),'utf8')).output.sha256,oldHash);
  }finally{cleanup(root)}
});
test('P04/P06 MCP authenticates distinct workers, refuses wrong scope and stale writes',{timeout:45000},async()=>{
  const dir=temp('pb-secure-http-'),p=await freePort(),url='http://127.0.0.1:'+p;
  const director=randomBytes(32).toString('hex'),agent1=randomBytes(32).toString('hex'),agent2=randomBytes(32).toString('hex');
  const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(p),PB_DATA_DIR:dir,MCP_API_KEY:director,PB_WEB_USER:'test',
      PB_WEB_PASSWORD:'testing-password-123456',
      PB_AGENT_KEYS_JSON:JSON.stringify([{id:'agent1',token:agent1,role:'worker',projects:['scene-demo'],scenes:['s01']},
        {id:'agent2',token:agent2,role:'worker',projects:['scene-demo'],scenes:['s02']}])}});
  let logs='';child.stderr.on('data',x=>logs+=x);child.stdout.on('data',x=>logs+=x);
  const rpc=async(token,name,args)=>{const r=await fetch(url+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(r.status,200);const json=await r.json();return json.result};
  try{
    let ready=false;
    for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{if((await fetch(url+'/health')).ok){ready=true;break}}catch{}await sleep(130)}
    assert.ok(ready,logs);
    const make=await rpc(director,'create_deck',{id:'scene-demo',title:'Demo',text:'First scene. Second scene.',slide_count:2});
    assert.equal(make.isError,false,JSON.stringify(make));
    const denied=await rpc(agent1,'set_style_contract',{id:'scene-demo',expected_revision:0,contract:{}});
    assert.equal(denied.isError,true);
    const foreign=await rpc(agent1,'get_scene_3d',{id:'scene-demo',slide_id:'s02'});
    assert.equal(foreign.isError,true);
    const outside=await rpc(agent1,'get_project_context',{id:'outside-project'});
    assert.equal(outside.isError,true);
    assert.match(outside.content[0].text,/outside agent scope/);
    const visible=await rpc(agent1,'list_decks',{});
    assert.equal(visible.isError,false);
    assert.deepEqual(JSON.parse(visible.content[0].text).map(p=>p.id),['scene-demo']);
    const noFence=await rpc(agent1,'set_scene_checkpoint',{id:'scene-demo',slide_id:'s01',checkpoint_id:'x',done:true});
    assert.equal(noFence.isError,true);
    const lease=await rpc(agent1,'claim_scene',{id:'scene-demo',slide_id:'s01',ttl:60});
    assert.equal(lease.isError,false,JSON.stringify(lease));
    const {fence}=JSON.parse(lease.content[0].text);
    const denyReassign=await rpc(agent1,'set_scene_task',{id:'scene-demo',slide_id:'s01',fence_token:fence,expected_revision:0,assignee:'agent2'});
    assert.equal(denyReassign.isError,true,'Worker cannot change assignee');
    const denySelfApproval=await rpc(agent1,'set_scene_task',{id:'scene-demo',slide_id:'s01',fence_token:fence,expected_revision:0,status:'done'});
    assert.equal(denySelfApproval.isError,true,'Worker cannot self-approve');
    const denyRender=await rpc(agent1,'render_scene',{id:'scene-demo',slide_id:'s01'});
    assert.equal(denyRender.isError,true,'Rendering needs current fenced lease');
    const denyReviewerRender=await rpc(agent2,'render_scene',{id:'scene-demo',slide_id:'s01'});
    assert.equal(denyReviewerRender.isError,true,'Other agent cannot render foreign scene');
    const task=await rpc(agent1,'set_scene_task',{id:'scene-demo',slide_id:'s01',fence_token:fence,expected_revision:0,title:'Owned scene'});
    assert.equal(task.isError,false,JSON.stringify(task));
    const otherWrite=await rpc(agent2,'set_scene_task',{id:'scene-demo',slide_id:'s01',fence_token:fence,expected_revision:1,title:'Hijack'});
    assert.equal(otherWrite.isError,true);
    const released=await rpc(agent1,'release_scene',{id:'scene-demo',slide_id:'s01',fence_token:fence});
    assert.equal(released.isError,false);
    const stale=await rpc(agent1,'set_scene_task',{id:'scene-demo',slide_id:'s01',fence_token:fence,expected_revision:1,title:'Stale'});
    assert.equal(stale.isError,true);
  }finally{if(child.exitCode===null){const closing=once(child,'close');child.kill('SIGTERM');await closing}cleanup(dir)}
});

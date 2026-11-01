import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {sceneSyncStore} from '../server/scene-sync.mjs';
import {sceneVersionStore} from '../server/scene-versions.mjs';
import {scene3dStore} from '../server/scene-3d.mjs';

function setup(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p09-'));
  const out=path.join(root,'out');fs.mkdirSync(out);
  let deck={id:'demo',format:{fps:24,height:720,bitrate:10},style:'paper',target:null,
    slides:[{id:'s01',label:'First',lead:0,tail:0,cues:[{id:'a',say:'A',dur:2},{id:'b',say:'B',dur:3}]},
      {id:'s02',label:'Second',lead:0,tail:0,cues:[{id:'c',say:'C',dur:4}]}]};
  const getDeck=id=>{assert.equal(id,'demo');return structuredClone(deck)};
  const three=scene3dStore({root,getDeck});
  const sync=sceneSyncStore({root,getDeck});
  const versions=sceneVersionStore({root,out,getDeck,getScene3D:(id,scene)=>three.read(id,scene),
    getStyle:()=>({revision:0,contract:{enforce:false}}),getSceneSync:(id,scene)=>sync.read(id,scene)});
  return {root,out,sync,three,versions,getDeck,setDeck:d=>{deck=structuredClone(d)},
    cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
const beat={id:'beat-1',kind:'beat',anchor:{type:'cue_start',cue_id:'b',offset:.25},emphasis:.8};
test('P09 stable anchored cue timeline, frame alignment and orphan repair',()=>{
  const f=setup();
  try{
    const a=f.sync.put('demo','s01',[beat],0);
    assert.equal(a.timeline.events[0].global_time,2.25);
    assert.equal(a.timeline.events[0].frame,54);
    assert.throws(()=>f.sync.put('demo','s01',[beat],0),e=>e.status===409);
    let d=f.getDeck('demo');d.format.fps=60;d.slides[0].cues[0].dur=4;f.setDeck(d);
    const b=f.sync.read('demo','s01');
    assert.equal(b.timeline.events[0].global_time,4.25);
    assert.equal(b.timeline.events[0].frame,255);
    assert.ok(Math.abs(b.timeline.events[0].snapped_time-4.25)<=1/120+1e-8);
    assert.equal(f.sync.read('demo','s02').revision,0);
    d.slides[0].cues[1].id='new-b';f.setDeck(d);
    const orphan=f.sync.read('demo','s01');
    assert.match(orphan.validation_error,/Unknown cue_id/);
    assert.equal(f.sync.put('demo','s01',[],1).revision,2);
    assert.equal(f.sync.read('demo','s01').validation_error,null);
    assert.throws(()=>f.sync.put('demo','s01',[{...beat,id:'../../evil'}],2));
  }finally{f.cleanup()}
});
test('P08 source fingerprint covers anchored scene markers, time, voice bytes, and invalid 3D links',()=>{
  const f=setup();
  try{
    const start=f.versions.source('demo','s01');
    f.sync.put('demo','s01',[beat],0);
    const annotated=f.versions.source('demo','s01');
    assert.notEqual(start.fingerprint,annotated.fingerprint);
    assert.deepEqual(annotated.snapshot.sync_markers,[beat]);
    assert.equal(annotated.snapshot.clip_duration,5);
    let d=f.getDeck('demo');d.slides[0].cues[0].dur=3;f.setDeck(d);
    const retimed=f.versions.source('demo','s01');
    assert.notEqual(annotated.fingerprint,retimed.fingerprint);
    assert.equal(retimed.snapshot.clip_duration,6);
    const initialSecond=f.versions.source('demo','s02');
    assert.equal(initialSecond.snapshot.clip_start,6);
    d.slides[0].cues[0].dur=4;f.setDeck(d);
    assert.notEqual(initialSecond.fingerprint,f.versions.source('demo','s02').fingerprint);
    const voice=path.join(f.root,'demo','voice.wav');fs.mkdirSync(path.dirname(voice),{recursive:true});
    fs.writeFileSync(voice,'version1');
    d.audio={file:'voice.wav',offset:0,volume:1};f.setDeck(d);
    const audio1=f.versions.source('demo','s01');
    fs.writeFileSync(voice,'version2');
    const audio2=f.versions.source('demo','s01');
    assert.notEqual(audio1.fingerprint,audio2.fingerprint);
    const three={version:1,camera:{},objects:[{id:'core',mesh:'cube',color:'#aabbcc',start_marker:'missing'}]};
    f.three.put('demo','s01',three,0);
    assert.throws(()=>f.versions.source('demo','s01'),e=>e.status===409);
    const marked={...three,objects:[{...three.objects[0],start_marker:'beat-1'}]};
    f.three.put('demo','s01',marked,1);
    assert.equal(f.versions.source('demo','s01').snapshot.scene3d.spec.objects[0].start_marker,'beat-1');
  }finally{f.cleanup()}
});
test('P09 MCP write guarded by P06 fenced scene lease and per-agent scope',{timeout:45000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p09-mcp-'));
  const l=net.createServer();await new Promise(ok=>l.listen(0,'127.0.0.1',ok));const port=l.address().port;
  await new Promise(ok=>l.close(ok));
  const base='http://127.0.0.1:'+port;
  const director=randomBytes(32).toString('hex'),agent=randomBytes(32).toString('hex'),other=randomBytes(32).toString('hex');
  const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),PB_DATA_DIR:root,MCP_API_KEY:director,PB_WEB_USER:'editor',
      PB_WEB_PASSWORD:'long-password-123456',
      PB_AGENT_KEYS_JSON:JSON.stringify([{id:'one',token:agent,role:'worker',projects:['scoped'],scenes:['s01']},
        {id:'two',token:other,role:'worker',projects:['scoped'],scenes:['s02']}])}});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const rpc=async(token,name,args)=>{
    const response=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(response.status,200);
    return (await response.json()).result;
  };
  try{
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error(logs);
      try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
      await new Promise(ok=>setTimeout(ok,120));
    }
    assert.equal(ready,true,logs);
    const created=await rpc(director,'create_deck',{id:'scoped',title:'Scoped',text:'Первый кадр. Второй кадр.',slide_count:2,target:12});
    assert.equal(created.isError,false,JSON.stringify(created));
    assert.equal((await rpc(agent,'get_scene_sync',{id:'scoped',slide_id:'s02'})).isError,true);
    assert.equal((await rpc(other,'get_scene_sync',{id:'scoped',slide_id:'s01'})).isError,true);
    const mark={id:'event',kind:'beat',anchor:{type:'scene',offset:.2}};
    assert.equal((await rpc(agent,'set_scene_sync',{id:'scoped',slide_id:'s01',expected_revision:0,markers:[mark]})).isError,true);
    const lease=await rpc(agent,'claim_scene',{id:'scoped',slide_id:'s01',ttl:60});
    assert.equal(lease.isError,false,JSON.stringify(lease));
    const fence=JSON.parse(lease.content[0].text).fence;
    const saved=await rpc(agent,'set_scene_sync',{id:'scoped',slide_id:'s01',fence_token:fence,expected_revision:0,markers:[mark]});
    assert.equal(saved.isError,false,JSON.stringify(saved));
    assert.equal(JSON.parse(saved.content[0].text).timeline.events[0].local_time,.2);
    assert.equal((await rpc(agent,'release_scene',{id:'scoped',slide_id:'s01',fence_token:fence})).isError,false);
    assert.equal((await rpc(agent,'set_scene_sync',{id:'scoped',slide_id:'s01',fence_token:fence,expected_revision:1,markers:[]})).isError,true);
    assert.equal((await fetch(base+'/api/decks/scoped/sync/s01')).status,401);
  }finally{
    if(child.exitCode===null){const done=once(child,'close');child.kill('SIGTERM');await done}
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('P08 source rollback restores P09 cue markers together with slide and 3D without touching another scene',()=>{
  const f=setup();
  try{
    f.sync.put('demo','s01',[beat],0);
    const spec={version:1,camera:{},objects:[{id:'core',mesh:'cube',color:'#aabbcc',start_marker:'beat-1'}]};
    f.three.put('demo','s01',spec,0);
    const v=sceneVersionStore({
      root:f.root,out:f.out,getDeck:f.getDeck,staticRoot:path.join(f.root,'empty-build'),
      getScene3D:(id,scene)=>f.three.read(id,scene),
      getStyle:()=>({revision:0,contract:{enforce:false}}),
      getSceneSync:(id,scene)=>f.sync.read(id,scene),
      restoreScene3D:(id,scene,source,rev)=>f.three.restore(id,scene,source,rev),
      restoreSlide:(id,scene,slide)=>{
        const d=f.getDeck(id),index=d.slides.findIndex(x=>x.id===scene);
        assert.ok(index>=0);d.slides[index]=slide;f.setDeck(d);
      },
      restoreSceneSync:(id,scene,markers,rev)=>f.sync.put(id,scene,markers,rev)
    });
    const original=v.source('demo','s01');
    const job='archive-scene',vid=v.versionId(job),file=path.join(f.out,'demo_s01_v'+vid+'.mp4');
    fs.writeFileSync(file,Buffer.alloc(2048,42));
    v.capture({id:'demo',scene:'s01',jobId:job,file,expectedSource:original,
      rendered:{duration:5,fps:24,height:720},qa:{verdict:'PASS'}});
    assert.deepEqual(v.readSource('demo','s01',vid).source.sync_markers,[beat]);
    const updatedSheet=[{id:'future-beat',kind:'beat',anchor:{type:'scene',offset:.2}}];
    f.sync.put('demo','s01',updatedSheet,1);
    f.three.put('demo','s01',{...spec,objects:[{...spec.objects[0],start_marker:'future-beat'}]},1);
    const changed=f.getDeck('demo');changed.slides[0].label='Edited';f.setDeck(changed);
    const current=v.source('demo','s01'),actor={id:'director',role:'director'};
    assert.notEqual(current.fingerprint,original.fingerprint);
    assert.throws(()=>v.restoreSource('demo','s01',vid,'outdated',current.scene3d_revision,actor),
      e=>e.status===409);
    const restored=v.restoreSource('demo','s01',vid,current.fingerprint,current.scene3d_revision,actor);
    assert.equal(restored.ok,true);
    assert.equal(f.getDeck('demo').slides[0].label,'First');
    assert.equal(f.getDeck('demo').slides[1].label,'Second');
    assert.deepEqual(f.sync.read('demo','s01').markers,[beat]);
    assert.equal(f.sync.read('demo','s02').revision,0);
    assert.equal(f.three.read('demo','s01').spec.objects[0].start_marker,'beat-1');
    const globalChange=f.getDeck('demo');globalChange.target=9;f.setDeck(globalChange);
    const after=v.source('demo','s01');
    assert.throws(()=>v.restoreSource('demo','s01',vid,after.fingerprint,after.scene3d_revision,actor),
      e=>e.status===409,'Global retiming must block isolated source restore');
  }finally{f.cleanup()}
});

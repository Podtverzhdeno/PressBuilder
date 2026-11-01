import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sceneSyncStore} from '../server/scene-sync.mjs';
import {sceneVersionStore} from '../server/scene-versions.mjs';
import {scene3dStore} from '../server/scene-3d.mjs';

function setup(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-versions-'));
  const out=path.join(dir,'out');fs.mkdirSync(out,{recursive:true});
  const deck={id:'p1',title:'Versioning',text:'',target:null,style:'lines',
    format:{height:720,fps:24,bitrate:10},slides:[
      {id:'s01',label:'Intro',lead:0,tail:0,cues:[{id:'one',say:'Hello',dur:2},{id:'two',say:'World',dur:3}]},
      {id:'s02',label:'Outro',lead:0,tail:0,cues:[{id:'three',say:'Done',dur:4}]}
    ]};
  let live=structuredClone(deck);
  const getDeck=id=>{if(id!=='p1')throw Object.assign(new Error('not found'),{status:404});return structuredClone(live)};
  const putDeck=(_,d)=>{live=structuredClone(d)};
  const three=scene3dStore({root:dir,getDeck});
  const sync=sceneSyncStore({root:dir,getDeck});
  const versions=sceneVersionStore({root:dir,outDir:out,getDeck,putDeck,scene3d:three,syncStore:sync});
  return {dir,out,getDeck,putDeck,three,sync,versions,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
const beat={id:'beat-1',kind:'beat',anchor:{type:'cue_start',cue_id:'two',offset:.25},emphasis:.7,note:'Visual accent'};
const camera={id:'camera-cut',kind:'camera',anchor:{type:'scene',offset:1.5},duration:.3};
test('P09 cue anchors track narration and FPS with <= half-frame rounding drift',()=>{
  const s=setup();
  try{
    const first=s.sync.read('p1','s01');
    assert.equal(first.revision,0);
    assert.equal(first.timeline.cues[1].start,2);
    const saved=s.sync.put('p1','s01',[beat,camera],0);
    assert.equal(saved.revision,1);
    assert.equal(saved.timeline.events[0].local_time,2.25);
    assert.equal(saved.timeline.events[1].global_time,1.5);
    assert.throws(()=>s.sync.put('p1','s01',[beat],0),e=>e.status===409);
    const d=s.getDeck('p1');d.slides[0].cues[0].dur=4;d.format.fps=60;s.putDeck('p1',d);
    const shifted=s.sync.read('p1','s01');
    assert.equal(shifted.timeline.events[0].local_time,4.25);
    assert.equal(shifted.timeline.events[1].local_time,1.5);
    assert.equal(shifted.timeline.fps,60);
    assert.ok(Math.abs(shifted.timeline.events[0].snapped_time-shifted.timeline.events[0].global_time)<=1/(2*60)+1e-8);
    assert.equal(s.sync.read('p1','s02').revision,0);
    // A cue can be renamed by another editor: expose orphan markers so they
    // can be repaired, instead of making both GET and PUT unusable.
    const renamed=s.getDeck('p1');
    renamed.slides[0].cues[1].id='two-new';
    s.putDeck('p1',renamed);
    const orphan=s.sync.read('p1','s01');
    assert.match(orphan.validation_error,/Unknown cue_id/);
    assert.equal(orphan.revision,1);
    assert.equal(s.sync.put('p1','s01',[],1).revision,2);
    const repaired=s.sync.read('p1','s01');
    assert.equal(repaired.validation_error,null);
    // Subsequent rejection checks use the fresh optimistic revision.

    assert.throws(()=>s.sync.put('p1','s01',[{...beat,id:'bad',anchor:{type:'cue_start',cue_id:'unknown',offset:0}}],2),e=>e.status===409);
    assert.throws(()=>s.sync.put('p1','s01',[beat,beat],2),/duplicate/);
    assert.throws(()=>s.sync.put('p1','s01',[{...beat,inject:'eval'}],2),/Unknown marker/);
    assert.throws(()=>s.sync.put('p1','s01',[{...camera,anchor:{type:'scene',offset:500}}],2),/outside scene/);
    assert.throws(()=>s.sync.read('p1','../s02'),e=>e.status===400);
  }finally{s.cleanup()}
});
test('P08 captures immutable artifacts, rejects stale work and restores a scene without changing its neighbor',()=>{
  const s=setup();
  try{
    const render=(scene,label)=>{
      const source=s.versions.source('p1',scene);
      const p=path.join(s.out,'p1_'+scene+'.mp4');
      fs.writeFileSync(p,Buffer.alloc(2500,label));
      return {id:'p1',slide_id:scene,job_id:'job-'+label,status:'completed',
        render_fingerprint:source.fingerprint,result:{file:'out/p1_'+scene+'.mp4'},
        qa_report:{verdict:'PASS',metadata:{fps:24,duration:5}}};
    };
    const first=s.versions.capture('p1','s01',render('s01',11));
    const secondScene=s.versions.capture('p1','s02',render('s02',33));
    const original=s.versions.ensureArtifact('p1','s01',first.version_id);
    assert.equal(fs.readFileSync(original.file).at(0),11);
    assert.equal(s.versions.approve('p1','s01',first.version_id,0).revision,1);
    assert.throws(()=>s.versions.approve('p1','s01',first.version_id,0),e=>e.status===409);
    const d=s.getDeck('p1');d.slides[0].label='Revision 2';d.slides[0].cues[0].say='changed';s.putDeck('p1',d);
    const stale={...render('s01',22),render_fingerprint:first.source_sha256};
    assert.throws(()=>s.versions.capture('p1','s01',stale),e=>e.status===409);
    const second=s.versions.capture('p1','s01',render('s01',44));
    assert.notEqual(first.version_id,second.version_id);
    assert.equal(s.versions.list('p1','s01').versions.length,2);
    const diff=s.versions.compare('p1','s01',first.version_id,second.version_id);
    assert.deepEqual(diff.changed_cues,['one']);assert.equal(diff.scene3d_changed,false);
    assert.equal(s.versions.ensureArtifact('p1','s01',first.version_id).file,original.file);
    assert.equal(fs.readFileSync(original.file).at(0),11);
    assert.throws(()=>s.versions.restore('p1','s01',first.version_id,'wrong'),e=>e.status===409);
    const current=s.versions.source('p1','s01').fingerprint;
    const restored=s.versions.restore('p1','s01',first.version_id,current);
    assert.equal(restored.exact_render_input_match,true);
    assert.equal(s.getDeck('p1').slides[0].label,'Intro');
    assert.equal(s.getDeck('p1').slides[1].label,'Outro');
    assert.equal(s.versions.active('p1','s01').approved_version,first.version_id);
    assert.equal(s.versions.ensureArtifact('p1','s02',secondScene.version_id).doc.version_id,secondScene.version_id);
    assert.throws(()=>s.versions.restore('p1','s01',second.version_id,current),e=>e.status===409);
    const auditDir=path.join(s.dir,'p1','.scene-versions','s01','audit');
    assert.equal(fs.readdirSync(auditDir).length,2);
    fs.writeFileSync(original.file,Buffer.alloc(2500,55));
    assert.throws(()=>s.versions.ensureArtifact('p1','s01',first.version_id),e=>e.status===409);
  }finally{s.cleanup()}
});
test('P08 rollback retains and restores authored cue anchors and cleared 3D definitions',()=>{
  const s=setup();
  try{
    s.sync.put('p1','s01',[beat],0);
    const first=s.versions.source('p1','s01');
    const p=path.join(s.out,'p1_s01.mp4');fs.writeFileSync(p,Buffer.alloc(2048,4));
    const v=s.versions.capture('p1','s01',{id:'p1',slide_id:'s01',job_id:'x',status:'completed',
      render_fingerprint:first.fingerprint,result:{file:'out/p1_s01.mp4'},qa_report:{verdict:'PASS',metadata:{}}});
    s.sync.put('p1','s01',[],1);
    const current=s.versions.source('p1','s01').fingerprint;
    s.versions.restore('p1','s01',v.version_id,current);
    assert.deepEqual(s.sync.read('p1','s01').markers,[beat]);
    assert.equal(s.three.read('p1','s01').spec,null);
  }finally{s.cleanup()}
});

test('P09 3D entrance linked to an anchored beat is guarded against missing markers',()=>{
  const s=setup();
  try{
    const spec={version:1,camera:{},objects:[{id:'core',mesh:'cube',color:'#112233',start_marker:'beat-1'}]};
    const saved=s.three.put('p1','s01',spec,0);
    assert.equal(saved.spec.objects[0].start_marker,'beat-1');
    assert.throws(()=>s.versions.source('p1','s01'),e=>e.status===409);
    s.sync.put('p1','s01',[beat],0);
    const before=s.versions.source('p1','s01');
    assert.equal(before.snapshot.scene3d.objects[0].start_marker,'beat-1');
    const d=s.getDeck('p1');d.slides[0].cues[0].dur=3;s.putDeck('p1',d);
    const after=s.versions.source('p1','s01');
    assert.notEqual(after.fingerprint,before.fingerprint);
    assert.equal(s.sync.read('p1','s01').timeline.events[0].local_time,3.25);
  }finally{s.cleanup()}
});

test('P08/P09 MCP respects P06 project scope, scene lease and director-only rollback',{timeout:45000},async()=>{
  const {spawn}=await import('node:child_process');
  const {once}=await import('node:events');
  const {randomBytes}=await import('node:crypto');
  const net=await import('node:net');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-sync-mcp-'));
  const listener=net.createServer();
  await new Promise(ok=>listener.listen(0,'127.0.0.1',ok));
  const port=listener.address().port;await new Promise(ok=>listener.close(ok));
  const base='http://127.0.0.1:'+port;
  const director=randomBytes(32).toString('hex'),worker=randomBytes(32).toString('hex'),other=randomBytes(32).toString('hex');
  const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),PB_DATA_DIR:dir,MCP_API_KEY:director,PB_WEB_USER:'editor',
      PB_WEB_PASSWORD:'password-very-strong-123',
      PB_AGENT_KEYS_JSON:JSON.stringify([{id:'worker01',token:worker,role:'worker',projects:['scoped'],scenes:['s01']},
        {id:'worker02',token:other,role:'worker',projects:['scoped'],scenes:['s02']}])}});
  let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
  const rpc=async(token,name,args)=>{
    const response=await fetch(base+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},
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
    assert.equal((await rpc(worker,'get_scene_sync',{id:'scoped',slide_id:'s02'})).isError,true);
    assert.equal((await rpc(other,'get_scene_sync',{id:'scoped',slide_id:'s01'})).isError,true);
    const mark={id:'start',kind:'animation',anchor:{type:'scene',offset:.2}};
    assert.equal((await rpc(worker,'set_scene_sync',{id:'scoped',slide_id:'s01',markers:[mark],expected_revision:0})).isError,true);
    const claimed=await rpc(worker,'claim_scene',{id:'scoped',slide_id:'s01',ttl:60});
    assert.equal(claimed.isError,false,JSON.stringify(claimed));
    const fence=JSON.parse(claimed.content[0].text).fence;
    const written=await rpc(worker,'set_scene_sync',{id:'scoped',slide_id:'s01',fence_token:fence,markers:[mark],expected_revision:0});
    assert.equal(written.isError,false,JSON.stringify(written));
    assert.equal(JSON.parse(written.content[0].text).timeline.events[0].local_time,.2);
    const wrong=await rpc(worker,'set_scene_sync',{id:'scoped',slide_id:'s02',fence_token:fence,markers:[],expected_revision:0});
    assert.equal(wrong.isError,true);
    const list=await rpc(worker,'list_scene_versions',{id:'scoped',slide_id:'s01'});
    assert.equal(list.isError,false,JSON.stringify(list));
    assert.equal((await rpc(worker,'restore_scene_version',{id:'scoped',slide_id:'s01',version_id:'v-'+'0'.repeat(24),expected_fingerprint:'x'})).isError,true);
    const saved=await rpc(worker,'save_scene_version',{id:'scoped',slide_id:'s01',fence_token:fence});
    assert.equal(saved.isError,true,'Cannot archive absent completed video');
    const released=await rpc(worker,'release_scene',{id:'scoped',slide_id:'s01',fence_token:fence});
    assert.equal(released.isError,false);
    const stale=await rpc(worker,'set_scene_sync',{id:'scoped',slide_id:'s01',fence_token:fence,markers:[],expected_revision:1});
    assert.equal(stale.isError,true,'Stale lease is fenced');
    const operator=await rpc(director,'get_scene_sync',{id:'scoped',slide_id:'s01'});
    assert.equal(operator.isError,false);
    const web=await fetch(base+'/api/decks/scoped/sync/s01');
    assert.equal(web.status,401,'REST does not expose sync to anonymous users');
  }finally{
    if(child.exitCode===null){const done=once(child,'close');child.kill('SIGTERM');await done}
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {sceneAccessStore} from '../server/scene-access.mjs';
import {sceneReviewStore} from '../server/scene-review.mjs';

const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pb-scenes-'));
const actor=(id,role='worker')=>({id,role});
const mustStatus=(status)=>(e)=>e?.status===status;
test('P06: assignment, lease TTL, fencing and release prevent stale writes',()=>{
  const root=temp(),deck={slides:[{id:'s01'},{id:'s02'}]};
  const assigned={s01:'Agent-01',s02:'Agent-02'};
  let now=Date.UTC(2026,10,1);
  const store=sceneAccessStore({root,getDeck:()=>deck,getTask:(_id,sid)=>({assignee:assigned[sid]}),now:()=>now});
  const a=actor('Agent-01'),b=actor('Agent-02'),director=actor('owner','director');
  try{
    assert.throws(()=>store.claim('demo','s01',b),mustStatus(403));
    const one=store.claim('demo','s01',a,30);
    assert.equal(one.fencing_token,1);
    assert.ok(one.lease_token.length>=24);
    store.guard('demo','s01',a,one.lease_token,one.fencing_token);
    assert.throws(()=>store.guard('demo','s01',b,one.lease_token,1),mustStatus(403));
    assert.throws(()=>store.guard('demo','s01',a,'wrong-key',1),mustStatus(409));
    assert.throws(()=>store.claim('demo','s01',a,30),mustStatus(409));
    const second=store.claim('demo','s02',b,30);
    assert.equal(store.status('demo','s02').owner,'Agent-02');
    assert.equal(store.status('demo','s01').owner,'Agent-01');
    assert.notEqual(one.lease_token,second.lease_token);
    now+=31000;
    assert.throws(()=>store.renew('demo','s01',a,one.lease_token,one.fencing_token),mustStatus(409));
    assigned.s01='Agent-02';
    const replaced=store.claim('demo','s01',b,30);
    assert.equal(replaced.fencing_token,2);
    assert.throws(()=>store.guard('demo','s01',a,one.lease_token,1),mustStatus(403));
    assert.throws(()=>store.guard('demo','s01',b,one.lease_token,1),mustStatus(409));
    assert.equal(store.renew('demo','s01',b,replaced.lease_token,2,600).fencing_token,2);
    const rel=store.release('demo','s01',b,replaced.lease_token,2);
    assert.equal(rel.fencing_token,3);
    assert.equal(rel.owner,null);
    assert.throws(()=>store.guard('demo','s01',b,replaced.lease_token,2),mustStatus(409));
    const forced=store.claim('demo','s01',director,40,true);
    assert.equal(forced.fencing_token,4);
    assert.throws(()=>store.claim('demo','s01',b,40,true),mustStatus(403));
    store.audit('demo','s01',director,'test_action',{revision:5,trace_id:'trace-123'});
    const audit=fs.readFileSync(path.join(root,'demo','.scene-audit','s01.jsonl'),'utf8');
    assert.match(audit,/test_action/);
    assert.doesNotMatch(audit,new RegExp(one.lease_token));
    assert.doesNotMatch(audit,new RegExp(forced.lease_token));
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

test('P07: frame anchoring, durable thumbnail and review state transition history',()=>{
  const root=temp(),deck={slides:[{id:'s01'},{id:'s02'}]};
  let n=0;
  const store=sceneReviewStore({root,getDeck:()=>deck,now:()=>new Date(1800000000000+n++*1000).toISOString()});
  const reviewer=actor('Reviewer-01','reviewer'),worker=actor('Agent-01');
  const render={status:'completed',job_id:'render-v1',qa_report:{metadata:{duration:5,fps:30}}};
  const evidence='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,2,3,4]).toString('base64');
  const payload={render_revision:'render-v1',t:3.4,frame:102,fps:30,severity:'major',
    text:'At frame 102 headline overlaps object',region:{x:0.1,y:0.2,w:0.5,h:0.3},frame_evidence:evidence};
  try{
    const item=store.create('demo','s01',payload,reviewer,render);
    assert.equal(item.status,'OPEN');
    assert.equal(item.frame,102);
    assert.equal(item.has_frame_evidence,true);
    assert.equal(store.get('demo','s01',item.id).frame_evidence,evidence);
    assert.equal(store.list('demo','s01').items[0].frame_evidence,undefined);
    assert.equal(store.list('demo','s02').items.length,0);
    assert.throws(()=>store.create('demo','s01',{...payload,frame:90},reviewer,render),mustStatus(400));
    assert.throws(()=>store.create('demo','s01',{...payload,render_revision:'stale'},reviewer,render),mustStatus(409));
    assert.throws(()=>store.create('demo','s01',{...payload,region:{x:0.8,y:0.9,w:0.4,h:0.3}},reviewer,render),mustStatus(400));
    const fixed=store.update('demo','s01',item.id,{status:'FIXED',note:'Shifted headline by 80 px',expected_revision:1},worker);
    assert.equal(fixed.revision,2);
    assert.throws(()=>store.update('demo','s01',item.id,{status:'VERIFIED',note:'Looks good',expected_revision:1},reviewer),mustStatus(409));
    const verified=store.update('demo','s01',item.id,{status:'VERIFIED',note:'Checked corrected render',expected_revision:2},reviewer);
    assert.equal(verified.status,'VERIFIED');
    const reopened=store.update('demo','s01',item.id,{status:'REOPENED',note:'Regression in newer build',expected_revision:3},reviewer);
    assert.equal(reopened.history.length,4);
    assert.deepEqual(reopened.history.map(x=>x.status),['OPEN','FIXED','VERIFIED','REOPENED']);
    assert.equal(store.get('demo','s01',item.id).render_revision,'render-v1');
    assert.equal(store.get('demo','s01',item.id).frame_evidence,evidence);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

async function freePort(){
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));return port;
}
test('P06/P07: actual HTTP MCP identities cannot modify another scene or bypass review roles',{timeout:45000},async()=>{
  const root=temp(),port=await freePort(),url='http://127.0.0.1:'+port;
  const ownerToken='owner-secret-abcdef0123456789012345';
  const keys={
    'Agent-01':{token:'agent01-000000000000000000000000',role:'worker'},
    'Agent-02':{token:'agent02-000000000000000000000000',role:'worker'},
    'Reviewer-01':{token:'reviewer-0000000000000000000000',role:'reviewer'},
  };
  const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),PB_DATA_DIR:root,MCP_API_KEY:ownerToken,
      PB_WEB_USER:'editor',PB_WEB_PASSWORD:'strong-secret-password-1234',PB_AGENT_KEYS_JSON:JSON.stringify(keys)}});
  let output='';
  child.stdout.on('data',d=>output+=d.toString());child.stderr.on('data',d=>output+=d.toString());
  const call=async(token,name,args)=>{
    const response=await fetch(url+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:Math.floor(Math.random()*1e6),method:'tools/call',params:{name,arguments:args}})});
    const j=await response.json();
    if(response.status!==200)return {status:response.status,error:j.error};
    return {status:200,error:j.result?.isError,body:j.result?.content?.[0]?.text&&
      (j.result.isError?j.result.content[0].text:JSON.parse(j.result.content[0].text))};
  };
  try{
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error(output);
      try{if((await fetch(url+'/health')).ok){ready=true;break}}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(ready,output);
    const owner=ownerToken,a=keys['Agent-01'].token,b=keys['Agent-02'].token,r=keys['Reviewer-01'].token;
    const created=await call(owner,'create_deck',{id:'demo',title:'Demo',text:'First scene. Second scene.',slide_count:2});
    assert.equal(created.error,false,JSON.stringify(created));
    for(const [sid,who] of [['s01','Agent-01'],['s02','Agent-02']]){
      const saved=await call(owner,'set_scene_task',{id:'demo',slide_id:sid,expected_revision:0,assignee:who,
        checkpoints:[{id:'pass',title:'Scene finished',done:false,note:''}]});
      assert.equal(saved.error,false,JSON.stringify(saved));
    }
    assert.equal((await call('bad','get_deck',{id:'demo'})).status,401);
    assert.equal((await call(a,'update_deck',{id:'demo',title:'Takeover'})).error,true);
    const foreign=await call(b,'claim_scene',{id:'demo',slide_id:'s01'});
    assert.equal(foreign.error,true);
    const claim=(await call(a,'claim_scene',{id:'demo',slide_id:'s01'})).body;
    assert.ok(claim.lease_token,JSON.stringify(claim));
    const twin=(await call(b,'claim_scene',{id:'demo',slide_id:'s02'})).body;
    assert.equal(claim.fencing_token,1);
    assert.equal(twin.fencing_token,1);
    const lease={lease_token:claim.lease_token,fencing_token:claim.fencing_token};
    const invalid=await call(a,'set_scene_checkpoint',{id:'demo',slide_id:'s01',checkpoint_id:'pass',done:true});
    assert.equal(invalid.error,true);
    const wrong=await call(b,'set_scene_checkpoint',{id:'demo',slide_id:'s01',checkpoint_id:'pass',done:true,...lease});
    assert.equal(wrong.error,true);
    const mine=await call(a,'set_scene_checkpoint',{id:'demo',slide_id:'s01',checkpoint_id:'pass',done:true,note:'Rendered',...lease});
    assert.equal(mine.error,false,JSON.stringify(mine));
    assert.equal(mine.body.checkpoints[0].done,true);
    const assigneeTakeover=await call(a,'set_scene_task',{id:'demo',slide_id:'s01',expected_revision:2,assignee:'Agent-01',...lease});
    assert.equal(assigneeTakeover.error,true);
    const spec={version:1,camera:{},objects:[{id:'cube',mesh:'cube',color:'#ffffff'}]};
    const sceneSaved=await call(a,'set_scene_3d',{id:'demo',slide_id:'s01',expected_revision:0,spec,...lease});
    assert.equal(sceneSaved.error,false,JSON.stringify(sceneSaved));
    assert.equal((await call(b,'set_scene_3d',{id:'demo',slide_id:'s01',expected_revision:1,spec,
      lease_token:twin.lease_token,fencing_token:twin.fencing_token})).error,true);
    assert.equal((await call(a,'create_scene_review_item',{id:'demo',slide_id:'s01',
      render_revision:'fake',t:1,frame:30,fps:30,severity:'major',text:'Bad frame'})).error,true);
    assert.equal((await call(r,'create_scene_review_item',{id:'demo',slide_id:'s01',
      render_revision:'fake',t:1,frame:30,fps:30,severity:'major',text:'Bad frame'})).error,true);
    const list=(await call(r,'list_scene_review_items',{id:'demo',slide_id:'s01'})).body;
    assert.equal(list.items.length,0);
    assert.equal((await call(a,'release_scene',{id:'demo',slide_id:'s01',...lease})).error,false);
    assert.equal((await call(a,'set_scene_checkpoint',{id:'demo',slide_id:'s01',checkpoint_id:'pass',done:false,...lease})).error,true);
    const audit=fs.readFileSync(path.join(root,'decks','demo','.scene-audit','s01.jsonl'),'utf8');
    assert.match(audit,/Agent-01/);
    assert.match(audit,/set_scene_3d/);
    assert.doesNotMatch(audit,new RegExp(claim.lease_token));
    const scene2=(await call(b,'get_scene_task',{id:'demo',slide_id:'s02'})).body;
    assert.equal(scene2.checkpoints[0].done,false);
  }finally{
    if(child.exitCode===null){const closed=once(child,'close');child.kill('SIGTERM');await closed}
    fs.rmSync(root,{recursive:true,force:true});
  }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {sceneReviewStore} from '../server/scene-review.mjs';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pb-review-'));
const actor=(id,role)=>({id,role});
const mustStatus=status=>e=>e?.status===status;
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
  await new Promise(resolve=>server.close(resolve));
  return port;
}

test('P07 + P06: scoped reviewer/worker MCP permissions and director REST access',{timeout:45000},async()=>{
  const root=temp(),port=await freePort(),base='http://127.0.0.1:'+port;
  const owner=randomBytes(32).toString('hex');
  const reviewer=randomBytes(32).toString('hex');
  const worker=randomBytes(32).toString('hex');
  const creds=JSON.stringify([
    {id:'rev01',token:reviewer,role:'reviewer',projects:['demo'],scenes:['s01']},
    {id:'worker01',token:worker,role:'worker',projects:['demo'],scenes:['s01']}
  ]);
  const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),PB_DATA_DIR:root,MCP_API_KEY:owner,PB_WEB_USER:'reviewer',
      PB_WEB_PASSWORD:'review-test-password-123456',PB_AGENT_KEYS_JSON:creds}});
  let logs='';
  child.stdout.on('data',d=>logs+=d.toString());
  child.stderr.on('data',d=>logs+=d.toString());
  async function rpc(token,name,args){
    const r=await fetch(base+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'
    },body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(r.status,200);
    const j=(await r.json()).result;
    return {isError:j.isError,value:j.isError?j.content[0].text:JSON.parse(j.content[0].text)};
  }
  const basic='Basic '+Buffer.from('reviewer:review-test-password-123456').toString('base64');
  async function rest(route,method='GET',data){
    return fetch(base+route,{method,headers:{Authorization:basic,...(data?{'Content-Type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{})});
  }
  try{
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error(logs);
      try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}
      await new Promise(resolve=>setTimeout(resolve,130));
    }
    assert.ok(ready,logs);
    assert.equal((await rpc(owner,'create_deck',{id:'demo',title:'Review demo',text:'Part one. Part two.',slide_count:2})).isError,false);
    const l=await rpc(worker,'claim_scene',{id:'demo',slide_id:'s01',ttl:100});
    assert.equal(l.isError,false,JSON.stringify(l));
    const fence=l.value.fence;
    const hijack=await rpc(worker,'set_scene_task',{id:'demo',slide_id:'s01',fence_token:fence,expected_revision:0,assignee:'wrong'});
    assert.equal(hijack.isError,true);
    const say=await rpc(worker,'update_cue',{id:'demo',slide_id:'s01',fence_token:fence,cue_id:'c01',say:'Changed narration'});
    assert.equal(say.isError,true);
    const edit=await rpc(worker,'set_scene_task',{id:'demo',slide_id:'s01',fence_token:fence,
      expected_revision:0,status:'in_progress'});
    assert.equal(edit.isError,false,JSON.stringify(edit));
    const noFence=await rpc(worker,'update_scene_review_item',{id:'demo',slide_id:'s01',
      item_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',expected_revision:1,status:'FIXED',note:'done'});
    assert.equal(noFence.isError,true);
    const forbid=await rpc(worker,'create_scene_review_item',{id:'demo',slide_id:'s01',
      render_revision:'fake',t:1,frame:30,fps:30,severity:'major',text:'Issue text'});
    assert.equal(forbid.isError,true);
    const stale=await rpc(reviewer,'create_scene_review_item',{id:'demo',slide_id:'s01',
      render_revision:'fake',t:1,frame:30,fps:30,severity:'major',text:'Issue text'});
    assert.equal(stale.isError,true,'Review must not target a fake/non-completed job');
    const missing=await rpc(reviewer,'list_scene_review_items',{id:'demo',slide_id:'s02'});
    assert.equal(missing.isError,true,'Reviewer cannot read foreign scene');
    const visible=await rpc(reviewer,'list_scene_review_items',{id:'demo',slide_id:'s01'});
    assert.equal(visible.isError,false);
    assert.equal(visible.value.items.length,0);
    const api=(await rest('/api/decks/demo/reviews/s01')).status;
    assert.equal(api,200);
    assert.equal((await rest('/api/decks/demo/renders/s01')).status,200);
    const badPost=await rest('/api/decks/demo/reviews/s01','POST',{render_revision:'fake',t:1,frame:30,
      fps:30,severity:'major',text:'Issue'});
    assert.equal(badPost.status,409);
    const postNoAuth=await fetch(base+'/api/decks/demo/reviews/s01');
    assert.equal(postNoAuth.status,401);
  }finally{
    if(child.exitCode===null){const closed=once(child,'close');child.kill('SIGTERM');await closed}
    fs.rmSync(root,{recursive:true,force:true});
  }
});

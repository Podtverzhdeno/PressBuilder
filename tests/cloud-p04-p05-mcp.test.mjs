import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){
  const server=net.createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const p=server.address().port;await new Promise(r=>server.close(r));return p;
}
test('P04/P05: REST+MCP transition plan and style revision safety on real HTTP server',{timeout:45000},async()=>{
  const data=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p04-p05-mcp-'));
  const p=await port(),origin='http://127.0.0.1:'+p,token=randomBytes(32).toString('hex');
  const basic='Basic '+Buffer.from('editor:testing-style-123456').toString('base64');
  const server=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),
    env:{...process.env,PORT:String(p),PB_DATA_DIR:data,MCP_API_KEY:token,
      PB_WEB_USER:'editor',PB_WEB_PASSWORD:'testing-style-123456'},
    stdio:['ignore','pipe','pipe']});
  let logs='';
  server.stdout.on('data',b=>logs+=b);
  server.stderr.on('data',b=>logs+=b);
  const rpc=async(name,args)=>{
    const response=await fetch(origin+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
    assert.equal(response.status,200);
    const j=await response.json();
    return j.result;
  };
  const value=async(name,args)=>{
    const r=await rpc(name,args);
    assert.equal(r.isError,false,JSON.stringify(r));
    return JSON.parse(r.content[0].text);
  };
  const req=(path,method='GET',body)=>fetch(origin+path,{method,
    headers:{Authorization:basic,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  try{
    let ready=false;
    for(let i=0;i<100;i++){
      if(server.exitCode!==null)throw new Error('Server exited '+logs);
      try{if((await fetch(origin+'/health')).ok){ready=true;break}}catch{}
      await delay(100);
    }
    assert.ok(ready,logs);
    await value('create_deck',{id:'p0405',title:'Example',text:'First sequence. Second sequence.',slide_count:2});
    const base=await value('get_style_contract',{id:'p0405'});
    assert.equal(base.revision,0);
    const updated=await value('set_style_contract',{id:'p0405',expected_revision:0,
      contract:{...base.contract,enforce:true,
        palette:['#FFFFFF','#000000'],sceneOverrides:{s02:{minFontSize:60}}}});
    assert.equal(updated.revision,1);
    const readBack=await (await req('/api/decks/p0405/style-contract')).json();
    assert.equal(readBack.revision,1);
    const bad2d=await rpc('set_slide_visuals',{id:'p0405',slide_id:'s01',elements:[
      {id:'caption',kind:'text',text:'A2A',x:300,y:300,size:64,color:'h1'}]});
    assert.equal(bad2d.isError,true,'engine h1 token must resolve to approved hex palette');
    const draftDeck=await (await req('/api/decks/p0405')).json();
    const injected=structuredClone(draftDeck);
    injected.slides[0].visuals=[{id:'caption',kind:'text',text:'A2A',x:300,y:300,size:64,color:'h1'}];
    assert.equal((await req('/api/decks/p0405','PUT',injected)).status,422,
      'REST deck save must not bypass the style contract');
    assert.equal((await (await req('/api/decks/p0405')).json()).slides[0].visuals,undefined);
    const paletteUpdated=await value('set_style_contract',{id:'p0405',expected_revision:1,
      contract:{...updated.contract,palette:['#FFFFFF','#000000','#51D3FF']}});
    assert.equal(paletteUpdated.revision,2);
    const good2d=await value('set_slide_visuals',{id:'p0405',slide_id:'s01',elements:[
      {id:'caption',kind:'text',text:'A2A',x:300,y:300,size:64,color:'h1'}]});
    assert.equal(good2d.ok,true);
    const after2d=await (await req('/api/decks/p0405')).json();
    assert.equal(after2d.slides[0].visuals.length,1);
    const badPalette=structuredClone(after2d);
    badPalette.slides[0].visuals[0].color='accent';
    assert.equal((await req('/api/decks/p0405','PUT',badPalette)).status,422);
    assert.equal((await (await req('/api/decks/p0405')).json()).slides[0].visuals[0].color,'h1');

    const policy=await value('get_style_contract',{id:'p0405',slide_id:'s02'});
    assert.equal(policy.effective.typography.minFontSize,60);
    const context=await value('get_project_context',{id:'p0405'});
    assert.equal(context.style_contract.revision,2);
    const stale=await rpc('set_style_contract',{id:'p0405',expected_revision:0,contract:base.contract});
    assert.equal(stale.isError,true);
    const initial=await value('get_assembly_plan',{id:'p0405'});
    assert.equal(initial.revision,0);
    assert.equal(initial.plan.scenes.length,2);
    const change=structuredClone(initial.plan);
    change.scenes[0].transition_after={type:'crossfade',duration:0.25};
    const saved=await value('set_assembly_plan',{id:'p0405',expected_revision:0,plan:change});
    assert.equal(saved.revision,1);
    assert.equal((await (await req('/api/decks/p0405/assembly-plan')).json()).plan.scenes[0].transition_after.duration,0.25);
    const oldPlan=await rpc('set_assembly_plan',{id:'p0405',expected_revision:0,plan:initial.plan});
    assert.equal(oldPlan.isError,true);
    const invalidChange=await req('/api/decks/p0405/style-contract','PUT',{expected_revision:2,
      contract:{...updated.contract,transitions:{allowed:['hard-cut'],maxDuration:0}}});
    assert.equal(invalidChange.status,422);
    assert.equal((await (await req('/api/decks/p0405/style-contract')).json()).revision,2);
    const denied=await rpc('assemble_video',{id:'p0405',scene_ids:['s01','s02']});
    assert.equal(denied.isError,true,'Cannot assemble unapproved scenes');
    const noAuth=await fetch(origin+'/api/decks/p0405/assembly-plan');
    assert.equal(noAuth.status,401);
  }finally{
    if(server.exitCode===null){const closed=once(server,'close');server.kill('SIGTERM');await closed}
    fs.rmSync(data,{recursive:true,force:true});
  }
});

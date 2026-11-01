import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const port=()=>new Promise((resolve,reject)=>{
  const server=net.createServer();
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
    const p=server.address().port;
    server.close(()=>resolve(p));
  });
});
test('scene-scoped 3D spec: MCP publish, REST read, revision, isolation and malicious payload rejection',{timeout:45000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-scene3d-'));
  const p=await port(),base='http://127.0.0.1:'+p;
  const token=randomBytes(32).toString('hex');
  const basic='Basic '+Buffer.from('editor:threeDTestPassword123').toString('base64');
  const child=spawn(process.execPath,['server/cloud.mjs'],{
    cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(p),PB_DATA_DIR:dir,MCP_API_KEY:token,
      PB_WEB_USER:'editor',PB_WEB_PASSWORD:'threeDTestPassword123'},
  });
  let output='';
  child.stdout.on('data',d=>output+=d.toString());
  child.stderr.on('data',d=>output+=d.toString());
  const web=(route,method='GET',data)=>fetch(base+route,{
    method,headers:{Authorization:basic,...(data===undefined?{}:{'Content-Type':'application/json'})},
    ...(data===undefined?{}:{body:JSON.stringify(data)})
  });
  async function rpc(name,args,id=1){
    const response=await fetch(base+'/mcp',{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}})
    });
    assert.equal(response.status,200);
    const data=await response.json();
    return data.result;
  }
  const spec={version:1,camera:{cx:960,cy:510,size:220,dist:9,yaw:0.2,pitch:0.2,yaw_speed:0.5,
    pitch_speed:0.1,zoom_speed:0.04},objects:[
    {id:'core',mesh:'icosa',pos:[0,0,0],color:'#35bafb',scale:1.5,spin:[.3,.9,.2],
     rotation:[0,0,0],wire:true,edge_color:'#ffffff',start:0,fade:.4},
    {id:'satellite',mesh:'octa',pos:[2,.4,-1],color:'#edb363',scale:.55,spin:[0,-.8,0],
     rotation:[0,0,0],wire:false,start:.6,fade:.4},
  ]};
  try {
    let running=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw new Error('Exited '+output);
      try{running=(await fetch(base+'/health')).ok;if(running)break}catch{}
      await sleep(120);
    }
    assert.ok(running,output);
    const created=await rpc('create_deck',{id:'scene3d-demo',title:'Scene3D test',
      text:'Первая сцена. Вторая сцена.',slide_count:2,target:12},1);
    assert.equal(created.isError,false,JSON.stringify(created));

    const empty=await rpc('get_scene_3d',{id:'scene3d-demo',slide_id:'s01'},2);
    assert.equal(empty.isError,false);
    assert.equal(JSON.parse(empty.content[0].text).spec,null);

    const saved=await rpc('set_scene_3d',{id:'scene3d-demo',slide_id:'s01',expected_revision:0,spec},3);
    assert.equal(saved.isError,false,JSON.stringify(saved));
    assert.equal(JSON.parse(saved.content[0].text).revision,1);

    const fromHttp=await web('/api/decks/scene3d-demo/scene3d');
    assert.equal(fromHttp.status,200);
    const all=await fromHttp.json();
    assert.equal(all.length,1);assert.equal(all[0].scene_id,'s01');
    assert.deepEqual(all[0].spec.objects.map(x=>x.mesh),['icosa','octa']);
    assert.equal(fs.existsSync(path.join(dir,'decks','scene3d-demo','.scene3d','s01.json')),true);
    const data=await (await web('/api/decks/scene3d-demo')).json();
    assert.ok(!Object.hasOwn(data.slides[0],'scene3d'),'no deck.json mutation');
    const s02=await (await web('/api/decks/scene3d-demo/scene3d/s02')).json();
    assert.equal(s02.revision,0);
    assert.equal(s02.spec,null,'other scenes unchanged');

    const stale=await web('/api/decks/scene3d-demo/scene3d/s01','PUT',{expected_revision:0,spec});
    assert.equal(stale.status,409);
    const harmful=await web('/api/decks/scene3d-demo/scene3d/s02','PUT',{expected_revision:0,
      spec:{...spec,objects:[{...spec.objects[0],mesh:'javascript'}]}});
    assert.equal(harmful.status,400);
    const injection=await web('/api/decks/scene3d-demo/scene3d/s02','PUT',{expected_revision:0,
      spec:{...spec,objects:[{...spec.objects[0],pos:[0,1e300,0]}]}});
    assert.equal(injection.status,400);
    const foreign=await web('/api/decks/scene3d-demo/scene3d/not-a-scene','GET');
    assert.equal(foreign.status,404);
    assert.equal((await (await web('/api/decks/scene3d-demo/scene3d/s01')).json()).revision,1);
    const updated=await web('/api/decks/scene3d-demo/scene3d/s01','PUT',{expected_revision:1,
      spec:{...spec,camera:{...spec.camera,yaw_speed:1}}});
    assert.equal(updated.status,200);
    assert.equal((await updated.json()).revision,2);
  }finally {
    if(child.exitCode===null){
      const done=once(child,'close');child.kill('SIGTERM');await done;
    }
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

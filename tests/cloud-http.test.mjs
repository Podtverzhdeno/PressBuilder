import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

async function freePort() {
  const s=net.createServer();
  await new Promise((resolve)=>s.listen(0,'127.0.0.1',resolve));
  const p=s.address().port;
  await new Promise((resolve)=>s.close(resolve));
  return p;
}
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
test('cloud HTTP integration: auth, MCP project, editor and static build', {timeout:35000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-cloud-http-'));
  const port=await freePort();
  const token=randomBytes(32).toString('hex');
  const basic='Basic '+Buffer.from('editor:passwordForTestingOnly123').toString('base64');
  const child=spawn(process.execPath,['server/cloud.mjs'],{
    cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(port),PB_DATA_DIR:dir,MCP_API_KEY:token,
      PB_WEB_USER:'editor',PB_WEB_PASSWORD:'passwordForTestingOnly123'}
  });
  let output='';
  child.stdout.on('data',(s)=>output+=s.toString());
  child.stderr.on('data',(s)=>output+=s.toString());
  const base='http://127.0.0.1:'+port;
  const rpc=(method,params,id=1)=>fetch(base+'/mcp',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  try {
    let ready=false;
    for(let i=0;i<80;i++){
      if(child.exitCode!==null)throw new Error('Cloud process exited: '+output);
      try{const r=await fetch(base+'/health');if(r.ok){ready=true;break}}catch{}
      await sleep(200);
    }
    assert.equal(ready,true,'Cloud did not boot: '+output);
    assert.equal((await fetch(base+'/')).status,401);
    assert.equal((await fetch(base+'/mcp',{method:'POST'})).status,401);
    assert.equal((await fetch(base+'/health')).status,200);
    const mcpInit=await (await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1.0'}})).json();
    assert.equal(mcpInit.result.serverInfo.name,'pressbuilder-cloud');
    const tools=(await (await rpc('tools/list',{},2)).json()).result.tools;
    assert.ok(tools.some(x=>x.name==='render_video'));
    const created=await (await rpc('tools/call',{name:'create_deck',arguments:{
      id:'from-mcp',title:'MCP sample',text:'Новая идея. Следующий пример.',style:'paper',slide_count:2
    }},3)).json();
    assert.equal(created.result.isError,false,JSON.stringify(created));
    const deck=await fetch(base+'/api/decks/from-mcp',{headers:{Authorization:basic}});
    assert.equal(deck.status,200);
    assert.equal((await deck.json()).style,'paper');
    const html=await fetch(base+'/',{headers:{Authorization:basic}});
    assert.equal(html.status,200);
    assert.ok((await html.text()).includes('PresBuilder'));
    const badToken=await fetch(base+'/mcp',{method:'POST',
      headers:{Authorization:'Bearer incorrect', 'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',method:'ping',id:5})});
    assert.equal(badToken.status,401);
  } finally {
    child.kill('SIGTERM');
    await sleep(200);
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes,createHash} from 'node:crypto';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
  const sock=net.createServer();
  await new Promise(resolve=>sock.listen(0,'127.0.0.1',resolve));
  const p=sock.address().port; await new Promise(resolve=>sock.close(resolve)); return p;
}

test('OAuth consent survives server restart and can only be approved once', {timeout:45000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-consent-restart-'));
  const p=await freePort(),base='http://127.0.0.1:'+p;
  const redirectUri='https://chatgpt.com/connector/oauth/restart-test';
  const clientId='oauth-consent-restart',clientSecret=randomBytes(40).toString('hex');
  const user='Basic '+Buffer.from('editor:testPassword123456789').toString('base64');
  const client='Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64');
  const verifier=randomBytes(32).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const params=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,
    code_challenge:challenge,code_challenge_method:'S256',state:'restart-test',scope:'mcp:tools',resource:base+'/mcp'});
  let child,output='';
  function launch(){
    child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
      env:{...process.env,PORT:String(p),PB_DATA_DIR:dir,PUBLIC_URL:base,MCP_API_KEY:randomBytes(32).toString('hex'),
        PB_WEB_USER:'editor',PB_WEB_PASSWORD:'testPassword123456789',
        OAUTH_CLIENT_ID:clientId,OAUTH_CLIENT_SECRET:clientSecret,OAUTH_REDIRECT_URIS:redirectUri}});
    child.stdout.on('data',buf=>{output+=buf.toString()});
    child.stderr.on('data',buf=>{output+=buf.toString()});
  }
  async function ready(){
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw Error('Server stopped: '+output);
      try{const r=await fetch(base+'/health');if(r.status===200)return}catch{}
      await sleep(120);
    }
    throw Error('Server not ready: '+output);
  }
  async function shutdown(){
    if(child && child.exitCode===null){const closing=once(child,'close');child.kill('SIGTERM');await closing}
  }
  const submit=(csrf)=>fetch(base+'/oauth/authorize',{method:'POST',redirect:'manual',headers:{
    Authorization:user,Origin:'null','Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({csrf,decision:'approve'})});
  try{
    launch();await ready();
    const response=await fetch(base+'/oauth/authorize?'+params,{headers:{Authorization:user}});
    assert.equal(response.status,200);
    const page=await response.text();
    const nonce=/name="csrf" value="([^"]+)"/.exec(page)?.[1];assert.ok(nonce);
    assert.ok(fs.existsSync(path.join(dir,'oauth-consents',nonce+'.json')),'Pending approval must be persisted before returning the form');
    await shutdown();
    launch();await ready();
    const approved=await submit(nonce);
    assert.equal(approved.status,303,'Approval after restart failed: '+await approved.clone().text());
    const callback=new URL(approved.headers.get('location'));
    assert.equal(callback.searchParams.get('state'),'restart-test');
    const code=callback.searchParams.get('code');assert.ok(code);
    assert.equal((await submit(nonce)).status,400,'Consent nonce must not be replayable');
    const exchanged=await fetch(base+'/oauth/token',{method:'POST',headers:{
      Authorization:client,'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'authorization_code',code,
        redirect_uri:redirectUri,code_verifier:verifier,resource:base+'/mcp'})});
    assert.equal(exchanged.status,200,'OAuth code exchange failed: '+await exchanged.clone().text());
    assert.ok((await exchanged.json()).access_token);
  }finally{await shutdown();fs.rmSync(dir,{recursive:true,force:true})}
});

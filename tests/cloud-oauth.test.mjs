import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {createOAuth} from '../server/oauth.mjs';

async function port(){
  const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const n=s.address().port;await new Promise(r=>s.close(r));return n;
}
const sleep=n=>new Promise(r=>setTimeout(r,n));
test('OAuth discovery, consent, confidential client S256 PKCE, audience, refresh and replay protection', {timeout:45000}, async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-oauth-'));
  const p=await port(),base='http://127.0.0.1:'+p,resource=base+'/mcp';
  const clientId='pressbuilder-test-client',clientSecret='test-'.padEnd(64,'s');
  const redirectUri='https://chatgpt.com/connector_platform_oauth_redirect';
  const userBasic='Basic '+Buffer.from('owner:test-editor-password-123').toString('base64');
  const clientBasic='Basic '+Buffer.from(clientId+':'+clientSecret).toString('base64');
  const child=spawn(process.execPath,['server/cloud.mjs'],{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
    env:{...process.env,PORT:String(p),PUBLIC_URL:base,PB_DATA_DIR:dir,MCP_API_KEY:randomBytes(32).toString('hex'),
      PB_WEB_USER:'owner',PB_WEB_PASSWORD:'test-editor-password-123',OAUTH_CLIENT_ID:clientId,
      OAUTH_CLIENT_SECRET:clientSecret,OAUTH_REDIRECT_URIS:redirectUri}});
  let log='';child.stdout.on('data',x=>log+=x.toString());child.stderr.on('data',x=>log+=x.toString());
  const verifier=randomBytes(32).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const params=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,
    code_challenge:challenge,code_challenge_method:'S256',state:'chatgpt-state-123',scope:'mcp:tools',resource});
  const token=(body,basic=clientBasic)=>fetch(base+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:basic},body:new URLSearchParams(body)});
  const rpc=(bearer)=>fetch(resource,{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  try{
    let ready=false;for(let i=0;i<90;i++){if(child.exitCode!==null)throw new Error('OAuth server exited: '+log);try{const r=await fetch(base+'/health');if(r.ok){ready=true;break}}catch{}await sleep(180)}
    assert.ok(ready,'Not ready: '+log);
    const d=await (await fetch(base+'/.well-known/oauth-authorization-server')).json();
    assert.equal(d.issuer,base);assert.equal(d.authorization_response_iss_parameter_supported,true);
    assert.deepEqual(d.token_endpoint_auth_methods_supported,['client_secret_basic']);
    assert.ok(d.code_challenge_methods_supported.includes('S256'));
    const pr=await (await fetch(base+'/.well-known/oauth-protected-resource/mcp')).json();
    assert.equal(pr.resource,resource);assert.deepEqual(pr.authorization_servers,[base]);
    const unauthorized=await fetch(resource,{method:'POST'});
    assert.equal(unauthorized.status,401);
    assert.match(unauthorized.headers.get('www-authenticate'),/resource_metadata=.*oauth-protected-resource/);
    assert.equal((await fetch(base+'/oauth/authorize?'+params)).status,401);
    const bad=new URLSearchParams(params);bad.set('redirect_uri','https://attacker.example/collect');
    assert.equal((await fetch(base+'/oauth/authorize?'+bad,{headers:{Authorization:userBasic}})).status,400);
    const badRes=new URLSearchParams(params);badRes.set('resource','https://untrusted.example/mcp');
    assert.equal((await fetch(base+'/oauth/authorize?'+badRes,{headers:{Authorization:userBasic}})).status,400);
    async function grant(origin='https://chatgpt.com'){
      const consent=await fetch(base+'/oauth/authorize?'+params,{headers:{Authorization:userBasic}});
      assert.equal(consent.status,200);
      assert.match(consent.headers.get('content-security-policy'),/form-action 'self' https:\/\/chatgpt\.com;/);
      const page=await consent.text();assert.match(page,/Разрешить доступ/);
      const csrf=/name="csrf" value="([^"]+)"/.exec(page)?.[1];assert.ok(csrf);
      const noAuth=await fetch(base+'/oauth/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({csrf,decision:'approve'}),redirect:'manual'});
      assert.equal(noAuth.status,401);
      const denied=await fetch(base+'/oauth/authorize',{method:'POST',headers:{Authorization:userBasic,Origin:'https://chatgpt.com','Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({csrf:'invalid-csrf-token',decision:'approve'}),redirect:'manual'});
      assert.equal(denied.status,400,'Cross-site POST without a valid consent nonce must fail');
      const approved=await fetch(base+'/oauth/authorize',{method:'POST',headers:{Authorization:userBasic,Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({csrf,decision:'approve'}),redirect:'manual'});
      assert.equal(approved.status,303);
      const callback=new URL(approved.headers.get('location'));
      assert.equal(callback.origin,'https://chatgpt.com');
      assert.equal(callback.searchParams.get('state'),'chatgpt-state-123');
      assert.equal(callback.searchParams.get('iss'),base);
      assert.ok(callback.searchParams.get('code'));
      const replay=await fetch(base+'/oauth/authorize',{method:'POST',headers:{
        Authorization:userBasic,Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({csrf,decision:'approve'}),redirect:'manual'});
      assert.equal(replay.status,303,'A browser double-submit must return the original callback');
      assert.equal(replay.headers.get('location'),approved.headers.get('location'));
      return callback.searchParams.get('code');
    }
    const code1=await grant('https://chatgpt.com');
    const wrongClient=await token({grant_type:'authorization_code',code:code1,redirect_uri:redirectUri,code_verifier:verifier,resource},
      'Basic '+Buffer.from(clientId+':wrong-client-secret').toString('base64'));
    assert.equal(wrongClient.status,401);
    const mismatchResource=await token({grant_type:'authorization_code',code:code1,redirect_uri:redirectUri,code_verifier:verifier,resource:'https://elsewhere.invalid'});
    assert.equal(mismatchResource.status,400);
    const got=await token({grant_type:'authorization_code',code:code1,redirect_uri:redirectUri,code_verifier:verifier,resource});
    assert.equal(got.status,200,await got.clone().text());
    assert.equal(got.headers.get('cache-control'),'no-store');
    const grant1=await got.json();assert.ok(grant1.access_token);assert.ok(grant1.refresh_token);
    assert.equal((await rpc(grant1.access_token)).status,200);
    assert.equal((await token({grant_type:'authorization_code',code:code1,redirect_uri:redirectUri,code_verifier:verifier,resource})).status,400);
    const code2=await grant('null');
    const wrongPkce=await token({grant_type:'authorization_code',code:code2,redirect_uri:redirectUri,code_verifier:randomBytes(32).toString('base64url'),resource});
    assert.equal(wrongPkce.status,400);
    assert.equal((await token({grant_type:'authorization_code',code:code2,redirect_uri:redirectUri,code_verifier:verifier,resource})).status,400);
    const changedAudience=await token({grant_type:'refresh_token',refresh_token:grant1.refresh_token,resource:'https://other.invalid'});
    assert.equal(changedAudience.status,400);
    const refresh=await token({grant_type:'refresh_token',refresh_token:grant1.refresh_token});
    assert.equal(refresh.status,200);
    const rotated=await refresh.json();
    assert.ok(rotated.refresh_token && rotated.refresh_token!==grant1.refresh_token);
    assert.equal((await token({grant_type:'refresh_token',refresh_token:grant1.refresh_token})).status,400);
    assert.equal((await rpc(rotated.access_token)).status,200);
    const restored=createOAuth({publicUrl:base,clientId,clientSecret,dataDir:dir,authWeb:()=>true,redirectUris:redirectUri});
    assert.equal(restored.verifyToken(rotated.access_token),true);
    assert.equal(restored.verifyToken('badtoken'),false);
    const revoked=await fetch(base+'/oauth/revoke',{method:'POST',headers:{Authorization:clientBasic,'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({token:rotated.access_token})});
    assert.equal(revoked.status,200);
    assert.equal((await rpc(rotated.access_token)).status,401);
    assert.equal((await fetch(base+'/',{headers:{Authorization:userBasic}})).status,200);
  }finally{child.kill('SIGTERM');await sleep(220);fs.rmSync(dir,{recursive:true,force:true})}
});

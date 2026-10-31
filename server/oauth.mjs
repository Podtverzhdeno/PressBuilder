/**
 * Single-owner OAuth 2.0 authorization-code provider for PressBuilder MCP.
 * Confidential client, exact redirect allowlist, S256 PKCE, RFC 8707 resource binding,
 * RFC 8414/9728 discovery, opaque rotating tokens stored as SHA-256 hashes on /data.
 * No dynamic client registration, password grants, or wildcard callbacks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const now=()=>Math.floor(Date.now()/1000);
const random=()=>randomBytes(32).toString('base64url');
const digest=s=>createHash('sha256').update(s).digest('base64url');
const secure=(a,b)=>{
  const x=Buffer.from(String(a)),y=Buffer.from(String(b));
  return x.length===y.length && timingSafeEqual(x,y);
};
const html=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(res,status,obj,headers={})=>{
  const body=JSON.stringify(obj);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache',...headers});
  res.end(body);
};
const fail=(res,status,code,description,headers={})=>json(res,status,{error:code,error_description:description},headers);
const redirect=(res,where)=>{
  res.writeHead(303,{'Location':where,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  res.end();
};
async function formBody(req) {
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/x-www-form-urlencoded'))throw new Error('Expected application/x-www-form-urlencoded');
  let size=0,parts=[];
  for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('Form too large');parts.push(chunk)}
  return new URLSearchParams(Buffer.concat(parts).toString('utf8'));
}

export function createOAuth({ publicUrl, clientId, clientSecret, dataDir, authWeb, redirectUris }) {
  if(!clientId && !clientSecret)return {enabled:false,canHandle:()=>false,handle:async()=>false,verifyToken:()=>false,challenge:''};
  if(typeof clientId!=='string'||!/^[-A-Za-z0-9_]{8,100}$/.test(clientId)||typeof clientSecret!=='string'||clientSecret.length<32)throw new Error('OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET (32+ chars) required');
  const issuer=new URL(publicUrl).origin;
  if(!issuer.startsWith('https://') && !issuer.startsWith('http://localhost:') && !issuer.startsWith('http://127.0.0.1:'))throw new Error('OAuth PUBLIC_URL must be HTTPS');
  const resource=issuer+'/mcp';
  const allowedResources=new Set([resource,issuer]);
  const allowedRedirects=new Set((redirectUris||'https://chatgpt.com/connector_platform_oauth_redirect').split(',').map(s=>s.trim()).filter(Boolean));
  for(const u of allowedRedirects){
    const parsed=new URL(u);
    if(parsed.protocol!=='https:' || parsed.hash || parsed.username || parsed.password)throw new Error('OAuth redirect URI must be exact HTTPS');
  }
  fs.mkdirSync(dataDir,{recursive:true});
  const stateFile=path.join(dataDir,'oauth-state.json');
  let records={codes:{},access:{},refresh:{}};
  if(fs.existsSync(stateFile)){
    const read=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    for(const k of ['codes','access','refresh'])if(read[k]&&typeof read[k]==='object'&&!Array.isArray(read[k]))records[k]=read[k];
  }
  const pending=new Map();
  function prune(){
    const t=now();
    for(const k of ['codes','access','refresh'])for(const [h,v] of Object.entries(records[k]))if(!v||v.exp<=t)delete records[k][h];
    for(const [k,v] of pending)if(v.exp<=t)pending.delete(k);
  }
  function save(){
    prune();
    const tmp=stateFile+'.'+random()+'.tmp';
    try{fs.writeFileSync(tmp,JSON.stringify(records),{mode:0o600,flag:'wx'});fs.renameSync(tmp,stateFile)}
    finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{force:true})}
  }
  const challenge='Bearer realm="PressBuilder MCP", resource_metadata="'+issuer+'/.well-known/oauth-protected-resource/mcp", scope="mcp:tools"';
  function verifyToken(token){
    if(typeof token!=='string'||token.length<32||token.length>256)return false;
    const r=records.access[digest(token)];
    return Boolean(r && r.exp>now() && r.client===clientId && allowedResources.has(r.aud) && r.scope==='mcp:tools');
  }
  function clientAuth(req,form){
    let user='',pass='';
    const h=req.headers.authorization||'';
    if(h.startsWith('Basic ')){
      try{const s=Buffer.from(h.slice(6),'base64').toString('utf8');const i=s.indexOf(':');user=decodeURIComponent(s.slice(0,i));pass=decodeURIComponent(s.slice(i+1))}catch{return false}
      if(form.has('client_secret'))return false;
    }else{
      user=form.get('client_id')||'';
      pass=form.get('client_secret')||'';
    }
    return secure(user,clientId)&&secure(pass,clientSecret);
  }
  function validAuth(params){
    const id=params.get('client_id')||'';
    const red=params.get('redirect_uri')||'';
    const cc=params.get('code_challenge')||'';
    const scope=params.get('scope')||'mcp:tools';
    const aud=params.get('resource')||resource;
    const state=params.get('state')||'';
    if(!secure(id,clientId)||!allowedRedirects.has(red))throw new Error('Unknown client_id or unregistered redirect_uri');
    if(params.get('response_type')!=='code'||params.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43,128}$/.test(cc))throw new Error('Authorization code with S256 PKCE is required');
    if(scope!=='mcp:tools')throw new Error('Unsupported OAuth scope');
    if(!allowedResources.has(aud))throw new Error('Invalid resource identifier');
    if(state.length>1024)throw new Error('Invalid state');
    return {id,red,cc,scope,aud,state};
  }
  function toCallback(a,params){
    const url=new URL(a.red);
    for(const [k,v] of Object.entries(params))if(v!==undefined)url.searchParams.set(k,v);
    url.searchParams.set('iss',issuer);
    return url.toString();
  }
  function authorizeGet(req,res,url){
    if(!authWeb(req)){
      res.writeHead(401,{'WWW-Authenticate':'Basic realm="PressBuilder OAuth login"','Cache-Control':'no-store'});res.end('Authenticate as PressBuilder editor to approve access.');return;
    }
    let a;
    try{a=validAuth(url.searchParams)}catch(e){return fail(res,400,'invalid_request',e.message)}
    prune();
    if(pending.size>=300)return fail(res,429,'temporarily_unavailable','Too many pending approvals');
    const csrf=random();
    pending.set(csrf,{...a,exp:now()+600});
    const page=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PressBuilder OAuth approval</title></head>
<body style="max-width:560px;margin:7vh auto;font:17px system-ui,sans-serif;line-height:1.55;padding:20px">
<h1>Подключение PressBuilder к ChatGPT</h1>
<p>Вы разрешаете клиенту <strong>${html(a.id)}</strong> создавать, читать и изменять видеопроекты, а также запускать рендер на вашем сервере PressBuilder.</p>
<p>Доступ: <strong>mcp:tools</strong>. Сервер: ${html(resource)}</p>
<form method="post" action="/oauth/authorize"><input type="hidden" name="csrf" value="${html(csrf)}">
<button name="decision" value="approve" style="padding:12px 22px;cursor:pointer">Разрешить доступ</button>
<button name="decision" value="deny" style="padding:12px 22px;cursor:pointer">Отмена</button></form>
<p style="font-size:12px;color:#666">Запрос действителен 10 минут. Подтверждайте только если вы сами начали подключение.</p>
</body></html>`;
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});
    res.end(page);
  }
  async function authorizePost(req,res){
    if(!authWeb(req)){
      res.writeHead(401,{'WWW-Authenticate':'Basic realm="PressBuilder OAuth login"'});res.end();return;
    }
    if(req.headers.origin && req.headers.origin!==issuer)return fail(res,403,'access_denied','Invalid request origin');
    let form;try{form=await formBody(req)}catch(e){return fail(res,400,'invalid_request',e.message)}
    const nonce=form.get('csrf')||'';
    const a=pending.get(nonce);
    if(!a||a.exp<=now())return fail(res,400,'invalid_request','Consent expired or already used');
    pending.delete(nonce);
    if(form.get('decision')!=='approve')return redirect(res,toCallback(a,{error:'access_denied',state:a.state}));
    const code=random();
    records.codes[digest(code)]={client:clientId,red:a.red,cc:a.cc,scope:a.scope,aud:a.aud,exp:now()+300};
    save();
    redirect(res,toCallback(a,{code,state:a.state}));
  }
  function mint(a,includeRefresh=true){
    const token=random(),r={client:clientId,scope:a.scope,aud:a.aud,exp:now()+3600};
    records.access[digest(token)]=r;
    const out={access_token:token,token_type:'Bearer',expires_in:3600,scope:r.scope};
    if(includeRefresh){
      const refresh=random();records.refresh[digest(refresh)]={...r,exp:now()+30*86400};
      out.refresh_token=refresh;
    }
    save();
    return out;
  }
  async function tokenEndpoint(req,res){
    let form;try{form=await formBody(req)}catch(e){return fail(res,400,'invalid_request',e.message)}
    if(!clientAuth(req,form))return fail(res,401,'invalid_client','Client authentication failed',{'WWW-Authenticate':'Basic realm="PressBuilder OAuth token"'});
    const grant=form.get('grant_type');
    if(grant==='authorization_code'){
      const code=form.get('code')||'',verifier=form.get('code_verifier')||'',red=form.get('redirect_uri')||'',aud=form.get('resource')||'';
      const hash=digest(code),a=records.codes[hash];
      if(!a||a.exp<=now()||!secure(a.red,red)||!allowedResources.has(aud)||a.aud!==aud||!(/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)))return fail(res,400,'invalid_grant','Invalid or expired code, redirect URI, PKCE verifier or resource');
      delete records.codes[hash];save(); // consume once, even on failed PKCE
      if(!secure(digest(verifier),a.cc))return fail(res,400,'invalid_grant','PKCE challenge mismatch');
      return json(res,200,mint(a));
    }
    if(grant==='refresh_token'){
      const raw=form.get('refresh_token')||'';
      const hash=digest(raw),a=records.refresh[hash];
      if(!a||a.exp<=now()||a.client!==clientId||!allowedResources.has(a.aud))return fail(res,400,'invalid_grant','Invalid or expired refresh token');
      if(form.has('resource')&&form.get('resource')!==a.aud)return fail(res,400,'invalid_target','Resource cannot change on refresh');
      delete records.refresh[hash];save();
      return json(res,200,mint(a));
    }
    return fail(res,400,'unsupported_grant_type','Only authorization_code and refresh_token are supported');
  }
  const pr={resource,authorization_servers:[issuer],scopes_supported:['mcp:tools'],bearer_methods_supported:['header']};
  const metadata={issuer,authorization_endpoint:issuer+'/oauth/authorize',token_endpoint:issuer+'/oauth/token',response_types_supported:['code'],
    grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],
    token_endpoint_auth_methods_supported:['client_secret_basic'],scopes_supported:['mcp:tools'],authorization_response_iss_parameter_supported:true};
  function canHandle(pathname){
    return pathname==='/oauth/authorize'||pathname==='/oauth/token'||pathname==='/oauth/revoke'||
      pathname==='/oauth' || pathname==='/oauth/'||
      pathname==='/\.well-known/oauth-authorization-server'||
      pathname==='/\.well-known/oauth-protected-resource'||
      pathname==='/\.well-known/oauth-protected-resource/mcp';
  }
  async function handle(req,res,url){
    const p=url.pathname,m=req.method;
    if(p==='/\.well-known/oauth-authorization-server'||p==='/oauth'||p==='/oauth/')return m==='GET'?json(res,200,metadata):fail(res,405,'invalid_request','Method not allowed');
    if(p==='/\.well-known/oauth-protected-resource'||p==='/\.well-known/oauth-protected-resource/mcp')return m==='GET'?json(res,200,pr):fail(res,405,'invalid_request','Method not allowed');
    if(p==='/oauth/authorize'){
      if(m==='GET')return authorizeGet(req,res,url);
      if(m==='POST')return authorizePost(req,res);
      return fail(res,405,'invalid_request','Method not allowed');
    }
    if(p==='/oauth/token'&&m==='POST')return tokenEndpoint(req,res);
    if(p==='/oauth/revoke'&&m==='POST'){
      let form;try{form=await formBody(req)}catch(e){return fail(res,400,'invalid_request',e.message)}
      if(!clientAuth(req,form))return fail(res,401,'invalid_client','Client authentication failed');
      const key=digest(form.get('token')||'');
      delete records.access[key];delete records.refresh[key];save();
      return json(res,200,{});
    }
    return fail(res,405,'invalid_request','Method not allowed');
  }
  return {enabled:true,canHandle,handle,verifyToken,challenge,metadata,resource};
}

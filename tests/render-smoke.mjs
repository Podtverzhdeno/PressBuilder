/** Run against a Dockerized PressBuilder Cloud (port 3987) to verify real MP4. */
const BASE=process.env.PB_SMOKE_URL||'http://127.0.0.1:3987';
const TOKEN=process.env.PB_SMOKE_TOKEN||'smoke-only-not-a-real-secret-0000000000000000';
const USER=process.env.PB_SMOKE_USER||'smoke';
const PASSWORD=process.env.PB_SMOKE_PASSWORD||'smokePassword123456789';
const basic='Basic '+Buffer.from(USER+':'+PASSWORD).toString('base64');
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
let sequence=0;
async function rpc(method,params){
 const res=await fetch(BASE+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params})});
 if(!res.ok)throw new Error('MCP HTTP error '+res.status+': '+await res.text());
 const json=await res.json();
 if(json.error)throw new Error(JSON.stringify(json.error));
 if(json.result?.isError)throw new Error(JSON.stringify(json.result));
 return json.result;
}
const id='render-smoke';
const unwrap=(r)=>JSON.parse(r.content[0].text);
await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'render-smoke',version:'0.1.0'}});
unwrap(await rpc('tools/call',{name:'create_deck',arguments:{id,title:'Render smoke',text:'Привет! Это тест.',style:'paper',slide_count:1,target:1}}));
unwrap(await rpc('tools/call',{name:'update_deck',arguments:{id,fps:24,height:720}}));
const actualDeck=unwrap(await rpc('tools/call',{name:'get_deck',arguments:{id}}));
const firstSlide=actualDeck.slides[0].id;
const firstCue=actualDeck.slides[0].cues[0].id;
unwrap(await rpc('tools/call',{name:'set_slide_visuals',arguments:{id,slide_id:firstSlide,elements:[
  {id:'banner',kind:'rect',x:150,y:180,w:1600,h:480,color:'panel',radius:36,effect:'pop',duration:0.3},
  {id:'headline',kind:'text',x:250,y:280,w:1500,text:'MCP VIDEO TEST',size:90,color:'h1',effect:'rise',cue_id:firstCue,duration:0.3}
]}}));
const started=unwrap(await rpc('tools/call',{name:'render_video',arguments:{id}}));
if(!['queued','running'].includes(started.status))throw new Error('Render did not queue');
let status=null;
for(let i=0;i<150;i++){
 await sleep(1300);
 status=unwrap(await rpc('tools/call',{name:'get_render_status',arguments:{id}}));
 if(status.status==='completed')break;
 if(status.status==='failed')throw new Error('Render failed: '+status.error);
}
if(status?.status!=='completed')throw new Error('Render did not complete: '+JSON.stringify(status));
const res=await fetch(BASE+'/out/'+id+'.mp4',{headers:{Authorization:basic}});
if(!res.ok)throw new Error('MP4 download failed: '+res.status);
const bytes=new Uint8Array(await res.arrayBuffer());
if(bytes.length<1000)throw new Error('MP4 suspiciously small: '+bytes.length);
console.log('PASS actual MP4 render '+bytes.length+' bytes');

/** Run against a Dockerized PressBuilder Cloud (port 3987) to verify real MP4. */
const BASE=process.env.PB_SMOKE_URL||'http://127.0.0.1:3987';
const TOKEN=process.env.PB_SMOKE_TOKEN||'smoke-only-not-a-real-secret-0000000000000000';
const USER=process.env.PB_SMOKE_USER||'smoke';
const PASSWORD=process.env.PB_SMOKE_PASSWORD||'smokePassword123456789';
const basic='Basic '+Buffer.from(USER+':'+PASSWORD).toString('base64');
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
let sequence=0;
async function rpc(method,params,{allowToolError=false}={}){
 const res=await fetch(BASE+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params})});
 if(!res.ok)throw new Error('MCP HTTP error '+res.status+': '+await res.text());
 const json=await res.json();
 if(json.error)throw new Error(JSON.stringify(json.error));
 if(json.result?.isError&&!allowToolError)throw new Error(JSON.stringify(json.result));
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
const initialSync=unwrap(await rpc('tools/call',{name:'get_scene_sync',arguments:{id,slide_id:firstSlide}}));
if(initialSync.revision!==0||!initialSync.timeline.cues.some(c=>c.id===firstCue))throw new Error('Missing P09 cue timebase');
const savedSync=unwrap(await rpc('tools/call',{name:'set_scene_sync',arguments:{id,slide_id:firstSlide,expected_revision:0,
  markers:[{id:'core-rise',kind:'animation',anchor:{type:'cue_start',cue_id:firstCue,offset:0},emphasis:0.8},
           {id:'camera-hit',kind:'camera',anchor:{type:'scene',offset:0.25}}]}}));
if(savedSync.revision!==1||!savedSync.timeline.events.some(e=>e.id==='core-rise'&&!e.out_of_range))throw new Error('P09 marker not resolved');
// P01: exercise the actual rendered 3D Scene SDK path, not just persistence.
const authored=unwrap(await rpc('tools/call',{name:'set_scene_3d',arguments:{
  id,slide_id:firstSlide,expected_revision:0,spec:{
    version:1,
    camera:{cx:1070,cy:480,size:230,dist:9,yaw:-.4,pitch:.28,yaw_speed:.7,pitch_speed:.05,zoom_speed:.02},
    objects:[
      {id:'core',mesh:'icosa',pos:[0,0,0],scale:1.7,rotation:[0,0,0],
       spin:[.25,.9,.13],color:'#40cbff',edge_color:'#b9eeff',wire:true,start:0,start_marker:'core-rise',fade:.15},
      {id:'orbit',mesh:'octa',pos:[2,.4,-.5],scale:.6,rotation:[0,0,0],
       spin:[0,-1,0],color:'#ffbc64',edge_color:null,wire:false,start:.2,fade:.15},
    ]
  }
}}));
if(authored.revision!==1)throw new Error('3D composition was not stored');
const fetched=unwrap(await rpc('tools/call',{name:'get_scene_3d',arguments:{id,slide_id:firstSlide}}));
if(fetched.spec.objects.length!==2)throw new Error('3D composition not readable');
const started=unwrap(await rpc('tools/call',{name:'render_video',arguments:{id}}));
const sceneJob=unwrap(await rpc('tools/call',{name:'render_scene',arguments:{id,slide_id:firstSlide}}));
if(!['queued','running'].includes(sceneJob.status))throw new Error('Scene job was not accepted during full-deck render');
if(sceneJob.slide_id!==firstSlide||!sceneJob.job_id)throw new Error('Scene job metadata missing');
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
let clipStatus=null;
for(let i=0;i<150;i++){
  await sleep(1000);
  clipStatus=unwrap(await rpc('tools/call',{name:'get_scene_render_status',arguments:{id,slide_id:firstSlide}}));
  if(clipStatus.status==='completed')break;
  if(clipStatus.status==='failed')throw new Error('Scene clip render failed: '+clipStatus.error);
}
if(clipStatus?.status!=='completed')throw new Error('Scene MP4 did not finish');
const clip=await fetch(BASE+'/out/'+id+'_'+firstSlide+'.mp4',{headers:{Authorization:basic}});
if(!clip.ok)throw new Error('Scene MP4 download failed: '+clip.status);
const clipBytes=new Uint8Array(await clip.arrayBuffer());
if(clipBytes.length<1000)throw new Error('Scene MP4 suspiciously small');
console.log('PASS P02 independent scene MP4 '+clipBytes.length+' bytes');
const qa=unwrap(await rpc('tools/call',{name:'get_scene_qa_report',arguments:{id,slide_id:firstSlide}}));
if(qa?.report?.verdict!=='PASS')throw new Error('P03 scene technical QA failed '+JSON.stringify(qa));
const qaFull=unwrap(await rpc('tools/call',{name:'get_video_qa_report',arguments:{id}}));
if(qaFull?.report?.verdict!=='PASS')throw new Error('P03 full video technical QA failed '+JSON.stringify(qaFull));
console.log('PASS P03 ffprobe quality gates for scene and full video');

const versions=unwrap(await rpc('tools/call',{name:'list_scene_versions',arguments:{id,slide_id:firstSlide}}));
if(versions.versions.length!==1)throw new Error('P08 immutable render version not recorded');
const version=versions.versions[0];
if(version.qa.verdict!=='PASS'||!/^[0-9a-f]{16}$/.test(version.version_id))throw new Error('P08 immutable metadata is invalid');
const archivedSource=unwrap(await rpc('tools/call',{name:'get_scene_version_source',arguments:{id,slide_id:firstSlide,version_id:version.version_id}}));
if(archivedSource.fingerprint!==version.source.fingerprint||
   archivedSource.source?.sync_markers?.length!==2||
   archivedSource.source?.scene3d?.spec?.objects?.[0]?.start_marker!=='core-rise')
  throw new Error('P08 source archive does not retain P09 markers');
console.log('PASS P09 cue-triggered 3D MP4 and immutable source archive');

if(version.frame_evidence?.frames?.length!==3||version.frame_evidence.scope!=='FRAME_HEURISTICS_ONLY')
  throw new Error('P03 real MP4 has no three-frame diagnostic evidence');
for(const evidence of version.frame_evidence.frames){
  const response=await fetch(BASE+'/'+evidence.file,{headers:{Authorization:basic}});
  if(!response.ok)throw new Error('P03 archived JPEG unavailable: '+evidence.file);
  const jpegBytes=new Uint8Array(await response.arrayBuffer());
  if(jpegBytes.length!==evidence.size||jpegBytes[0]!==0xff||jpegBytes[1]!==0xd8)
    throw new Error('P03 archived JPEG corrupted: '+evidence.file);
  const {createHash}=await import('node:crypto');
  if(createHash('sha256').update(jpegBytes).digest('hex')!==evidence.sha256)
    throw new Error('P03 archived JPEG hash mismatch: '+evidence.file);
}
console.log('PASS P03 three real immutable JPEG storyboards and integrity hashes');
const immutable=await fetch(BASE+'/'+version.file,{headers:{Authorization:basic}});
if(!immutable.ok || (await immutable.arrayBuffer()).byteLength<1000)throw new Error('P08 immutable MP4 not downloadable');
// Evidence from an actual Docker-rendered H.264 frame, not a synthetic JPEG.
const {spawnSync}=await import('node:child_process');
const thumbnail=spawnSync('docker',['exec','pb-cloud','ffmpeg','-hide_banner','-loglevel','error',
  '-i','/data/out/'+id+'_'+firstSlide+'_v'+version.version_id+'.mp4',
  '-vf','scale=480:270','-frames:v','1','-f','image2pipe','-vcodec','mjpeg','-q:v','9','pipe:1'],
  {maxBuffer:1024*1024,timeout:30000});
if(thumbnail.status!==0||!thumbnail.stdout?.length)
  throw new Error('P07 frame JPEG extraction failed: '+String(thumbnail.error?.message||thumbnail.stderr||thumbnail.status));
const jpeg='data:image/jpeg;base64,'+thumbnail.stdout.toString('base64');
const newReview=unwrap(await rpc('tools/call',{name:'add_scene_review_item',arguments:{
  id,slide_id:firstSlide,expected_revision:0,version_id:version.version_id,
  t:Math.max(0,Math.min(version.duration-1/version.fps,0.25)),severity:'medium',
  text:'Review position and motion of the published 3D objects',
  rect:{x:0.2,y:0.2,w:0.3,h:0.3},frame_evidence:jpeg
}}));
if(newReview.item.status!=='OPEN'||newReview.item.version_id!==version.version_id)throw new Error('P07 review not anchored');
const stored=unwrap(await rpc('tools/call',{name:'get_scene_review_item',arguments:{
  id,slide_id:firstSlide,item_id:newReview.item.id
}}));
if(stored.frame_evidence!==jpeg)throw new Error('P07 real JPEG evidence not stored');
const brief=unwrap(await rpc('tools/call',{name:'list_scene_review_items',arguments:{id,slide_id:firstSlide}}));
if(!brief.items[0].has_frame_evidence||brief.items[0].frame_evidence!==undefined)
  throw new Error('P07 review summary does not properly hide large JPEG');
console.log('PASS P07 real MP4 JPEG evidence stored and retrievable');
unwrap(await rpc('tools/call',{name:'set_scene_task',arguments:{id,slide_id:firstSlide,expected_revision:0,status:'done'}}));
const blocked=await rpc('tools/call',{name:'approve_scene_version',arguments:{
  id,slide_id:firstSlide,version_id:version.version_id,expected_revision:0}},{allowToolError:true});
if(!blocked.isError)throw new Error('P07 unresolved issue did not block approval');
const fixed=unwrap(await rpc('tools/call',{name:'transition_scene_review_item',arguments:{
  id,slide_id:firstSlide,item_id:newReview.item.id,status:'FIXED',
  note:'Correct composition confirmed in frame samples',expected_revision:1}}));
if(fixed.item.status!=='FIXED')throw new Error('P07 FIXED transition failed');
const verified=unwrap(await rpc('tools/call',{name:'transition_scene_review_item',arguments:{
  id,slide_id:firstSlide,item_id:newReview.item.id,status:'VERIFIED',
  note:'Reviewed against immutable MP4',expected_revision:2}}));
if(verified.item.status!=='VERIFIED')throw new Error('P07 VERIFIED transition failed');
const approved=unwrap(await rpc('tools/call',{name:'approve_scene_version',arguments:{
  id,slide_id:firstSlide,version_id:version.version_id,expected_revision:0}}));
if(approved.version_id!==version.version_id||approved.revision!==1)throw new Error('P08 version approval failed');
const approvedRest=await fetch(BASE+'/api/decks/'+id+'/versions/'+firstSlide,{headers:{Authorization:basic}});
if(!approvedRest.ok||(await approvedRest.json()).approved.version_id!==version.version_id)throw new Error('P08 REST approved pointer unavailable');
console.log('PASS P07 review workflow + P08 immutable version approval and authenticated download');
const sourceSnapshot=unwrap(await rpc('tools/call',{name:'get_scene_source_snapshot',arguments:{
  id,slide_id:firstSlide,version_id:version.version_id
}}));
if(sourceSnapshot.fingerprint!==version.source.fingerprint||
  sourceSnapshot.source?.slide?.id!==firstSlide||
  sourceSnapshot.source?.assets?.browser?.available!==true)
  throw new Error('P08 immutable deployed-source provenance snapshot not available');
const sourceStateBefore=unwrap(await rpc('tools/call',{name:'get_scene_source_state',arguments:{
  id,slide_id:firstSlide
}}));
if(sourceStateBefore.fingerprint!==sourceSnapshot.fingerprint)
  throw new Error('P08 live source fingerprint disagrees with immutable snapshot');
unwrap(await rpc('tools/call',{name:'update_slide',arguments:{
  id,slide_id:firstSlide,label:'Temporary modified slide for source rollback'
}}));
const changedSource=unwrap(await rpc('tools/call',{name:'get_scene_source_state',arguments:{
  id,slide_id:firstSlide
}}));
if(changedSource.fingerprint===sourceStateBefore.fingerprint)
  throw new Error('P08 source edits did not change fingerprint');
const restoredSource=unwrap(await rpc('tools/call',{name:'restore_scene_source',arguments:{
  id,slide_id:firstSlide,version_id:version.version_id,
  expected_fingerprint:changedSource.fingerprint,
  expected_scene3d_revision:changedSource.scene3d_revision
}}));
if(!restoredSource.ok)throw new Error('P08 scene source rollback failed');
const deckAfter=unwrap(await rpc('tools/call',{name:'get_deck',arguments:{id}}));
if(deckAfter.slides.find(s=>s.id===firstSlide)?.label!==sourceSnapshot.source.slide.label)
  throw new Error('P08 scene label was not restored from immutable source');
console.log('PASS P08 real MP4 source provenance + director-only scene data restoration');


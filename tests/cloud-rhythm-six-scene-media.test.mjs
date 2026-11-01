import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {rhythmPreviewService} from '../server/rhythm-preview.mjs';

const available=spawnSync('ffmpeg',['-version'],{timeout:2000}).status===0 &&
  spawnSync('ffprobe',['-version'],{timeout:2000}).status===0;
const colors=['red','green','blue','yellow','magenta','cyan'];
function wavActivity(){
 const samples=6*8000;const pcm=Buffer.alloc(samples*2);
 for(let i=0;i<samples;i++){
   const active=i%8000<4000;
   pcm.writeInt16LE(active?Math.round(Math.sin(i*2*Math.PI*220/8000)*6500):0,i*2);
 }
 const b=Buffer.alloc(44+pcm.length);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);
 b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(pcm.length,40);pcm.copy(b,44);
 return b;
}
const run=(cmd,args,options={})=>{
 const p=spawnSync(cmd,args,{encoding:'utf8',timeout:25_000,maxBuffer:1024*1024,...options});
 assert.equal(p.status,0,cmd+' '+args.join(' ')+'\n'+(p.stderr??p.error));
 return p.stdout;
};

test('P15 six actual H264/AAC MP4 scenes: decoded audio silence and source-preserving cut preview',
 {skip:!available,timeout:90_000},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-p15-media-e2e-'));
 try{
   const projectRoot=path.join(root,'decks'),id='six-real-scenes';
   const dir=path.join(projectRoot,id);fs.mkdirSync(dir,{recursive:true});
   const voice=path.join(dir,'voice.wav');
   fs.writeFileSync(voice,wavActivity());
   const before=fs.readFileSync(voice);
   const parts=[];
   for(let i=0;i<6;i++){
     const output=path.join(root,'scene-'+(i+1)+'.mp4');
     run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',
       '-f','lavfi','-i','color=c='+colors[i]+':s=96x96:r=24:d=1',
       '-frames:v','24','-an','-c:v','libx264','-preset','ultrafast',
       '-pix_fmt','yuv420p',output]);
     parts.push(output);
   }
   const list=path.join(root,'clips.txt');
   fs.writeFileSync(list,parts.map(p=>"file '"+p+"'").join('\n')+'\n');
   const movie=path.join(root,'six-scenes.mp4');
   run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',
     '-f','concat','-safe','0','-i',list,'-i',voice,
     '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac',
     '-ar','16000','-shortest',movie]);
   const decoded=JSON.parse(run('ffprobe',['-v','error','-count_frames',
     '-show_entries','stream=codec_name,codec_type,nb_read_frames,r_frame_rate',
     '-show_entries','format=duration','-of','json',movie]));
   const video=decoded.streams.find(s=>s.codec_type==='video');
   const audio=decoded.streams.find(s=>s.codec_type==='audio');
   assert.equal(video.codec_name,'h264');
   assert.equal(audio.codec_name,'aac');
   assert.equal(video.r_frame_rate,'24/1');
   assert.equal(Number(video.nb_read_frames),144);
   assert.ok(Math.abs(Number(decoded.format.duration)-6)<0.2,
     'six scenes and 6s audio must remain synchronized');
   const deck={id,format:{fps:24,height:1080},audio:{file:'voice.wav'},target:6,
     slides:colors.map((c,i)=>({id:'s0'+(i+1),label:c,lead:0,tail:0,
       cues:[{id:'c01',say:'Synthetic activity '+i,dur:1}]}))};
   const preview=rhythmPreviewService({root:projectRoot,getDeck:()=>deck,
     enabled:true,audioEvidenceEnabled:true});
   const c=preview.context(id);
   const manifest={
     schema_version:1,project_id:id,
     voice_source_sha256:c.voice_source_sha256,
     alignment_revision:c.alignment_revision,
     expected_alignment_revision:c.alignment_revision,
     timebase_revision:c.timebase_revision,
     expected_timebase_revision:c.timebase_revision,
     frame_rate:c.frame_rate,duration_us:c.duration_us,
     words:colors.map((_,i)=>({id:'w'+i,scene_id:'s0'+(i+1),cue_id:'c01',
       start_us:i*1_000_000,end_us:i*1_000_000+400_000})),
     pauses:colors.map((_,i)=>({scene_id:'s0'+(i+1),cue_id:'c01',
       start_us:i*1_000_000+650_000,end_us:i*1_000_000+950_000})),
     beats:[],policy:{min_shot_frames:6,max_cuts_per_10s:10,max_cuts:10}
   };
   const p=preview.preview(id,manifest);
   assert.equal(p.status,'READY_FOR_REVIEW',JSON.stringify(p.issues));
   assert.equal(p.cuts.length,6);
   assert.equal(p.provenance.pause_audio_verified,true);
   assert.equal(p.provenance.word_alignment_verified,false);
   assert.equal(p.publication_allowed,false);
   assert.equal(p.persisted,false);
   assert.deepEqual(fs.readFileSync(voice),before);
   const mp4Before=fs.readFileSync(movie);
   assert.equal(fs.existsSync(path.join(dir,'.rhythm')),false);
   const corrupt=path.join(root,'corrupt.mp4');
   fs.writeFileSync(corrupt,Buffer.from('unreadable mp4'));
   const bad=spawnSync('ffprobe',['-v','error','-of','json','-show_format',corrupt],
     {encoding:'utf8',timeout:2000});
   assert.notEqual(bad.status,0);
   assert.deepEqual(fs.readFileSync(movie),mp4Before);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});

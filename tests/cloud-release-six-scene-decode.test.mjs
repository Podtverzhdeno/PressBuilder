import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';
import {styleContractStore} from '../server/style-contract.mjs';
import {inspectP05ActiveRelease} from '../server/release-media-integrity.mjs';
import {inspectP05DecodedMedia} from '../server/release-media-decode.mjs';

const available=['ffmpeg','ffprobe'].every(bin=>
  spawnSync(bin,['-version'],{timeout:4000,stdio:'ignore'}).status===0);
const colors=['red','green','blue','yellow','magenta','cyan'];
const hash=data=>createHash('sha256').update(data).digest('hex');
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const run=args=>{
  const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',...args],{
    timeout:40000,encoding:'utf8',maxBuffer:131072,
  });
  assert.equal(p.status,0,'ffmpeg fixture input failed: '+(p.stderr||p.error?.message));
};
async function untilDone(get){
  for(let i=0;i<300;i++){
    const job=get();
    if(['completed','failed','cancelled'].includes(job.status))return job;
    await wait(250);
  }
  throw new Error('P05 six-scene assembly did not settle');
}

test('M58-R03: six real H264/AAC scenes -> P05 immutable master -> SHA -> independent FFprobe and FFmpeg decode', {
  skip:!available,timeout:180000,
},async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-m58-media-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const out=path.join(root,'out'),decks=path.join(root,'decks');
  fs.mkdirSync(out,{recursive:true});
  const deck={id:'m58-six',slides:colors.map((_,i)=>({id:'s0'+(i+1)})),
    format:{height:720,fps:24}};
  const getDeck=()=>deck;
  const styles=styleContractStore({root:decks,getDeck});
  const plans=assemblyPlanStore({root:decks,getDeck,getStyle:id=>styles.read(id)});
  const svc=assemblyService({out,getDeck,getPlan:id=>plans.read(id),
    getStyle:id=>styles.read(id),
    getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
    getTask:()=>({status:'done'}),
    baseUrl:()=> 'https://example.test',
  });
  for(let i=0;i<6;i++){
    const args=['-f','lavfi','-i',
      'color=c='+colors[i]+':s=160x90:r='+(i%2===0?24:30)+':d=1.25'];
    if(i%2===0)
      args.push('-f','lavfi','-i','sine=frequency='+(350+i*75)+':sample_rate=48000:duration=1.25');
    args.push('-t','1.25','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p');
    if(i%2===0)args.push('-c:a','aac','-b:a','96k');else args.push('-an');
    args.push(path.join(out,'m58-six_s0'+(i+1)+'.mp4'));
    run(args);
  }
  const begin=svc.start(deck.id,deck.slides.map(x=>x.id));
  assert.ok(['queued','running'].includes(begin.status));
  const job=await untilDone(()=>svc.get(deck.id));
  assert.equal(job.status,'completed',job.error);
  assert.equal(job.manifest.scenes.length,6);
  const current=svc.current(deck.id);
  assert.equal(current?.release_id,job.result.release_id);
  const file=svc.download(deck.id,current.release_id);
  assert.equal(fs.statSync(file).isFile(),true);
  const expectedSha=job.manifest.output.sha256;
  assert.equal(hash(fs.readFileSync(file)),expectedSha);
  const bytes=inspectP05ActiveRelease({rootOut:out,projectId:deck.id,expectedMasterSha256:expectedSha});
  assert.equal(bytes.status,'BYTES_VERIFIED');
  assert.equal(bytes.scenes,6);
  const decoded=inspectP05DecodedMedia({rootOut:out,projectId:deck.id,expectedMasterSha256:expectedSha});
  assert.equal(decoded.status,'MEDIA_DECODED_FOR_REVIEW');
  assert.equal(decoded.scope,'SIX_SCENE_SYNTHETIC_COMPATIBLE_MEDIA_DECODE');
  assert.ok(Math.abs(decoded.frame_count-180)<=1,
    'P05 frame-rate normalization may round the final presentation frame by one');
  assert.equal(decoded.audio_sample_rate,48000);
  assert.equal(decoded.audio_channels,2);
  assert.equal(decoded.video_decoded,true);
  assert.equal(decoded.audio_decoded,true);
  assert.equal(decoded.may_publish,false);
  assert.equal(decoded.may_deploy,false);
  assert.equal(decoded.licensing_verified,false);
  assert.ok(Math.abs(decoded.decoded_duration_sec-7.5)<0.25);
  assert.equal(fs.existsSync(file),true);
  const cli=spawnSync(process.execPath,[
    'tools/inspect-p05-media.mjs',out,deck.id,expectedSha,
  ],{encoding:'utf8',timeout:120000,maxBuffer:256*1024});
  assert.equal(cli.status,0,cli.stderr);
  const cliReport=JSON.parse(cli.stdout);
  assert.equal(cliReport.status,'MEDIA_DECODED_FOR_REVIEW');
  assert.equal(cliReport.may_publish,false);

  // Strong negative case: a forged P05 manifest can match a corrupt file.
  // Byte-integrity alone is insufficient; FFprobe/FFmpeg must fail closed.
  const original=fs.readFileSync(file);
  const manifestPath=path.join(out,'releases',deck.id,current.release_id,'manifest.json');
  const originalManifest=fs.readFileSync(manifestPath);
  try{
    const garbage=Buffer.alloc(original.length,0x13);
    fs.writeFileSync(file,garbage);
    const fake=JSON.parse(originalManifest.toString('utf8'));
    fake.output.sha256=hash(garbage);
    fs.writeFileSync(manifestPath,JSON.stringify(fake));
    const byteOnly=inspectP05ActiveRelease({rootOut:out,projectId:deck.id,
      expectedMasterSha256:fake.output.sha256});
    assert.equal(byteOnly.status,'BYTES_VERIFIED',
      'matching checksums alone cannot prove that bytes contain decodable video');
    assert.throws(()=>inspectP05DecodedMedia({rootOut:out,projectId:deck.id,
      expectedMasterSha256:fake.output.sha256}),
    e=>e.code==='M58_DECODE_PROBE_FAILED');
  }finally{
    fs.writeFileSync(file,original);
    fs.writeFileSync(manifestPath,originalManifest);
  }
  assert.equal(inspectP05DecodedMedia({
    rootOut:out,projectId:deck.id,expectedMasterSha256:expectedSha,
  }).status,'MEDIA_DECODED_FOR_REVIEW');
});

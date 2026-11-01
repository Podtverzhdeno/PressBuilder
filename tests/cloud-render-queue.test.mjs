import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeRenderQueue} from '../server/render-queue.mjs';
import {createHash} from 'node:crypto';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,timeout=6000)=>{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=fn();if(value)return value;await sleep(15)}
  throw Error('Timed out awaiting render queue');
};
const fixture=()=> {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-queue-'));
  const outputDir=path.join(dir,'out');
  fs.mkdirSync(outputDir,{recursive:true});
  return {dir,root:path.join(dir,'jobs'),outputDir,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
};
const deck=()=>({id:'film',slides:[{id:'s01'},{id:'s02'}]});
const renderFake=outputDir=>async({outputName,signal,onProgress})=>{
  signal?.throwIfAborted();
  onProgress?.(.4);
  fs.writeFileSync(path.join(outputDir,outputName+'.mp4'),Buffer.from('VALID_MP4_TEST_DATA'));
  onProgress?.(1);
  return {fps:24,height:720,duration:3};
};
const ok=()=>({verdict:'PASS',issues:[]});
const create=(f,overrides={})=>makeRenderQueue({
  root:f.root,outputDir:f.outputDir,resolveDeck:deck,
  baseUrl:()=> 'https://example.test',render:renderFake(f.outputDir),inspect:ok,
  fingerprint:()=> 'v1',...overrides
});

test('P02 FIFO: independent jobs, deduplication, immutable MP4 and legacy alias',{timeout:12000},async()=>{
  const f=fixture();
  try {
    const queue=create(f);
    const j1=queue.enqueue('film','s01');
    assert.equal(j1.status,'queued');
    assert.equal(queue.enqueue('film','s01').job_id,j1.job_id,'active job deduplicated');
    const j2=queue.enqueue('film','s02');
    assert.notEqual(j2.job_id,j1.job_id);
    queue.start();
    await until(()=>queue.get('film','s02').status==='completed');
    const a=queue.get('film','s01'),b=queue.get('film','s02');
    assert.equal(a.status,'completed');
    assert.equal(a.progress,100);
    assert.equal(b.status,'completed');
    assert.ok(a.result.download_url.includes(j1.job_id));
    assert.ok(fs.existsSync(path.join(f.outputDir,'film_s01.mp4')));
    assert.ok(fs.existsSync(path.join(f.outputDir,'film_s02.mp4')));
    assert.ok(fs.existsSync(path.join(f.outputDir,a.output_name+'.mp4')));
    assert.equal(a.qa_report.verdict,'PASS');
    assert.equal(queue.snapshot().running,null);
    assert.equal(queue.snapshot().queued,0);
  }finally{f.cleanup()}
});

test('P02 preserves approved alias when a subsequent QA check fails',{timeout:12000},async()=>{
  const f=fixture();
  try {
    let quality='PASS';
    const q=create(f,{inspect:()=>({verdict:quality,issues:quality==='FAIL'?[{id:'BAD_VIDEO'}]:[]})});
    q.start();
    const v1=q.enqueue('film','s01');
    await until(()=>q.get('film','s01').status==='completed');
    const accepted=fs.readFileSync(path.join(f.outputDir,'film_s01.mp4'));
    quality='FAIL';
    const v2=q.retry('film','s01',v1.job_id);
    await until(()=>q.get('film','s01').status==='failed');
    assert.notEqual(v1.job_id,v2.job_id);
    assert.deepEqual(fs.readFileSync(path.join(f.outputDir,'film_s01.mp4')),accepted);
    assert.ok(fs.existsSync(path.join(f.outputDir,v1.output_name+'.mp4')));
    assert.ok(!fs.existsSync(path.join(f.outputDir,v2.output_name+'.mp4')));
    assert.equal(q.get('film','s01').qa_report.verdict,'FAIL');
  }finally{f.cleanup()}
});

test('P02 queued and running cancellation cannot accidentally cancel a different attempt',{timeout:12000},async()=>{
  const f=fixture();
  try {
    let resolveEntered;
    const entered=new Promise(r=>resolveEntered=r);
    const q=create(f,{render:async({outputName,signal})=>{
      resolveEntered();
      await new Promise((resolve,reject)=>{
        const cancel=()=>reject(signal.reason||new Error('Aborted'));
        if(signal.aborted)return cancel();
        signal.addEventListener('abort',cancel,{once:true});
      });
      fs.writeFileSync(path.join(f.outputDir,outputName+'.mp4'),'WRONG');
      return {fps:24,height:720,duration:1};
    }});
    q.start();
    const a=q.enqueue('film','s01');
    await entered;
    const b=q.enqueue('film','s02');
    assert.equal(q.cancel('film','s02',b.job_id).status,'cancelled');
    assert.equal(q.cancel('film','s01',a.job_id).status,'cancelling');
    await until(()=>q.get('film','s01').status==='cancelled');
    assert.equal(q.get('film','s02').status,'cancelled');
    assert.throws(()=>q.cancel('film','s01','stale'),e=>e.status===404);
    assert.ok(!fs.existsSync(path.join(f.outputDir,'film_s01.mp4')));
  }finally{f.cleanup()}
});

test('P02 crash recovery resumes queued and interrupted jobs with bounded restarts',{timeout:12000},async()=>{
  const f=fixture();
  try {
    const q1=create(f);
    const j=q1.enqueue('film','s01'); // deliberately do not start: simulate crash
    const q2=create(f);
    assert.equal(q2.get('film','s01').status,'queued');
    assert.equal(q2.get('film','s01').restartAttempts,1);
    q2.start();
    await until(()=>q2.get('film','s01').status==='completed');
    const resumed=q2.get('film','s01');
    assert.equal(resumed.job_id,j.job_id,'resume same job rather than creating duplicate');

    // Simulate interrupted in-flight job on another scene; future boot resumes it.
    const q3=create(f);
    const k=q3.enqueue('film','s02');
    const files=fs.readdirSync(f.root).filter(x=>x.endsWith('.json'));
    const file=files.map(x=>path.join(f.root,x)).find(x=>JSON.parse(fs.readFileSync(x,'utf8')).slide_id==='s02');
    const content=JSON.parse(fs.readFileSync(file,'utf8'));
    content.status='running';
    fs.writeFileSync(file,JSON.stringify(content));
    const q4=create(f);
    assert.equal(q4.get('film','s02').restartAttempts,1);
    q4.start();
    await until(()=>q4.get('film','s02').status==='completed');
    assert.equal(q4.get('film','s02').job_id,k.job_id);

    // Bounded recovery: never loop indefinitely after repeated process crashes.
    const again=JSON.parse(fs.readFileSync(file,'utf8'));
    again.status='running';again.restartAttempts=2;
    fs.writeFileSync(file,JSON.stringify(again));
    const q5=create(f,{maxRestarts:2});
    assert.equal(q5.get('film','s02').status,'failed');
    assert.match(q5.get('film','s02').error,/repeated restarts/);
  }finally{f.cleanup()}
});

test('P02 refuses stale source and rejects invalid scenes and unsafe filenames',{timeout:12000},async()=>{
  const f=fixture();
  try {
    let fingerprint='v1';
    const q=create(f,{fingerprint:()=>fingerprint});
    q.enqueue('film','s01');
    fingerprint='v2';
    q.start();
    await until(()=>q.get('film','s01').status==='failed');
    assert.match(q.get('film','s01').error,/Source changed/);
    assert.throws(()=>q.enqueue('film','../../escape'),e=>e.status===400);
    assert.throws(()=>q.enqueue('film','s03'),e=>e.status===404);
    assert.throws(()=>q.retry('film','s01','stale'),e=>e.status===409);
  }finally{f.cleanup()}
});


test('P02 migrates a legacy PASS journal without losing its previously approved MP4',{timeout:12000},()=>{
  const f=fixture();
  try{
    fs.mkdirSync(f.root,{recursive:true});
    const legacyName='film_s01.mp4';
    fs.writeFileSync(path.join(f.outputDir,legacyName),Buffer.from('OLD_APPROVED_VIDEO'));
    // This is the previous server/cloud.mjs journal key, not the new queue key.
    const oldHash=createHash('sha256').update('film'+'\\0'+'s01').digest('hex');
    const oldFile=path.join(f.root,oldHash+'.json');
    fs.writeFileSync(oldFile,JSON.stringify({
      id:'film',slide_id:'s01',job_id:'film:s01-1730000000000',status:'completed',
      result:{file:'out/'+legacyName,size:18,download_url:'https://example.test/out/'+legacyName},
      qa_report:{verdict:'PASS',issues:[]}
    }));
    const queue=create(f);
    const recovered=queue.get('film','s01');
    assert.equal(recovered.status,'completed');
    assert.match(recovered.job_id,/^[0-9a-f]{32}$/);
    assert.equal(recovered.result.legacy_file,'out/film_s01.mp4');
    assert.ok(fs.existsSync(path.join(f.outputDir,recovered.output_name+'.mp4')));
    assert.equal(fs.readFileSync(path.join(f.outputDir,'film_s01.mp4'),'utf8'),'OLD_APPROVED_VIDEO');
    assert.ok(!fs.existsSync(oldFile));
    assert.equal(create(f).get('film','s01').status,'completed');
  }finally{f.cleanup()}
});

test('P02 legacy in-flight jobs fail explicitly instead of replaying unpinned sources',{timeout:12000},()=>{
  const f=fixture();
  try{
    fs.mkdirSync(f.root,{recursive:true});
    const oldHash=createHash('sha256').update('film'+'\\0'+'s02').digest('hex');
    fs.writeFileSync(path.join(f.root,oldHash+'.json'),JSON.stringify({
      id:'film',slide_id:'s02',job_id:'film:s02-1730000000000',status:'running'
    }));
    const queue=create(f);
    const job=queue.get('film','s02');
    assert.equal(job.status,'failed');
    assert.match(job.error,/Legacy queued render/);
    assert.equal(queue.snapshot().queued,0);
    assert.equal(create(f).get('film','s02').status,'failed');
  }finally{f.cleanup()}
});

test('P03 malformed/null inspector results fail closed and keep the approved MP4',{timeout:12000},async()=>{
  const f=fixture();
  try{
    let verdict={verdict:'PASS',issues:[]};
    const queue=create(f,{inspect:()=>verdict});
    queue.start();
    const first=queue.enqueue('film','s01');
    await until(()=>queue.get('film','s01').status==='completed');
    const previouslyAccepted=fs.readFileSync(path.join(f.outputDir,'film_s01.mp4'));
    verdict=null;
    queue.retry('film','s01',first.job_id);
    await until(()=>queue.get('film','s01').status==='failed');
    assert.match(queue.get('film','s01').error,/Invalid QA response/);
    assert.deepEqual(fs.readFileSync(path.join(f.outputDir,'film_s01.mp4')),previouslyAccepted);
  }finally{f.cleanup()}
});

test('P02 stalled worker fails after hard render deadline, not labelled cancelled',{timeout:12000},async()=>{
  const f=fixture();
  try{
    const queue=create(f,{jobTimeoutMs:1000,render:async({signal})=>new Promise((resolve,reject)=>{
      const rejectOnAbort=()=>reject(signal.reason);
      if(signal.aborted)return rejectOnAbort();
      signal.addEventListener('abort',rejectOnAbort,{once:true});
    })});
    queue.start();
    queue.enqueue('film','s01');
    await until(()=>queue.get('film','s01').status==='failed',5000);
    assert.match(queue.get('film','s01').error,/timed out/i);
    assert.equal(queue.get('film','s01').status,'failed');
    assert.ok(!fs.existsSync(path.join(f.outputDir,'film_s01.mp4')));
  }finally{f.cleanup()}
});


test('P02/P08 publishes a draft version without replacing approved stable alias',{timeout:12000},async()=>{
  const f=fixture();
  try {
    fs.writeFileSync(path.join(f.outputDir,'film_s01.mp4'),'APPROVED_OLD_VIDEO');
    const captured=[];
    const q=create(f,{
      outputNameForJob:(id,scene,jobId)=>id+'_'+scene+'_v'+jobId,
      publishScene:async({job,file,qa})=>{
        captured.push({job_id:job.job_id,file,verdict:qa.verdict});
        return {version_id:'a1b2c3d4e5f60708'};
      },
    });
    q.start();
    q.enqueue('film','s01');
    await until(()=>q.get('film','s01').status==='completed');
    const done=q.get('film','s01');
    assert.equal(done.version_id,'a1b2c3d4e5f60708');
    assert.equal(captured.length,1);
    assert.equal(captured[0].verdict,'PASS');
    assert.equal(fs.readFileSync(path.join(f.outputDir,'film_s01.mp4'),'utf8'),'APPROVED_OLD_VIDEO');
    assert.ok(fs.existsSync(path.join(f.outputDir,done.output_name+'.mp4')));
  }finally{f.cleanup()}
});


test('P08 crash between immutable capture and journal completion recovers without re-encoding',{timeout:12000},async()=>{
  const f=fixture();
  try{
    fs.writeFileSync(path.join(f.outputDir,'film_s01.mp4'),'APPROVED_VERSION');
    const captured=new Map();
    const options={
      outputNameForJob:(id,scene,jobId)=>id+'_'+scene+'_v'+jobId,
      publishScene:({job,file})=>{
        const value={version_id:'aaaaaaaaaaaaaaaa',
          result:{file:'out/'+path.basename(file),size:fs.statSync(file).size,
            download_url:'https://example.test/out/'+path.basename(file)}};
        captured.set(job.job_id,value);
        return {version_id:value.version_id};
      },
      recoverCompleted:j=>captured.get(j.job_id)||null,
    };
    const q=create(f,options);
    q.start();q.enqueue('film','s01');
    await until(()=>q.get('film','s01').status==='completed');
    const completed=q.get('film','s01');
    const journal=fs.readdirSync(f.root).find(n=>n.endsWith('.json'));
    const file=path.join(f.root,journal);
    const persisted=JSON.parse(fs.readFileSync(file,'utf8'));
    persisted.status='running';persisted.result=null;persisted.version_id=null;
    fs.writeFileSync(file,JSON.stringify(persisted));
    const second=create(f,{...options,render:async()=>{throw Error('Should NOT re-encode captured MP4')}});
    assert.equal(second.get('film','s01').status,'completed');
    assert.equal(second.get('film','s01').version_id,'aaaaaaaaaaaaaaaa');
    second.start();
    assert.equal(second.snapshot().queued,0);
    assert.deepEqual(second.get('film','s01').result.file,completed.result.file);
    assert.equal(fs.readFileSync(path.join(f.outputDir,'film_s01.mp4'),'utf8'),'APPROVED_VERSION');
    assert.ok(fs.existsSync(path.join(f.outputDir,completed.output_name+'.mp4')));
  }finally{f.cleanup()}
});

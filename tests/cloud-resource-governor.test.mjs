import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createResourceGovernor} from '../server/resource-governor.mjs';
import {makeRenderQueue} from '../server/render-queue.mjs';
import {assemblyService} from '../server/assemble-scenes.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';
import {styleContractStore} from '../server/style-contract.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=10000){
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){const value=fn();if(value)return value;await sleep(15)}
  throw Error('Timed out awaiting resource governor');
}

test('FIFO governor: cancel queued waiter, release once, reject overload and preserve order',{
  timeout:5000
},async()=>{
  const gov=createResourceGovernor({capacity:1,maxWaiting:2});
  const release1=await gov.acquire();
  const cancel=new AbortController();
  const rejected=gov.acquire({signal:cancel.signal});
  const acquired=gov.acquire();
  const overflow=gov.acquire();
  await assert.rejects(overflow,e=>e.status===429);
  assert.deepEqual(gov.snapshot(),{capacity:1,active:1,waiting:2});
  cancel.abort();
  await assert.rejects(rejected,/abort/i);
  assert.deepEqual(gov.snapshot(),{capacity:1,active:1,waiting:1});
  release1();
  release1();
  const release2=await acquired;
  assert.deepEqual(gov.snapshot(),{capacity:1,active:1,waiting:0});
  release2();
  assert.deepEqual(gov.snapshot(),{capacity:1,active:0,waiting:0});
  const preAborted=new AbortController();preAborted.abort();
  await assert.rejects(gov.acquire({signal:preAborted.signal}),/abort/i);
  assert.deepEqual(gov.snapshot(),{capacity:1,active:0,waiting:0});
});

test('P02 waits for capacity and cancellation never starts a waiting render',{timeout:12000},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-govern-queue-'));
  const out=path.join(dir,'out');
  const resource=createResourceGovernor({capacity:1});
  const hold=await resource.acquire();
  let renderCalls=0;
  const queue=makeRenderQueue({root:path.join(dir,'jobs'),outputDir:out,
    resolveDeck:()=>({slides:[{id:'s01'}]}),baseUrl:()=> 'http://localhost',
    fingerprint:()=> 'source',
    acquireResource:params=>resource.acquire(params),
    render:async()=>{renderCalls++;throw Error('A waiting render must not launch')},
    inspect:()=>({verdict:'PASS',issues:[]})});
  try{
    queue.start();
    const job=queue.enqueue('demo','s01');
    await until(()=>resource.snapshot().waiting===1);
    assert.equal(queue.get('demo','s01').status,'running');
    queue.cancel('demo','s01',job.job_id);
    await until(()=>queue.get('demo','s01').status==='cancelled');
    assert.equal(renderCalls,0);
    assert.equal(resource.snapshot().waiting,0);
  }finally{hold();fs.rmSync(dir,{recursive:true,force:true})}
});

const ready=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{stdio:'ignore'}).status===0);
const clip=(file,color)=>{
  const cmd=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',
    '-f','lavfi','-i','color=c='+color+':s=160x90:r=24:d=0.6',
    '-c:v','libx264','-pix_fmt','yuv420p','-an',file],{encoding:'utf8',timeout:15000});
  assert.equal(cmd.status,0,cmd.stderr);
};
test('P02 and P05 share one capacity slot; queued assembly starts after P02 cancellation',{
  skip:!ready,timeout:55000
},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pb-govern-integration-')),out=path.join(dir,'out');
  fs.mkdirSync(out,{recursive:true});
  const deck={id:'demo',slides:[{id:'s01'},{id:'s02'}],format:{fps:24,height:720}};
  const resource=createResourceGovernor({capacity:1});
  const entered={};
  entered.promise=new Promise(resolve=>entered.resolve=resolve);
  let renderCalls=0;
  const q=makeRenderQueue({root:path.join(dir,'jobs'),outputDir:out,
    resolveDeck:()=>deck,baseUrl:()=> 'http://localhost',
    fingerprint:()=> 'source',
    acquireResource:params=>resource.acquire(params),
    render:async({signal})=>{
      renderCalls++;
      entered.resolve();
      await new Promise((resolve,reject)=>{
        const abort=()=>reject(signal.reason||new Error('Cancelled'));
        if(signal.aborted)return abort();
        signal.addEventListener('abort',abort,{once:true});
      });
      throw Error('Render must be cancelled');
    },inspect:()=>({verdict:'PASS',issues:[]})});
  const styles=styleContractStore({root:path.join(dir,'decks'),getDeck:()=>deck});
  const plans=assemblyPlanStore({root:path.join(dir,'decks'),getDeck:()=>deck,
    getStyle:id=>styles.read(id)});
  const assembly=assemblyService({out,getDeck:()=>deck,
    getRender:()=>({status:'completed',qa_report:{verdict:'PASS'}}),
    getTask:()=>({status:'done'}),getPlan:id=>plans.read(id),
    getStyle:id=>styles.read(id),baseUrl:()=> 'http://localhost',
    acquireResource:params=>resource.acquire(params)});
  try{
    clip(path.join(out,'demo_s01.mp4'),'red');
    clip(path.join(out,'demo_s02.mp4'),'green');
    q.start();
    const render=q.enqueue('demo','s01');
    await entered.promise;
    assert.equal(resource.snapshot().active,1);
    assembly.start('demo',['s01','s02']);
    await until(()=>resource.snapshot().waiting===1);
    assert.equal(assembly.get('demo').status,'queued','Must not launch FFmpeg under render load');
    q.cancel('demo','s01',render.job_id);
    await until(()=>q.get('demo','s01').status==='cancelled');
    const result=await until(()=>{
      const j=assembly.get('demo');return ['completed','failed'].includes(j.status)?j:null;
    },30000);
    assert.equal(result.status,'completed',result.error);
    assert.equal(renderCalls,1);
    assert.ok(result.timings_ms.wait_resource>=0);
    assert.equal(resource.snapshot().active,0);
    assert.equal(resource.snapshot().waiting,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

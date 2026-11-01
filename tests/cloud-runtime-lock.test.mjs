import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {assemblyService} from '../server/assemble-scenes.mjs';

const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pb-writer-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));

test('P05 interrupted montage journal is recovered as failed, never as published',()=>{
  const root=temp(),out=path.join(root,'out'),id='demo';
  const deck={id,slides:[{id:'s01'},{id:'s02'}],format:{fps:24,height:720}};
  const service=()=>assemblyService({out,getDeck:()=>deck,
    getPlan:()=>({revision:0,plan:{scenes:[]}}),getStyle:()=>({revision:0,contract:{}}),
    getTask:()=>({status:'done'}),getRender:()=>({status:'not_started'}),
    baseUrl:()=> 'http://example.test'});
  try{
    fs.mkdirSync(path.join(out,'assembly-jobs'),{recursive:true});
    const file=path.join(out,'assembly-jobs','demo.json');
    fs.writeFileSync(file,JSON.stringify({id,job_id:'12345678-1234-4234-8234-123456789abc',
      status:'running',progress:76,scene_ids:['s01','s02']}));
    const s=service(),failed=s.get(id);
    assert.equal(failed.status,'failed');
    assert.match(failed.error,/interrupted by server restart/i);
    assert.equal(s.current(id),null);
    assert.equal(service().get(id).status,'failed','Recovery is persisted atomically');
    assert.throws(()=>s.cancel(id),e=>e.status===409);
    fs.writeFileSync(file,'{broken');
    assert.throws(()=>service().get(id),e=>e.status===500,'Corrupt journal fails closed');
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

const linuxFlock=process.platform==='linux'&&spawnSync('flock',['--version'],{stdio:'ignore'}).status===0;
test('production flock blocks second writer and releases on SIGKILL',{
  skip:!linuxFlock,timeout:12000
},async()=>{
  const root=temp(),lock=path.join(root,'writer.lock');
  const run=code=>['-F','-n','-E','75',lock,process.execPath,'-e',code];
  const leader=spawn('flock',run('setInterval(()=>{},1000)'),{stdio:'ignore'});
  try{
    await pause(150);
    assert.equal(leader.exitCode,null,'First writer must hold the lock');
    const blocked=spawnSync('flock',run('process.exit(0)'),{timeout:2500,encoding:'utf8'});
    assert.equal(blocked.status,75,'Second writer should fail fast, not wait or write');
    leader.kill('SIGKILL');
    await once(leader,'exit');
    const next=spawnSync('flock',run('process.exit(0)'),{timeout:2500,encoding:'utf8'});
    assert.equal(next.status,0,'Kernel lock must be released after process death');
  }finally{if(leader.exitCode===null)leader.kill('SIGKILL');fs.rmSync(root,{recursive:true,force:true})}
});

test('production entrypoints enforce the shared-volume writer lock',()=>{
  const railway=JSON.parse(fs.readFileSync('railway.json','utf8'));
  const docker=fs.readFileSync('Dockerfile','utf8');
  assert.match(railway.deploy.startCommand,/flock -F -n -E 75 \/data\/\.pressbuilder-writer\.lock node server\/cloud\.mjs/);
  assert.match(docker,/CMD \["flock","-F","-n","-E","75","\/data\/\.pressbuilder-writer\.lock","node","server\/cloud\.mjs"\]/);
});

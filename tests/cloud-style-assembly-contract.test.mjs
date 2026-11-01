import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {styleContractStore,validateStyleContract,effectiveStyle,enforceScene3D,enforceVisuals} from '../server/style-contract.mjs';
import {assemblyPlanStore} from '../server/assembly-plan.mjs';

const sampleDeck={id:'demo',slides:[{id:'s01'},{id:'s02'},{id:'s03'}]};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'pb-style-contract-'));
test('P04: scene overrides can only tighten global rules; revisions survive reads',()=>{
  const root=temp();
  try{
    const store=styleContractStore({root,getDeck:()=>sampleDeck});
    const base=store.read('demo');
    assert.equal(base.revision,0);
    assert.equal(base.contract.schemaVersion,1);
    const contract={...base.contract,enforce:true,
      sceneOverrides:{s02:{minFontSize:72,safeArea:{left:150},maxSpin:1,palette:['#FFFFFF']}}};
    const saved=store.put('demo',contract,0);
    assert.equal(saved.revision,1);
    assert.equal(store.read('demo').revision,1);
    const global=effectiveStyle(saved.contract,'s01');
    const scene=effectiveStyle(saved.contract,'s02');
    assert.equal(global.typography.minFontSize,46);
    assert.equal(scene.typography.minFontSize,72);
    assert.equal(scene.safeArea.left,150);
    assert.deepEqual(scene.palette,['#FFFFFF']);
    assert.throws(()=>store.put('demo',contract,0),/revision conflict/);
    assert.throws(()=>validateStyleContract({...contract,sceneOverrides:{s02:{minFontSize:30}}}),/scene minFontSize/);
    assert.throws(()=>validateStyleContract({...contract,sceneOverrides:{s02:{palette:['#123456']}}}),/palette/);
    assert.throws(()=>store.put('demo',{...contract,sceneOverrides:{unknown:{}}},1),/Unknown scene/);
    enforceVisuals(saved.contract,[{kind:'text',id:'title',text:'GOOD',x:300,y:300,size:80,font:'display'}],'s02');
    assert.throws(()=>enforceVisuals(saved.contract,[{kind:'text',id:'title',text:'SMALL',x:300,y:300,size:50}],'s02'),/Text size/);
    assert.throws(()=>enforceVisuals(saved.contract,[{kind:'text',id:'title',text:'EDGE',x:90,y:300,size:80}],'s02'),/safe area/);
    const spec={camera:{cx:500,cy:400,yaw_speed:0.2,pitch_speed:0},objects:[
      {id:'shape',color:'#FFFFFF',spin:[0,0.4,0]}]};
    enforceScene3D(saved.contract,spec,'s02');
    assert.throws(()=>enforceScene3D(saved.contract,{...spec,objects:[{...spec.objects[0],color:'#000000'}]},'s02'),/color/);
    assert.throws(()=>enforceScene3D(saved.contract,{...spec,objects:[{...spec.objects[0],spin:[0,1.1,0]}]},'s02'),/spin/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('P05: transition plan has scene states, protects ordering and match-cut semantics',()=>{
  const root=temp();
  try{
    const style=styleContractStore({root,getDeck:()=>sampleDeck});
    const plans=assemblyPlanStore({root,getDeck:()=>sampleDeck,getStyle:id=>style.read(id)});
    const start=plans.read('demo');
    assert.equal(start.plan.scenes.length,3);
    assert.equal(start.plan.scenes[0].transition_after.type,'hard-cut');
    const scenes=structuredClone(start.plan.scenes);
    scenes[0].transition_after={type:'crossfade',duration:0.4};
    scenes[1].exit_state={subject:'key',background:'#112233',camera:[0.5,0.5],motion:'right'};
    scenes[2].entry_state={subject:'key',background:'#112233',camera:[0.52,0.52],motion:'right'};
    scenes[1].transition_after={type:'match-cut',duration:0};
    const saved=plans.put('demo',{schemaVersion:1,scenes},0);
    assert.equal(saved.revision,1);
    assert.equal(plans.read('demo').plan.scenes[1].transition_after.type,'match-cut');
    assert.throws(()=>plans.put('demo',{schemaVersion:1,scenes},0),/changed/);
    const badScenes=structuredClone(scenes);
    badScenes[2].entry_state.subject='other';
    assert.throws(()=>plans.put('demo',{schemaVersion:1,scenes:badScenes},1),/identical named subject/);
    const long=structuredClone(scenes);
    long[0].transition_after={type:'crossfade',duration:0.9};
    assert.throws(()=>plans.put('demo',{schemaVersion:1,scenes:long},1),/transition duration/);
    const reversed=structuredClone(scenes);
    reversed.reverse();
    assert.throws(()=>plans.put('demo',{schemaVersion:1,scenes:reversed},1),/order mismatch/);
  }finally{fs.rmSync(root,{recursive:true,force:true})}
});

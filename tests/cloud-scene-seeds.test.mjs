import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sceneTaskStore} from '../server/scene-tasks.mjs';
import {projectReadmeStore} from '../server/project-readme.mjs';

test('GitHub seed README and task are readable; runtime edits overlay seeds without changing repository',{timeout:15000},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pb-seeded-scenes-'));
  const seedRoot=path.join(process.cwd(),'src','decks');
  const sourceTask=path.join(seedRoot,'a2a-3d-hero','.scene-tasks','s01.json');
  const sourceReadme=path.join(seedRoot,'a2a-3d-hero','README.md');
  const beforeTask=fs.readFileSync(sourceTask,'utf8');
  const beforeReadme=fs.readFileSync(sourceReadme,'utf8');
  const getDeck=id=>JSON.parse(fs.readFileSync(path.join(seedRoot,id,'deck.json'),'utf8'));
  try{
    const tasks=sceneTaskStore({root,seedRoot,getDeck});
    const readmes=projectReadmeStore({root,seedRoot,getDeck});
    const task=tasks.read('a2a-3d-hero','s01');
    const readme=readmes.read('a2a-3d-hero');
    assert.equal(task.assignee,'Agent-01');
    assert.ok(task.brief.includes('АНИМАЦИЯ ПО ВРЕМЕНИ'));
    assert.equal(task.revision,0);
    assert.equal(readme.source,'seed');
    assert.ok(readme.content.includes('A2A × BLOCKCHAIN'));
    assert.equal(readme.content,beforeReadme);
    assert.equal(readmes.ensure('a2a-3d-hero').source,'seed');
    assert.equal(fs.existsSync(path.join(root,'a2a-3d-hero','README.md')),false);

    const newTask=tasks.checkpoint('a2a-3d-hero','s01','mesh',{
      done:true,note:'Конкретный просмотр 3D-модели',
    });
    assert.equal(newTask.revision,1);
    assert.equal(newTask.checkpoints.find(c=>c.id==='mesh').done,true);
    const newReadme=readmes.write('a2a-3d-hero',beforeReadme+'\n## Дополнение координатора\n\nЕдиный стиль принят.\n',readme.revision);
    assert.equal(newReadme.source,'saved');
    assert.ok(newReadme.content.includes('Дополнение координатора'));
    assert.throws(()=>readmes.write('a2a-3d-hero','stale',readme.revision),e=>e.status===409);
    const reopened=sceneTaskStore({root,seedRoot,getDeck});
    assert.equal(reopened.read('a2a-3d-hero','s01').checkpoints.find(c=>c.id==='mesh').note,
      'Конкретный просмотр 3D-модели');
    assert.equal(fs.readFileSync(sourceTask,'utf8'),beforeTask);
    assert.equal(fs.readFileSync(sourceReadme,'utf8'),beforeReadme);
    assert.throws(()=>tasks.read('../invalid','s01'),e=>e.status===400);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

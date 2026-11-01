/**
 * A separate Markdown README for each video project.
 * Existing projects without a README get a truthful, read-only generated guide.
 * A save creates README.md on disk; editing it never touches deck.json or scene tasks.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const SLUG=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const MAX_README=64*1024;
const revision=(content)=>createHash('sha256').update(content).digest('hex').slice(0,20);
const issue=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(s)=>String(s??'').replace(/\r\n/g,'\n');

export function projectReadmeStore({root,seedRoot,getDeck}) {
  function paths(id){
    if(typeof id!=='string'||!SLUG.test(id))throw issue('Invalid project ID');
    const deck=getDeck(id);
    const saved=path.join(root,id,'README.md');
    const seeded=seedRoot?path.join(seedRoot,id,'README.md'):null;
    return {deck,saved,seeded};
  }
  function generated(deck){
    const fmt=deck.format||{};
    const sceneLines=(deck.slides||[]).map((s,i)=>
      '- **'+s.id+'** — '+String(s.label||'Сцена '+(i+1)).replace(/[\r\n]/g,' ').slice(0,180)).join('\n');
    const script=clean(deck.text||'').trim();
    return [
      '# '+String(deck.title||deck.id).replace(/[\r\n]/g,' ').slice(0,180),
      '',
      '> README видеопроекта PressBuilder · \`'+deck.id+'\`',
      '',
      '## О проекте',
      '',
      'Проект: \`'+deck.id+'\`. Цель — собрать ролик из отдельных сцен с единым визуальным стилем.',
      'Содержательная основа (текст проекта):',
      '',
      script?script.slice(0,6000):'Текст проекта пока не задан.',
      '',
      '## Общие технические параметры',
      '',
      '- Формат: 16:9, '+(fmt.height||1080)+'p, '+(fmt.fps||60)+' FPS.',
      '- Стиль PressBuilder: \`'+(deck.style||'terevo')+'\`.',
      '- Целевой хронометраж: '+(deck.target==null?'из текста':deck.target+' с')+'.',
      '',
      '## Сцены и отдельные задания',
      '',
      sceneLines||'Сцены ещё не созданы.',
      '',
      'Назначения, полные технические задания, критерии приёмки и чекпоинты находятся **отдельно**:',
      'через MCP \`list_scene_tasks\` и \`get_scene_task\`; в веб-редакторе — «Задания агентам».',
      'Не считай отсутствие заполненного задания разрешением начать работу без ТЗ.',
      '',
      '## Как агенту начать работу без предварительного контекста',
      '',
      '1. \`list_decks\` — найди проект по названию, если ID неизвестен.',
      '2. \`get_project_context\` — прочитай README и общую карту задач.',
      '3. \`get_scene_task\` — прочитай полное ТЗ своей сцены и оставшиеся чекпоинты.',
      '4. \`get_deck\` — изучи реплики, тайминг, формат и технические данные.',
      '5. Работай только с назначенной сценой. Не меняй чужие задачи и общий стиль без согласования.',
      '6. После проверки результата обновляй чекпоинты через \`set_scene_checkpoint\` и записывай доказательства в \`note\`.',
      '',
      '## Приёмка',
      '',
      'Не ставь \`done\`, пока результат не проверен. Для сложных 3D-сцен нужны предпросмотр,',
      'проверка читаемости, отсутствия наложений, корректности таймингов и воспроизводимого MP4.',
      'Итоговую сборку всех сцен выполняет координатор; назначение сцены само по себе не запускает агента.',
      '',
    ].join('\n');
  }
  function read(id){
    const {deck,saved,seeded}=paths(id);
    let content,source,updated_at=null;
    if(fs.existsSync(saved)){
      content=fs.readFileSync(saved,'utf8');source='saved';
      updated_at=fs.statSync(saved).mtime.toISOString();
    }else if(seeded&&fs.existsSync(seeded)){
      content=fs.readFileSync(seeded,'utf8');source='seed';
      updated_at=fs.statSync(seeded).mtime.toISOString();
    }else {
      content=generated(deck);source='generated';
    }
    return {id,filename:'README.md',content,revision:revision(content),source,updated_at};
  }
  function write(id,content,expected_revision){
    const {saved}=paths(id);
    if(typeof content!=='string'||content.length>MAX_README||!content.trim())
      throw issue('README must be non-empty Markdown (max 64 KiB)');
    const old=read(id);
    if(expected_revision!==old.revision)
      throw issue('Project README changed; reload and retry',409);
    const normalized=clean(content);
    fs.mkdirSync(path.dirname(saved),{recursive:true});
    const tmp=saved+'.'+process.pid+'.'+Math.random().toString(36).slice(2)+'.tmp';
    fs.writeFileSync(tmp,normalized,{mode:0o600});
    try{fs.renameSync(tmp,saved)}finally{fs.rmSync(tmp,{force:true})}
    return read(id);
  }
  function ensure(id){
    const {saved,seeded}=paths(id);
    if(!fs.existsSync(saved)&&!(seeded&&fs.existsSync(seeded))){
      const initial=read(id);
      write(id,initial.content,initial.revision);
    }
    return read(id);
  }
  return {read,write,ensure};
}

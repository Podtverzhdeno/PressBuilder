/** Scene-level agent assignment editor, backed by independent persisted task files. */
import { useEffect, useState } from 'preact/hooks';
import { api, type SceneCheckpoint, type SceneTask } from './api.ts';

const statuses: Record<string,string> = {
  todo:'Не начато',in_progress:'В работе',review:'На проверке',done:'Готово',blocked:'Блокер',
};
const seedCheckpoints: SceneCheckpoint[]=[
  {id:'brief',title:'ТЗ и визуальная идея согласованы',done:false,note:''},
  {id:'assets',title:'3D-модели и ассеты готовы',done:false,note:''},
  {id:'animation',title:'Камера, свет и анимация реализованы',done:false,note:''},
  {id:'preview',title:'Предпросмотр и визуальная проверка пройдены',done:false,note:''},
  {id:'render',title:'MP4 отрендерен и передан на сборку',done:false,note:''},
];
const copiedPrompt = (project:string,t:SceneTask) =>
  'ПРОЕКТ: '+project+'\nСЦЕНА: '+t.scene_id+'\nЗАДАНИЕ: '+t.title+
  '\nАГЕНТ: '+(t.assignee||'не назначен')+'\nСТАТУС: '+t.status+
  '\n\nПОДРОБНОЕ ТЗ:\n'+(t.brief||'ТЗ ещё не заполнено')+
  '\n\nКРИТЕРИИ ПРИЁМКИ:\n'+(t.deliverables||'Не заданы')+
  '\n\nЧЕКПОИНТЫ:\n'+t.checkpoints.map(c=>'- ['+(c.done?'x':' ')+'] '+c.id+': '+c.title+(c.note?' — '+c.note:'')).join('\n')+
  '\n\nНачни с MCP get_project_context (README, правила и карта сцен), затем get_scene_task и get_deck. Работай только со своей сценой; '+
  'после проверенного результата отмечай чекпоинт через set_scene_checkpoint. '+
  'Не меняй чужие сцены и не объявляй сцену готовой без тестов.';

interface Props { projectId:string; initialSlide?:string; onClose:()=>void }
export function SceneTasksPanel({projectId,initialSlide,onClose}:Props){
  const [tasks,setTasks]=useState<SceneTask[]>([]);
  const [active,setActive]=useState(initialSlide||'');
  const [draft,setDraft]=useState<SceneTask|null>(null);
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [newCheck,setNewCheck]=useState('');

  useEffect(()=>{
    let alive=true;
    void api.listSceneTasks(projectId).then(rows=>{
      if(!alive)return;
      setTasks(rows);
      const id=rows.some(x=>x.scene_id===initialSlide)?initialSlide:rows[0]?.scene_id||'';
      setActive(id||'');setDraft(rows.find(x=>x.scene_id===id)||null);
    }).catch(e=>{if(alive)setError(String(e))}).finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[projectId]);

  async function refresh(){
    if(busy)return;
    if(dirty&&!confirm('Несохранённые изменения исчезнут при обновлении. Продолжить?'))return;
    setBusy(true);setError('');
    try {
      const rows=await api.listSceneTasks(projectId);
      const selected=rows.some(x=>x.scene_id===active)?active:rows[0]?.scene_id||'';
      setTasks(rows);setActive(selected);
      setDraft(rows.find(x=>x.scene_id===selected)||null);
      setDirty(false);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  function select(id:string){
    if(busy)return;
    if(dirty&&!confirm('У этой сцены есть несохранённые изменения. Переключиться без сохранения?'))return;
    setActive(id);
    setDraft(tasks.find(t=>t.scene_id===id)||null);
    setDirty(false);setError('');setNewCheck('');
  }
  function change(field:keyof SceneTask,value:unknown){
    setDraft(old=>old?{...old,[field]:value}:old);setDirty(true);
  }
  function changeCp(id:string,patch:Partial<SceneCheckpoint>){
    setDraft(old=>old?{...old,checkpoints:old.checkpoints.map(c=>c.id===id?{...c,...patch}:c)}:old);
    setDirty(true);
  }
  async function save(){
    if(!draft||busy)return;
    setBusy(true);setError('');
    try{
      const saved=await api.saveSceneTask(projectId,draft.scene_id,{
        title:draft.title,assignee:draft.assignee,status:draft.status,brief:draft.brief,
        deliverables:draft.deliverables,checkpoints:draft.checkpoints,
      },draft.revision);
      setDraft(saved);setDirty(false);
      setTasks(list=>list.map(t=>t.scene_id===saved.scene_id?saved:t));
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{setBusy(false)}
  }
  async function toggleCheckpoint(c:SceneCheckpoint,done:boolean){
    if(!draft||busy)return;
    if(dirty){changeCp(c.id,{done});return}
    setBusy(true);setError('');
    try{
      const saved=await api.patchSceneCheckpoint(projectId,draft.scene_id,c.id,{done});
      setDraft(saved);setTasks(list=>list.map(t=>t.scene_id===saved.scene_id?saved:t));
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  function addCheckpoint(){
    if(!draft||!newCheck.trim())return;
    const used=new Set(draft.checkpoints.map(c=>c.id));
    let i=1;while(used.has('cp'+String(i).padStart(2,'0')))i++;
    change('checkpoints',[...draft.checkpoints,{
      id:'cp'+String(i).padStart(2,'0'),title:newCheck.trim(),done:false,note:'',
    }]);setNewCheck('');
  }
  const done=tasks.filter(t=>t.status==='done').length;
  const cpDone=tasks.reduce((n,t)=>n+t.checkpoints.filter(c=>c.done).length,0);
  const cpTotal=tasks.reduce((n,t)=>n+t.checkpoints.length,0);
  return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="Задания агентам по сценам">
    <div class="task-window">
      <header class="task-header">
        <div><strong>Задания агентам</strong><span>{projectId} · {done}/{tasks.length} сцен готово · {cpDone}/{cpTotal} чекпоинтов</span></div>
        <div class="task-head-actions">
          <button type="button" class="btn" disabled={busy} onClick={()=>void refresh()}>Обновить прогресс</button>
          <button type="button" class="btn" onClick={()=>{
            if(!dirty||confirm('Есть несохранённые изменения. Закрыть?'))onClose();
          }}>Закрыть</button>
        </div>
      </header>
      <div class="task-layout">
        <nav class="task-list" aria-label="Сцены проекта">
          {tasks.map(t=>{
            const passed=t.checkpoints.filter(c=>c.done).length;
            return <button type="button" key={t.scene_id}
              class={'task-scene'+(active===t.scene_id?' is-active':'')}
              onClick={()=>select(t.scene_id)}>
              <span class="task-scene-title">{t.scene_id} · {t.title}</span>
              <small>{statuses[t.status]||t.status} · {passed}/{t.checkpoints.length} · {t.assignee||'агент не назначен'}</small>
              <span class="task-progress"><i style={{width:(t.checkpoints.length?passed/t.checkpoints.length*100:0)+'%'}} /></span>
            </button>;
          })}
        </nav>
        <section class="task-detail">
          {loading&&<p>Загружаю задания сцен…</p>}
          {!loading&&!draft&&<p>В проекте пока нет сцен.</p>}
          {draft&&<>
            <div class="task-row">
              <label>Название задания
                <input value={draft.title} maxLength={180} onInput={e=>change('title',e.currentTarget.value)} />
              </label>
              <label>Агент / исполнитель
                <input value={draft.assignee} maxLength={150} placeholder="Например: Agent-03" onInput={e=>change('assignee',e.currentTarget.value)} />
              </label>
              <label>Статус
                <select value={draft.status} onChange={e=>change('status',e.currentTarget.value)}>
                  {Object.entries(statuses).map(([id,name])=><option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>
            <label class="task-field">Подробное ТЗ для агента
              <textarea rows={9} maxLength={20000} value={draft.brief} placeholder="Цель сцены, композиция, 3D-объекты, камера, освещение, анимация по секундам, ограничения, переходы…" onInput={e=>change('brief',e.currentTarget.value)} />
            </label>
            <label class="task-field">Результат и критерии приёмки
              <textarea rows={4} maxLength={10000} value={draft.deliverables} placeholder="Что агент обязан сдать: сцену, MP4, исходники, превью, проверку текста, кадры, тесты…" onInput={e=>change('deliverables',e.currentTarget.value)} />
            </label>
            <div class="task-check-title"><strong>Чекпоинты</strong>
              {!draft.checkpoints.length&&<button type="button" class="btn" onClick={()=>change('checkpoints',seedCheckpoints.map(c=>({...c})))}>Добавить стандартные этапы</button>}
            </div>
            {draft.checkpoints.map(c=><div class="task-check" key={c.id}>
              <input type="checkbox" checked={c.done} disabled={busy} aria-label={'Выполнено: '+c.title}
                onChange={e=>void toggleCheckpoint(c,e.currentTarget.checked)} />
              <div class="task-check-main">
                <input value={c.title} maxLength={260} onInput={e=>changeCp(c.id,{title:e.currentTarget.value})} aria-label={'Название '+c.id} />
                <input value={c.note||''} maxLength={1000} placeholder="Доказательство, ссылка на результат или блокер" onInput={e=>changeCp(c.id,{note:e.currentTarget.value})} aria-label={'Комментарий '+c.id} />
              </div>
              <button type="button" class="task-remove" title="Удалить чекпоинт" onClick={()=>change('checkpoints',draft.checkpoints.filter(x=>x.id!==c.id))}>×</button>
            </div>)}
            <div class="task-add">
              <input value={newCheck} maxLength={260} placeholder="Добавить новый чекпоинт" onInput={e=>setNewCheck(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCheckpoint()}}} />
              <button type="button" class="btn" disabled={!newCheck.trim()||draft.checkpoints.length>=60} onClick={addCheckpoint}>Добавить</button>
            </div>
            {error&&<p class="task-error" role="alert">{error} · при конфликте обнови задания и повтори изменение</p>}
            <footer class="task-footer">
              <button class="btn" type="button" onClick={()=>{
                void navigator.clipboard.writeText(copiedPrompt(projectId,draft)).catch(()=>setError('Не удалось скопировать'));
              }}>Копировать ТЗ агенту</button>
              <span>{dirty?'Есть несохранённые изменения':'Сохранено'} · ревизия {draft.revision}</span>
              <button class="btn is-primary" type="button" disabled={!dirty||busy} onClick={()=>void save()}>{busy?'Сохраняю…':'Сохранить ТЗ'}</button>
            </footer>
          </>}
        </section>
      </div>
    </div>
  </div>;
}

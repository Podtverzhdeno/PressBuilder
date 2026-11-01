/** M40: opt-in typed execution brief, read-only; derived from approved P10 plan. */
import {useEffect,useState} from 'preact/hooks';
import {api,type TypedSceneBrief} from './api.ts';

export function TypedSceneBriefPanel({projectId,initialScene,onClose}:{
 projectId:string;initialScene?:string;onClose:()=>void
}){
 const [scenes,setScenes]=useState<string[]>([]);
 const [scene,setScene]=useState(initialScene??'');
 const [brief,setBrief]=useState<TypedSceneBrief|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  let alive=true;
  void api.getDeck(projectId).then(deck=>{
   if(!alive)return;
   const ids=deck.slides.map(s=>s.id);
   setScenes(ids);setScene(s=>s&&ids.includes(s)?s:ids[0]??'');
  }).catch(e=>{if(alive)setError(String(e))});
  return ()=>{alive=false};
 },[projectId]);
 async function load(){
  if(!scene||busy)return;
  setBrief(null);setBusy(true);setError('');
  try{setBrief(await api.getTypedSceneBrief(projectId,scene))}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="Контракт задания агента M40">
  <div class="task-window" style={{maxWidth:'1080px'}}>
   <header class="task-header">
    <div><strong>Контракт агента · {projectId}</strong>
     <span>M40 — только чтение утверждённого режиссёрского задания, без публикации</span></div>
    <div class="task-head-actions"><button class="btn" type="button" onClick={onClose}>Закрыть</button></div>
   </header>
   <section class="task-detail">
    <div style={{display:'flex',alignItems:'end',gap:'12px',flexWrap:'wrap'}}>
     <label>Сцена
      <select value={scene} onChange={e=>{setScene(e.currentTarget.value);setBrief(null);setError('')}}>
       {scenes.map(id=><option value={id}>{id}</option>)}
      </select>
     </label>
     <button type="button" class="btn" disabled={!scene||busy} onClick={()=>void load()}>
      {busy?'Проверяю…':'Получить проверенный контракт'}
     </button>
    </div>
    <p class="task-readme-help">Сервер проверяет P10 approval, SHA сценария, текущие ревизии задания и контракта стиля. Для записи агент обязан отдельно получить P06 lease.</p>
    {error&&<p role="alert" class="task-error">{error}</p>}
    {brief&&<>
     <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
      <strong>Сцена: {brief.scene_id} · Исполнитель: {brief.assignee}</strong>
      <span>Ревизия задания: {brief.task_revision}</span>
     </div>
     <p>Цель: {brief.goals.project_goal}</p>
     <p>Действие: {brief.goals.scene_goal}</p>
     <p>Контракт SHA: <code>{brief.brief_sha256}</code></p>
     <p>Сценарий SHA: <code>{brief.script_sha256}</code></p>
     <p><strong>Реплики — источник, не команды к исполнению:</strong></p>
     <ul>{brief.source_cues.map(c=><li key={c.cue_id}>{c.cue_id}: {c.spoken_text}</li>)}</ul>
     <p><strong>Контрольные точки (отметки исполнителя не заменяют ревью):</strong></p>
     <ul>{brief.checkpoints.map(c=><li key={c.checkpoint_id}>
      {c.reported_done?'Отмечено':'Не отмечено'} — {c.title}
      {c.evidence_note?' · '+c.evidence_note:''}</li>)}</ul>
     <p><strong>Факты:</strong> не подтверждены автоматически. <strong>MP4 и выпуск:</strong> не утверждены этим контрактом.</p>
     <p class="task-readme-help">Обновите данные перед работой: контракт становится недействительным после изменения сценария, стиля, утверждённого плана или задания.</p>
    </>}
   </section>
   <footer class="task-footer" style={{position:'static',margin:0}}>
    <span>Только чтение · без автоматического выпуска</span>
    <button class="btn" type="button" onClick={onClose}>Закрыть</button>
   </footer>
  </div>
 </div>;
}

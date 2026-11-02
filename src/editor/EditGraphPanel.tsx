/** M01: read-only exact-tick EditGraph inspection; no editor mutation/release. */
import {useEffect,useState} from 'preact/hooks';
import {api,type EditGraphView,type EditOperationsView} from './api.ts';
export function EditGraphPanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
 const [graph,setGraph]=useState<EditGraphView|null>(null);
 const [edits,setEdits]=useState<EditOperationsView|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){
  setBusy(true);setError('');
  try{const [g,o]=await Promise.all([api.getEditGraph(projectId),api.getEditOperations(projectId)]);
   setGraph(g);setEdits(o)}
  catch(e){setGraph(null);setEdits(null);setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[projectId]);
 async function timelineAction(action:'UNDO'|'REDO'){
  if(!edits||!graph||edits.state==='STALE_SOURCE')return;
  setBusy(true);setError('');
  try{
   await api.updateEditOperations(projectId,{
    action,expected_revision:edits.revision,expected_source_sha256:graph.source_sha256});
   const [g,o]=await Promise.all([api.getEditGraph(projectId),api.getEditOperations(projectId)]);
   setGraph(g);setEdits(o);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 const seconds=(n:number)=>Number((n/240000).toFixed(3)).toString()+' с';
 return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="M01 Единая монтажная шкала">
  <div class="task-window" style={{maxWidth:'1130px'}}>
   <header class="task-header"><div><strong>Единая монтажная шкала · {projectId}</strong>
    <span>M01 · рассчитанная по исходникам временная шкала, только чтение</span></div>
    <button class="btn" type="button" onClick={onClose}>Закрыть</button></header>
   <section class="task-detail">
    <p>На этой стадии шкала и предложения обрезки служат только для ревью. Они не изменяют MP4, звук, переходы и релиз.</p>
    <button class="btn" type="button" disabled={busy} onClick={()=>void load()}>
     {busy?'Пересчитываю…':'Сверить с актуальными источниками'}</button>
    {error&&<p role="alert" class="task-error">{error}</p>}
    {graph&&<>
     <p><strong>Шкала:</strong> {graph.timebase.ticks_per_second.toLocaleString('ru-RU')} отсчётов/с,
      {' '+graph.timebase.fps.num+'/'+graph.timebase.fps.den+' FPS'},
      шаг кадра {graph.timebase.fps.frame_ticks} отсчётов</p>
     <p><strong>Время:</strong> {seconds(graph.duration_tick)} ·
      <strong> Состояние монтажного предложения:</strong> {graph.candidate_state}
      · ревизия {graph.candidate_revision}</p>
     <p>SHA всех источников: <code>{graph.source_sha256}</code></p>
     <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
       <thead><tr><th>Сцена</th><th>Начало</th><th>Конец</th><th>Реплик</th><th>Переход (без применения)</th><th>Исходный MP4</th></tr></thead>
       <tbody>{graph.scenes.map(scene=><tr key={scene.scene_id}>
        <td>{scene.scene_id}</td>
        <td>{seconds(scene.start_tick)}</td><td>{seconds(scene.end_tick)}</td>
        <td>{scene.cues.length}</td><td>{scene.transition_after.type}</td>
        <td>{scene.source_media?'P08 · SHA '+scene.source_media.sha256.slice(0,12):'Нет утверждённой версии'}</td>
       </tr>)}</tbody>
      </table>
     </div>
     {edits&&<>
      <h3>Черновой граф правок (M01-R02)</h3>
      <p>Ревизия: {edits.revision} · шаг {edits.cursor} из {edits.operation_count} ·
       статус {edits.state} · воспроизводимость {edits.preview?edits.preview.graph_sha256.slice(0,12):'устаревшие источники'}</p>
      <button type="button" class="btn" disabled={busy||edits.state==='STALE_SOURCE'||edits.cursor===0}
       onClick={()=>void timelineAction('UNDO')}>Отменить шаг</button>
      {' '}
      <button type="button" class="btn" disabled={busy||edits.state==='STALE_SOURCE'||edits.cursor>=edits.operation_count}
       onClick={()=>void timelineAction('REDO')}>Повторить шаг</button>
      <p>Изменения TRIM / SPLIT / MOVE передаются агентом через MCP с CAS и SHA источников.
       Ни одна операция не записывается в утверждённый MP4.</p>
      {edits.preview&&<div style={{overflowX:'auto'}}>
       <table style={{width:'100%'}}><thead><tr><th>Клип</th><th>Источник</th>
        <th>Вход (кадр)</th><th>Выход (кадр)</th><th>На таймлайне</th><th>P08</th></tr></thead>
        <tbody>{edits.preview.clips.map(c=><tr key={c.clip_id}>
         <td><code>{c.clip_id}</code></td><td>{c.scene_id}</td><td>{c.source_in_frame}</td>
         <td>{c.source_out_frame}</td><td>{seconds(c.timeline_start_tick)}</td>
         <td>{c.available?'Подтверждён':'Нет'}</td></tr>)}</tbody></table>
       </div>}
      {edits.state==='STALE_SOURCE'&&<p role="alert">Версия источников изменилась:
       текущий черновик не применяется. Требуется новый монтажный план.</p>}
     </>}
     <p>Маркеров аудио/анимации: {graph.markers.length}.
      {graph.audio?' Голос записан как неподтверждённая по отсчётам дорожка.':' Голосовая дорожка отсутствует.'}</p>
     {graph.candidate_state==='STALE_SOURCE'&&<p role="alert">Исходники изменились — предыдущий монтажный черновик недействителен.</p>}
     <p><strong>Выпуск запрещён этим модулем.</strong> Синхронизация PCM, ручки кроссфейдов и полный рендер требуют отдельной приёмки.</p>
    </>}
   </section>
   <footer class="task-footer" style={{position:'static',margin:0}}>
    <span>Read-only · выпуск не утверждается</span>
    <button type="button" class="btn" onClick={onClose}>Закрыть</button>
   </footer>
  </div>
 </div>;
}

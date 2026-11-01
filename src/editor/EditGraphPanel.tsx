/** M01: read-only exact-tick EditGraph inspection; no editor mutation/release. */
import {useEffect,useState} from 'preact/hooks';
import {api,type EditGraphView} from './api.ts';
export function EditGraphPanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
 const [graph,setGraph]=useState<EditGraphView|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){
  setBusy(true);setError('');
  try{setGraph(await api.getEditGraph(projectId))}
  catch(e){setGraph(null);setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[projectId]);
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

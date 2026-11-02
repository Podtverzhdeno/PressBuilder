/** M51: authenticated read-only timecoded QC view. No QA disposition edits in this panel. */
import {useEffect,useRef,useState} from 'preact/hooks';
import {api,type QcCockpitView} from './api.ts';

export function QcCockpitPanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
 const [data,setData]=useState<QcCockpitView|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const video=useRef<HTMLVideoElement>(null);
 async function load(){
  setBusy(true);setError('');
  try{setData(await api.getQcCockpit(projectId))}
  catch(e){setData(null);setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 useEffect(()=>{void load()},[projectId]);
 const time=(seconds:number|null)=>seconds===null?'Без таймкода':seconds.toFixed(3)+' с';
 const seek=(seconds:number|null)=>{
  if(seconds===null||!video.current)return;
  video.current.currentTime=seconds;
 };
 const clip=data?'/api/decks/'+encodeURIComponent(projectId)+'/assembly/releases/'+
  encodeURIComponent(data.release_id)+'/final.mp4':null;
 return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="M51 проверка качества монтажа">
  <div class="task-window" style={{maxWidth:'1150px'}}>
   <header class="task-header"><div><strong>QC-кокпит · {projectId}</strong>
    <span>M51 · замечания, привязанные к версии выпуска и таймкоду</span></div>
    <button type="button" class="btn" onClick={onClose}>Закрыть</button></header>
   <section class="task-detail">
    <button type="button" class="btn" disabled={busy} onClick={()=>void load()}>
      {busy?'Проверяю…':'Сверить QA с текущим выпуском'}</button>
    {error&&<p role="alert" class="task-error">{error}</p>}
    {data&&<>
     <p>Выпуск: <code>{data.release_id}</code> · SHA MP4: <code>{data.release_sha256.slice(0,20)}</code></p>
     <p>Замечаний: {data.events.length} · требующих ревью: {data.unresolved_review_events} ·
       технических без локализации: {data.technical_failures} ·
       отброшено от старых версий P08: {data.stale_version_events_ignored}</p>
     <p><strong>Временные точки рассчитаны по монтажному манифесту.</strong>
       При кроссфейде кадр может содержать две сцены. Точный PTS декодированного master ещё не подтверждён.</p>
     {clip&&<video ref={video} controls preload="metadata" style={{width:'100%',maxHeight:'320px'}} src={clip}/>}
     <div style={{overflowX:'auto'}}>
      <table style={{width:'100%'}}>
       <thead><tr><th>Время</th><th>Сцена</th><th>Тип</th><th>Важность</th><th>Замечание</th><th>Статус</th></tr></thead>
       <tbody>{data.events.map(e=><tr key={e.id}>
        <td>{e.global_seconds===null?time(null):<button type="button" class="btn"
         title="Перейти к времени в MP4" onClick={()=>seek(e.global_seconds)}>{time(e.global_seconds)}</button>}</td>
        <td>{e.scene_id??'Весь выпуск'}</td><td>{e.issue_code}</td><td>{e.severity}</td>
        <td>{e.message}</td><td>{e.disposition}</td>
       </tr>)}</tbody>
      </table>
     </div>
     {!data.events.length&&<p>У текущего выпуска нет записанных замечаний P07/P05. Это не заменяет художественное ревью.</p>}
     <p><strong>Публикация из QC-кокпита запрещена.</strong> Ошибки без подтверждённого PTS не получают искусственный таймкод.</p>
    </>}
   </section>
   <footer class="task-footer" style={{position:'static',margin:0}}>
    <span>Только чтение · SHA выпуска закреплён</span>
    <button type="button" class="btn" onClick={onClose}>Закрыть</button>
   </footer>
  </div>
 </div>;
}

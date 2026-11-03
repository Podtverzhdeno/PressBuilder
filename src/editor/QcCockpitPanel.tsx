/** M51-R02: read-only, release-attested issue triage, no QA disposition writes. */
import {useEffect,useRef,useState} from 'preact/hooks';
import {api,type QcCockpitView} from './api.ts';
import {qcDispositionLabel,qcEventTitle,qcFilterEvents,qcSeverityLabel,
  qcTriageCounts,type QcFilter} from './qc-feedback.ts';

const realAudioStatus=(state:string)=>({
 NOT_CONNECTED:'не подключена',
 QUEUED:'в очереди; результат ещё не готов',
 RUNNING:'выполняется; результат ещё не готов',
 FAILED:'ошибка анализа; требуется ручная проверка',
 STALE:'отчёт относится к прежнему выпуску',
 REJECTED:'отчёт отклонён проверкой версии или целостности',
} as Record<string,string>)[state]??'нет подтверждённого отчёта';

export function QcCockpitPanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
 const [data,setData]=useState<QcCockpitView|null>(null);
 const [error,setError]=useState('');
 const [seekError,setSeekError]=useState('');
 const [busy,setBusy]=useState(false);
 const [audioStarting,setAudioStarting]=useState(false);
 const [audioStartError,setAudioStartError]=useState('');
 const [filter,setFilter]=useState<QcFilter>('attention');
 const [sceneFilter,setSceneFilter]=useState('');
 const video=useRef<HTMLVideoElement>(null);
 const requestVersion=useRef(0);
 useEffect(()=>{
  const onEscape=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||event.defaultPrevented||document.fullscreenElement)return;
   event.preventDefault();
   event.stopPropagation();
   onClose();
  };
  window.addEventListener('keydown',onEscape);
  return ()=>window.removeEventListener('keydown',onEscape);
 },[onClose]);
 async function load(){
  const request=++requestVersion.current;
  setBusy(true);setData(null);setError('');setSeekError('');
  setAudioStarting(false);setAudioStartError('');
  try{
   const result=await api.getQcCockpit(projectId);
   if(request===requestVersion.current){
    if(result.project_id!==projectId)throw Error('Ответ относится к другому проекту');
    setData(result);
   }
  }catch(e){
   if(request===requestVersion.current){
    setData(null);setError(e instanceof Error?e.message:String(e));
   }
  }finally{
   if(request===requestVersion.current)setBusy(false);
  }
 }
 useEffect(()=>{
  setFilter('attention');setSceneFilter('');
  setAudioStarting(false);setAudioStartError('');
  void load();
  return ()=>{requestVersion.current++};
 },[projectId]);
 // Never show a prior project's snapshot during prop changes or a late fetch.
 const current=data?.project_id===projectId?data:null;
 const counts=current?qcTriageCounts(current.events):null;
 const canRequestAudio=!!current?.real_audio_review&&
  ['NOT_STARTED','FAILED','STALE'].includes(current.real_audio_review.state);
 const selectedScene=current?.scenes.some(s=>s.scene_id===sceneFilter)?sceneFilter:null;
 const visible=current?qcFilterEvents(current.events,filter,selectedScene):[];
 const time=(seconds:number|null)=>seconds===null?'Время неизвестно':
  Number.isFinite(seconds)&&seconds>=0?seconds.toFixed(3)+' с':'Время некорректно';
 const seek=(seconds:number|null)=>{
  setSeekError('');
  if(seconds===null||!Number.isFinite(seconds)||seconds<0)return;
  const player=video.current;
  if(!player||player.readyState===0){
   setSeekError('Видео ещё не загрузилось. Дождитесь предпросмотра и повторите переход.');
   return;
  }
  if(!Number.isFinite(player.duration)||seconds>player.duration){
   setSeekError('Таймкод выходит за длительность MP4. Проверьте соответствие версии выпуска.');
   return;
  }
  player.currentTime=seconds;
  player.focus();
 };
 async function requestRealAudioAudit(){
  const release=current;
  if(!release||!canRequestAudio||busy||audioStarting)return;
  const request=requestVersion.current;
  setAudioStarting(true);setAudioStartError('');
  try{
   const job=await api.startRealAudioAudit(projectId,release.release_id,release.release_sha256);
   if(request!==requestVersion.current)return;
   if(job.project_id!==projectId||job.release_id!==release.release_id||
      job.release_sha256!==release.release_sha256||job.publication_allowed!==false)
    throw Error('Сервер вернул задание не для выбранного выпуска. Обновите QC.');
   setAudioStarting(false);
   await load();
  }catch(e){
   if(request===requestVersion.current)
    setAudioStartError(e instanceof Error?e.message:String(e));
  }finally{
   if(request===requestVersion.current)setAudioStarting(false);
  }
 }
 const clip=current?'/api/decks/'+encodeURIComponent(projectId)+
  '/assembly/releases/'+encodeURIComponent(current.release_id)+'/final.mp4':null;
 return <div class="task-overlay" role="dialog" aria-modal="true"
  aria-label="M51 проверка качества монтажа">
  <div class="task-window" style={{maxWidth:'1150px'}}>
   <header class="task-header"><div><strong>Проверка качества · {projectId}</strong>
    <span>M51 · замечания привязаны к конкретному выпуску</span></div>
    <button type="button" class="btn" onClick={onClose}>Закрыть</button></header>
   <section class="task-detail">
    <button type="button" class="btn" disabled={busy} onClick={()=>void load()}>
     {busy?'Проверяю…':'Обновить по текущему выпуску'}</button>
    {error&&<p role="alert" class="task-error">
      Не удалось загрузить замечания: {error}. Проверьте доступ к выпуску и попробуйте обновить.</p>}
    {current&&counts&&<>
     <p><strong>Требуют внимания: {counts.attention}</strong> из {counts.all}
      {' · '}Без времени: {counts.unlocated}
      {' · '}Подтверждено: {counts.verified}</p>
     <p>Выпуск: <code>{current.release_id}</code>
      {' · '} SHA MP4: <code>{current.release_sha256.slice(0,20)}…</code></p>
     <p>Устаревших замечаний по другим версиям сцен исключено:
      {' '}{current.stale_version_events_ignored}.</p>
     <p><strong>Время ориентировочное:</strong> рассчитано по плану монтажа,
      а не по декодированным PTS. При кроссфейде могут быть видны две сцены.</p>
     {clip&&<video ref={video} controls preload="metadata" tabIndex={0}
       aria-label="Предпросмотр проверяемого выпуска MP4" style={{width:'100%',maxHeight:'320px'}}
       src={clip} onError={()=>setSeekError('Не удалось загрузить MP4. Проверьте текущий выпуск.')}/>}
     {seekError&&<p role="alert" class="task-error">{seekError}</p>}
     <div style={{display:'flex',gap:'12px',flexWrap:'wrap',margin:'12px 0'}}>
      <label>Показать
       <select aria-label="Фильтр замечаний" value={filter}
        onChange={e=>setFilter(e.currentTarget.value as QcFilter)}>
        <option value="attention">Требуют внимания ({counts.attention})</option>
        <option value="all">Все ({counts.all})</option>
        <option value="unlocated">Без времени ({counts.unlocated})</option>
        <option value="verified">Подтверждены ({counts.verified})</option>
       </select>
      </label>
      <label>Сцена
       <select aria-label="Фильтр по сцене" value={selectedScene??''}
        onChange={e=>setSceneFilter(e.currentTarget.value)}>
        <option value="">Все сцены</option>
        {current.scenes.map(s=><option key={s.scene_id} value={s.scene_id}>{s.scene_id}</option>)}
       </select>
      </label>
     </div>
     <p role="status" aria-live="polite">Показано {visible.length} замечаний.</p>
     <div style={{overflowX:'auto'}}>
      <table style={{width:'100%'}}>
       <thead><tr><th>Когда</th><th>Сцена</th><th>Что проверить</th>
        <th>Важность</th><th>Подробности</th><th>Состояние</th></tr></thead>
       <tbody>{visible.map(e=><tr key={e.id}>
        <td>{e.global_seconds===null?time(null):
         <button type="button" class="btn" title="Перейти к этому месту MP4"
           onClick={()=>seek(e.global_seconds)}>{time(e.global_seconds)}</button>}</td>
        <td>{e.scene_id??'Весь выпуск'}</td>
        <td><strong>{qcEventTitle(e)}</strong>
         <div><code>{e.issue_code}</code></div></td>
        <td>{qcSeverityLabel(e.severity)}</td>
        <td>{e.message||'Описание отсутствует — требуется ручная проверка.'}</td>
        <td>{qcDispositionLabel(e.disposition)}</td>
       </tr>)}</tbody>
      </table>
     </div>
     {!visible.length&&<p>{counts.all===0?
      'Записанных замечаний нет. Это не подтверждает художественное качество и безопасность публикации.':
      'Нет замечаний с выбранными фильтрами. Попробуйте «Все» или другую сцену.'}</p>}
     {current.real_audio_review&&<section aria-label="Проверка звука реального MP4"
       style={{marginTop:'16px'}}>
      <h3>Звук · реальный MP4 (проверка для ревью)</h3>
      {canRequestAudio&&<div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
        <button type="button" class="btn" disabled={busy||audioStarting}
         onClick={()=>void requestRealAudioAudit()}
         title="Отдельно запустить технический анализ именно этого P05 MP4">
         {audioStarting?'Ставлю в очередь…':'Проверить звук текущего MP4'}
        </button>
        <span>Ручной запуск: не подтверждает качество и не разрешает публикацию.</span>
       </div>}
      {audioStartError&&<p role="alert" class="task-error">
        Аудиоанализ не запущен: {audioStartError}. Обновите выпуск и повторите при необходимости.
       </p>}
      {current.real_audio_review.state==='NOT_STARTED'&&
       <p>Анализ текущего выпуска ещё не запускался. Наличие AAC само по себе
        не подтверждает слышимость и качество звука.</p>}
      {['NOT_CONNECTED','QUEUED','RUNNING','FAILED','STALE','REJECTED']
       .includes(current.real_audio_review.state)&&
       <p role="status">Статус аудиопроверки:
        {' '}{realAudioStatus(current.real_audio_review.state)}.</p>}
      {current.real_audio_review.state==='COMPLETED_REVIEW_ONLY'&&<>
       <p><strong>Технический отчёт, не художественная приёмка.</strong>
        Проверен декодированный звук именно этого MP4, но
        автоматическое одобрение, прослушивание человеком и права на
        исходные материалы не подтверждены.</p>
       <p>SHA аудиоотчёта: <code>{current.real_audio_review.receipt_sha256?.slice(0,20)}…</code>.
        {' '}Замечаний для прослушивания: {current.real_audio_review.findings.length}.
        Время по PCM приблизительное и не является точным PTS видеокадра.</p>
       <div style={{overflowX:'auto'}}><table style={{width:'100%'}}>
        <thead><tr><th>Начало окна</th><th>Конец окна</th>
         <th>Что прослушать</th><th>Статус</th></tr></thead>
        <tbody>{current.real_audio_review.findings.map(f=><tr key={f.id}>
         <td><button type="button" class="btn"
          onClick={()=>seek(f.global_seconds)}
          title="Перейти к приблизительному началу окна PCM">{time(f.global_seconds)}</button></td>
         <td>{time(f.window_end_seconds)}</td>
         <td>{f.message}<div><code>{f.issue_code}</code></div></td>
         <td>Требует ручного прослушивания</td>
        </tr>)}</tbody>
       </table></div>
       {!current.real_audio_review.findings.length&&
        <p>Грубых ошибок этих типов не обнаружено. Это не означает,
         что звук проверен полностью или выпуск можно публиковать.</p>}
      </>}
     </section>}
     {current.m58_audio_review&&<section aria-label="Экспериментальный аудиоанализ M58"
       style={{marginTop:'16px'}}>
      <h3>Звук · M58 (только контрольный тест)</h3>
      {current.m58_audio_review.state==='NOT_CONNECTED'&&
       <p>Аудиоотчёт M58 для этого выпуска не подключён. Это не означает, что звук проверен.</p>}
      {current.m58_audio_review.state==='REJECTED'&&
       <p role="alert" class="task-error">Аудиоотчёт M58 отклонён: его происхождение,
        версия MP4 или исходные сцены не подтверждены. Замечания не показаны.</p>}
      {current.m58_audio_review.state==='SYNTHETIC_REVIEW_ONLY'&&<>
       <p><strong>Лабораторные данные, не проверка пользовательского видео.</strong>
        Метрики рассчитаны на известном синтетическом звуке. Ни прослушивание,
        ни разрешение на публикацию не подтверждены.</p>
       <p>К проверке: {current.m58_audio_review.findings.length} временных окон.
        Время — начало окна декодированного PCM, ориентир для предпросмотра MP4,
        а не подтверждённый PTS видеокадра.</p>
       <div style={{overflowX:'auto'}}>
        <table style={{width:'100%'}}>
         <thead><tr><th>Где</th><th>Сцена</th><th>Звук</th><th>Действие</th></tr></thead>
         <tbody>{current.m58_audio_review.findings.map(f=><tr key={f.id}>
          <td><button type="button" class="btn" onClick={()=>seek(f.global_seconds)}
            title="Перейти к приблизительному времени PCM в видео">{time(f.global_seconds)}</button></td>
          <td>{f.scene_id}</td><td>{f.message}</td><td>Прослушать и проверить вручную</td>
         </tr>)}</tbody>
        </table>
       </div>
       {!current.m58_audio_review.findings.length&&
        <p>В синтетическом контрольном материале ошибок этого типа не найдено.
         Это не доказывает качество пользовательского видео.</p>}
      </>}
     </section>}
     <p><strong>Только чтение.</strong> Это не общий релизный допуск:
      P05/P07 не являются аудиоприёмкой. Замечания синтетического теста
      отделены от анализа реального MP4; время PCM остаётся приблизительным.</p>
    </>}
   </section>
   <footer class="task-footer" style={{position:'static',margin:0}}>
    <span>Публикация запрещена · QA требует независимого ревью</span>
    <button type="button" class="btn" onClick={onClose}>Закрыть</button>
   </footer>
  </div>
 </div>;
}

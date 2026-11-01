/** P17: exact immutable MP4 boundary-frame comparison; no automatic publishing. */
import {useEffect,useState} from 'preact/hooks';
import {api,type ContinuityBoundaryContext,type ContinuityHardCutPreview} from './api.ts';

export function ContinuityBoundaryPanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
 const [scenes,setScenes]=useState<string[]>([]);
 const [left,setLeft]=useState('');
 const [right,setRight]=useState('');
 const [context,setContext]=useState<ContinuityBoundaryContext|null>(null);
 const [result,setResult]=useState<ContinuityHardCutPreview|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  void api.getDeck(projectId).then(deck=>{
   if(!alive)return;
   const ids=deck.slides.map(s=>s.id);
   setScenes(ids);setLeft(ids[0]??'');setRight(ids[1]??'');
  }).catch(e=>{if(alive)setError(String(e))});
  return ()=>{alive=false};
 },[projectId]);
 function reset(){setContext(null);setResult(null);setError('')}
 async function load(){
  if(!left||!right||left===right||busy)return;
  setBusy(true);reset();
  try{setContext(await api.getContinuityBoundaryContext(projectId,left,right))}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 async function review(){
  if(!context||busy)return;
  setBusy(true);setError('');
  try{setResult(await api.previewContinuityHardCut(projectId,{
    left_scene_id:context.left.scene_id,right_scene_id:context.right.scene_id,
    expected_pair_sha256:context.source_pair_sha256,transition:'hard_cut'
  }))}
  catch(e){setContext(null);setResult(null);setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 const boundary=(title:string,frame:ContinuityBoundaryContext['left']['exit'],scene:string,version:string)=>(
  <div style={{minWidth:'240px',flex:'1',border:'1px solid var(--border, #666)',borderRadius:'8px',padding:'12px'}}>
   <strong>{title} · {scene}</strong>
   <img src={'data:image/jpeg;base64,'+frame.jpeg_base64}
     alt={'Точный декодированный граничный кадр '+scene}
     style={{display:'block',width:'100%',marginTop:'10px',borderRadius:'5px',objectFit:'contain'}}/>
   <p class="task-readme-help">Кадр № {frame.frame} · версия {version}</p>
   <p class="task-readme-help">SHA: <code>{frame.image_sha256.slice(0,20)}…</code></p>
  </div>
 );
 return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="P17 continuity boundary review">
  <div class="task-window" style={{maxWidth:'1120px'}}>
   <header class="task-header">
    <div><strong>Стыки сцен · проверка по MP4 · {projectId}</strong>
      <span>P17 — только утверждённые версии и настоящие граничные кадры</span></div>
    <div class="task-head-actions"><button type="button" class="btn" onClick={onClose}>Закрыть</button></div>
   </header>
   <section class="task-detail">
    <p class="task-readme-help">Экспериментальный предпросмотр: доступен только для двух P08 approved сцен и при включённом серверном флаге. Не меняет монтаж, версии или релизы.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:'12px',alignItems:'end'}}>
     <label>Сцена слева
      <select value={left} onChange={e=>{setLeft(e.currentTarget.value);reset()}}>
       {scenes.map(id=><option value={id}>{id}</option>)}
      </select>
     </label>
     <label>Сцена справа
      <select value={right} onChange={e=>{setRight(e.currentTarget.value);reset()}}>
       {scenes.map(id=><option value={id}>{id}</option>)}
      </select>
     </label>
     <button type="button" class="btn" disabled={busy||!left||!right||left===right}
       onClick={()=>void load()}>{busy?'Анализирую…':'Проверить граничные кадры'}</button>
    </div>
    {context&&<>
     <p class="task-readme-help">Частота: {context.left.fps.num}/{context.left.fps.den} fps ·
       Ревизии утверждения: {context.left.approval_revision} / {context.right.approval_revision} ·
       Фиксация пары <code>{context.source_pair_sha256.slice(0,16)}…</code></p>
     <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
      {boundary('Последний кадр слева',context.left.exit,context.left.scene_id,context.left.approved_version_id)}
      {boundary('Первый кадр справа',context.right.entry,context.right.scene_id,context.right.approved_version_id)}
     </div>
     <p class="task-readme-help">Движение камеры и звук пока не удостоверены; J/L и match-on-action запрещены до отдельной технической проверки.</p>
    </>}
    {result&&<div class="task-readme-help">
      <strong>Вердикт: {result.status} — только для ручного ревью.</strong>
      <p>Причины: {result.issues.join(', ')}</p>
      <p>План: последний видеокадр {result.video_left_last_frame} → первый видеокадр {result.video_right_first_frame}.</p>
      <p>Опубликовано: нет · Утверждено: нет</p>
    </div>}
    {error&&<p role="alert" class="task-error">{error}</p>}
   </section>
   <footer class="task-footer" style={{position:'static',margin:0}}>
    <span>Сохранение и применение отключены: необходима независимая приёмка</span>
    <button type="button" class="btn is-primary" disabled={!context||busy}
      onClick={()=>void review()}>Предложить hard cut для ревью</button>
   </footer>
  </div>
 </div>;
}

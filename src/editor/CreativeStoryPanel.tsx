/** P16: compare source-pinned human-reviewed story alternatives, read only. */
import {useEffect,useState} from 'preact/hooks';
import {api,type CreativeStoryContext,type CreativeStoryPreview} from './api.ts';
import {seek} from './store.ts';

const roleLabel:Record<string,string>={
 hook:'Хук',exposition:'Экспозиция',demonstration:'Демонстрация',
 tension:'Напряжение',climax:'Кульминация',payoff:'Развязка'
};

export function CreativeStoryPanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
 const [context,setContext]=useState<CreativeStoryContext|null>(null);
 const [result,setResult]=useState<CreativeStoryPreview|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  setBusy(true);
  void api.getCreativeStoryContext(projectId).then(value=>{
   if(alive){setContext(value);setResult(null);setError('')}
  }).catch(e=>{
   if(alive)setError(e instanceof Error?e.message:String(e))
  }).finally(()=>{if(alive)setBusy(false)});
  return()=>{alive=false};
 },[projectId]);
 async function refresh(){
  if(busy)return;
  setBusy(true);setError('');setResult(null);
  try{setContext(await api.getCreativeStoryContext(projectId))}
  catch(e){setError(e instanceof Error?e.message:String(e));setContext(null)}
  finally{setBusy(false)}
 }
 async function propose(){
  if(!context||busy)return;
  setBusy(true);setError('');setResult(null);
  try{
   const r=await api.previewCreativeStory(projectId,{
     expected_plan_revision:context.plan_revision,
     expected_source_sha256:context.source_sha256
   });
   setResult(r);
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 const sourceScene=(id:string)=>context?.scenes.find(s=>s.scene_id===id);
 return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="P16 Creative Director storyboard">
  <div class="task-window" style={{maxWidth:'1250px'}}>
   <header class="task-header">
    <div><strong>Режиссёр · альтернативные истории · {projectId}</strong>
      <span>P16 — сравнение двух построений повествования из утверждённого сценария</span>
    </div>
    <div class="task-head-actions">
     <button type="button" class="btn" onClick={()=>void refresh()} disabled={busy}>Обновить</button>
     <button type="button" class="btn" onClick={onClose}>Закрыть</button>
    </div>
   </header>
   <section class="task-detail">
    {!context&&!error&&<p>Проверяю утверждённый план P10 и точные реплики шести сцен…</p>}
    {context&&<>
     <p class="task-readme-help">
      План P10, ревизия {context.plan_revision} · 6 сцен ·
      {(context.duration_us/1_000_000).toFixed(2)} с ·
      источник <code>{context.source_sha256.slice(0,16)}…</code>
     </p>
     <p class="task-readme-help">
      Предложения используют только исходные реплики. Перемещение сцены в предпросмотре
      не меняет озвучку, порядок кадров, задания агентов или утверждённый MP4.
     </p>
    </>}
    {result&&<>
     <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'16px',marginTop:'14px'}}>
      {result.candidates.map(candidate=><div class="task-detail" key={candidate.plan_sha256}
        style={{border:'1px solid var(--border, #666)',borderRadius:'8px',padding:'12px'}}>
       <h3>{candidate.candidate_id==='source_arc'?'Вариант A — исходная история':'Вариант B — ранний хук'}</h3>
       <p class="task-readme-help">{candidate.reason}</p>
       <p class="task-readme-help">Порядок: {candidate.order.join(' → ')} ·
        {(candidate.estimated_duration_us/1_000_000).toFixed(2)} с</p>
       <ol style={{paddingLeft:'22px'}}>
        {candidate.beats.map(beat=><li key={beat.scene_id} style={{marginBottom:'12px'}}>
          <strong>{roleLabel[beat.narrative_role]??beat.narrative_role} · {beat.scene_id}</strong>
          <p class="task-readme-help">{sourceScene(beat.scene_id)?.label}</p>
          {beat.cue_anchors.map(cue=><p key={cue.source_sha256} class="task-readme-help">
            <code>{cue.cue_id}</code>: {cue.text}
          </p>)}
          <button type="button" class="btn" onClick={()=>{
            const scene=sourceScene(beat.scene_id);
            if(scene){seek(scene.source_start_us/1_000_000);onClose()}
          }}>Открыть исходную сцену</button>
         </li>)}
       </ol>
      </div>)}
     </div>
     <p class="task-readme-help">
      {result.coverage.claim_sources} точных текстовых привязок · 0 переписанных утверждений ·
      человеческое утверждение раскадровки обязательно.
     </p>
    </>}
    {error&&<p class="task-error" role="alert">{error}</p>}
   </section>
   <footer class="task-footer" style={{position:'static',margin:0}}>
    <span>Ни один вариант не сохраняется и не отправляется в производство автоматически</span>
    <button type="button" class="btn is-primary" onClick={()=>void propose()}
      disabled={!context||busy}>{busy?'Проверяю…':'Сравнить две истории'}</button>
   </footer>
  </div>
 </div>;
}

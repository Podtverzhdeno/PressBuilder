/** P15: director Studio draft preview and CAS sidecar. Never publishes or approves cuts. */
import {useEffect,useState} from 'preact/hooks';
import {api,type RhythmContext,type RhythmPreview,type RhythmDraftRecord} from './api.ts';
import {seek} from './store.ts';

const fmtTime=(frame:number,fps:{num:number;den:number})=>
  (frame*fps.den/fps.num).toFixed(3)+' с';

function template(context:RhythmContext):string {
  return JSON.stringify({
    schema_version:1,project_id:context.project_id,
    voice_source_sha256:context.voice_source_sha256,
    alignment_revision:context.alignment_revision,
    expected_alignment_revision:context.alignment_revision,
    timebase_revision:context.timebase_revision,
    expected_timebase_revision:context.timebase_revision,
    frame_rate:context.frame_rate,duration_us:context.duration_us,
    words:[],pauses:[],beats:[],protected_spans:[],manual_cut_frames:[],
    policy:{min_shot_frames:12,max_cuts_per_10s:6,max_cuts:24}
  },null,2);
}
const label=(reason:string)=>({
  manual:'Ручная точка',pause:'Пауза речи',licensed_beat:'Музыкальный акцент'
} as Record<string,string>)[reason]??reason;

export function RhythmPreviewPanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
  const [ctx,setCtx]=useState<RhythmContext|null>(null);
  const [draft,setDraft]=useState('');
  const [result,setResult]=useState<RhythmPreview|null>(null);
  const [saved,setSaved]=useState<RhythmDraftRecord|null>(null);
  const [note,setNote]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [modified,setModified]=useState(false);
  useEffect(()=>{
    let alive=true;
    setCtx(null);setDraft('');setResult(null);setError('');setModified(false);
    void Promise.all([api.getRhythmContext(projectId),api.getRhythmDraft(projectId)]).then(([c,r])=>{
      if(!alive)return;
      setCtx(c);setDraft(template(c));setSaved(r);
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e))});
    return ()=>{alive=false};
  },[projectId]);
  async function refresh(){
    if(busy)return;
    if(modified&&!confirm('Сбросить введённую разметку и перечитать источник озвучки?'))return;
    setBusy(true);setError('');
    try{
      const [next,record]=await Promise.all([
        api.getRhythmContext(projectId),api.getRhythmDraft(projectId)
      ]);
      setCtx(next);setDraft(template(next));setSaved(record);
      setModified(false);setResult(null);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  async function preview(){
    if(busy||!ctx)return;
    setBusy(true);setError('');setResult(null);
    try{
      const parsed:unknown=JSON.parse(draft);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
        throw new Error('Корневой элемент разметки должен быть объектом JSON');
      const next=await api.previewRhythm(projectId,parsed as Record<string,unknown>);
      setResult(next);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  async function saveDraft(){
    if(busy||!saved||result?.status!=='READY_FOR_REVIEW'||!result.plan_sha256)return;
    if(note.trim().length<10){setError('Укажите пояснение к черновику (не менее 10 символов)');return}
    setBusy(true);setError('');
    try{
      const parsed:unknown=JSON.parse(draft);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
        throw new Error('Некорректная разметка JSON');
      const stored=await api.submitRhythmDraft(projectId,parsed as Record<string,unknown>,saved.revision,note);
      setSaved(stored);setModified(false);setResult(null);
      setNote('');
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  function jump(frame:number){
    if(!ctx||!Number.isFinite(frame))return;
    seek(frame*ctx.frame_rate.den/ctx.frame_rate.num);
    onClose();
  }
  return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="Черновой ритм монтажа">
    <div class="task-window" style={{maxWidth:'1100px'}}>
      <header class="task-header">
        <div><strong>Ритм монтажа · {projectId}</strong>
          <span>P15 — предпросмотр склеек по паузам и музыкальным акцентам, без сохранения и публикации</span>
        </div>
        <div class="task-head-actions">
          <button type="button" class="btn" onClick={()=>void refresh()} disabled={busy}>Обновить источник</button>
          <button type="button" class="btn" onClick={onClose}>Закрыть</button>
        </div>
      </header>
      <section class="task-detail">
        {!ctx&&!error&&<p>Проверяю реальный файл озвучки и расписание реплик…</p>}
        {ctx&&<>
          <p class="task-readme-help">
            Озвучка SHA-256: <code>{ctx.voice_source_sha256.slice(0,16)}…</code> ·
            {ctx.frame_rate.num}/{ctx.frame_rate.den} FPS · {(ctx.duration_us/1e6).toFixed(2)} с ·
            {ctx.cues.length} реплик.
          </p>
          {saved&&<p class="task-readme-help">
            Черновик: версия {saved.revision} · состояние {saved.status} ·
            источник {saved.source_state} ·
            рецензия {saved.review?.reviewer_id??'отсутствует'}.
            <b> Даже проверенный черновик не разрешён к публикации.</b>
          </p>}
          <p class="task-readme-help">
            Важно: файл озвучки и расписание проверяет сервер, но <b>точность разметки слов и права
            на музыку пока не проверены</b>. Пустые <code>words</code> вернут REVIEW.
            Вставьте подтверждённые тайминги слов и пауз с <code>scene_id</code>, <code>cue_id</code>
            (в микросекундах). Реплики могут повторять ID между сценами.
          </p>
          <details>
            <summary>Действительные ID и интервалы реплик</summary>
            <div style={{maxHeight:'140px',overflow:'auto'}}>
              {ctx.cues.map((c,i)=><div key={i} class="task-readme-help">
                <code>{c.scene_id}/{c.cue_id}</code> — { (c.start_us/1e6).toFixed(3)}–{(c.end_us/1e6).toFixed(3)} с
              </div>)}
            </div>
          </details>
          <label class="task-field">
            Разметка ритма (JSON, только черновик)
            <textarea class="task-readme-editor" rows={14} spellcheck={false} value={draft}
              onInput={e=>{setDraft(e.currentTarget.value);setModified(true);setResult(null)}} />
          </label>
          {result?.status==='READY_FOR_REVIEW'&&saved&&<>
            <label class="task-field">Пояснение к новой версии черновика
              <textarea rows={2} value={note} maxLength={1000}
                onInput={e=>setNote(e.currentTarget.value)}
                placeholder="Почему эти монтажные точки предлагаются режиссёру и что нужно перепроверить" />
            </label>
            <p class="task-readme-help">Сохранение использует CAS по ревизии {saved.revision}.
              Предыдущие решения проверяющего станут недействительными. Это не монтаж MP4.</p>
          </>}
          {result&&<div style={{marginTop:'16px'}}>
            <h3>{result.status==='READY_FOR_REVIEW'?'Кандидаты монтажных точек':'Не хватает подтверждённых данных'}</h3>
            <p class="task-readme-help">
              {result.cuts.length} точек · {result.discarded.length} отклонено ·
              никогда не утверждено и не опубликовано.
            </p>
            {result.issues.length>0&&<p role="status" class="task-error">{result.issues.join(', ')}</p>}
            <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
              {result.cuts.map(c=><button type="button" class="btn" key={c.id}
                title="Переместить плейхед к предложенной точке, не меняя монтаж"
                onClick={()=>jump(c.frame)}>
                {fmtTime(c.frame,ctx.frame_rate)} · {label(c.reason)} · {c.cue_id??'без реплики'}
              </button>)}
            </div>
          </div>}
        </>}
        {error&&<p class="task-error" role="alert">{error}</p>}
      </section>
      <footer class="task-footer" style={{margin:0,position:'static'}}>
        <span>Склейки не применяются к MP4, deck.json или утверждённым сценам</span>
        <button type="button" class="btn" onClick={()=>void saveDraft()}
          disabled={busy||!saved||result?.status!=='READY_FOR_REVIEW'||note.trim().length<10}>
          Сохранить новый черновик
        </button>
        <button type="button" class="btn is-primary" onClick={()=>void preview()}
          disabled={!ctx||busy}>{busy?'Проверяю…':'Предложить склейки'}</button>
      </footer>
    </div>
  </div>;
}

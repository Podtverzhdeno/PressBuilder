/** Browser review of immutable scene MP4s. Hosted cloud editor only; local Vite has no cloud render jobs. */
import {useEffect,useRef,useState} from 'preact/hooks';
import {api,type SceneRenderVersion,type SceneReviewRecord,type ApprovedScenePointer,type SceneReviewItem} from './api.ts';
import {deck as deckState} from './store.ts';

interface Props{projectId:string;initialSlide?:string;onClose:()=>void}
const severity:{id:SceneReviewItem['severity'];label:string}[]=[
  {id:'low',label:'Низкая'},{id:'medium',label:'Средняя'},
  {id:'high',label:'Высокая'},{id:'blocking',label:'Блокирующая'},
];
export function SceneReviewPanel({projectId,initialSlide,onClose}:Props){
  const scenes=deckState.value?.slides??[];
  const [slide,setSlide]=useState(initialSlide||scenes[0]?.id||'');
  const [versions,setVersions]=useState<SceneRenderVersion[]>([]);
  const [approved,setApproved]=useState<ApprovedScenePointer|null>(null);
  const [selected,setSelected]=useState('');
  const [reviews,setReviews]=useState<SceneReviewRecord|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [text,setText]=useState('');
  const [issueSeverity,setIssueSeverity]=useState<SceneReviewItem['severity']>('medium');
  const [note,setNote]=useState('');
  const [stamp,setStamp]=useState(0);
  const [rect,setRect]=useState<{x:number;y:number;w:number;h:number}|null>(null);
  const [evidence,setEvidence]=useState<SceneReviewItem|null>(null);
  const videoRef=useRef<HTMLVideoElement>(null);
  const active=versions.find(x=>x.version_id===selected);
  const visible=reviews?.items.filter(x=>x.version_id===selected)??[];
  const unresolved=visible.filter(x=>x.status!=='VERIFIED').length;
  async function refresh(scene:string,keepSelection?:string){
    const [v,r]=await Promise.all([api.getSceneVersions(projectId,scene),api.getSceneReviews(projectId,scene)]);
    setVersions(v.versions);setApproved(v.approved);setReviews(r);setEvidence(null);
    setSelected(keepSelection&&v.versions.some(x=>x.version_id===keepSelection)
      ?keepSelection:(v.approved.version_id||v.versions.at(-1)?.version_id||''));
  }
  useEffect(()=>{
    let alive=true;
    setError('');setNotice('');
    void Promise.all([api.getSceneVersions(projectId,slide),api.getSceneReviews(projectId,slide)])
      .then(([v,r])=>{
        if(!alive)return;
        setVersions(v.versions);setApproved(v.approved);setReviews(r);
        setSelected(v.approved.version_id||v.versions.at(-1)?.version_id||'');
      }).catch(e=>{if(alive)setError('Версии доступны в облачном редакторе после рендера: '+String(e))});
    return()=>{alive=false};
  },[projectId,slide]);
  async function perform(fn:()=>Promise<void>){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{await fn()}catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  const add=()=>perform(async()=>{
    if(!reviews||!active||text.trim().length<4)throw new Error('Укажи версию и конкретное замечание (минимум 4 символа)');
    const video=videoRef.current;
    const t=Math.max(0,Math.min(active.duration-1/active.fps,Number.isFinite(video?.currentTime)?video!.currentTime:stamp));
    // The archived JPEG persists even if the approved video later changes.
    let frame_evidence:string|undefined;
    if(video?.videoWidth&&video.videoHeight){
      try{
        const canvas=document.createElement('canvas');
        canvas.width=480;canvas.height=270;
        const ctx=canvas.getContext('2d');
        if(ctx){
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const encoded=canvas.toDataURL('image/jpeg',0.65);
          if(encoded.length<=180000)frame_evidence=encoded;
        }
      }catch{ /* Browser may forbid screenshot; time and rectangle remain valid. */ }
    }
    await api.addSceneReview(projectId,slide,{
      version_id:selected,t,text:text.trim(),severity:issueSeverity,rect,frame_evidence
    },reviews.revision);
    setText('');setRect(null);setNotice('Замечание привязано к текущей версии и кадру');
    await refresh(slide,selected);
  });
  const transition=(item:SceneReviewItem,status:'FIXED'|'VERIFIED'|'REOPENED')=>perform(async()=>{
    if(!reviews)throw new Error('Сначала обнови список замечаний');
    await api.transitionSceneReview(projectId,slide,item.id,status,note,reviews.revision);
    setNote('');setNotice('Статус обновлён и сохранён в истории');
    await refresh(slide,selected);
  });
  const approval=(action:'approve'|'restore')=>perform(async()=>{
    if(!approved||!active)throw new Error('Выбери существующий MP4');
    await api.setApprovedSceneVersion(projectId,slide,selected,approved.revision,action);
    setNotice(action==='approve'?'Версия утверждена':'Выполнен откат к ранее утверждённой версии');
    await refresh(slide,selected);
  });
  function frameJump(item:SceneReviewItem){
    const video=videoRef.current;
    if(video){video.pause();video.currentTime=item.t;}
    setStamp(item.t);setRect(item.rect);
    setEvidence(null);
    if(item.has_frame_evidence){
      void api.getSceneReviewItem(projectId,slide,item.id).then(setEvidence)
        .catch(e=>setError('Не удалось открыть сохранённый кадр: '+String(e)));
    }
  }
  function pickRect(event:MouseEvent){
    const el=event.currentTarget as HTMLVideoElement;
    const b=el.getBoundingClientRect();
    if(b.width<=0||b.height<=0)return;
    const x=Math.max(0,Math.min(0.85,(event.clientX-b.left)/b.width));
    const y=Math.max(0,Math.min(0.85,(event.clientY-b.top)/b.height));
    setRect({x:Number(x.toFixed(3)),y:Number(y.toFixed(3)),w:0.15,h:0.15});
    setStamp(el.currentTime||0);
  }
  return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="Ревью и версии сцен">
    <div class="task-window" style={{maxWidth:'1240px'}}>
      <header class="task-header">
        <div><strong>Ревью MP4 и версии</strong>
          <span>{projectId} · неизменяемые артефакты · утверждение и откат</span>
        </div>
        <div class="task-head-actions">
          <button type="button" class="btn" disabled={busy} onClick={()=>void perform(()=>refresh(slide,selected))}>Обновить</button>
          <button type="button" class="btn" onClick={onClose}>Закрыть</button>
        </div>
      </header>
      <section class="task-detail" style={{overflowY:'auto',maxHeight:'75vh'}}>
        <div class="task-row">
          <label>Сцена
            <select value={slide} onChange={e=>setSlide(e.currentTarget.value)}>
              {scenes.map(s=><option key={s.id} value={s.id}>{s.id} · {s.label}</option>)}
            </select>
          </label>
          <label>Версия рендера
            <select value={selected} onChange={e=>{setSelected(e.currentTarget.value);setRect(null)}}>
              {versions.map(v=><option key={v.version_id} value={v.version_id}>
                {v.version_id} · {v.created_at}{approved?.version_id===v.version_id?' · УТВЕРЖДЕНА':''}
              </option>)}
            </select>
          </label>
        </div>
        {!versions.length&&!error&&<p class="task-readme-help">Пока нет сохранённых MP4 этой сцены. Сначала выполни render_scene через MCP.</p>}
        {active&&<>
          <div style={{display:'flex',gap:'20px',flexWrap:'wrap'}}>
            <section style={{flex:'1 1 500px',minWidth:'280px'}}>
              <p class="task-readme-help">Видео конкретной версии. Поставь на паузу и нажми на область с дефектом, чтобы привязать замечание к кадру и прямоугольнику.</p>
              <div style={{position:'relative'}}>
                <video key={active.version_id} ref={videoRef} src={'/'+active.file} controls
                  onClick={pickRect} style={{width:'100%',maxHeight:'390px',background:'#111'}} />
                {rect&&<div style={{position:'absolute',pointerEvents:'none',
                  border:'2px solid #ffb454',left:(rect.x*100)+'%',top:(rect.y*100)+'%',
                  width:(rect.w*100)+'%',height:(rect.h*100)+'%'}} />}
              </div>
              <p class="task-readme-help">{active.fps} FPS · {active.duration.toFixed(2)} с · SHA-256: {active.sha256.slice(0,16)}…</p>
              <div class="task-row">
                <label>Приоритет
                  <select value={issueSeverity} onChange={e=>setIssueSeverity(e.currentTarget.value as SceneReviewItem['severity'])}>
                    {severity.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}
                  </select>
                </label>
              </div>
              <label class="task-field">Конкретное замечание
                <textarea rows={3} maxLength={2000} value={text} placeholder="На 1.3 с заголовок перекрывает основной объект…"
                  onInput={e=>setText(e.currentTarget.value)} />
              </label>
              <button type="button" class="btn" disabled={busy||text.trim().length<4} onClick={add}>
                Оставить замечание к этому кадру
              </button>
            </section>
            <section style={{flex:'1 1 420px',minWidth:'290px'}}>
              <div class="task-check-title"><strong>Замечания ({visible.length}) · открыто: {unresolved}</strong></div>
              {visible.map(item=><div key={item.id} style={{borderBottom:'1px solid #7775',padding:'10px 0'}}>
                <button class="btn" type="button" onClick={()=>frameJump(item)}>
                  {item.t.toFixed(2)} с · кадр {item.frame}
                </button>
                <strong> {item.status} · {item.severity}</strong>
                <p>{item.text}</p>
                <small>Автор: {item.created_by} · событий: {item.history.length}
                  {item.has_frame_evidence?' · сохранённый JPEG':''}</small>
                {evidence?.id===item.id&&evidence.frame_evidence&&
                  <div style={{position:'relative',maxWidth:'480px',aspectRatio:'16/9',background:'#111',marginTop:'8px'}}>
                    <img src={evidence.frame_evidence} alt={'Сохранённый кадр '+item.frame}
                      style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}} />
                    {evidence.rect&&<div style={{position:'absolute',pointerEvents:'none',border:'2px solid #ffb454',
                      left:(evidence.rect.x*100)+'%',top:(evidence.rect.y*100)+'%',
                      width:(evidence.rect.w*100)+'%',height:(evidence.rect.h*100)+'%'}}/>}
                  </div>}
                <div style={{display:'flex',gap:'6px',marginTop:'8px',flexWrap:'wrap'}}>
                  {(item.status==='OPEN'||item.status==='REOPENED')&&<button type="button" class="btn" disabled={busy} onClick={()=>transition(item,'FIXED')}>Исправлено</button>}
                  {item.status==='FIXED'&&<button type="button" class="btn" disabled={busy} onClick={()=>transition(item,'VERIFIED')}>Проверено</button>}
                  {(item.status==='FIXED'||item.status==='VERIFIED')&&<button type="button" class="btn" disabled={busy} onClick={()=>transition(item,'REOPENED')}>Переоткрыть</button>}
                </div>
              </div>)}
              <label class="task-field">Комментарий к смене статуса
                <input maxLength={1000} value={note} onInput={e=>setNote(e.currentTarget.value)} placeholder="Что исправлено или проверено" />
              </label>
            </section>
          </div>
          <footer class="task-footer" style={{position:'static',marginTop:'18px'}}>
            <span>{approved?.version_id===selected?'Эта версия утверждена':'Черновик / прежняя версия'} · ревизия утверждения {approved?.revision??0}</span>
            <button type="button" class="btn is-primary" disabled={busy||unresolved>0} onClick={()=>approval('approve')}>Утвердить MP4</button>
            <button type="button" class="btn" disabled={busy} onClick={()=>approval('restore')}>Откат к ранее утверждённой</button>
          </footer>
        </>}
        {error&&<p class="task-error" role="alert">{error}</p>}
        {notice&&<p role="status">{notice}</p>}
      </section>
    </div>
  </div>;
}

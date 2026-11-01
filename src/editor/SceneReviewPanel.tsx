/** P07: Review an actual scene render at exact timestamp and frame.
 * Thumbnail evidence is stored with the comment; video is not assumed immutable.
 */
import {useEffect,useRef,useState} from 'preact/hooks';
import {api,type ReviewRegion,type SceneRenderState,type SceneReviewItem,type ReviewStatus} from './api.ts';

type Props={projectId:string;slideId:string;fallbackFps:number;onClose:()=>void};
const stamp=(t:number)=>t.toFixed(3)+' с';
const COLOR:Record<string,string>={minor:'#84b9ff',major:'#ffb96a',blocker:'#ff7070'};
function errorMessage(e:unknown){return e instanceof Error?e.message:String(e)}
export function SceneReviewPanel({projectId,slideId,fallbackFps,onClose}:Props){
  const [render,setRender]=useState<SceneRenderState|null>(null);
  const [items,setItems]=useState<SceneReviewItem[]>([]);
  const [selected,setSelected]=useState<SceneReviewItem|null>(null);
  const [timestamp,setTimestamp]=useState(0);
  const [region,setRegion]=useState<ReviewRegion|null>(null);
  const [drawing,setDrawing]=useState(false);
  const [text,setText]=useState('');
  const [severity,setSeverity]=useState<'minor'|'major'|'blocker'>('major');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const video=useRef<HTMLVideoElement>(null);
  const start=useRef<{x:number;y:number}|null>(null);
  const fps=Math.max(1,Math.min(120,Math.round(render?.qa_report?.metadata?.fps||fallbackFps||60)));
  const ready=render?.status==='completed'&&!!render.job_id;
  const videoSrc=ready?`/out/${encodeURIComponent(projectId+'_'+slideId)}.mp4`:undefined;
  async function reload(){
    const [r,list]=await Promise.all([api.getSceneRender(projectId,slideId),api.listSceneReviews(projectId,slideId)]);
    setRender(r);setItems(list.items);
  }
  useEffect(()=>{
    let live=true;
    void Promise.all([api.getSceneRender(projectId,slideId),api.listSceneReviews(projectId,slideId)])
      .then(([r,list])=>{if(live){setRender(r);setItems(list.items)}})
      .catch(e=>{if(live)setError(errorMessage(e))});
    return ()=>{live=false};
  },[projectId,slideId]);
  const point=(e:PointerEvent)=>{
    const bounds=(e.currentTarget as HTMLElement).getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(e.clientX-bounds.left)/bounds.width)),
      y:Math.max(0,Math.min(1,(e.clientY-bounds.top)/bounds.height))};
  };
  function move(e:PointerEvent){
    if(!start.current)return;
    const p=point(e),s=start.current;
    setRegion({x:Math.min(s.x,p.x),y:Math.min(s.y,p.y),
      w:Math.abs(p.x-s.x),h:Math.abs(p.y-s.y)});
  }
  async function save(){
    if(!ready||busy||!text.trim()||!video.current)return;
    setBusy(true);setError('');
    try{
      const v=video.current;
      v.pause();
      const t=Math.max(0,v.currentTime);
      let frame_evidence:string|null=null;
      if(v.videoWidth&&v.videoHeight){
        try{
          const canvas=document.createElement('canvas');
          canvas.width=480;canvas.height=270;
          const ctx=canvas.getContext('2d');
          if(ctx){
            ctx.drawImage(v,0,0,480,270);
            const thumb=canvas.toDataURL('image/jpeg',0.62);
            if(thumb.length<=180000)frame_evidence=thumb;
          }
        }catch{ /* Browser may restrict thumbnail; timestamp/region remain usable. */ }
      }
      const item=await api.createSceneReview(projectId,slideId,{
        render_revision:render!.job_id!,t:Math.round(t*1000)/1000,fps,
        frame:Math.round(t*fps),severity,text:text.trim(),
        ...(region&&region.w>=0.005&&region.h>=0.005?{region}:{}),
        ...(frame_evidence?{frame_evidence}:{})
      });
      setItems(old=>[...old,item]);setText('');setRegion(null);setDrawing(false);
      setSelected(await api.getSceneReview(projectId,slideId,item.id));
    }catch(e){setError(errorMessage(e))}finally{setBusy(false)}
  }
  async function open(item:SceneReviewItem){
    setError('');setNote('');
    try{
      setSelected(await api.getSceneReview(projectId,slideId,item.id));
      if(video.current&&ready&&item.render_revision===render?.job_id){
        video.current.pause();video.current.currentTime=item.t;setTimestamp(item.t);
      }
    }catch(e){setError(errorMessage(e))}
  }
  async function transition(item:SceneReviewItem,status:ReviewStatus){
    if(!note.trim()||busy)return;
    setBusy(true);setError('');
    try{
      const changed=await api.updateSceneReview(projectId,slideId,item.id,{
        status,note:note.trim(),expected_revision:item.revision
      });
      setItems(old=>old.map(x=>x.id===changed.id?changed:x));
      setSelected(await api.getSceneReview(projectId,slideId,item.id));
      setNote('');
    }catch(e){setError(errorMessage(e))}finally{setBusy(false)}
  }
  const actions=(status:ReviewStatus):ReviewStatus[]=>
    status==='OPEN'||status==='REOPENED'?['FIXED']:
    status==='FIXED'?['VERIFIED','REOPENED']:['REOPENED'];
  return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="Ревью сцен">
    <div class="task-window review-window">
      <header class="task-header">
        <div><strong>Ревью по кадрам</strong><span>{projectId} · {slideId} · {items.filter(x=>x.status!=='VERIFIED').length} замечаний требуют решения</span></div>
        <div class="task-head-actions">
          <button type="button" class="btn" disabled={busy} onClick={()=>void reload().catch(e=>setError(errorMessage(e)))}>Обновить</button>
          <button type="button" class="btn" onClick={onClose}>Закрыть</button>
        </div>
      </header>
      <div class="review-grid">
        <section class="review-preview">
          {ready?<div class="review-frame">
            <video ref={video} src={videoSrc} controls playsInline preload="metadata"
              onTimeUpdate={e=>setTimestamp(e.currentTarget.currentTime)}
              onSeeked={e=>setTimestamp(e.currentTarget.currentTime)}
              onError={()=>setError('Не удалось открыть MP4; проверь, что файл рендера существует')}/>
            <div class="review-mark-layer" style={{pointerEvents:drawing?'auto':'none',cursor:drawing?'crosshair':'auto'}}
              onPointerDown={e=>{
                if(!drawing)return;
                video.current?.pause();start.current=point(e);setRegion(null);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={move}
              onPointerUp={e=>{move(e);start.current=null}}
              onPointerCancel={()=>{start.current=null}}>
              {region&&<div class="review-region" style={{
                left:(region.x*100)+'%',top:(region.y*100)+'%',
                width:(region.w*100)+'%',height:(region.h*100)+'%'
              }}/>}
            </div>
          </div>:<div class="review-empty">Для покадрового ревью сначала завершите <code>render_scene</code> для {slideId}. Текущий статус: {render?.status||'неизвестен'}.</div>}
          <div class="review-meta">
            <span>Время: {stamp(timestamp)} · FPS: {fps} · кадр {Math.round(timestamp*fps)}</span>
            <span>Версия: {render?.job_id||'нет подтверждённого рендера'}</span>
          </div>
          <div class="review-controls">
            <button type="button" class="btn" disabled={!ready} onClick={()=>{setDrawing(x=>!x);setRegion(null)}}>{drawing?'Завершить разметку':'Выделить область'}</button>
            <button type="button" class="btn" disabled={!region} onClick={()=>setRegion(null)}>Сбросить область</button>
          </div>
          <label class="task-field">Замечание к текущему кадру
            <textarea rows={3} maxLength={2000} value={text} onInput={e=>setText(e.currentTarget.value)}
              placeholder="Например: на 3,400 с текст пересекает орбиту; сдвинуть заголовок вправо"/>
          </label>
          <div class="review-controls">
            <select value={severity} onChange={e=>setSeverity(e.currentTarget.value as 'minor'|'major'|'blocker')}>
              <option value="minor">Небольшое</option><option value="major">Серьёзное</option><option value="blocker">Блокер</option>
            </select>
            <button type="button" class="btn is-primary" disabled={!ready||busy||text.trim().length<3}
              onClick={()=>void save()}>Создать замечание</button>
          </div>
          {!ready&&<small>В локальном предпросмотре можно читать замечания; новые привязываются только к завершённому облачному рендеру.</small>}
        </section>
        <section class="review-list">
          <strong>Замечания ({items.length})</strong>
          {items.length===0&&<p>Пока нет замечаний.</p>}
          {items.map(item=><button type="button" key={item.id}
            class={'review-item'+(selected?.id===item.id?' is-selected':'')}
            onClick={()=>void open(item)}>
            <span style={{color:COLOR[item.severity]||'inherit'}}>{item.severity.toUpperCase()}</span>
            <span>{stamp(item.t)} · кадр {item.frame} · {item.status}</span>
            <strong>{item.text}</strong>
            <small>{item.render_revision===render?.job_id?'Текущий рендер':'Архивная версия'}</small>
          </button>)}
          {selected&&<div class="review-detail">
            <h4>Замечание · {stamp(selected.t)}</h4>
            <p>{selected.text}</p>
            {selected.frame_evidence&&<div class="review-archive-frame">
              <img src={selected.frame_evidence} alt={'Сохранённый кадр '+selected.frame} />
              {selected.region&&<div class="review-region" style={{
                left:(selected.region.x*100)+'%',top:(selected.region.y*100)+'%',
                width:(selected.region.w*100)+'%',height:(selected.region.h*100)+'%'
              }}/>}
            </div>}
            <small>Рендер {selected.render_revision} · ревизия {selected.revision}</small>
            <label class="task-field">Что исправлено или проверено
              <textarea rows={2} maxLength={2000} value={note} onInput={e=>setNote(e.currentTarget.value)} placeholder="Проверено на новом рендере; текст больше не пересекает орбиту"/>
            </label>
            <div class="review-controls">
              {actions(selected.status).map(action=><button type="button" key={action} class="btn"
                disabled={busy||note.trim().length<3} onClick={()=>void transition(selected,action)}>{{
                  FIXED:'Исправлено',VERIFIED:'Подтверждено',REOPENED:'Вернуть на доработку',OPEN:'Открыто'
                }[action]}</button>)}
            </div>
            <strong>История</strong>
            {selected.history.map((h,i)=><p class="review-history" key={i}>{h.at} · {h.actor} → {h.status}: {h.note}</p>)}
          </div>}
        </section>
      </div>
      {error&&<p class="task-error" role="alert">{error}</p>}
    </div>
  </div>;
}

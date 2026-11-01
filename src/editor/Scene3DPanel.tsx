/** Minimal structured 3D Scene SDK editor: same JSON contract used by MCP agents. */
import {useEffect,useState} from 'preact/hooks';
import {api} from './api.ts';
import {loadScenes} from '../decks/registry.ts';
import {scenes} from './store.ts';
import type {Scene3DRecord,Scene3DSpec} from '../engine/scene3d.ts';

const initialSpec:Scene3DSpec={
  version:1,
  camera:{cx:1090,cy:500,size:245,dist:9.5,yaw:-.45,pitch:.25,
    yaw_speed:.45,pitch_speed:.03,zoom_speed:.02},
  objects:[
    {id:'core',mesh:'icosa',color:'#42d4ff',edge_color:'#c6f5ff',
      wire:true,pos:[0,0,0],scale:2,rotation:[0,0,0],spin:[.15,.8,.12],start:0,fade:.5},
    {id:'satellite',mesh:'octa',color:'#ffc06b',edge_color:null,
      wire:false,pos:[2.3,.3,-1],scale:.7,rotation:[0,0,0],spin:[0,-1.2,0],start:.7,fade:.5},
  ],
};
interface Props{projectId:string;slideId:string;onClose:()=>void}
export function Scene3DPanel({projectId,slideId,onClose}:Props){
  const [remote,setRemote]=useState<Scene3DRecord|null>(null);
  const [json,setJson]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let alive=true;
    void api.getScene3D(projectId,slideId).then(x=>{
      if(!alive)return;
      setRemote(x);
      setJson(JSON.stringify(x.spec??initialSpec,null,2));
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[projectId,slideId]);
  const changed=!!remote && json!==JSON.stringify(remote.spec??initialSpec,null,2);
  async function save(){
    if(!remote||busy)return;
    setError('');setMessage('');
    let parsed:Scene3DSpec;
    try{parsed=JSON.parse(json) as Scene3DSpec}
    catch(e){setError('Ошибка JSON: '+String(e));return;}
    setBusy(true);
    try{
      const updated=await api.saveScene3D(projectId,slideId,parsed,remote.revision);
      setRemote(updated);
      setJson(JSON.stringify(updated.spec,null,2));
      scenes.value=await loadScenes(projectId);
      setMessage('3D-сцена опубликована. Предпросмотр обновлён.');
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="3D Scene SDK">
    <div class="task-window" style={{maxWidth:'1170px'}}>
      <header class="task-header">
        <div><strong>3D Scene SDK · {slideId}</strong>
          <span>Проект {projectId} · JSON-композиция; создаётся без публикации TypeScript на сервер</span>
        </div>
        <button class="btn" type="button" onClick={()=>{
          if(!changed||confirm('Закрыть с несохранёнными изменениями?'))onClose();
        }}>Закрыть</button>
      </header>
      <section class="task-detail">
        {loading&&<p>Загружаю 3D-сцену…</p>}
        {remote&&<>
          <p class="task-readme-help">Редактируй список объектов, камеру и скорости вращения.
            Доступны \`cube, pyramid, octa, icosa, hexPrism, cylinder\`. Сохранение проверяет допустимые числа, цвета, размеры и ревизию. Для кода сложных моделей нужен отдельный workflow.
          </p>
          <label class="task-field">3D-композиция (scene3d.json, schema v1)
            <textarea class="task-readme-editor" style={{height:'min(58vh,620px)'}}
              spellcheck={false} value={json} onInput={e=>setJson(e.currentTarget.value)} />
          </label>
          <div class="task-row">
            <p class="task-readme-help">Ревизия {remote.revision} · {remote.spec?'Сохранённая 3D-сцена':'Сцена ещё не создана'}</p>
            <p class="task-readme-help">Камера и все объекты получают координаты в пространстве 1920×1080.</p>
          </div>
        </>}
        {error&&<p class="task-error" role="alert">{error}</p>}
        {message&&<p role="status">{message}</p>}
      </section>
      <footer class="task-footer" style={{margin:'0',position:'static'}}>
        <button class="btn" type="button" disabled={busy||!remote} onClick={()=>{
          if(remote){setJson(JSON.stringify(initialSpec,null,2));setMessage('')}
        }}>Вставить пример</button>
        <span>Создаёт безопасную 3D-сцену только для {slideId}</span>
        <button class="btn is-primary" type="button" disabled={busy||!remote||!json.trim()}
          onClick={()=>void save()}>{busy?'Проверяю…':'Опубликовать 3D-сцену'}</button>
      </footer>
    </div>
  </div>;
}

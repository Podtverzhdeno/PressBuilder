/** Project-specific README.md editor. The saved Markdown is the onboarding contract for agents. */
import {useEffect,useState} from 'preact/hooks';
import {api,type ProjectReadme} from './api.ts';

export function ProjectReadmePanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
  const [data,setData]=useState<ProjectReadme|null>(null);
  const [content,setContent]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let alive=true;
    void api.getProjectReadme(projectId).then(r=>{
      if(!alive)return;
      setData(r);setContent(r.content);
    }).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e))})
      .finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[projectId]);
  const dirty=!!data && data.content!==content;
  const save=async()=>{
    if(!data||busy||!dirty)return;
    setBusy(true);setError('');
    try {
      const result=await api.saveProjectReadme(projectId,content,data.revision);
      setData(result);setContent(result.content);
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  };
  const close=()=>{
    if(!dirty||confirm('Есть несохранённые изменения в README. Закрыть?'))onClose();
  };
  return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="README проекта">
    <div class="task-window" style={{maxWidth:'1110px'}}>
      <header class="task-header">
        <div>
          <strong>README проекта · {projectId}</strong>
          <span>Единая инструкция, которую каждый новый агент прочитает через MCP</span>
        </div>
        <div class="task-head-actions">
          <button type="button" class="btn" onClick={close}>Закрыть</button>
        </div>
      </header>
      <section class="task-detail">
        {loading&&<p>Открываю README.md…</p>}
        {data&&<>
          <p class="task-readme-help">
            Хранилище: <code>{data.filename}</code> · источник: {data.source==='generated'?'созданный шаблон':data.source==='seed'?'из репозитория':'сохранённый файл'}.
            Здесь задаётся общая концепция, стиль, правила монтажа, единые переходы и порядок работы агентов.
            Подробные ТЗ и чекпоинты для каждой сцены редактируются отдельно через «Задания агентам».
          </p>
          <label class="task-field">Содержимое README.md (Markdown)
            <textarea class="task-readme-editor" rows={24} maxLength={65536}
              value={content} spellcheck={false}
              onInput={e=>setContent(e.currentTarget.value)} />
          </label>
        </>}
        {error&&<p class="task-error" role="alert">{error} · при конфликте закрой README и открой снова</p>}
      </section>
      <footer class="task-footer" style={{margin:'0',position:'static'}}>
        <button class="btn" type="button" disabled={!data} onClick={()=>{
          if(data)void navigator.clipboard.writeText(content).catch(()=>setError('Не удалось скопировать'));
        }}>Копировать Markdown</button>
        <span>{dirty?'Изменения не сохранены':'Сохранено'} · агентам доступен MCP get_project_context</span>
        <button class="btn is-primary" type="button" disabled={!dirty||busy||!content.trim()}
          onClick={()=>void save()}>{busy?'Сохраняю…':'Сохранить README'}</button>
      </footer>
    </div>
  </div>;
}

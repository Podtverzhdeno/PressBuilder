/** P04: style-contract JSON editor and immediate palette/safe-area preview. */
import {useEffect,useState} from 'preact/hooks';
import {api,type StyleContractRecord} from './api.ts';

export function StyleContractPanel({projectId,onClose}:{projectId:string;onClose:()=>void}){
  const [record,setRecord]=useState<StyleContractRecord|null>(null);
  const [draft,setDraft]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let mounted=true;
    void api.getStyleContract(projectId).then(r=>{
      if(mounted){setRecord(r);setDraft(JSON.stringify(r.contract,null,2));}
    }).catch(e=>{if(mounted)setError(String(e))});
    return ()=>{mounted=false};
  },[projectId]);
  let parsed:StyleContractRecord['contract']|null=null;
  let parseError='';
  try{parsed=JSON.parse(draft) as StyleContractRecord['contract'];}
  catch(e){parseError=e instanceof Error?e.message:String(e);}
  const dirty=!!record&&draft!==JSON.stringify(record.contract,null,2);
  const save=async()=>{
    if(!record||!parsed||busy)return;
    setBusy(true);setError('');
    try{
      const updated=await api.saveStyleContract(projectId,parsed,record.revision);
      setRecord(updated);setDraft(JSON.stringify(updated.contract,null,2));
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  };
  const close=()=>{if(!dirty||confirm('Не сохранённые правила оформления будут потеряны. Закрыть?'))onClose();};
  const area=parsed?.safeArea;
  return <div class="task-overlay" role="dialog" aria-modal="true" aria-label="Визуальный контракт">
    <div class="task-window" style={{maxWidth:'1090px'}}>
      <header class="task-header">
        <div><strong>Визуальный контракт · {projectId}</strong>
          <span>Глобальные ограничения и более строгие исключения для отдельных сцен</span></div>
        <button type="button" class="btn" onClick={close}>Закрыть</button>
      </header>
      <section class="task-detail">
        {!record&&!error&&<p>Загружаю правила…</p>}
        {record&&<>
          <p class="task-readme-help">
            Версия {record.revision} · {parsed?.enforce?'проверки включены':'проверки выключены'}.
            Перечислите сцену в <code>sceneOverrides</code>, чтобы задать ей более строгие требования.
            Контрольная проверка на сервере производится до сохранения.
          </p>
          <label class="task-field">style-contract.json
            <textarea rows={19} class="task-readme-editor" spellcheck={false}
              value={draft} onInput={e=>setDraft(e.currentTarget.value)} />
          </label>
          {parseError&&<p class="task-error">Ошибка JSON: {parseError}</p>}
          {parsed?.palette&&<div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'12px'}}>
            {parsed.palette.map((c,i)=><span key={c+i} title={c}
              style={{background:c,width:'30px',height:'30px',border:'1px solid #888',borderRadius:'5px'}} />)}
          </div>}
          {area&&<div>
            <p>Предпросмотр обязательной безопасной зоны (1920×1080)</p>
            <div style={{position:'relative',maxWidth:'460px',aspectRatio:'16 / 9',
              background:'#161923',outline:'1px solid #888'}}>
              <div style={{position:'absolute',border:'1px dashed #52c6ed',
                left:(area.left/1920*100)+'%',right:(area.right/1920*100)+'%',
                top:(area.top/1080*100)+'%',bottom:(area.bottom/1080*100)+'%'}}/>
            </div>
          </div>}
        </>}
        {error&&<p role="alert" class="task-error">{error}</p>}
      </section>
      <footer class="task-footer" style={{margin:'0',position:'static'}}>
        <span>{dirty?'Есть несохранённые изменения':'Сохранено'} · агентам доступен MCP get_style_contract</span>
        <button type="button" class="btn is-primary" onClick={()=>void save()}
          disabled={!record||!parsed||!!parseError||!dirty||busy}>{busy?'Проверяю…':'Проверить и сохранить'}</button>
      </footer>
    </div>
  </div>;
}

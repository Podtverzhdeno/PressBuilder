/**
 * In-process FIFO capacity governor for CPU/RAM-heavy Chromium and FFmpeg work.
 * Separate Railway replicas are NOT coordinated; the /data single-writer guard
 * and one-replica deployment limitation still apply.
 */
export function createResourceGovernor({capacity=1,maxWaiting=64}={}){
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>16||
     !Number.isSafeInteger(maxWaiting)||maxWaiting<0||maxWaiting>10000)
    throw new Error('Invalid resource governor limits');
  let active=0;
  const waiting=[];
  const aborted=signal=>signal?.reason instanceof Error?signal.reason:new Error('Resource request aborted');
  function makeRelease(){
    let freed=false;
    return ()=>{
      if(freed)return;
      freed=true;
      active--;
      drain();
    };
  }
  function drain(){
    while(active<capacity&&waiting.length){
      const item=waiting.shift();
      item.signal?.removeEventListener('abort',item.onAbort);
      if(item.signal?.aborted){item.reject(aborted(item.signal));continue}
      active++;
      item.resolve(makeRelease());
    }
  }
  function acquire({signal}={}){
    if(signal?.aborted)return Promise.reject(aborted(signal));
    if(active<capacity&&waiting.length===0){
      active++;
      return Promise.resolve(makeRelease());
    }
    if(waiting.length>=maxWaiting)
      return Promise.reject(Object.assign(new Error('Resource queue is full'),{status:429}));
    return new Promise((resolve,reject)=>{
      const item={signal,resolve,reject,onAbort:null};
      item.onAbort=()=>{
        const i=waiting.indexOf(item);
        if(i>=0){waiting.splice(i,1);signal.removeEventListener('abort',item.onAbort);reject(aborted(signal))}
      };
      waiting.push(item);
      signal?.addEventListener('abort',item.onAbort,{once:true});
      if(signal?.aborted)item.onAbort();
    });
  }
  return {acquire,snapshot:()=>({capacity,active,waiting:waiting.length})};
}

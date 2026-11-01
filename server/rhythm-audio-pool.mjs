/** Resource-governed P15 audio worker admission.
 * Fixed-size queue, no shared user-editable state, hard timeout, cancellation.
 * Worker threads absorb spawnSync so the API event loop remains responsive.
 */
import {Worker} from 'node:worker_threads';

const ENTRY=new URL('./rhythm-audio-worker.mjs',import.meta.url);
const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
export function rhythmAudioPool({
  maxActive=1,maxWaiting=2,timeoutMs=10_000,workerFactory=options=>new Worker(ENTRY,options)
}={}){
  if(!Number.isSafeInteger(maxActive)||maxActive<1||maxActive>2||
     !Number.isSafeInteger(maxWaiting)||maxWaiting<0||maxWaiting>8||
     !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30_000)
    throw new TypeError('INVALID_AUDIO_POOL_LIMITS');
  let active=0,closed=false;
  const waiting=[],working=new Set();
  function pump(){
    while(!closed&&active<maxActive&&waiting.length){
      const job=waiting.shift();
      if(job.done||job.signal?.aborted){job.reject(fail('AUDIO_CANCELLED',499));continue}
      active++; working.add(job);
      let worker;
      try{
        worker=workerFactory({type:'module',resourceLimits:{maxOldGenerationSizeMb:64}});
      }catch(e){working.delete(job);active--;job.reject(fail('AUDIO_WORKER_UNAVAILABLE'));continue}
      job.worker=worker;
      let timer;
      function finish(error,result){
        if(job.done)return;
        job.done=true;
        clearTimeout(timer);
        job.signal?.removeEventListener('abort',job.abort);
        working.delete(job);active--;
        try{void worker.terminate()}catch{}
        if(error)job.reject(error);else job.resolve(result);
        pump();
      }
      job.finish=finish;
      worker.on('message',message=>{
        if(!message?.ok)finish(fail(message?.code??'AUDIO_WORKER_FAILED',message?.status??422));
        else finish(null,message.result);
      });
      worker.on('error',()=>finish(fail('AUDIO_WORKER_FAILED')));
      worker.on('exit',()=>finish(fail('AUDIO_WORKER_EXITED')));
      timer=setTimeout(()=>finish(fail('AUDIO_WORKER_TIMEOUT',504)),timeoutMs);
      try{worker.postMessage(job.input)}catch{finish(fail('AUDIO_WORKER_FAILED'))}
    }
  }
  function inspect(input,{signal}={}){
    if(closed)return Promise.reject(fail('AUDIO_POOL_CLOSED'));
    if(signal?.aborted)return Promise.reject(fail('AUDIO_CANCELLED',499));
    if(active>=maxActive&&waiting.length>=maxWaiting)
      return Promise.reject(fail('AUDIO_QUEUE_FULL',429));
    return new Promise((resolve,reject)=>{
      const job={input,resolve,reject,signal,done:false,worker:null};
      job.abort=()=>{
        if(job.done)return;
        if(job.finish){job.finish(fail('AUDIO_CANCELLED',499))}
        else{
          const pos=waiting.indexOf(job);if(pos>=0)waiting.splice(pos,1);
          job.done=true;reject(fail('AUDIO_CANCELLED',499));
          signal?.removeEventListener('abort',job.abort);
        }
      };
      signal?.addEventListener('abort',job.abort,{once:true});
      waiting.push(job);pump();
    });
  }
  function close(){
    closed=true;
    while(waiting.length){const job=waiting.shift();job.abort()}
    for(const job of Array.from(working))job.finish(fail('AUDIO_POOL_CLOSED'));
  }
  return {inspect,close,stats:()=>({active,waiting:waiting.length,maxActive,maxWaiting,closed})};
}

/** P15: isolate synchronous ffmpeg PCM inspection from the HTTP event loop.
 * This worker receives only bounded, server-derived file references and hashes.
 */
import {parentPort} from 'node:worker_threads';
import {inspectRhythmSilence} from './rhythm-audio-evidence.mjs';

if(!parentPort)throw new Error('Worker only');
parentPort.once('message',input=>{
  try{
    const result=inspectRhythmSilence(input);
    parentPort.postMessage({ok:true,result});
  }catch(e){
    parentPort.postMessage({ok:false,
      code:typeof e?.code==='string'?e.code:'AUDIO_EVIDENCE_UNAVAILABLE',
      status:Number.isInteger(e?.status)?e.status:422});
  }
});

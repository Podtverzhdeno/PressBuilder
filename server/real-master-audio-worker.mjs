/** M58-R21: isolated worker for a server-selected, immutable P05 master.
 * Thread input never contains a command or user-supplied filesystem path.
 * The existing R20 SHA-before/after audit runs off the cloud event loop.
 */
import fs from 'node:fs';
import path from 'node:path';
import {parentPort,workerData} from 'node:worker_threads';
import {inspectCurrentMasterStereo} from './current-master-audio-evidence.mjs';

const PROJECT=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const UUID=/^[a-f0-9-]{36}$/;
const SHA=/^[a-f0-9]{64}$/;
const assertRegular=(p)=>{
 const s=fs.lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink())throw Error('M58_AUDIO_WORKER_UNSAFE_FILE');
};
const assertDirectory=(p)=>{
 const s=fs.lstatSync(p);
 if(!s.isDirectory()||s.isSymbolicLink())throw Error('M58_AUDIO_WORKER_UNSAFE_DIRECTORY');
};
function launch(){
 const {out,projectId,releaseId,releaseSha}=workerData??{};
 if(typeof out!=='string'||!path.isAbsolute(out)||
    typeof projectId!=='string'||!PROJECT.test(projectId)||
    typeof releaseId!=='string'||!UUID.test(releaseId)||
    typeof releaseSha!=='string'||!SHA.test(releaseSha))
   throw Error('M58_AUDIO_WORKER_INPUT_INVALID');
 const releaseRoot=path.join(out,'releases');
 const projectRoot=path.join(releaseRoot,projectId);
 const releaseDir=path.join(projectRoot,releaseId);
 const currentFile=path.join(projectRoot,'current.json');
 const manifestFile=path.join(releaseDir,'manifest.json');
 const masterFile=path.join(releaseDir,'final.mp4');
 // A symlink in the P05 directory chain must not redirect this worker
 // to unrelated files even if the outer app has a privileged filesystem.
 for(const dir of [out,releaseRoot,projectRoot,releaseDir])assertDirectory(dir);
 const assembly={
  current:(id)=>{
   if(id!==projectId)throw Error('M58_AUDIO_WORKER_PROJECT_CHANGED');
   assertRegular(currentFile);assertRegular(manifestFile);
   const pointer=JSON.parse(fs.readFileSync(currentFile,'utf8'));
   const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
   if(pointer.release_id!==releaseId||manifest.release_id!==releaseId||
      manifest.output?.sha256!==releaseSha)return null;
   return {release_id:releaseId,manifest};
  },
  download:(id,rid)=>{
   if(id!==projectId||rid!==releaseId)
    throw Error('M58_AUDIO_WORKER_RELEASE_CHANGED');
   assertRegular(masterFile);return masterFile;
  },
 };
 const report=inspectCurrentMasterStereo({assembly,projectId});
 if(report.release_id!==releaseId||report.release_sha256!==releaseSha||
    report.may_publish!==false||report.may_deploy!==false)
  throw Error('M58_AUDIO_WORKER_RECEIPT_MISMATCH');
 return report;
}
try{
 const report=launch();
 parentPort.postMessage({ok:true,report});
}catch(e){
 // Codes only: never include filesystem paths or FFmpeg stderr in message.
 const code=String(e?.code||e?.message||'');
 const safe=/^M58_[A-Z0-9_]{5,100}$/.test(code)?code:'M58_AUDIO_WORKER_FAILED';
 parentPort.postMessage({ok:false,code:safe});
}

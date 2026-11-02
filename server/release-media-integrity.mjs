/** M58-R02: read-only inspection of the current P05 assembly artifact.
 * Confirms manifest consistency and MP4 bytes, NOT decoded quality, licensing,
 * worker identity, a signed receipt, or permission to publish.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const RELEASE=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const MIN_VIDEO_BYTES=1024;
const MAX_VIDEO_BYTES=4*1024*1024*1024;
const bad=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
const digest=x=>createHash('sha256').update(x).digest('hex');
const ensure=(v,condition,code)=>{if(!condition(v))bad(code,400)};
const allowedId=v=>typeof v==='string'&&ID.test(v);
const allowedSha=v=>typeof v==='string'&&SHA.test(v);

function inspectFile(file,limit,kind){
  let st;
  try{st=fs.lstatSync(file)}
  catch{bad('M58_P05_'+kind+'_MISSING',404)}
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<=0||st.size>limit)
    bad('M58_P05_'+kind+'_UNSAFE',422);
  return st;
}
function directory(dir){
  let st;
  try{st=fs.lstatSync(dir)}
  catch{bad('M58_P05_DIRECTORY_MISSING',404)}
  if(!st.isDirectory()||st.isSymbolicLink())
    bad('M58_P05_DIRECTORY_UNSAFE',422);
}
function readBoundedJson(file,maxBytes,kind){
  inspectFile(file,maxBytes,kind);
  try{
    return JSON.parse(fs.readFileSync(file,'utf8'));
  }catch{bad('M58_P05_'+kind+'_MALFORMED',422)}
}
function validateManifest(manifest,project,releaseId){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
    manifest.schemaVersion!==1||manifest.project!==project||
    manifest.release_id!==releaseId||manifest.output?.qa?.verdict!=='PASS'||
    !allowedSha(manifest.output?.sha256)||
    !Number.isSafeInteger(manifest.output?.bytes)||
    manifest.output.bytes<MIN_VIDEO_BYTES||
    manifest.output.bytes>MAX_VIDEO_BYTES)
    bad('M58_P05_MANIFEST_INVALID',422);
  if(!Array.isArray(manifest.scenes)||manifest.scenes.length<1||
     manifest.scenes.length>24)bad('M58_P05_SCENES_INVALID',422);
  const used=new Set();
  let sceneApprovalCount=0;
  for(const scene of manifest.scenes){
    if(!scene||!allowedId(scene.id)||used.has(scene.id)||
       !allowedSha(scene.sha256))bad('M58_P05_SCENES_INVALID',422);
    used.add(scene.id);
    // Missing P08 approval is not upgraded to a verified source.
    if(scene.approved_version_id!==null&&scene.approved_version_id!==undefined){
      if(typeof scene.approved_version_id!=='string'||
        !/^[a-f0-9]{16}$/.test(scene.approved_version_id)||
        !Number.isSafeInteger(scene.approved_revision)||scene.approved_revision<1)
        bad('M58_P05_SCENES_INVALID',422);
      sceneApprovalCount++;
    }
  }
  return sceneApprovalCount;
}
function fileDigest(file,stat){
  // Check the opened descriptor as well as the path to reject replacement,
  // symlinks and truncation mid-read. Does not provide hostile FS isolation.
  let fd;
  try{
    fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    const opened=fs.fstatSync(fd);
    if(!opened.isFile()||opened.nlink!==1||opened.size!==stat.size||
      opened.ino!==stat.ino||opened.dev!==stat.dev)
      bad('M58_P05_FILE_CHANGED',409);
    const h=createHash('sha256'),buffer=Buffer.allocUnsafe(1024*1024);
    let remaining=stat.size;
    while(remaining>0){
      const n=fs.readSync(fd,buffer,0,Math.min(buffer.length,remaining),null);
      if(n<=0)bad('M58_P05_FILE_CHANGED',409);
      remaining-=n;h.update(buffer.subarray(0,n));
    }
    if(fs.fstatSync(fd).size!==stat.size)bad('M58_P05_FILE_CHANGED',409);
    return h.digest('hex');
  }finally{if(fd!==undefined)fs.closeSync(fd)}
}

/**
 * rootOut: trusted, local P05 OUT directory (not from client JSON).
 * expectedMasterSha256: independently specified expected SHA, or omitted
 * for read-only discovery. Both modes never issue a release receipt.
 */
export function inspectP05ActiveRelease({rootOut,projectId,expectedMasterSha256=null}={}){
  ensure(projectId,allowedId,'M58_P05_PROJECT_INVALID');
  if(typeof rootOut!=='string'||!path.isAbsolute(rootOut))
    bad('M58_P05_ROOT_INVALID',400);
  if(expectedMasterSha256!==null)
    ensure(expectedMasterSha256,allowedSha,'M58_P05_EXPECTED_SHA_INVALID');

  const out=path.resolve(rootOut);
  const releases=path.join(out,'releases');
  const project=path.join(releases,projectId);
  for(const dir of [out,releases,project])directory(dir);
  const pointerFile=path.join(project,'current.json');
  const pointer=readBoundedJson(pointerFile,4096,'POINTER');
  if(!pointer||typeof pointer!=='object'||Array.isArray(pointer)||
    !RELEASE.test(pointer.release_id||''))
    bad('M58_P05_POINTER_INVALID',422);

  const release=path.join(project,pointer.release_id);
  directory(release);
  const manifestFile=path.join(release,'manifest.json');
  const manifest=readBoundedJson(manifestFile,256*1024,'MANIFEST');
  const approvedCount=validateManifest(manifest,projectId,pointer.release_id);
  const mp4File=path.join(release,'final.mp4');
  const stat=inspectFile(mp4File,MAX_VIDEO_BYTES,'VIDEO');
  if(stat.size<MIN_VIDEO_BYTES||stat.size!==manifest.output.bytes)
    bad('M58_P05_VIDEO_SIZE_MISMATCH',409);
  const actual=fileDigest(mp4File,stat);
  if(actual!==manifest.output.sha256)
    bad('M58_P05_MASTER_SHA_MISMATCH',409);
  if(expectedMasterSha256!==null&&expectedMasterSha256!==actual)
    bad('M58_P05_EXPECTED_MASTER_MISMATCH',409);

  // Refuse to claim consistency if the active release or metadata changed
  // while reading the large video file.
  const pointerAfter=readBoundedJson(pointerFile,4096,'POINTER');
  if(pointerAfter.release_id!==pointer.release_id||
     digest(JSON.stringify(pointerAfter))!==digest(JSON.stringify(pointer)))
    bad('M58_P05_ACTIVE_RELEASE_CHANGED',409);
  const manifestAfter=readBoundedJson(manifestFile,256*1024,'MANIFEST');
  if(digest(JSON.stringify(manifestAfter))!==digest(JSON.stringify(manifest)))
    bad('M58_P05_MANIFEST_CHANGED',409);
  const statAfter=inspectFile(mp4File,MAX_VIDEO_BYTES,'VIDEO');
  if(statAfter.size!==stat.size||statAfter.ino!==stat.ino||
     statAfter.dev!==stat.dev||statAfter.mtimeMs!==stat.mtimeMs)
    bad('M58_P05_FILE_CHANGED',409);

  return {
    schema_version:1,scope:'P05_ACTIVE_MASTER_BYTE_INTEGRITY_ONLY',
    status:'BYTES_VERIFIED',may_publish:false,may_deploy:false,
    project_id:projectId,release_id:pointer.release_id,
    master_sha256:actual,master_bytes:stat.size,
    p05_manifest_sha256:digest(JSON.stringify(manifest)),
    scenes:manifest.scenes.length,scenes_with_p08_approval:approvedCount,
    p05_recorded_qa_verdict:manifest.output.qa.verdict,
    decoded_media_verified:false,licensing_verified:false,
    source_approvals_reverified:false,
    caveat:'Local P05 manifest and MP4 bytes agree. No media decode, signed receipts, P08 reapproval, human review or release authorization.',
  };
}

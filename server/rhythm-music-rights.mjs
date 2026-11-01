/**
 * P15 music-rights server gate. The catalog is operator-managed: NOT deck.json,
 * NOT the viewer's manifest and NOT an uploaded scene-task "licensed" flag.
 * It validates a recorded attestation and actual local bytes, not legal truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const ID=/^[a-z0-9][a-z0-9_-]{0,48}$/;
const SHA=/^[a-f0-9]{64}$/;
const LICENSE=/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const FAIL=(code,status=409)=>{throw Object.assign(new Error(code),{code,status})};
const MB=16*1024*1024;
function readVerifiedFile(file,maximum) {
  const before=fs.lstatSync(file,{throwIfNoEntry:false});
  if(!before?.isFile()||before.isSymbolicLink()||before.nlink!==1||
     before.size<1||before.size>maximum)FAIL('UNSAFE_RIGHTS_SOURCE',403);
  let fd;
  try{
    fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
    const beforeFd=fs.fstatSync(fd);
    if(beforeFd.dev!==before.dev||beforeFd.ino!==before.ino||
       beforeFd.size!==before.size||beforeFd.mtimeMs!==before.mtimeMs)
      FAIL('RIGHTS_SOURCE_CHANGED',409);
    const bytes=Buffer.alloc(before.size);
    let pos=0;
    while(pos<bytes.length){
      const n=fs.readSync(fd,bytes,pos,bytes.length-pos,null);
      if(n===0)FAIL('RIGHTS_SOURCE_CHANGED',409);
      pos+=n;
    }
    const afterFd=fs.fstatSync(fd);
    const atPath=fs.lstatSync(file);
    if(afterFd.size!==before.size||afterFd.mtimeMs!==before.mtimeMs||
       atPath.ino!==before.ino||atPath.dev!==before.dev||
       atPath.size!==before.size||atPath.mtimeMs!==before.mtimeMs)
      FAIL('RIGHTS_SOURCE_CHANGED',409);
    return bytes;
  }finally{if(fd!==undefined)fs.closeSync(fd)}
}
export function musicRightsVerifier({catalogFile,assetRoot,projectRoot,now=()=>new Date()}){
  function verify(projectId,music){
    if(!ID.test(projectId)||!music||typeof music!=='object'||
       !SHA.test(music.source_sha256)||!LICENSE.test(music.license_ref)||
       music.licensed!==true)FAIL('MUSIC_RIGHTS_UNVERIFIED',403);
    if(!catalogFile||!assetRoot)FAIL('MUSIC_CATALOG_NOT_CONFIGURED',409);
    const root=path.resolve(assetRoot);
    const managed=path.resolve(catalogFile);
    const project=projectRoot?path.resolve(projectRoot):null;
    if((project&&(root===project||root.startsWith(project+path.sep)||
       managed===project||managed.startsWith(project+path.sep)))||
       root===path.dirname(managed)) {
      // Catalog and music assets must each be operator-managed, never
      // project upload/scene output directories; separate roots protect audit.
      if(project)FAIL('UNSAFE_MUSIC_CATALOG_LOCATION',403);
    }
    for(const dir of [root,path.dirname(managed)]){
      const stat=fs.lstatSync(dir,{throwIfNoEntry:false});
      if(!stat?.isDirectory()||stat.isSymbolicLink())FAIL('UNSAFE_MUSIC_CATALOG_LOCATION',403);
    }
    let catalog;
    try{catalog=JSON.parse(readVerifiedFile(managed,128*1024).toString('utf8'))}
    catch(e){
      if(e?.code?.startsWith('UNSAFE_')||e?.code?.startsWith('RIGHTS_'))throw e;
      FAIL('MUSIC_CATALOG_INVALID',409);
    }
    if(catalog?.schema_version!==1||!Array.isArray(catalog.assets)||
       catalog.assets.length>512)FAIL('MUSIC_CATALOG_INVALID',409);
    const matches=catalog.assets.filter(a=>a?.source_sha256===music.source_sha256&&
      a?.license_ref===music.license_ref);
    if(matches.length!==1)FAIL('MUSIC_RIGHTS_UNVERIFIED',403);
    const a=matches[0];
    if(!ID.test(a.asset_id)||typeof a.file_name!=='string'||
       !/^[a-z0-9][a-z0-9_.-]{0,90}\.(wav|mp3|flac|ogg|m4a)$/.test(a.file_name)||
       a.file_name.includes('..')||a.status!=='approved'||
       typeof a.rights_attested_by!=='string'||!ID.test(a.rights_attested_by)||
       !Array.isArray(a.allowed_projects)||!a.allowed_projects.includes(projectId))
      FAIL('MUSIC_RIGHTS_UNVERIFIED',403);
    const until=Date.parse(a.expires_at);
    if(!Number.isFinite(until)||until<=now().getTime())FAIL('MUSIC_RIGHTS_EXPIRED',403);
    const bytes=readVerifiedFile(path.join(root,a.file_name),MB);
    if(createHash('sha256').update(bytes).digest('hex')!==music.source_sha256)
      FAIL('MUSIC_SOURCE_SHA_MISMATCH',409);
    return {verified:true,source:'operator_owned_catalog_v1',
      source_sha256:music.source_sha256,license_ref:music.license_ref,
      attested_by:a.rights_attested_by,expires_at:a.expires_at,
      note:'Technical rights-attestation check only; not independent legal opinion.'};
  }
  return {verify};
}

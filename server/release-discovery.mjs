/** Read-only P05 active release discovery for operator diagnostics.
 * A candidate is NEVER a verified release until separately SHA+media checked.
 */
import fs from 'node:fs';
import path from 'node:path';

const ID=/^[a-z0-9][a-z0-9_-]{0,40}$/;
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const fail=(code)=>{throw Object.assign(new Error(code),{code,status:422})};
function statDir(dir,optional=false){
  let stat;
  try{stat=fs.lstatSync(dir)}
  catch(e){if(optional&&e?.code==='ENOENT')return false;fail('M58_DISCOVERY_DIRECTORY_UNREADABLE')}
  if(!stat.isDirectory()||stat.isSymbolicLink())fail('M58_DISCOVERY_UNSAFE_DIRECTORY');
  return true;
}
function discoverPointer(file){
  let st;
  try{st=fs.lstatSync(file)}catch{return {status:'INVALID_POINTER'}}
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<2||st.size>4096)
    return {status:'INVALID_POINTER'};
  let entry;
  try{entry=JSON.parse(fs.readFileSync(file,'utf8'))}catch{return {status:'INVALID_POINTER'}}
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
     typeof entry.release_id!=='string'||!UUID.test(entry.release_id))
    return {status:'INVALID_POINTER'};
  return {status:'CANDIDATE_UNVERIFIED',release_id:entry.release_id,
    updated_ms:Math.floor(st.mtimeMs)};
}
export function discoverP05ActiveReleases({rootOut,maxProjects=32}={}){
  if(typeof rootOut!=='string'||!path.isAbsolute(rootOut))fail('M58_DISCOVERY_ROOT_INVALID');
  if(!Number.isSafeInteger(maxProjects)||maxProjects<1||maxProjects>100)
    fail('M58_DISCOVERY_LIMIT_INVALID');
  const out=path.resolve(rootOut);
  if(!statDir(out,true))
    return {status:'NO_RELEASES',root_out:out,projects:[],may_publish:false};
  const releases=path.join(out,'releases');
  if(!statDir(releases,true))
    return {status:'NO_RELEASES',root_out:out,projects:[],may_publish:false};
  const entries=fs.readdirSync(releases,{withFileTypes:true});
  // Never silently truncate a list: that could hide a recent candidate.
  if(entries.length>maxProjects)fail('M58_DISCOVERY_TOO_MANY_ENTRIES');
  const projects=[];
  for(const dirent of entries){
    const name=dirent.name;
    if(!ID.test(name)||!dirent.isDirectory()||dirent.isSymbolicLink())
      fail('M58_DISCOVERY_UNSAFE_ENTRY');
    const folder=path.join(releases,name);
    statDir(folder);
    const pointer=discoverPointer(path.join(folder,'current.json'));
    if(pointer.status==='CANDIDATE_UNVERIFIED'){
      const release=path.join(folder,pointer.release_id);
      try{statDir(release)}catch{pointer.status='MISSING_RELEASE'}
    }
    projects.push({project_id:name,...pointer});
  }
  projects.sort((a,b)=>(b.updated_ms??0)-(a.updated_ms??0)||
    a.project_id.localeCompare(b.project_id,'en'));
  return {
    status:projects.length?'FOUND_CANDIDATES':'NO_RELEASES',
    root_out:out,projects,may_publish:false,
    caveat:'Discovery reads current.json only. Candidates are not attested or decoded. Invalid entries are never silently skipped.',
  };
}

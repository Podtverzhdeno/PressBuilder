/**
 * Reuse only completed, source-pinned P08 scene versions with SHA-verified
 * immutable media and source snapshots. Never approve a cached draft.
 */
import path from 'node:path';

export function findReusableScene({id,slide_id,source_fingerprint,versions,reviews,baseUrl}){
  if(!/^[a-f0-9]{64}$/.test(source_fingerprint||''))return null;
  const entries=versions.list(id,slide_id);
  for(let i=entries.length-1;i>=0;i--){
    const candidate=entries[i];
    // Legacy P08 archives lack the full render engine fingerprint. Treat as
    // cache miss even if their narrower P08 source hash matches.
    if(candidate.render_fingerprint!==source_fingerprint||
       candidate.qa?.verdict!=='PASS')continue;
    if(reviews.unresolved(id,slide_id,candidate.version_id))continue;
    try{
      const artifact=versions.verified(id,slide_id,candidate.version_id);
      versions.readSource(id,slide_id,candidate.version_id);
      if(artifact.job_id!==candidate.job_id||artifact.qa?.verdict!=='PASS')continue;
      const name=path.basename(artifact.file);
      return {job_id:artifact.job_id,output_name:name.slice(0,-4),
        version_id:artifact.version_id,qa_report:artifact.qa,
        result:{file:artifact.file,version_id:artifact.version_id,size:artifact.size,
          download_url:baseUrl().replace(/\/$/,'')+'/out/'+name}};
    }catch{
      // A damaged archive is never treated as a successful cache hit.
      // Normal rendering can proceed, producing a distinct new version.
    }
  }
  return null;
}

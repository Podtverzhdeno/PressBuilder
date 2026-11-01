/** P15 stage-only CAS sidecar declaration. Never represents published MP4 approval. */
export interface RhythmSidecar {
  schema_version:1;
  project_id:string;
  revision:number;
  status:'empty'|'submitted'|'endorsed_nonpublishable'|'rejected';
  proposal:null | {
    plan_sha256:string;voice_source_sha256:string;timebase_revision:string;
    frame_rate:{num:number;den:number};
    cuts:Array<{id:string;frame:number;reason:string;cue_id:string|null}>;
    discarded_count:number;
    provenance:{word_alignment_verified:false;music_rights_verified:false}
  };
  author:null|{id:string;note:string;at:string};
  review:null|{reviewer_id:string;decision:'endorse'|'reject';note:string;at:string;plan_sha256:string};
  history:unknown[];
  source_state?:'CURRENT'|'STALE'|'NOT_APPLICABLE';
  publication_allowed:false;
}
export function rhythmDraftStore(input:{
  root:string;
  getDeck:(id:string)=>unknown;
  previewService:{
    context(id:string):{voice_source_sha256:string;timebase_revision:string};
    preview(id:string,manifest:Record<string,unknown>):unknown;
  };
  now?:()=>string;
}):{
  status(id:string,actor:{id:string;role:string;projects?:string[];scenes?:string[]}):RhythmSidecar;
  submit(id:string,actor:{id:string;role:string},manifest:Record<string,unknown>,expected_revision:number,note:string):RhythmSidecar;
  decide(id:string,actor:{id:string;role:string;projects:string[];scenes:string[]},
    data:{expected_revision:number;plan_sha256:string;decision:'endorse'|'reject';note:string}):RhythmSidecar;
};

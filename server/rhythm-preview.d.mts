/** Typed boundary for the P15 read-only JavaScript adapter. */
export interface RhythmServerContext {
  project_id: string;
  voice_source_sha256: string;
  alignment_revision: string;
  timebase_revision: string;
  duration_us: number;
  frame_rate: { num:number; den:number };
  voice_verified: boolean;
  word_alignment_verified: false;
  cues: Array<{scene_id:string;cue_id:string;start_us:number;end_us:number}>;
  note:string;
}
export interface RhythmServerCut {
  id:string;frame:number;cue_id:string|null;reason:string;confidence:string;
}
export interface RhythmServerResult {
  status:'REVIEW'|'READY_FOR_REVIEW';
  cuts:RhythmServerCut[];
  discarded:Array<{frame:number;reason:string;violation:string}>;
  issues:string[];
  approved:false;
  persisted:false;
  publication_allowed:false;
  [other:string]:unknown;
}
export function rhythmPreviewService(input:{
  root:string;
  getDeck:(id:string)=>unknown;
  enabled?:boolean;
}):{
  context(id:string):RhythmServerContext;
  preview(id:string,manifest:Record<string,unknown>):RhythmServerResult;
  measuredSilence(id:string): {
    schema_version:1;analysis:'MEASURED_AUDIO_SILENCE';
    project_id:string;audio_source_sha256:string;timebase_revision:string;
    silences:Array<{start_us:number;end_us:number;method:string;confidence:string;
      scene_id:string|null;cue_id:string|null}>;
    word_alignment_verified:false;publication_allowed:false;
    note:string;
  };
};

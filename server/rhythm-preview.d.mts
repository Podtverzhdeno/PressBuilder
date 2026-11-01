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
  audioEvidenceEnabled?:boolean;
  rightsVerifier?:{verify(projectId:string,music:Record<string,unknown>):{verified:boolean}}|null;
  audioInspector?:(args:Record<string,unknown>)=>unknown;
}):{
  context(id:string):RhythmServerContext;
  preview(id:string,manifest:Record<string,unknown>):RhythmServerResult;
};

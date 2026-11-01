export interface StoryContext {
  project_id:string;
  plan_revision:number;
  script_fingerprint:string;
  source_sha256:string;
  fps:number|null;
  duration_us:number;
  scenes:Array<{scene_id:string;source_index:number;label:string;
    source_start_us:number;duration_us:number;
    cue_anchors:Array<{cue_id:string;text:string;source_sha256:string;start_us:number;end_us:number}>}>;
}
export interface StoryPreview {
  schema_version:1;status:'READY_FOR_REVIEW';project_id:string;
  plan_revision:number;source_sha256:string;script_fingerprint:string;
  candidates:Array<{candidate_id:string;order:string[];reason:string;
    plan_sha256:string;estimated_duration_us:number;
    beats:Array<{beat_index:number;narrative_role:string;scene_id:string;
      source_index:number;source_start_us:number;estimated_duration_us:number;
      editorial_note:string;
      cue_anchors:Array<{cue_id:string;text:string;source_sha256:string;
        source_start_us:number;source_end_us:number}>}>;
    approved:false;downstream_eligible:false;publication_allowed:false}>;
  coverage:{scenes:number;variants:number;claim_sources:number;source_facts_rewritten:number};
  require_human_storyboard_approval:true;applied:false;approved:false;
  downstream_eligible:false;publication_allowed:false;limitations:string[];
}
export function approvedScriptFingerprint(deck:unknown):string;
export function creativeStoryboardService(input:{
  getDeck:(id:string)=>unknown;
  getDirectorPlan:(id:string)=>unknown;
  enabled?:boolean;
}):{
  context(id:string):StoryContext;
  preview(id:string,manifest:{expected_plan_revision:number;expected_source_sha256:string}):StoryPreview;
};

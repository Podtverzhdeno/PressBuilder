import type {StyleContractRecord} from './style-contract.mjs';
export interface AssemblyState {subject:string;background:string;camera:[number,number];motion:string}
export interface AssemblyTransition {type:'hard-cut'|'crossfade'|'match-cut';duration:number}
export interface AssemblyPlan {schemaVersion:1;scenes:{
  scene_id:string;
  entry_state:AssemblyState;
  exit_state:AssemblyState;
  transition_after:AssemblyTransition;
}[]}
export interface AssemblyPlanRecord {id:string;revision:number;plan:AssemblyPlan;updated_at:string|null;source:'saved'|'generated'}
export function validateAssemblyPlan(plan:AssemblyPlan,deck:{slides:{id:string}[]},contract:StyleContractRecord['contract']):AssemblyPlan;
export function assemblyPlanStore(args:{
  root:string;getDeck:(id:string)=>{slides:{id:string}[]};getStyle:(id:string)=>StyleContractRecord
}):{
  read:(id:string)=>AssemblyPlanRecord;
  put:(id:string,plan:AssemblyPlan,expected_revision:number)=>AssemblyPlanRecord;
};

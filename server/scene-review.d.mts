export interface ReviewRegion {x:number;y:number;w:number;h:number}
export type ReviewStatus='OPEN'|'FIXED'|'VERIFIED'|'REOPENED';
export interface ReviewItem {
 id:string;scene_id:string;render_revision:string;t:number;fps:number;frame:number;
 severity:'minor'|'major'|'blocker';text:string;author:string;region:ReviewRegion|null;
 status:ReviewStatus;revision:number;created_at:string;updated_at:string;
 has_frame_evidence?:boolean;frame_evidence?:string|null;
 history:{at:string;actor:string;status:ReviewStatus;note:string}[];
}
export interface ReviewList {scene_id:string;revision:number;items:ReviewItem[]}
export function sceneReviewStore(args:{root:string;getDeck:(id:string)=>{slides:{id:string}[]}}):{
 list:(id:string,sid:string)=>ReviewList;
 get:(id:string,sid:string,itemId:string)=>ReviewItem;
 create:(id:string,sid:string,payload:Record<string,unknown>,actor:{id:string},render?:{status:string;job_id:string})=>ReviewItem;
 update:(id:string,sid:string,itemId:string,payload:Record<string,unknown>,actor:{id:string})=>ReviewItem;
};

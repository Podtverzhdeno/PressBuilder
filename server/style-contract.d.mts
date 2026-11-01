export interface StyleContract {
  schemaVersion:1;
  enforce:boolean;
  palette:string[];
  typography:{fonts:string[];minFontSize:number;maxTextLength:number};
  safeArea:{left:number;right:number;top:number;bottom:number};
  camera:{maxYawSpeed:number;maxPitchSpeed:number};
  motion:{maxSpin:number};
  transitions:{allowed:string[];maxDuration:number};
  sceneOverrides?:Record<string,unknown>;
}
export interface StyleContractRecord {
  id:string;revision:number;contract:StyleContract;updated_at:string|null;
}
export function validateStyleContract(x:StyleContract):StyleContract;
export function effectiveStyle(contract:StyleContract,sceneId?:string):StyleContract;
export function enforceScene3D(contract:StyleContract,spec:unknown,sceneId?:string):void;
export function enforceVisuals(contract:StyleContract,elements:unknown[],sceneId?:string,theme?:{h1:string;accent:string;text:string;pos:string;panel:string;bg:string}):void;
export function styleContractStore(args:{
  root:string;
  getDeck:(id:string)=>{slides:{id:string;visuals?:unknown[]}[]}
}):{
  read:(id:string)=>StyleContractRecord;
  put:(id:string,contract:StyleContract,expected_revision:number)=>StyleContractRecord;
};

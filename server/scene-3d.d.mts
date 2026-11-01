import type {Scene3DRecord,Scene3DSpec} from '../src/engine/scene3d.ts';
export function scene3dStore(args:{root:string;seedRoot?:string;getDeck:(id:string)=>{slides:{id:string}[]}}):{
  read:(id:string,slideId:string)=>Scene3DRecord;
  list:(id:string)=>Scene3DRecord[];
  put:(id:string,slideId:string,spec:Scene3DSpec,expected_revision:number)=>Scene3DRecord;
};

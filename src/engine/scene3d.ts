/**
 * Data-only 3D authoring for chat/MCP-created video scenes.
 * Uses the same deterministic camera projection and shaded solids as built-in
 * Game-Ready 3D scenes. Nothing from JSON is eval'd or dynamically imported.
 */
import {drawSolid,drawWire,depthOf,MESH,type View,type V3} from './wire3d.ts';
import {clamp01,easeOutCubic} from './anim.ts';
import type {SceneDef} from './types.ts';

export type MeshName='cube'|'pyramid'|'octa'|'icosa'|'hexPrism'|'cylinder';
export interface Scene3DCamera{
  cx:number;cy:number;size:number;dist:number;
  yaw:number;pitch:number;yaw_speed:number;pitch_speed:number;zoom_speed:number;
}
export interface Scene3DObject{
  id:string;mesh:MeshName;pos:V3;scale:number;
  rotation:V3;spin:V3;color:string;edge_color:string|null;
  wire:boolean;start:number;fade:number;
}
export interface Scene3DSpec{version:1;camera:Scene3DCamera;objects:Scene3DObject[]}
export interface Scene3DRecord{
  id:string;scene_id:string;revision:number;spec:Scene3DSpec|null;updated_at:string|null;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function scene3dDefinition(scene_id:string,spec:Scene3DSpec):SceneDef{
  return {
    id:scene_id,
    energy(t){
      return clamp01(.15+spec.objects.reduce((sum,o)=>sum+(t>o.start?0.12:0),0));
    },
    render(frame){
      const {ctx,t}=frame;
      const camera:View={
        cx:spec.camera.cx,cy:spec.camera.cy,
        size:clamp(spec.camera.size*(1+spec.camera.zoom_speed*t),20,800),
        dist:spec.camera.dist,
        yaw:spec.camera.yaw+spec.camera.yaw_speed*t,
        pitch:clamp(spec.camera.pitch+spec.camera.pitch_speed*t,-1.4,1.4),
      };
      const inDepth=spec.objects.map(o=>({o,z:depthOf(o.pos,camera)}))
        .sort((a,b)=>a.z-b.z);
      for(const {o} of inDepth){
        frame.obj('3d:'+o.id,{
          x:camera.cx,y:camera.cy,abs:true,
          label:'3D '+o.mesh+' · '+o.id
        },()=>{
          const visibility=easeOutCubic(clamp01((t-o.start)/o.fade));
          if(visibility<=0)return;
          const xf={
            pos:o.pos,scale:o.scale*visibility,
            rx:o.rotation[0]+o.spin[0]*t,
            ry:o.rotation[1]+o.spin[1]*t,
            rz:o.rotation[2]+o.spin[2]*t,
          };
          const mesh=MESH[o.mesh];
          ctx.save();ctx.globalAlpha*=visibility;
          drawSolid(ctx,mesh,camera,xf,{color:o.color,edge:o.edge_color,ambient:.38});
          if(o.wire)drawWire(ctx,mesh,camera,xf,{color:o.edge_color||'#ffffff',width:2,depthFade:.65});
          ctx.restore();
        });
      }
    }
  };
}

/**
 * Data-driven video graphics, editable and renderable without generated JS.
 * The server validates all shapes before persisting them to deck.json.
 */
import { seg, lerp } from './anim.ts';
import { C, FONT } from './theme.ts';
import { rrPath } from './draw.ts';
import type { Frame, SceneDef, VisualElement } from './types.ts';

const palette = (name: VisualElement['color']): string => {
  switch(name){
    case 'text': return C.text;
    case 'accent': return C.accent;
    case 'pos': return C.pos;
    case 'panel': return C.panel;
    case 'bg': return C.bg;
    case 'h1': return C.h1;
    default: return C.h1;
  }
};
const ease=(n:number)=>1-Math.pow(1-Math.max(0,Math.min(1,n)),3);
export function visualScene(elements: VisualElement[]): SceneDef {
  return {
    id:'data',
    render(frame:Frame){
      const ctx=frame.ctx;
      for(const v of elements){
        const t=v.cue_id ? frame.cue(v.cue_id).t : frame.t;
        const p=seg(t,0,v.duration??0.7);
        if(p<=0)continue;
        const e=ease(p);
        const x=v.x,y=v.y;
        frame.obj(v.id,{x,y,text:v.text||'',label:v.text?.slice(0,48)||v.kind},(o)=>{
          ctx.save();
          ctx.globalAlpha *= e;
          if(v.effect==='rise')ctx.translate(0,(1-e)*45);
          if(v.effect==='slide')ctx.translate((1-e)*80,0);
          if(v.effect==='pop')ctx.scale(lerp(0.82,1,e),lerp(0.82,1,e));
          const color=palette(v.color);
          const w=v.w??400,h=v.h??130;
          if(v.kind==='text'){
            ctx.font = (v.weight==='regular'?'400':'700')+' '+(v.size??80)+'px '+(v.font==='mono'?FONT.mono:v.font==='sans'?FONT.sans:FONT.display);
            ctx.fillStyle=color;
            ctx.textBaseline='top';
            ctx.textAlign='left';
            ctx.fillText(o.text,0,0,Math.max(1,w));
          }else if(v.kind==='rect'){
            ctx.fillStyle=color;
            rrPath(ctx,0,0,w,h,v.radius??24);
            ctx.fill();
          }else if(v.kind==='circle'){
            ctx.fillStyle=color;
            ctx.beginPath();ctx.arc(0,0,v.radius??70,0,Math.PI*2);ctx.fill();
          }else if(v.kind==='line'){
            ctx.strokeStyle=color;ctx.lineWidth=v.line_width??7;
            ctx.lineCap='round';
            ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(w*e,h*e);ctx.stroke();
          }else if(v.kind==='bar'){
            ctx.fillStyle=color;
            rrPath(ctx,0,0,w*e,h,v.radius??18);ctx.fill();
          }
          ctx.restore();
        });
      }
    }
  };
}

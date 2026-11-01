/**
 * Browser-side structural audit of data-authored text. This deliberately
 * reports only issues that can be measured; TypeScript-authored art still
 * requires screenshot review. The font stack/fit routine mirrors visuals.ts.
 */
import {FONT,H,SAFE_BOTTOM,W,setStyle} from './theme.ts';
import type {DeckData,VisualElement} from './types.ts';

export interface VisualIssue{
  id:string;severity:'FAIL'|'REVIEW';slide_id:string;object_id:string;
  message:string;metrics?:Record<string,number>;
}
export interface VisualAudit{
  scope:'DATA_TEXT_ONLY';verdict:'PASS'|'REVIEW'|'FAIL';
  tested_texts:number;issues:VisualIssue[];
  uninspected_scenes:string[];
}

export function auditDataText(deck:DeckData,ctx:CanvasRenderingContext2D):VisualAudit{
  const issues:VisualIssue[]=[];
  const uninspected_scenes:string[]=[];
  let tested=0;
  setStyle(deck.style);
  const report=(id:string,severity:VisualIssue['severity'],slide_id:string,object_id:string,message:string,metrics?:Record<string,number>)=>{
    issues.push({id,severity,slide_id,object_id,message,...(metrics?{metrics}:{})});
  };
  for(const slide of deck.slides){
    if(!slide.visuals?.length){uninspected_scenes.push(slide.id);continue}
    const rectangles:Array<{id:string,x:number,y:number,w:number,h:number}>=[];
    for(const v of slide.visuals){
      if(v.kind!=='text'||!v.text?.trim())continue;
      tested++;
      const family=v.font==='mono'?FONT.mono:v.font==='sans'?FONT.sans:FONT.display;
      const weight=v.weight==='regular'?'400':'700';
      const lines=String(v.text).split(/(?:\\n|\n)/);
      const available=Math.max(24,Math.min(v.w??400,W-v.x-40));
      const requested=v.size??80;
      let size=requested;
      ctx.font=weight+' '+size+'px '+family;
      while(size>24&&lines.some(line=>ctx.measureText(line).width>available)){
        size=Math.max(24,size-2);
        ctx.font=weight+' '+size+'px '+family;
      }
      const measured=Math.max(...lines.map(line=>ctx.measureText(line).width),0);
      const height=Math.max(1,lines.length)*size*1.18;
      const right=v.x+measured;
      const bottom=v.y+height;
      if(measured>available+2){
        report('TEXT_UNFIT','FAIL',slide.id,v.id,
          'Glyphs are wider than the usable text box even at minimum font size',
          {measured_width:Math.round(measured),available_width:Math.round(available),font_size:size});
      }
      if(v.x < -1 || v.y < -1 || right>W+1 || bottom>H+1){
        report('TEXT_OUTSIDE_FRAME','FAIL',slide.id,v.id,'Text extends outside the 1920x1080 logical frame',
          {x:v.x,y:v.y,right:Math.round(right),bottom:Math.round(bottom)});
      }else if(v.x<55||right>W-55||bottom>H-SAFE_BOTTOM){
        report('TEXT_SAFE_AREA','REVIEW',slide.id,v.id,'Text touches the safe-area border',
          {x:v.x,right:Math.round(right),bottom:Math.round(bottom)});
      }
      if(requested>=40&&size/requested<.6){
        report('TEXT_EXCESSIVE_SHRINK','REVIEW',slide.id,v.id,'Font size was reduced by more than 40% to fit',
          {requested_font_size:requested,actual_font_size:size});
      }
      rectangles.push({id:v.id,x:v.x,y:v.y,w:measured,h:height});
    }
    for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++){
      const a=rectangles[i],b=rectangles[j];
      const iw=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
      const ih=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
      const smaller=Math.min(a.w*a.h,b.w*b.h);
      if(smaller>0&&iw*ih/smaller>.4){
        report('TEXT_POTENTIAL_OVERLAP','REVIEW',slide.id,a.id,
          'Text overlaps another text box; verify deliberate layering with animation',{overlap_ratio:Number((iw*ih/smaller).toFixed(3))});
      }
    }
  }
  return {
    scope:'DATA_TEXT_ONLY',tested_texts:tested,issues,uninspected_scenes,
    verdict:issues.some(i=>i.severity==='FAIL')?'FAIL':issues.length?'REVIEW':'PASS',
  };
}

export interface FrameLuminance {
  t:number;mean_luma:number;near_black_fraction:number;pixels:number;
}
/** Signal-only screenshot check, sampled at actual rendered frames. */
export function frameLuminance(
  input:HTMLCanvasElement,t:number,
  sampleCanvas?:HTMLCanvasElement
):FrameLuminance{
  const small=sampleCanvas??document.createElement('canvas');
  small.width=64;small.height=36;
  const ctx=small.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('QA canvas unavailable');
  ctx.clearRect(0,0,64,36);
  ctx.drawImage(input,0,0,64,36);
  const rgba=ctx.getImageData(0,0,64,36).data;
  let sum=0,nearBlack=0;
  for(let i=0;i<rgba.length;i+=4){
    const l=.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2];
    sum+=l;if(l<=6)nearBlack++;
  }
  const pixels=rgba.length/4;
  return {t,mean_luma:Number((sum/pixels).toFixed(2)),
    near_black_fraction:Number((nearBlack/pixels).toFixed(4)),pixels};
}

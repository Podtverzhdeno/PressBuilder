/**
 * Cinematic A2A hero — one real 3D scene, based on the same time-driven
 * mesh / camera primitives used by the Game-Ready 3D character scenes.
 * Every frame is deterministic: no timers, network, WebGL or external assets.
 */
import { clamp01, easeOutQuart, easeInOutCubic, hash11, seg } from '../../engine/anim.ts';
import { softLight, shockRing } from '../../engine/draw.ts';
import { FONT } from '../../engine/theme.ts';
import { drawGrid, drawSolid, drawWire, MESH, project, type Mesh, type View, type V3 } from '../../engine/wire3d.ts';
import type { Frame, SceneDef } from '../../engine/types.ts';

const NAVY = '#06101f';
const INK = '#0b1e34';
const CYAN = '#5be6ff';
const AZURE = '#339dff';
const GOLD = '#ffbd65';
const WHITE = '#f3faff';
const MUTED = '#a3c2d9';
const TAU = 2 * Math.PI;

/** An actually curved torus surface in 3D, lit facet-by-facet by the mesh renderer. */
function torus(R: number, r: number, steps = 52, sides = 7): Mesh {
  const verts: V3[] = [];
  const faces: number[][] = [];
  const edges: Array<[number, number]> = [];
  const ix = (i: number, j: number) => ((i + steps) % steps) * sides + ((j + sides) % sides);
  for (let i = 0; i < steps; i++) {
    const th = i * TAU / steps;
    for (let j = 0; j < sides; j++) {
      const ph = j * TAU / sides, rad = R + r * Math.cos(ph);
      verts.push([rad * Math.cos(th), r * Math.sin(ph), rad * Math.sin(th)]);
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < sides; j++) {
    const a = ix(i, j), b = ix(i, j + 1), c = ix(i + 1, j + 1), d = ix(i + 1, j);
    faces.push([a, b, c, d]);
    if (j === 0) edges.push([a, d]);
  }
  return { verts, faces, edges, oriented: true };
}
const OUTER = torus(1.77, 0.055);
const INNER = torus(1.40, 0.045);
const BOUND = torus(2.06, 0.020, 62, 5);

const particles = Array.from({length: 86},(_,i)=>({
  x: 74 + hash11(i*5.4+1.3)*1780,
  y: 45 + hash11(i*7.3+11.4)*970,
  r: 0.7 + hash11(i*2.1+21.8)*2.2,
  d: .2 + hash11(i*3.1+6.3)*.9,
}));
const stars = Array.from({length: 50},(_,i)=>{
  const a = hash11(i*9.91+3.23)*TAU, r = .65+hash11(i*4.2+17)*2.4;
  return {a,r,phase:hash11(i*6.13+14)*TAU};
});
const smooth=(t: number, start: number, dur: number)=>easeInOutCubic(seg(t,start,dur));
const glow=(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number)=>{
  ctx.save();ctx.globalAlpha*=alpha;softLight(ctx,x,y,r,color,0.65);ctx.restore();
};
const line=(ctx:CanvasRenderingContext2D,x:number,y:number,tx:number,ty:number,color:string,width:number,alpha=1)=>{
  ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;
  ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();ctx.restore();
};
function label(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,size:number,color:string,mono=false,alpha=1){
  ctx.save();ctx.globalAlpha*=clamp01(alpha);ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.font=(mono?'500 ':'700 ')+size+'px '+(mono?FONT.mono:FONT.display);
  ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=mono?8:15;
  ctx.fillText(text,x,y);ctx.restore();
}

/** Independently orbiting glowing arc particles, perspective-projected. */
function orbitalSparks(ctx:CanvasRenderingContext2D,t:number,v:View,visibility:number){
  ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=visibility;
  for(let i=0;i<24;i++){
    const a=t*(0.45+(i%3)*.18) + stars[i].phase;
    const rad=stars[i].r;
    const p:V3=[rad*Math.cos(a),.5*Math.sin(a*1.6+i),rad*.7*Math.sin(a)];
    const [x,y,z]=project(p,v);
    const size=(z+6)/12*4 + (i%4===0?4:1);
    ctx.fillStyle=i%4===0?GOLD:CYAN;
    ctx.shadowBlur=15;ctx.shadowColor=ctx.fillStyle;
    ctx.beginPath();ctx.arc(x,y,Math.max(1,size),0,TAU);ctx.fill();
  }
  ctx.restore();
}

export const heroScene: SceneDef = {
  id: 's01',
  energy(t){return .25 + .75*(smooth(t,1.0,1.4)-.35*smooth(t,5.5,.6));},
  render(f:Frame){
    const {ctx,t}=f;
    const appear=smooth(t,.15,1.1);
    const lock=smooth(t,1.05,1.1);
    const title=smooth(t,1.55,.9);
    const subtitle=smooth(t,3.05,.8);
    const finale=smooth(t,4.25,1.0);
    const pulse=smooth(t,4.45,.55);

    // In-scene grading covers the entire canvas including the timeline safe margins.
    const bg=ctx.createLinearGradient(0,0,1920,1080);
    bg.addColorStop(0,'#030917');bg.addColorStop(.51,NAVY);bg.addColorStop(1,INK);
    ctx.fillStyle=bg;ctx.fillRect(-210,-60,2340,1280);
    glow(ctx,1230,493,830,AZURE,.30*appear);
    glow(ctx,1390,500,590,CYAN,.25*appear);
    glow(ctx,1120,710,550,GOLD,.12*lock);

    // Slow multi-depth parallax and calibrated starfield.
    ctx.save();
    for(const p of particles){
      const y=p.y+Math.sin(t*.48+p.x)*p.d*14;
      ctx.globalAlpha=(.12 + .42*appear)*(0.6+.4*Math.sin(t*.75+p.x*.01)**2);
      ctx.fillStyle=CYAN;ctx.beginPath();ctx.arc(p.x+Math.sin(t*.25+p.y)*p.d*10,y,p.r,0,TAU);ctx.fill();
    }
    ctx.restore();

    const push=1+0.17*easeOutQuart(seg(t,0,4.7))-.07*smooth(t,5.25,.8);
    const cam:View={cx:1280+Math.sin(t*.4)*20,cy:500+Math.cos(t*.35)*12,size:188*push,
      pitch:.33 + .16*Math.sin(t*.57),
      yaw:-.50+t*.37,dist:9.3};
    f.obj('hologram-core',{x:1280,y:510,abs:true,label:'Вращающееся 3D-ядро сделки'},()=>{
      if(appear<=0)return;
      ctx.save();ctx.globalAlpha*=appear;
      ctx.globalCompositeOperation='screen';
      drawGrid(ctx,{...cam,cy:787,size:140,yaw:(cam.yaw ?? 0)*.6},{half:4.5,halfZ:3.6,step:.5,y:-2.20,color:'rgba(66,161,208,.12)'});
      ctx.globalCompositeOperation='source-over';

      // Three independent rigid-body turns + real perspective.
      const ry=t*.93;
      const r1={ry:ry*.74,rx:1.0+Math.sin(t*.22)*.2,rz:.17};
      const r2={ry:-ry*.66,rx:.34,rz:1.08};
      const r3={ry:ry*.37,rx:1.12,rz:1.18};
      drawSolid(ctx,BOUND,cam,r3,{color:'#1473a6',edge:null,ambient:.55});
      drawSolid(ctx,OUTER,cam,r1,{color:'#24afda',edge:null,ambient:.50});
      drawSolid(ctx,INNER,cam,r2,{color:'#e4a554',edge:null,ambient:.55});
      ctx.globalCompositeOperation='screen';ctx.globalAlpha*=.42;
      drawWire(ctx,BOUND,cam,r3,{color:AZURE,width:2.3,p:lock});
      drawWire(ctx,OUTER,cam,r1,{color:CYAN,width:2.6,p:lock});
      drawWire(ctx,INNER,cam,r2,{color:GOLD,width:2.3,p:lock});
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=appear;

      // Floating contract diamond; not a flat billboard.
      const coreT={ry:-t*.6,rx:.22+Math.sin(t*.65)*.18,scale:1.46};
      drawSolid(ctx,MESH.icosa,cam,coreT,{color:'#21a7ce',ambient:.30,edge:'#7de7ff',edgeWidth:1.6});
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.5+.3*Math.sin(t*3)**2;
      drawWire(ctx,MESH.icosa,cam,coreT,{color:'#b5f6ff',width:2.4,p:1,dots:1});
      ctx.restore();
      const hexAngle=t*1.05;
      for(let i=0;i<8;i++){
        const a=i*TAU/8+hexAngle, radius=2.36;
        const point:V3=[radius*Math.cos(a),.54*Math.sin(a*1.5),radius*.60*Math.sin(a)];
        drawSolid(ctx,MESH.icosa,cam,{pos:point,scale:i%3===0?.19:.11,ry:t*.7},
          {color:i%3===0?GOLD:AZURE,ambient:.62,edge:null});
      }
      orbitalSparks(ctx,t,cam,lock);
      ctx.restore();
    });

    // Depth pulses and elegant targeting marks. Separate from geometric rotation.
    if(lock>0){
      ctx.save();ctx.globalAlpha=.6*lock;
      shockRing(ctx,cam.cx,cam.cy,seg(t,1.18,1.7),490,CYAN,6);
      shockRing(ctx,cam.cx,cam.cy,seg(t,4.49,1.2),720,GOLD,8);
      ctx.restore();
    }
    if(finale>0){
      line(ctx,950,790,1605,790,CYAN,2.2,finale*.75);
      label(ctx,'DEAL STATE  /  VERIFIED',998,835,25,CYAN,true,finale);
    }

    // Dedicated typography, no maxWidth compression or pseudo-3D text stretching.
    f.obj('hero-title',{x:144,y:390,abs:true,text:'A2A',label:'Главный заголовок'},o=>{
      if(title<=0)return;
      ctx.save();ctx.globalAlpha*=title;ctx.translate(-70*(1-easeOutQuart(title)),0);
      label(ctx,o.text,144,390,169,WHITE,false,1);
      ctx.restore();
    });
    f.obj('blockchain-title',{x:147,y:503,abs:true,text:'× BLOCKCHAIN',label:'Технология'},o=>{
      if(title<=0)return;
      ctx.save();ctx.globalAlpha*=smooth(t,1.95,.75);ctx.translate(-100*(1-smooth(t,1.95,.75)),0);
      label(ctx,o.text,147,501,54,CYAN,false,1);
      ctx.restore();
    });
    f.obj('hero-subtitle',{x:152,y:670,abs:true,text:'Доверенная B2B-сделка',label:'Подзаголовок'},o=>{
      if(subtitle<=0)return;ctx.save();
      ctx.globalAlpha*=subtitle;ctx.translate(0,28*(1-subtitle));
      label(ctx,o.text,153,671,42,WHITE,false,1);ctx.restore();
    });
    f.obj('hero-strap',{x:157,y:782,abs:true,text:'АГЕНТЫ СОГЛАСУЮТ  •  БАНК ИСПОЛНЯЕТ',label:'Итог'},o=>{
      if(finale<=0)return;ctx.save();ctx.globalAlpha*=finale;
      label(ctx,o.text,157,784,25,MUTED,true,1);ctx.restore();
    });
    // Animated scanning band, scaled to the shot; dies down after reveal.
    if(t>1.65 && t<4.9){
      const scan=seg(t,1.65,3.2);
      ctx.save();ctx.globalAlpha*=.16*(1-smooth(t,4.15,.7));
      const g=ctx.createLinearGradient(0,0,210,0);
      g.addColorStop(0,'rgba(91,230,255,0)');g.addColorStop(.5,CYAN);g.addColorStop(1,'rgba(91,230,255,0)');
      ctx.fillStyle=g;ctx.translate(-300+2300*scan,0);ctx.fillRect(0,50,210,850);ctx.restore();
    }
    if(pulse>0){
      ctx.save();ctx.globalAlpha*=.13*(1-smooth(t,5.0,.55));
      ctx.fillStyle=GOLD;ctx.fillRect(-210,-60,2340,1280);ctx.restore();
    }
    // Cinematic top/bottom rules, not default UI cards.
    line(ctx,155,113,1764,113,CYAN,2,.4+.3*appear);
    line(ctx,155,935,1764,935,CYAN,2,.3+.4*finale);
  }
};
export const SCENES: SceneDef[] = [heroScene];

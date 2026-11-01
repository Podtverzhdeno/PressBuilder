import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditDataText,frameLuminance} from '../src/engine/visual-qa.ts';
import {mergeVisualQA} from '../server/video-qa.mjs';

function canvasContext(){
  return {
    font:'700 80px Arial',
    measureText(text){
      const px=Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1]||80);
      return {width:String(text).length*px*.57};
    }
  };
}
function project(visuals){
  return {id:'film',style:'terevo',format:{height:720,fps:24},slides:[
    {id:'s01',label:'Scene 1',cues:[{id:'c01',say:'Sample'}],visuals},
    {id:'s02',label:'Scene 2',cues:[{id:'c02',say:'Other'}],visuals:[]},
  ]};
}
const txt=(id,text,extra={})=>({id,kind:'text',text,x:220,y:230,w:750,h:120,size:80,...extra});
const technical={verdict:'PASS',issues:[],metadata:{codec:'h264',fps:24}};

test('P03 measured text fits without deformation and no false alarm from TS scene',()=>{
  const ok=auditDataText(project([txt('headline','HELLO')]),canvasContext());
  assert.equal(ok.verdict,'PASS');
  assert.equal(ok.tested_texts,1);
  assert.deepEqual(ok.uninspected_scenes,['s02']);
  const excluded=auditDataText(project([txt('headline','X'.repeat(160))]),canvasContext(),'s01',['s01']);
  assert.equal(excluded.verdict,'PASS');
  assert.equal(excluded.tested_texts,0);
  assert.deepEqual(excluded.uninspected_scenes,['s01']);
});
test('P03 rejects text that cannot fit at minimum font size',()=>{
  const v=auditDataText(project([txt('bad','W'.repeat(130),{w:100})]),canvasContext(),'s01');
  assert.equal(v.verdict,'FAIL');
  assert.ok(v.issues.some(x=>x.id==='TEXT_UNFIT'&&x.object_id==='bad'));
});
test('P03 detects off-screen captions and flags important overlaps for review',()=>{
  const d=project([
    txt('off','HELLO',{x:220,w:500}),
    txt('first','TWO',{x:250,y:380}),
    txt('second','THREE',{x:275,y:405}),
  ]);
  d.slides[0].objects={off:{x:2050,y:250,scale:1}};
  const v=auditDataText(d,canvasContext(),'s01');
  assert.equal(v.verdict,'FAIL');
  assert.ok(v.issues.some(x=>x.id==='TEXT_OUTSIDE_FRAME'));
  assert.ok(v.issues.some(x=>x.id==='TEXT_POTENTIAL_OVERLAP'&&x.severity==='REVIEW'));
});
test('P03 audits editor overrides and ignores hidden source captions',()=>{
  const d=project([txt('moved','HELLO',{x:220}),txt('hidden','W'.repeat(120),{w:65})]);
  d.slides[0].objects={
    moved:{x:1890,y:250,scale:1},
    hidden:{hidden:true},
  };
  const report=auditDataText(d,canvasContext(),'s01');
  assert.equal(report.tested_texts,1,'hidden text must not be audited');
  assert.ok(report.issues.some(x=>x.id==='TEXT_OUTSIDE_FRAME'&&x.object_id==='moved'));
});
test('P03 stage projection prevents false frame-clipping errors for repositioned captions',()=>{
  const d=project([txt('near','Hi',{x:1500,w:400})]);
  d.slides[0].objects={near:{x:1830,y:250,scale:1}};
  const result=auditDataText(d,canvasContext(),'s01');
  assert.equal(result.verdict,'PASS',JSON.stringify(result.issues));
  assert.equal(result.issues.filter(i=>i.id==='TEXT_OUTSIDE_FRAME').length,0);
});
test('P03 frame detector finds all-black video, but not a single legitimate dark cut',()=>{
  const pixels=new Uint8ClampedArray(64*36*4);
  for(let i=3;i<pixels.length;i+=4)pixels[i]=255;
  const mock={getContext:()=>({
    clearRect(){},drawImage(){},getImageData(){return {data:pixels}}
  })};
  const frame=frameLuminance({},1,mock);
  assert.equal(frame.mean_luma,0);
  assert.equal(frame.near_black_fraction,1);
  const failed=mergeVisualQA(technical,null,[frame,{...frame,t:2},{...frame,t:3}]);
  assert.equal(failed.verdict,'FAIL');
  assert.ok(failed.issues.some(x=>x.id==='BLACK_VIDEO'));
  const review=mergeVisualQA(technical,null,[frame,{t:2,mean_luma:30,near_black_fraction:.2}]);
  assert.equal(review.verdict,'REVIEW');
  assert.ok(review.issues.some(x=>x.id==='POSSIBLE_BLACK_FRAME'));
});
test('P03 visual REVIEW remains non-blocking but technical FAIL always blocks',()=>{
  const visual={verdict:'REVIEW',issues:[{id:'TEXT_EXCESSIVE_SHRINK',severity:'REVIEW',slide_id:'s01',
    object_id:'a',message:'Review requested'}],scope:'DATA_TEXT_ONLY',tested_texts:1,uninspected_scenes:[]};
  assert.equal(mergeVisualQA(technical,visual,[]).verdict,'REVIEW');
  const broken={...technical,verdict:'FAIL',issues:[{id:'FPS_MISMATCH',message:'Wrong FPS'}]};
  const report=mergeVisualQA(broken,visual,[]);
  assert.equal(report.verdict,'FAIL');
  assert.ok(report.issues.find(x=>x.id==='FPS_MISMATCH').severity==='FAIL');
});

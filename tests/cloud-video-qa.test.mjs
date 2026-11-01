import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateVideoProbe,inspectMp4} from '../server/video-qa.mjs';

const data={
  format:{duration:'1.041667',size:'240000'},
  streams:[{codec_type:'video',codec_name:'h264',width:1280,height:720,r_frame_rate:'24/1'}]
};
test('P03 technical QA accepts matching H.264 stream, expected FPS and duration',()=>{
  const r=evaluateVideoProbe(data,{height:720,fps:24,duration:1});
  assert.equal(r.verdict,'PASS');assert.equal(r.issues.length,0);
  assert.equal(r.metadata.fps,24);
  assert.equal(r.scope,'TECHNICAL_ONLY');
});
test('P03 reports FPS, aspect, audio and duration defects without fake artistic scores',()=>{
  const broken={format:{duration:'2.5',size:'15000'},streams:[{
    codec_type:'video',codec_name:'hevc',width:1024,height:720,r_frame_rate:'30/1'}]};
  const r=evaluateVideoProbe(broken,{height:720,fps:24,duration:1,audio_required:true});
  assert.equal(r.verdict,'FAIL');
  const ids=r.issues.map(x=>x.id);
  for(const expected of ['VIDEO_CODEC','ASPECT_RATIO','FPS_MISMATCH','DURATION_MISMATCH','AUDIO_MISSING'])
    assert.ok(ids.includes(expected),expected);
});
test('P03 missing MP4 never passes QA',()=>{
  const r=inspectMp4('/does/not/exist/pb-missing.mp4',{height:720,fps:24,duration:1});
  assert.equal(r.verdict,'FAIL');
  assert.equal(r.issues[0].id,'FILE_MISSING');
});

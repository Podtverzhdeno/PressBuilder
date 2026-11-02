import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLoudnormInput,evaluateLoudness} from '../server/release-loudness-qc.mjs';

const report=(i,tp,lra='6.0')=>[
  '[Parsed_loudnorm_0 @ 0x123456] \n{',
  '  "input_i" : "'+i+'",',
  '  "input_tp" : "'+tp+'",',
  '  "input_lra" : "'+lra+'",',
  '  "input_thresh" : "-28.80",',
  '  "output_i" : "-16.20",',
  '  "output_tp" : "-1.55",',
  '  "output_lra" : "7.30",',
  '  "output_thresh" : "-26.20",',
  '  "normalization_type" : "dynamic",',
  '  "target_offset" : "0.20"',
  '}'
].join('\n');
const fail=(code,fn)=>assert.throws(fn,e=>e?.code===code,code);

test('M58 EBU R128 input LUFS/true peak, not normalized output, are used',()=>{
  const m=parseLoudnormInput(report('-18.50','-3.20'));
  assert.deepEqual(m,{integrated_lufs:-18.5,true_peak_dbtp:-3.2,
    loudness_range_lu:6});
  const q=evaluateLoudness(m);
  assert.equal(q.measurement_status,'MEASURED');
  assert.equal(q.manual_audio_review_required,false);
  assert.deepEqual(q.issues,[]);
  assert.equal(q.integrated_lufs,-18.5);
  assert.equal(q.true_peak_dbtp,-3.2);
  assert.equal(q.normalized_output_generated,false);
  assert.equal(q.may_publish,false);
});

test('M58 EBU R128 prevents over-loud, very low and true-peak overs',()=>{
  const loud=evaluateLoudness(parseLoudnormInput(report('-5.0','-0.2')));
  assert.deepEqual(loud.issues,['INTEGRATED_LOUDNESS_TOO_HIGH','TRUE_PEAK_RISK']);
  assert.equal(loud.manual_audio_review_required,true);
  const quiet=evaluateLoudness(parseLoudnormInput(report('-48.4','-50.5')));
  assert.deepEqual(quiet.issues,['INTEGRATED_LOUDNESS_TOO_LOW']);
  assert.equal(quiet.manual_audio_review_required,true);
});

test('M58 silent AAC with loudnorm -inf does not become numeric zero LUFS',()=>{
  const m=parseLoudnormInput(report('-inf','-inf','0.0'));
  assert.equal(m.integrated_lufs,null);
  assert.equal(m.true_peak_dbtp,null);
  const q=evaluateLoudness(m);
  assert.equal(q.measurement_status,'UNMEASURABLE');
  assert.deepEqual(q.issues,['LOUDNESS_UNMEASURABLE']);
  assert.equal(q.manual_audio_review_required,true);
});

test('M58 loudnorm rejects forged, duplicated, partial and malformed FFmpeg summaries',()=>{
  fail('M58_LOUDNORM_REPORT_MISSING',()=>parseLoudnormInput('hello'));
  fail('M58_LOUDNORM_MULTIPLE_REPORTS',()=>parseLoudnormInput(
    report('-20','-3')+'\n'+report('-30','-4')));
  fail('M58_LOUDNORM_SCHEMA_INVALID',()=>parseLoudnormInput(
    '{"input_i":"-10","input_tp":"-1"}'));
  fail('M58_LOUDNORM_VALUE_INVALID',()=>parseLoudnormInput(report('NaN','-2')));
  fail('M58_LOUDNORM_VALUE_INVALID',()=>parseLoudnormInput(report('0" bad','-2')));
  fail('M58_LOUDNORM_LOG_INVALID',()=>parseLoudnormInput('x'.repeat(262145)));
  fail('M58_LOUDNORM_POLICY_INVALID',()=>evaluateLoudness(
    {integrated_lufs:-15,true_peak_dbtp:-2,loudness_range_lu:5},
    {minIntegratedLufs:-3}));
  fail('M58_LOUDNORM_MEASUREMENT_INVALID',()=>evaluateLoudness(
    {integrated_lufs:NaN,true_peak_dbtp:-2,loudness_range_lu:5}));
});

test('M58 EBU R128 loudness policy remains review-only',()=>{
  const m=parseLoudnormInput(report('-16.0','-1.5','5.0'));
  const q=evaluateLoudness(m,{minIntegratedLufs:-24,maxIntegratedLufs:-12,
    maxTruePeakDbtp:-1});
  assert.equal(q.manual_audio_review_required,false);
  assert.equal(q.may_publish,false);
  assert.equal(q.may_deploy,false);
  assert.equal(q.scope,'FFMPEG_LOUDNORM_INPUT_EBU_R128_AND_TRUE_PEAK');
});

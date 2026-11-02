#!/usr/bin/env node
/** Detect offline speech engines for original spoken-word media QA fixtures. */
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const check=(bin,args)=>{const r=spawnSync(bin,args,{timeout:12000,
  encoding:'utf8',windowsHide:true,maxBuffer:8192,stdio:['ignore','pipe','pipe']});
  return {available:r.status===0,status:r.status,error:r.error?.code??null,
    stdout:r.stdout?.slice(0,200)??'',stderr:r.stderr?.slice(-240)??''};};
/** Generate original spoken words locally, without downloads or web TTS.
 * Output is a WAV resource usable by FFmpeg. No text supplied by users.
 */
export function createOfflineSpokenWav(wav){
  if(typeof wav!=='string'||!wav.endsWith('.wav'))
    throw new Error('M58_OFFLINE_TTS_PATH_INVALID');
  const words='The voice stays clear.';
  const d=path.dirname(wav);
  fs.mkdirSync(d,{recursive:true});
  const candidates=process.platform==='win32'?
    ['sapi','espeak-ng','espeak']:['espeak-ng','espeak'];
  for(const engine of candidates){
    let result;
    if(engine==='sapi'){
      const script=path.join(d,'tts-'+process.pid+'.ps1');
      try{
        const escaped=wav.replace(/'/g,"''");
        fs.writeFileSync(script,[
          '$ErrorActionPreference = "Stop"',
          'Add-Type -AssemblyName System.Speech',
          '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
          '$s.SetOutputToWaveFile('+"'"+escaped+"'"+')',
          '$s.Speak("The voice stays clear.")',
          '$s.Dispose()',
        ].join('\n'));
        result=check('powershell.exe',['-NoProfile','-NonInteractive',
          '-ExecutionPolicy','Bypass','-File',script]);
      }finally{fs.rmSync(script,{force:true});}
    }else{
      result=check(engine,['-v','en','-s','145','-w',wav,words]);
    }
    if(result.available&&fs.existsSync(wav)&&fs.statSync(wav).size>4000)
      return {engine,bytes:fs.statSync(wav).size,original_text:words,
        source:'LOCAL_OFFLINE_GENERATED_SPEECH'};
    fs.rmSync(wav,{force:true});
  }
  throw new Error('M58_OFFLINE_TTS_NOT_AVAILABLE');
}
export function probeOfflineSpeech(){
  const engines={
    espeak_ng:check('espeak-ng',['--version']),
    espeak:check('espeak',['--version']),
  };
  if(process.platform==='win32'){
    const d=fs.mkdtempSync(path.join(os.tmpdir(),'pb-speech-probe-'));
    const wav=path.join(d,'voice.wav');
    const script=path.join(d,'probe.ps1');
    try{
      fs.writeFileSync(script,[
        '$ErrorActionPreference = "Stop"',
        'Add-Type -AssemblyName System.Speech',
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        '$s.SetOutputToWaveFile("'+wav.replace(/\\/g,'\\\\')+'")',
        '$s.Speak("Testing spoken words for audio validation.")',
        '$s.Dispose()',
      ].join('\n'));
      const r=check('powershell.exe',['-NoProfile','-NonInteractive',
        '-ExecutionPolicy','Bypass','-File',script]);
      engines.windows_sapi={...r,bytes:fs.existsSync(wav)?fs.statSync(wav).size:0,
        available:r.available&&fs.existsSync(wav)&&fs.statSync(wav).size>100};
    }finally{fs.rmSync(d,{recursive:true,force:true});}
  }
  return {platform:process.platform,offline_speech_engines:engines,
    any_available:Object.values(engines).some(x=>x.available)};
}
if(process.argv[1]&&process.argv[1].endsWith('probe-offline-speech.mjs')){
  const args=process.argv.slice(2);
  if(args.length>1||(args.length===1&&args[0]!=='--require-available')){
    process.stderr.write('M58_OFFLINE_SPEECH_PROBE_USAGE_INVALID\n');
    process.exitCode=1;
  }else{
    const result=probeOfflineSpeech();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(args[0]==='--require-available'&&!result.any_available)
      process.exitCode=2;
  }
}

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
  process.stdout.write(JSON.stringify(probeOfflineSpeech(),null,2)+'\n');
}

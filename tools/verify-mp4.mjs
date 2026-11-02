#!/usr/bin/env node
/**
 * Inspect finished local MP4 exports without starting PressBuilder.
 *   npm run qa:mp4 -- gameready-3d
 *   npm run qa:mp4 -- out/gameready-3d.mp4
 *   npm run qa:mp4 -- gameready-3d --json
 * Exits 0 for technical PASS, 1 for QA FAIL, 2 for bad usage.
 */
import fs from 'node:fs';
import path from 'node:path';
import {inspectMp4} from './mp4-quality.mjs';

function usage(){
  console.error('Usage: npm run qa:mp4 -- <deck-id|path/to/video.mp4> [--json]');
  console.error('Requires ffprobe in PATH, or set FFPROBE to its executable path.');
}
const args=process.argv.slice(2);
const json=args.includes('--json');
const values=args.filter(x=>x!=='--json');
if(values.length!==1||values[0].startsWith('--')){
  usage();
  process.exitCode=2;
}else{
  const arg=values[0],isDeck=/^[a-z0-9][a-z0-9_-]{0,40}$/.test(arg);
  const root=process.cwd();
  const deckPath=isDeck?path.join(root,'src','decks',arg,'deck.json'):null;
  let expected={};
  let media;
  try{
    if(isDeck){
      const deck=JSON.parse(fs.readFileSync(deckPath,'utf8'));
      if(deck.id!==arg||!deck.format||!Number.isFinite(deck.format.fps)||
         deck.format.fps<=0||!Number.isFinite(deck.format.height)||deck.format.height<=0)
        throw new Error('Invalid deck.json format (missing FPS/height)');
      expected={
        fps:deck.format.fps,
        height:deck.format.height,
        ...(Number.isFinite(deck.target)&&deck.target>0?{duration:deck.target}:{}),
        audio_required:typeof deck.audio?.file==='string'&&deck.audio.file.length>0,
      };
      media=path.join(root,'out',arg+'.mp4');
    }else if(/\.mp4$/i.test(arg)){
      media=path.resolve(root,arg);
    }else{
      throw new Error('Expected a deck ID or a path ending with .mp4');
    }
    const report=inspectMp4(media,expected);
    if(json){
      console.log(JSON.stringify({file:media,deck_id:isDeck?arg:null,expected,report},null,2));
    }else{
      console.log('MP4: '+media);
      console.log('Technical QA: '+report.verdict+' (not an artistic quality score)');
      if(report.metadata)console.log(
        'Video: '+report.metadata.codec+', '+report.metadata.width+'x'+report.metadata.height+', '+
        report.metadata.fps.toFixed(3)+' FPS, '+report.metadata.duration.toFixed(3)+' s, '+
        'audio: '+(report.metadata.has_audio?'yes':'no'));
      for(const issue of report.issues)console.log('  ['+issue.id+'] '+issue.message);
      console.log('Composition, readability and sound quality still need human review.');
    }
    if(report.verdict!=='PASS')process.exitCode=1;
  }catch(e){
    console.error('MP4 QA error: '+(e instanceof Error?e.message:String(e)));
    process.exitCode=2;
  }
}

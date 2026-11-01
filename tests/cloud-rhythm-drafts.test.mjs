import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {rhythmPreviewService} from '../server/rhythm-preview.mjs';
import {rhythmDraftStore} from '../server/rhythm-drafts.mjs';

const data=Buffer.from('RIFF valid synthetic fixture bytes, not real audio decoding');
const author={id:'studio-director',role:'director'};
const reviewer={id:'reviewer-one',role:'reviewer',projects:['owned-video'],scenes:['s01','s02']};
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p15-drafts-'));
  const id='owned-video';
  fs.mkdirSync(path.join(root,id),{recursive:true});
  fs.writeFileSync(path.join(root,id,'voice.wav'),data);
  const deck={id,format:{fps:24,height:1080},audio:{file:'voice.wav'},target:4,
    slides:[{id:'s01',lead:0,tail:0,cues:[{id:'c01',say:'first',dur:2}]},
            {id:'s02',lead:0,tail:0,cues:[{id:'c01',say:'second',dur:2}]}]};
  const getDeck=()=>deck;
  const preview=rhythmPreviewService({root,getDeck,enabled:true});
  let ticker=0;
  const service=rhythmDraftStore({root,getDeck,previewService:preview,
    now:()=>new Date(Date.UTC(2026,9,1,0,0,ticker++)).toISOString()});
  const manifest=()=>{
    const c=preview.context(id);
    return {schema_version:1,project_id:id,
      voice_source_sha256:c.voice_source_sha256,alignment_revision:c.alignment_revision,
      expected_alignment_revision:c.alignment_revision,timebase_revision:c.timebase_revision,
      expected_timebase_revision:c.timebase_revision,frame_rate:c.frame_rate,
      duration_us:c.duration_us,
      words:[{id:'w1',scene_id:'s01',cue_id:'c01',start_us:0,end_us:800_000},
             {id:'w2',scene_id:'s02',cue_id:'c01',start_us:2_000_000,end_us:2_800_000}],
      pauses:[{scene_id:'s01',cue_id:'c01',start_us:900_000,end_us:1_400_000},
              {scene_id:'s02',cue_id:'c01',start_us:2_900_000,end_us:3_400_000}],
      beats:[],policy:{min_shot_frames:4,max_cuts_per_10s:6,max_cuts:5}};
  };
  const file=path.join(root,id,'.rhythm','review.json');
  return {root,id,file,deck,preview,service,manifest,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function bad(code,fn){assert.throws(fn,e=>e?.code===code,code)}
test('new plans have explicit empty revision, no approval/release or disk sidecar',()=>{
  const x=fixture();try{
    const r=x.service.status(x.id,author);
    assert.equal(r.status,'empty');assert.equal(r.revision,0);
    assert.equal(r.publication_allowed,false);assert.equal(fs.existsSync(x.file),false);
  }finally{x.close()}
});
test('CAS submit persists only pinned preview fields and is restart-readable',()=>{
  const x=fixture();try{
    const before=JSON.stringify(x.deck);
    const r=x.service.submit(x.id,author,x.manifest(),0,'First draft needs review');
    assert.equal(r.status,'submitted');assert.equal(r.revision,1);
    assert.equal(r.publication_allowed,false);
    assert.equal(r.proposal.cuts.length,2);assert.equal(r.proposal.provenance.music_rights_verified,false);
    assert.equal(JSON.stringify(x.deck),before);
    assert.equal(r.review,null);
    assert.ok(fs.existsSync(x.file));
    assert.equal(x.service.status(x.id,author).source_state,'CURRENT');
    const restarted=rhythmDraftStore({root:x.root,getDeck:()=>x.deck,previewService:x.preview});
    assert.deepEqual(restarted.status(x.id,author).proposal,r.proposal);
  }finally{x.close()}
});
test('stale expected revision blocks duplicate or concurrent submission',()=>{
  const x=fixture();try{
    x.service.submit(x.id,author,x.manifest(),0,'First valid proposal');
    bad('RHYTHM_REVISION_CONFLICT',()=>x.service.submit(x.id,author,x.manifest(),0,'Second stale proposal'));
  }finally{x.close()}
});
test('reviewer must be different principal, full-scene scoped, with current SHA and CAS',()=>{
  const x=fixture();try{
    const first=x.service.submit(x.id,author,x.manifest(),0,'First valid proposal');
    const onlyOne={...reviewer,scenes:['s02']};
    bad('RHYTHM_SCENE_SCOPE_DENIED',()=>x.service.status(x.id,onlyOne));
    bad('RHYTHM_SCENE_SCOPE_DENIED',()=>x.service.decide(x.id,onlyOne,{
      expected_revision:1,plan_sha256:first.proposal.plan_sha256,decision:'endorse',
      note:'Need another view'}));
    bad('RHYTHM_ROLE_DENIED',()=>x.service.decide(x.id,author,{
      expected_revision:1,plan_sha256:first.proposal.plan_sha256,decision:'endorse',
      note:'Self-authorizing attempt'}));
    const reviewed=x.service.decide(x.id,reviewer,{
      expected_revision:1,plan_sha256:first.proposal.plan_sha256,decision:'endorse',
      note:'Checked draft timings; not verified audio word alignment'});
    assert.equal(reviewed.status,'endorsed_nonpublishable');
    assert.equal(reviewed.review.reviewer_id,reviewer.id);
    assert.equal(reviewed.publication_allowed,false);
    bad('RHYTHM_REVISION_CONFLICT',()=>x.service.decide(x.id,reviewer,{
      expected_revision:1,plan_sha256:first.proposal.plan_sha256,decision:'endorse',
      note:'A replay should fail'}));
  }finally{x.close()}
});
test('reviewer rejects and newer author revision invalidates previous endorsement',()=>{
  const x=fixture();try{
    const one=x.service.submit(x.id,author,x.manifest(),0,'First valid proposal');
    const rejected=x.service.decide(x.id,reviewer,{
      expected_revision:1,plan_sha256:one.proposal.plan_sha256,
      decision:'reject',note:'Missing measured voice alignment'});
    assert.equal(rejected.status,'rejected');assert.equal(rejected.revision,2);
    const replaced=x.service.submit(x.id,author,x.manifest(),2,'Revised proposal after rejection');
    assert.equal(replaced.review,null);assert.equal(replaced.status,'submitted');
    assert.equal(replaced.history.length,1);assert.equal(replaced.history[0].status,'rejected');
    assert.deepEqual(replaced.history[0].cuts,
      one.proposal.cuts.map(c=>({frame:c.frame,reason:c.reason})),
      'reviewer must compare actual before/after frame decisions');
    assert.equal(replaced.publication_allowed,false);
  }finally{x.close()}
});
test('actual source SHA and deck cue source drift prevent stale review',()=>{
  const x=fixture();try{
    const one=x.service.submit(x.id,author,x.manifest(),0,'Proposed source-aligned cuts');
    const proof={expected_revision:1,plan_sha256:one.proposal.plan_sha256,
      decision:'endorse',note:'Reviewed against the current project'};
    x.deck.slides[0].cues[0].say='modified while under review';
    bad('RHYTHM_SOURCE_CHANGED',()=>x.service.decide(x.id,reviewer,proof));
    assert.equal(x.service.status(x.id,reviewer).source_state,'STALE');
    x.deck.slides[0].cues[0].say='first';
    fs.writeFileSync(path.join(x.root,x.id,'voice.wav'),'mutated voice bytes');
    bad('RHYTHM_SOURCE_CHANGED',()=>x.service.decide(x.id,reviewer,proof));
    assert.equal(x.service.status(x.id,author).source_state,'STALE');
  }finally{x.close()}
});
test('forged SHA, missing notes, invalid roles and bad decisions denied',()=>{
  const x=fixture();try{
    const one=x.service.submit(x.id,author,x.manifest(),0,'Proposed source-aligned cuts');
    bad('RHYTHM_NOTE_REQUIRED',()=>x.service.decide(x.id,reviewer,{
      expected_revision:1,plan_sha256:one.proposal.plan_sha256,decision:'endorse',note:''}));
    bad('RHYTHM_PLAN_CONFLICT',()=>x.service.decide(x.id,reviewer,{
      expected_revision:1,plan_sha256:'f'.repeat(64),decision:'endorse',note:'Important rationale'}));
    bad('RHYTHM_DECISION_INVALID',()=>x.service.decide(x.id,reviewer,{
      expected_revision:1,plan_sha256:one.proposal.plan_sha256,decision:'publish',note:'Bad action mode'}));
    bad('RHYTHM_ROLE_DENIED',()=>x.service.submit(x.id,reviewer,x.manifest(),1,'Cannot submit reviewer proposal'));
    const outsider={...reviewer,projects:['someone-else']};
    bad('RHYTHM_PROJECT_DENIED',()=>x.service.status(x.id,outsider));
  }finally{x.close()}
});
test('stale input, missing alignment, no cuts never saved',()=>{
 const x=fixture();try{
    const old=x.manifest();
    old.words=[];old.pauses=[];
    bad('RHYTHM_NOT_READY',()=>x.service.submit(x.id,author,old,0,'Cannot store phantom cuts'));
    const m=x.manifest();
    m.voice_source_sha256='f'.repeat(64);
    bad('VOICE_SOURCE_STALE',()=>x.service.submit(x.id,author,m,0,'Never store changed source'));
    assert.equal(fs.existsSync(x.file),false);
 }finally{x.close()}
});
test('rejects symlinked rhythm metadata directory or file',()=>{
 const x=fixture();try{
   const outside=path.join(x.root,'hidden');fs.mkdirSync(outside);
   const dir=path.dirname(x.file);
   try{fs.symlinkSync(outside,dir,'dir')}
   catch(e){if(['EPERM','EACCES'].includes(e.code))return;throw e}
   bad('UNSAFE_RHYTHM_DIR',()=>x.service.status(x.id,author));
 }finally{x.close()}
});

test('corrupt and symlinked review file are rejected without reading linked data',()=>{
 const x=fixture();try{
   x.service.submit(x.id,author,x.manifest(),0,'Create actual draft before tamper');
   fs.writeFileSync(x.file,'{not-json');
   bad('CORRUPT_RHYTHM_RECORD',()=>x.service.status(x.id,author));
   fs.rmSync(x.file);
   const privateFile=path.join(x.root,'private.txt');fs.writeFileSync(privateFile,'PRIVATE');
   try{fs.symlinkSync(privateFile,x.file)}
   catch(e){if(['EPERM','EACCES'].includes(e.code))return;throw e}
   bad('UNSAFE_RHYTHM_FILE',()=>x.service.status(x.id,author));
 }finally{x.close()}
});
test('hard-linked review file is rejected rather than exposing shared inode',()=>{
 const x=fixture();try{
   x.service.submit(x.id,author,x.manifest(),0,'Create draft for hardlink test');
   const another=path.join(x.root,'shared-review.json');
   try{fs.linkSync(x.file,another)}
   catch(e){if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return;throw e}
   bad('UNSAFE_RHYTHM_FILE',()=>x.service.status(x.id,author));
 }finally{x.close()}
});

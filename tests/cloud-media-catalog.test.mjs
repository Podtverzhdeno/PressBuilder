import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sceneVersionStore} from '../server/scene-versions.mjs';
import {mediaCatalogStore} from '../server/media-catalog.mjs';

const director={id:'director-1',role:'director'};
const worker={id:'agent-01',role:'worker'};
const error=(fn,code)=>assert.throws(fn,e=>e?.code===code||e?.message===code,code);
const expiry='2027-12-31T23:59:59.000Z';
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'m32-media-')),out=path.join(root,'out');
 fs.mkdirSync(out);
 const decks={demo:{id:'demo',title:'fixture',text:'First. Second.',format:{fps:24,height:720},
  style:'paper',slides:[{id:'s01',cues:[{id:'c1',say:'First'}]},{id:'s02',cues:[{id:'c2',say:'Second'}]}]}};
 const getDeck=id=>{if(!decks[id])throw Error('not found');return decks[id]};
 const versions=sceneVersionStore({root,out,getDeck,
  getScene3D:()=>({revision:0,spec:null}),getStyle:()=>({revision:0,contract:{enforce:false}})});
 let now=Date.parse('2026-11-02T00:00:00.000Z');
 const catalog=mediaCatalogStore({root,getDeck,versions,enabled:true,now:()=>now});
 const emit=(job,scene='s01')=>{
  const versionId=versions.versionId(job);
  const file=path.join(out,'demo_'+scene+'_v'+versionId+'.mp4');
  fs.writeFileSync(file,Buffer.from('fixture-only-not-an-MP4 '+job+'x'.repeat(1600)));
  const source=versions.source('demo',scene);
  const captured=versions.capture({id:'demo',scene,jobId:job,file,expectedSource:source,
   rendered:{fps:24,height:720,duration:4},qa:{verdict:'PASS',issues:[],metadata:{fps:24,height:720,duration:4}}});
  const old=versions.pointer('demo',scene).revision;
  versions.approve('demo',scene,captured.version_id,old,director);
  return versions.approved('demo',scene);
 };
 const proposal=src=>({expected_revision:0,asset_id:'take01',source_scene_id:'s01',
  source_version_id:src.version_id,source_sha256:src.artifact.sha256,
  source_approval_revision:src.revision,label:'Owned scene B-roll',
  rights_holder:'studio_owner',license_ref:'owned/rights-001',evidence_ref:'doc/license-001',
  expires_at:expiry,allowed_uses:['b_roll','internal_preview'],allowed_scenes:['s02'],attribution:'NONE'});
 return {root,out,versions,catalog,getDeck,decks,emit,proposal,forward:t=>now=t,
   cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('M32 P08 source-pinned proposal → explicit director attestation → verified candidate → revoke',{timeout:15000},()=>{
 const f=fixture();try{
  const approved=f.emit('job-1');
  const entry=f.catalog.propose('demo',director,f.proposal(approved));
  assert.equal(entry.asset.status,'PENDING_ATTESTATION');
  assert.equal(entry.catalog_revision,1);
  assert.equal(f.catalog.verify('demo','take01','s02','b_roll').proposal_allowed,false);
  assert.deepEqual(f.catalog.verify('demo','take01','s02','b_roll').reason_codes,['NOT_ATTESTED_OR_REVOKED']);
  error(()=>f.catalog.attest('demo','take01',worker,{expected_revision:1,expected_asset_revision:1,
   source_sha256:approved.artifact.sha256,confirm:'ATTEST_RIGHTS'}),'MEDIA_DIRECTOR_REQUIRED');
  error(()=>f.catalog.attest('demo','take01',director,{expected_revision:1,expected_asset_revision:1,
   source_sha256:approved.artifact.sha256,confirm:'APPROVE'}),'MEDIA_ATTESTATION_REJECTED');
  const attested=f.catalog.attest('demo','take01',director,{expected_revision:1,expected_asset_revision:1,
   source_sha256:approved.artifact.sha256,confirm:'ATTEST_RIGHTS'});
  assert.equal(attested.catalog_revision,2);assert.equal(attested.asset.status,'ATTESTED');
  const ok=f.catalog.verify('demo','take01','s02','b_roll');
  assert.equal(ok.proposal_allowed,true);
  assert.equal(ok.render_allowed,false);
  assert.equal(ok.publication_allowed,false);
  assert.equal(ok.rights_basis,'RECORDED_DIRECTOR_ATTESTATION_NOT_LEGAL_VERIFICATION');
  assert.equal(f.catalog.verify('demo','take01','s01','b_roll').proposal_allowed,false);
  assert.equal(f.catalog.verify('demo','take01','s02','composition').proposal_allowed,false);
  error(()=>f.catalog.revoke('demo','take01',director,{expected_revision:1,expected_asset_revision:2,
   reason:'rights withdrawal',confirm:'REVOKE_RIGHTS'}),'MEDIA_CATALOG_STALE');
  const revoked=f.catalog.revoke('demo','take01',director,{expected_revision:2,expected_asset_revision:2,
   reason:'rights withdrawal',confirm:'REVOKE_RIGHTS'});
  assert.equal(revoked.asset.status,'REVOKED');
  assert.equal(f.catalog.verify('demo','take01','s02','b_roll').proposal_allowed,false);
  assert.equal(f.catalog.read('demo').revision,3);
  const lines=fs.readFileSync(path.join(f.root,'demo','.media-catalog','events.jsonl'),'utf8').trim().split('\n');
  assert.deepEqual(lines.map(x=>JSON.parse(x).kind),['proposal','attest','revoke']);
  error(()=>f.catalog.attest('demo','take01',director,{expected_revision:3,expected_asset_revision:3,
   source_sha256:approved.artifact.sha256,confirm:'ATTEST_RIGHTS'}),'MEDIA_ATTESTATION_REJECTED');
 }finally{f.cleanup()}
});
test('M32 source SHA, changed P08 pointer and expiry revoke proposed candidate eligibility',()=>{
 const f=fixture();try{
  const source=f.emit('job-1');
  f.catalog.propose('demo',director,f.proposal(source));
  f.catalog.attest('demo','take01',director,{expected_revision:1,expected_asset_revision:1,
   source_sha256:source.artifact.sha256,confirm:'ATTEST_RIGHTS'});
  assert.equal(f.catalog.verify('demo','take01','s02','b_roll').proposal_allowed,true);
  f.emit('job-2');
  assert.deepEqual(f.catalog.verify('demo','take01','s02','b_roll').reason_codes,
   ['SOURCE_APPROVAL_OR_HASH_INVALID']);
  f.forward(Date.parse('2028-01-01T00:00:00.000Z'));
  assert.deepEqual(f.catalog.verify('demo','take01','s02','b_roll').reason_codes,
   ['RIGHTS_EXPIRED','SOURCE_APPROVAL_OR_HASH_INVALID']);
 }finally{f.cleanup()}
});
test('M32 strict CAS, duplicate IDs/SHA, malicious fields, symlinks and unauthorized principals',()=>{
 const f=fixture();try{
  const v=f.emit('job-1'),p=f.proposal(v);
  error(()=>f.catalog.propose('demo',worker,p),'MEDIA_DIRECTOR_REQUIRED');
  error(()=>f.catalog.propose('demo',director,{...p,file_path:'/etc/passwd'}),'MEDIA_INVALID_FIELDS');
  error(()=>f.catalog.propose('demo',director,{...p,source_version_id:'../../etc'}),'MEDIA_INVALID_PROPOSAL');
  error(()=>f.catalog.propose('demo',director,{...p,allowed_scenes:['s99']}),'MEDIA_UNKNOWN_SCENE');
  error(()=>f.catalog.propose('demo',director,{...p,expires_at:'2026-01-01T00:00:00.000Z'}),'MEDIA_RIGHTS_EXPIRED');
  error(()=>f.catalog.propose('demo',director,{...p,license_ref:'x'}),'MEDIA_INVALID_PROPOSAL');
  f.catalog.propose('demo',director,p);
  error(()=>f.catalog.propose('demo',director,p),'MEDIA_CATALOG_STALE');
  error(()=>f.catalog.propose('demo',director,{...p,expected_revision:1}),'MEDIA_ASSET_EXISTS');
  error(()=>f.catalog.propose('demo',director,{...p,asset_id:'take02',expected_revision:1}),'MEDIA_ASSET_EXISTS');
  const file=path.join(f.root,'demo','.media-catalog','catalog.json');
  const old=fs.readFileSync(file);
  fs.unlinkSync(file);fs.symlinkSync('/etc/passwd',file);
  error(()=>f.catalog.read('demo'),'MEDIA_CORRUPT_CATALOG');
  fs.unlinkSync(file);fs.writeFileSync(file,old);
  const disabled=mediaCatalogStore({root:f.root,getDeck:f.getDeck,versions:f.versions,enabled:false});
  error(()=>disabled.read('demo'),'MEDIA_CATALOG_DISABLED');
 }finally{f.cleanup()}
});

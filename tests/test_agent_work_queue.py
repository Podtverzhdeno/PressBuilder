"""State-machine tests for 4 developers + architect delivery queue (stdlib only)."""
import concurrent.futures
import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / 'tools' / 'agent_work_queue.py'
spec = importlib.util.spec_from_file_location('agent_work_queue', MODULE)
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)


def seed(root):
    (root/'docs').mkdir(parents=True)
    registry={'schema_version':1,'items':[]}
    for i in range(1,61):
        ident=f'M{i:02}'
        registry['items'].append({'id':ident,'rank':i,'wave':f'W{min(4,(i-1)//12)}',
                                  'category_key':['content','editorial','audio','visual','pipeline','quality'][i%6]})
    (root/'docs/top60-montage-registry.json').write_text(json.dumps(registry),encoding='utf8')
    folder=root/'openspec/changes/video-quality-top60'
    folder.mkdir(parents=True)
    tasks=['# 480 proposed tasks']
    for i in range(1,61):
        for c in range(1,9):
            tasks.append(f'- [ ] **M{i:02}-C{c:02} — Checkpoint {c}.** Requirement test source validation.')
    (folder/'tasks.md').write_text('\n'.join(tasks),encoding='utf8')
    ps=['# Original P plan']
    count=0
    for i in range(1,11):
        size=6 if i<=5 else 5
        for c in range(1,size+1):
            count+=1
            done='x' if count<=22 else ' '
            ps.append(f'- [{done}] **P{i:02}.{c} — Work item {c}.** Source task.')
    assert count==55
    (root/'tasks.md').write_text('\n'.join(ps),encoding='utf8')


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='pb-agent-queue-')
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        seed(self.root)
        self.path=self.root/'state.sqlite3'
        self.db=q.open_db(self.path)
        self.addCleanup(self.db.close)
        self.assertEqual(q.bootstrap(self.db,self.root)['total'],535)

    def assertDenied(self,code,fn):
        with self.assertRaises(q.Denied) as ctx: fn()
        self.assertEqual(ctx.exception.code,code)

    def get(self,task):return self.db.execute('SELECT * FROM work WHERE id=?',(task,)).fetchone()

    def test_bootstrap_counts_real_backlog_and_no_fabricated_acceptance(self):
        stats=q.snapshot(self.db)
        self.assertEqual(stats['total_checkpoints'],535)
        self.assertEqual(stats['queued'],513)
        self.assertEqual(stats['documented_legacy_done'],22)
        self.assertEqual(stats['formal_acceptance_count'],0)
        self.assertAlmostEqual(stats['required_average_reviewed_checkpoints_per_day'],17.1)
        q.bootstrap(self.db,self.root)
        self.assertEqual(q.snapshot(self.db)['queued'],513)

    def test_four_workers_receive_distinct_epics_and_architect_reviews_first(self):
        results=[q.acquire(self.db,f'dev-{i}',now=10000) for i in range(1,5)]
        ids=[r['task']['id'] for r in results]
        self.assertEqual(len(set(ids)),4)
        self.assertEqual(len(set(r['task']['epic'] for r in results)),4)
        self.assertTrue(all(r['mode']=='code' for r in results))
        self.assertEqual(q.acquire(self.db,'architect',now=10000)['mode'],'code')
        self.assertEqual(q.snapshot(self.db)['formal_acceptance_count'],0)

    def test_sqlite_concurrent_writers_never_issue_same_code_task(self):
        def worker(i):
            db=q.open_db(self.path)
            try:return q.acquire(db,f'dev-{i}',now=10000)
            finally:db.close()
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            calls=list(ex.map(worker,range(1,5)))
        self.assertEqual(len(set(x['task']['id'] for x in calls)),4)
        self.assertEqual(len(set(x['task']['epic'] for x in calls)),4)
        self.assertEqual(sum(1 for x in calls if x['mode']=='code'),4)

    def test_file_reservation_is_global_and_task_cannot_submit_without_it(self):
        a=q.acquire(self.db,'dev-1',now=10000)
        b=q.acquire(self.db,'dev-2',now=10000)
        t=a['task']['id']
        self.assertDenied('SOURCE_FILES_NOT_RESERVED',lambda:q.submit(self.db,t,'dev-1',a['lease_token'],
                          'a'*40,'b'*64,'https://github.com/Podtverzhdeno/PressBuilder/pull/47',now=10000))
        q.reserve(self.db,t,'dev-1',a['lease_token'],['server/worker.mjs'],now=10000)
        self.assertDenied('FILE_OWNERSHIP_CONFLICT',lambda:q.reserve(self.db,b['task']['id'],
                          'dev-2',b['lease_token'],['server/worker.mjs'],now=10000))
        self.assertDenied('INVALID_FILE_PATH',lambda:q.reserve(self.db,t,'dev-1',a['lease_token'],
                          ['../outside'],now=10000))
        self.assertDenied('INVALID_FILE_PATH',lambda:q.reserve(self.db,t,'dev-1',a['lease_token'],
                          ['C:\\Windows\\system.ini'],now=10000))

    def test_fence_after_expiry_reclaims_and_rejects_old_token(self):
        first=q.acquire(self.db,'dev-1',now=20000,lease=100)
        task=first['task']['id']
        q.reserve(self.db,task,'dev-1',first['lease_token'],['server/old.mjs'],now=20000)
        hb=q.heartbeat(self.db,task,'dev-1',first['lease_token'],now=20050,seconds=100)
        self.assertEqual(hb['expires_at'],20150)
        second=q.acquire(self.db,'dev-2',now=20151)
        # After expiry the same task may be immediately reassigned to dev-2.
        self.assertIn(self.get(task)['state'], ('TODO', 'LEASED'))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM reservations WHERE task_id=?',(task,)).fetchone()[0],0)
        self.assertDenied('STALE_OR_FOREIGN_LEASE',lambda:q.heartbeat(self.db,task,'dev-1',
                          first['lease_token'],now=20152))
        self.assertEqual(second['mode'],'code')
        self.assertEqual(self.get(task)['fence'], 2 if second['task']['id']==task else 1)

    def test_independent_review_and_peer_completion_not_formal_acceptance(self):
        claim=q.acquire(self.db,'dev-1',now=30000)
        task=claim['task']['id']
        q.reserve(self.db,task,'dev-1',claim['lease_token'],['server/queue.mjs'],now=30000)
        submission=q.submit(self.db,task,'dev-1',claim['lease_token'],
                            'a'*40,'b'*64,'https://github.com/Podtverzhdeno/PressBuilder/pull/49',now=30000)
        self.assertEqual(submission['state'],'REVIEW')
        self.assertEqual(submission['verification'],'UNVERIFIED')
        review=q.acquire(self.db,'architect',now=30001)
        self.assertEqual(review['mode'],'review')
        self.assertEqual(review['task']['id'],task)
        self.assertDenied('STALE_OR_SELF_REVIEW',lambda:q.review(self.db,task,'dev-1',
                          claim['lease_token'],'approve','Source and tests independently checked',now=30001))
        result=q.review(self.db,task,'architect',review['lease_token'],'approve',
                        'Evidence reviewed; pending owner authorization and deployment controls',now=30002)
        self.assertEqual(result['state'],'OWNER_PENDING')
        self.assertEqual(result['formal_acceptance'],False)
        self.assertEqual(q.snapshot(self.db)['owner_pending'],1)
        self.assertEqual(q.snapshot(self.db)['formal_acceptance_count'],0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM reservations WHERE task_id=?',(task,)).fetchone()[0],0)

    def test_rework_requeues_and_developer_can_review_when_no_code_supply(self):
        claim=q.acquire(self.db,'dev-1',now=40000)
        task=claim['task']['id']
        q.reserve(self.db,task,'dev-1',claim['lease_token'],['tools/queue.py'],now=40000)
        q.submit(self.db,task,'dev-1',claim['lease_token'],'a'*40,'b'*64,
                 'https://github.com/Podtverzhdeno/PressBuilder/pull/47',now=40000)
        # Simulate exhausted code supply; review work remains for dev-2.
        self.db.execute("UPDATE work SET state='STALE' WHERE state='TODO'")
        c=q.acquire(self.db,'dev-2',now=40001)
        self.assertEqual(c['mode'],'review')
        self.assertEqual(c['task']['id'],task)
        result=q.review(self.db,task,'dev-2',c['lease_token'],'rework',
                        'Negative concurrency test missing; return for focused changes',now=40002)
        self.assertEqual(result['state'],'TODO')

    def test_review_lease_expiry_returns_to_queue_with_new_token(self):
        claim=q.acquire(self.db,'dev-1',now=50000)
        t=claim['task']['id']
        q.reserve(self.db,t,'dev-1',claim['lease_token'],['tools/test.py'],now=50000)
        q.submit(self.db,t,'dev-1',claim['lease_token'],'a'*40,'b'*64,
                 'https://github.com/Podtverzhdeno/PressBuilder/pull/47',now=50000)
        reviewer=q.acquire(self.db,'architect',now=50001,lease=60)
        later=q.acquire(self.db,'dev-2',now=50062,prefer='review')
        self.assertEqual(later['mode'],'review')
        self.assertEqual(later['task']['id'],t)
        self.assertDenied('STALE_OR_SELF_REVIEW',lambda:q.review(self.db,t,'architect',
                          reviewer['lease_token'],'approve','Old review must not supersede new one',now=50063))

    def test_new_spec_text_invalidates_claim_fail_closed(self):
        old=q.acquire(self.db,'dev-1',now=60000)
        path=self.root/'openspec/changes/video-quality-top60/tasks.md'
        p_before=path.read_text(encoding='utf8')
        target='M40-C01'
        path.write_text(p_before.replace('**'+target+' — Checkpoint 1.**',
                                         '**'+target+' — Revised checkpoint 1.**'),encoding='utf8')
        q.bootstrap(self.db,self.root)
        self.assertEqual(self.get(target)['state'],'STALE')
        self.assertEqual(self.get(target)['source_sha'],q.sha('- [ ] **M40-C01 — Checkpoint 1.** Requirement test source validation.'))
        if old['task']['id']==target:
            self.assertDenied('STALE_OR_FOREIGN_LEASE',lambda:q.heartbeat(self.db,target,'dev-1',old['lease_token'],now=60001))
        self.assertIn('Revised checkpoint',path.read_text(encoding='utf8'))
        self.assertEqual(q.snapshot(self.db)['source_stale'],1)

    def test_m_stage_sequence_waits_for_peer_review_and_does_not_modify_open_spec(self):
        self.assertFalse(q.is_ready(self.db,self.get('M40-C02')))
        self.db.execute("UPDATE work SET state='OWNER_PENDING' WHERE id='M40-C01'")
        self.assertTrue(q.is_ready(self.db,self.get('M40-C02')))
        self.assertFalse(q.is_ready(self.db,self.get('M40-C03')))
        self.assertIn('- [ ] **M40-C01',
                      (self.root/'openspec/changes/video-quality-top60/tasks.md').read_text(encoding='utf8'))

    def test_bad_registry_never_creates_fake_tasks(self):
        path=self.root/'openspec/changes/video-quality-top60/tasks.md'
        path.write_text(path.read_text(encoding='utf8').replace('M40-C08','M40-C09'),encoding='utf8')
        self.assertDenied('TOP60_CHECKPOINT_COUNT_CHANGED',lambda:q.bootstrap(self.db,self.root))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM work').fetchone()[0],535)

    def test_tokens_not_stored_plain_in_sqlite_or_event_log(self):
        claim=q.acquire(self.db,'dev-1',now=80000)
        t=claim['task']['id']
        self.assertNotIn(claim['lease_token'],json.dumps(dict(self.get(t))))
        self.assertNotIn(claim['lease_token'],str([dict(x) for x in self.db.execute('SELECT * FROM events')]))
        self.assertDenied('INVALID_COMMIT',lambda:q.submit(self.db,t,'dev-1',claim['lease_token'],
                          'main','b'*64,'https://github.com/Podtverzhdeno/PressBuilder/pull/47',now=80000))
        self.assertDenied('INVALID_PR',lambda:q.submit(self.db,t,'dev-1',claim['lease_token'],
                          'a'*40,'b'*64,'https://somewhere.invalid/pull/1',now=80000))


if __name__=='__main__':unittest.main()

class SourceRepositorySchemaTests(unittest.TestCase):
    @unittest.skipUnless((MODULE.parent.parent/'docs/top60-montage-registry.json').exists(),
                         'The real PressBuilder checkout is unavailable; generated fixtures were tested')
    def test_real_pressbuilder_registry_has_535_incomplete_and_legacy_markers(self):
        cards=q.read_tasks(MODULE.parent.parent)
        self.assertEqual(len(cards),535)
        self.assertEqual(sum(c['initial']=='DOCUMENTED_DONE' for c in cards),22)
        self.assertEqual(sum(c['id'].startswith('M') for c in cards),480)
        self.assertEqual(sum(c['id'].startswith('P') for c in cards),55)

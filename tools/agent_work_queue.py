#!/usr/bin/env python3
"""PressBuilder 30-day development control plane. Local single-host SQLite queue.

Does NOT run LLMs, approve releases, modify source tasks, or provide trusted
identity. SQLite WAL is not a distributed lock across NFS/replicas.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import secrets
import sqlite3
import sys
import time
from pathlib import Path

M_TASK = re.compile(r'^- \[([ xX])\] \*\*(M\d{2}-C0[1-8])\b[^\n]*', re.M)
P_TASK = re.compile(r'^- \[([ xX])\] \*\*(P\d{2}\.\d+)\b[^\n]*', re.M)
SHA40 = re.compile(r'^[a-f0-9]{40}$')
SHA64 = re.compile(r'^[a-f0-9]{64}$')
GH_PR = re.compile(r'^https://github\.com/Podtverzhdeno/PressBuilder/pull/[1-9]\d*$')
ACTORS = {'dev-1', 'dev-2', 'dev-3', 'dev-4', 'architect'}
LIFETIME = 3600
LOCKABLE = ('LEASED', 'REVIEW')
STAGES_OWNER = {1, 7, 8}
SCHEMA = '''
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS work(
  id TEXT PRIMARY KEY, epic TEXT NOT NULL, stage INTEGER NOT NULL,
  rank INTEGER NOT NULL, wave TEXT NOT NULL, category TEXT NOT NULL,
  description TEXT NOT NULL, source_sha TEXT NOT NULL,
  state TEXT NOT NULL, assignee TEXT, lease_hash TEXT, fence INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0, claimed_at INTEGER NOT NULL DEFAULT 0,
  submitted_by TEXT, commit_sha TEXT, evidence_sha TEXT, pr_url TEXT,
  reviewer TEXT, review_hash TEXT, review_expires INTEGER NOT NULL DEFAULT 0,
  reviewed_at INTEGER, review_note TEXT,
  revision INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reservations(
  path TEXT PRIMARY KEY COLLATE NOCASE, task_id TEXT NOT NULL REFERENCES work(id)
);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL,
  actor TEXT NOT NULL, task_id TEXT, action TEXT NOT NULL,
  info TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_state_rank ON work(state,wave,rank);
'''


class Denied(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def check(cond: bool, code: str):
    if not cond:
        raise Denied(code)


def sha(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8')).hexdigest()


def event(db, actor, task, action, info=''):
    db.execute('INSERT INTO events(at,actor,task_id,action,info) VALUES (?,?,?,?,?)',
               (int(time.time()), actor, task, action, info[:240]))


def open_db(location: Path):
    location.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(location), timeout=20, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA busy_timeout=20000')
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript(SCHEMA)
    return db


def begin(db):
    db.execute('BEGIN IMMEDIATE')


def read_tasks(root: Path):
    manifest = json.loads((root/'docs/top60-montage-registry.json').read_text(encoding='utf-8'))
    check(manifest.get('schema_version') == 1 and len(manifest.get('items', [])) == 60,
          'INVALID_TOP60_REGISTRY')
    ranks = {i['id']: i for i in manifest['items']}
    check(len(ranks) == 60, 'DUPLICATE_EPIC')
    text = (root/'openspec/changes/video-quality-top60/tasks.md').read_text(encoding='utf-8')
    matches = list(M_TASK.finditer(text))
    check(len(matches) == 480, 'TOP60_CHECKPOINT_COUNT_CHANGED')
    cards = []
    for match in matches:
        ident = match.group(2)
        epic, sub = ident.split('-C')
        check(epic in ranks, 'UNKNOWN_TOP60_EPIC')
        entry = ranks[epic]
        cards.append(dict(id=ident, epic=epic, stage=int(sub), rank=entry['rank'],
            wave=entry['wave'],category=entry['category_key'],description=match.group(0),
            initial='DOCUMENTED_DONE' if match.group(1).lower() == 'x' else 'TODO'))
    check(len({x['id'] for x in cards}) == 480, 'DUPLICATE_CHECKPOINT')
    p_text = (root/'tasks.md').read_text(encoding='utf-8')
    ps = list(P_TASK.finditer(p_text))
    check(len(ps) == 55 and len({m.group(2) for m in ps}) == 55,
          'P_TASK_COUNT_CHANGED')
    for match in ps:
        ident = match.group(2)
        epic, sequence = ident.split('.')
        # Infrastructure first, followed by director, video QA, the remaining Pxx.
        order = {'P02': 0, 'P10': 1, 'P03': 2, 'P05': 3, 'P09': 4,
                 'P01': 5, 'P06': 6, 'P08': 7, 'P04': 8, 'P07': 9}
        cards.append(dict(id=ident, epic=epic, stage=int(sequence),
            rank=order[epic], wave='W0', category='platform',
            description=match.group(0),
            initial='DOCUMENTED_DONE' if match.group(1).lower() == 'x' else 'TODO'))
    return cards


def bootstrap(db, root):
    cards = read_tasks(root)
    now = int(time.time())
    begin(db)
    try:
        db.execute("INSERT OR IGNORE INTO meta VALUES ('started_at', ?)", (str(now),))
        db.execute("INSERT OR IGNORE INTO meta VALUES ('target_days', '30')")
        for card in cards:
            fingerprint = sha(card['description'])
            old = db.execute('SELECT source_sha,state FROM work WHERE id=?', (card['id'],)).fetchone()
            if not old:
                db.execute('''INSERT INTO work(id,epic,stage,rank,wave,category,
                description,source_sha,state,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)''',
                (card['id'],card['epic'],card['stage'],card['rank'],card['wave'],
                 card['category'],card['description'],fingerprint,card['initial'],now))
            elif old['source_sha'] != fingerprint and old['state'] != 'STALE':
                # Never silently transfer an in-flight approval to new requirements.
                db.execute("UPDATE work SET state='STALE',revision=revision+1,updated_at=? WHERE id=?",
                           (now,card['id']))
                db.execute('DELETE FROM reservations WHERE task_id=?', (card['id'],))
                event(db,'system',card['id'],'SOURCE_DRIFT','Manual reconciliation required')
        db.execute('COMMIT')
    except Exception:
        db.execute('ROLLBACK')
        raise
    return {'total':len(cards),'m_checkpoints':480,'p_checkpoints':55,
            'registry_status':'SPECIFICATION_ONLY','authority':'PLANNING_ONLY'}


def clean_expired(db, now):
    for row in db.execute("SELECT id FROM work WHERE state='LEASED' AND expires_at<=?", (now,)):
        db.execute('DELETE FROM reservations WHERE task_id=?',(row['id'],))
        db.execute("""UPDATE work SET state='TODO',assignee=NULL,lease_hash=NULL,
          expires_at=0,revision=revision+1,updated_at=? WHERE id=?""",(now,row['id']))
        event(db,'system',row['id'],'LEASE_EXPIRED','Previous fence invalidated')
    for row in db.execute("SELECT id FROM work WHERE state='REVIEW' AND reviewer IS NOT NULL AND review_expires<=?", (now,)):
        db.execute("UPDATE work SET reviewer=NULL,review_hash=NULL,review_expires=0,revision=revision+1,updated_at=? WHERE id=?", (now,row['id']))
        event(db,'system',row['id'],'REVIEW_EXPIRED','Can be reclaimed independently')


def public(row):
    return {key:row[key] for key in ('id','epic','stage','rank','wave','category',
        'description','source_sha','state','assignee','fence','expires_at',
        'submitted_by','commit_sha','evidence_sha','pr_url','reviewer','reviewed_at',
        'review_note','revision')}


def is_ready(db, task):
    if task['state'] != 'TODO':
        return False
    if task['id'].startswith('M') and task['stage'] > 1:
        prev = f"{task['epic']}-C{task['stage']-1:02d}"
        row = db.execute('SELECT state FROM work WHERE id=?', (prev,)).fetchone()
        if not row or row['state'] not in ('REVIEWED','OWNER_PENDING'):
            return False
    busy=db.execute("SELECT 1 FROM work WHERE epic=? AND state IN ('LEASED','REVIEW') LIMIT 1",
                    (task['epic'],)).fetchone()
    return not busy


def actor_valid(actor):
    check(actor in ACTORS, 'UNKNOWN_AGENT')


def choose_code(db, actor):
    # Conservative role-based workstream affinity, optional work stealing
    affinity={'dev-1':('editorial','content','platform'),
              'dev-2':('audio','platform'),
              'dev-3':('visual','platform'),
              'dev-4':('pipeline','quality','platform'),
              'architect':('content','editorial','pipeline','quality')}
    tasks=[r for r in db.execute("SELECT * FROM work WHERE state='TODO'") if is_ready(db,r)]
    if not tasks:return None
    wave={'W0':0,'W1':1,'W2':2,'W3':3,'W4':4}
    preferred=affinity[actor]
    # P02/P10 infrastructure tasks are top priority before wave scores.
    order=lambda r:(0 if r['epic'] in ('P02','P10') else 1,
                    wave.get(r['wave'],9),
                    0 if r['category'] in preferred else 1,
                    r['rank'],r['stage'],r['id'])
    return min(tasks,key=order)


def choose_review(db, actor):
    return db.execute("""SELECT * FROM work WHERE state='REVIEW'
      AND reviewer IS NULL AND submitted_by<>?
      ORDER BY CASE wave WHEN 'W0' THEN 0 WHEN 'W1' THEN 1
       WHEN 'W2' THEN 2 WHEN 'W3' THEN 3 ELSE 4 END,
       rank, updated_at, id LIMIT 1""",(actor,)).fetchone()


def acquire(db, actor, prefer='code', now=None, lease=LIFETIME):
    actor_valid(actor)
    check(prefer in ('code','review'), 'UNKNOWN_ACQUIRE_MODE')
    check(isinstance(lease,int) and 60<=lease<=7200,'INVALID_LEASE')
    now = int(time.time()) if now is None else now
    begin(db)
    try:
        clean_expired(db,now)
        row = None
        # Review architect always prioritizes unblocking; developers review if no code.
        modes=['review','code'] if prefer=='review' or actor=='architect' else ['code','review']
        for mode in modes:
            row=choose_review(db,actor) if mode=='review' else choose_code(db,actor)
            if row:
                break
        if row is None:
            db.execute('COMMIT')
            return {'mode':'idle','reason':'No eligible independent code or review task; may require owner decisions or source reconciliation','may_deploy':False}
        token=secrets.token_hex(24)
        if mode=='review':
            db.execute("""UPDATE work SET reviewer=?,review_hash=?,review_expires=?,
              revision=revision+1,updated_at=? WHERE id=? AND reviewer IS NULL""",
              (actor,sha(token),now+lease,now,row['id']))
            event(db,actor,row['id'],'REVIEW_CLAIM','Independent reviewer; not accepted')
        else:
            db.execute("""UPDATE work SET state='LEASED',assignee=?,lease_hash=?,
              fence=fence+1,expires_at=?,claimed_at=?,revision=revision+1,updated_at=?
              WHERE id=? AND state='TODO'""",
              (actor,sha(token),now+lease,now,now,row['id']))
            event(db,actor,row['id'],'CODE_CLAIM','Single-host fenced lease')
        current=db.execute('SELECT * FROM work WHERE id=?',(row['id'],)).fetchone()
        db.execute('COMMIT')
        return {'mode':mode,'task':public(current),'lease_token':token,
                'lease_seconds':lease,'may_deploy':False,
                'instruction':'Read current OpenSpec and task context; reserve your files before code; do not edit other workstreams or approve your own PR.'}
    except Exception:
        db.execute('ROLLBACK');raise


def guard(db, task, actor, token, mode, now):
    actor_valid(actor)
    row=db.execute('SELECT * FROM work WHERE id=?',(task,)).fetchone()
    check(row is not None,'TASK_NOT_FOUND')
    if mode=='code':
        check(row['state']=='LEASED' and row['assignee']==actor and
              row['lease_hash']==sha(token) and row['expires_at']>now,
              'STALE_OR_FOREIGN_LEASE')
    else:
        check(row['state']=='REVIEW' and row['reviewer']==actor and
              row['review_hash']==sha(token) and row['review_expires']>now and
              row['submitted_by']!=actor,'STALE_OR_SELF_REVIEW')
    return row


def filename(value):
    check(isinstance(value,str) and 0<len(value)<180,'INVALID_FILE_PATH')
    check('\\' not in value and not value.startswith('/') and
          not value.startswith('./') and not value.endswith('/') and
          all(s not in ('','.','..') for s in value.split('/')) and
          not any(s.startswith('.') for s in value.split('/')),
          'INVALID_FILE_PATH')
    return value


def reserve(db, task, actor, token, paths, now=None):
    now=int(time.time()) if now is None else now
    check(paths and len(paths)<=20,'INVALID_RESERVATION_COUNT')
    names=[filename(v) for v in paths]
    check(len(set(names))==len(names),'DUPLICATE_RESERVATION')
    begin(db)
    try:
        guard(db,task,actor,token,'code',now)
        for name in names:
            for existing in db.execute('SELECT path,task_id FROM reservations'):
                left,right=name.casefold(),existing['path'].casefold()
                conflicts=left==right or left.startswith(right+'/') or right.startswith(left+'/')
                check(not conflicts or existing['task_id']==task,'FILE_OWNERSHIP_CONFLICT')
        for name in names:
            db.execute('INSERT OR IGNORE INTO reservations(path,task_id) VALUES(?,?)',(name,task))
        event(db,actor,task,'FILES_RESERVED',','.join(names)[:200])
        db.execute('COMMIT')
        return {'task':task,'reserved_files':sorted(names)}
    except Exception:
        db.execute('ROLLBACK');raise


def heartbeat(db,task,actor,token,now=None,seconds=LIFETIME):
    now=int(time.time()) if now is None else now
    check(60<=seconds<=7200,'INVALID_LEASE')
    begin(db)
    try:
        row=db.execute('SELECT * FROM work WHERE id=?',(task,)).fetchone()
        mode='review' if row and row['reviewer']==actor and row['state']=='REVIEW' else 'code'
        guard(db,task,actor,token,mode,now)
        field='review_expires' if mode=='review' else 'expires_at'
        db.execute(f'UPDATE work SET {field}=?,revision=revision+1,updated_at=? WHERE id=?',
                   (now+seconds,now,task))
        event(db,actor,task,'HEARTBEAT',mode)
        db.execute('COMMIT')
        return {'task':task,'mode':mode,'expires_at':now+seconds}
    except Exception:
        db.execute('ROLLBACK');raise


def submit(db, task, actor, token, commit, evidence, pr_url, now=None):
    now=int(time.time()) if now is None else now
    check(SHA40.fullmatch(commit or '') is not None,'INVALID_COMMIT')
    check(SHA64.fullmatch(evidence or '') is not None,'INVALID_EVIDENCE')
    check(GH_PR.fullmatch(pr_url or '') is not None,'INVALID_PR')
    begin(db)
    try:
        guard(db,task,actor,token,'code',now)
        count=db.execute('SELECT COUNT(*) FROM reservations WHERE task_id=?',(task,)).fetchone()[0]
        check(count>0,'SOURCE_FILES_NOT_RESERVED')
        db.execute("""UPDATE work SET state='REVIEW',lease_hash=NULL,expires_at=0,
          submitted_by=?,commit_sha=?,evidence_sha=?,pr_url=?,
          revision=revision+1,updated_at=? WHERE id=?""",
          (actor,commit,evidence,pr_url,now,task))
        event(db,actor,task,'SUBMITTED_FOR_REVIEW','Evidence is unverified')
        db.execute('COMMIT')
        return {'task':task,'state':'REVIEW','verification':'UNVERIFIED',
                'may_publish':False}
    except Exception:
        db.execute('ROLLBACK');raise


def review(db,task,actor,token,decision,note,now=None):
    now=int(time.time()) if now is None else now
    check(decision in ('approve','rework'),'INVALID_REVIEW_DECISION')
    check(isinstance(note,str) and 20<=len(note)<=2000,'REVIEW_RATIONALE_REQUIRED')
    begin(db)
    try:
        row=guard(db,task,actor,token,'review',now)
        if decision=='approve':
            state='OWNER_PENDING' if (row['id'].startswith('P') or row['stage'] in STAGES_OWNER) else 'REVIEWED'
        else:state='TODO'
        db.execute("""UPDATE work SET state=?,review_hash=NULL,review_expires=0,
          reviewer=?,reviewed_at=?,review_note=?,revision=revision+1,updated_at=? WHERE id=?""",
          (state,actor,now,note,now,task))
        db.execute('DELETE FROM reservations WHERE task_id=?',(task,))
        event(db,actor,task,'PEER_REVIEW_'+decision.upper(),
              'Formal OpenSpec acceptance NOT granted')
        db.execute('COMMIT')
        return {'task':task,'state':state,'formal_acceptance':False,
                'may_publish':False}
    except Exception:
        db.execute('ROLLBACK');raise


def snapshot(db):
    rows=[dict(r) for r in db.execute('SELECT state,COUNT(*) AS n FROM work GROUP BY state')]
    states={r['state']:r['n'] for r in rows}
    reviewed=states.get('REVIEWED',0)+states.get('OWNER_PENDING',0)
    total=db.execute('SELECT COUNT(*) FROM work').fetchone()[0]
    started=int(db.execute("SELECT value FROM meta WHERE key='started_at'").fetchone()[0])
    return {'total_checkpoints':total,'m_checkpoints':480,'p_checkpoints':55,
      'documented_legacy_done':states.get('DOCUMENTED_DONE',0),
      'peer_reviewed_not_formally_accepted':reviewed,
      'queued':states.get('TODO',0),'in_development':states.get('LEASED',0),
      'pending_review':states.get('REVIEW',0),
      'source_stale':states.get('STALE',0),
      'owner_pending':states.get('OWNER_PENDING',0),
      'target_days':30,'started_at_unix':started,
      'required_average_reviewed_checkpoints_per_day':round((total-states.get('DOCUMENTED_DONE',0))/30,2),
      'days_elapsed':round(max(0,time.time()-started)/86400,2),
      'formal_acceptance_count':0,
      'note':'Peer review is NOT formal OpenSpec acceptance or production permission. Work is assigned only on this shared SQLite filesystem; cross-host deployments require Postgres/distributed locks.'}


def execute(args):
    db=open_db(Path(args.db).resolve())
    try:
        if args.command=='init':
            return bootstrap(db,Path(args.repo_root).resolve())
        if args.command=='status':return snapshot(db)
        if args.command=='acquire':return acquire(db,args.actor,args.prefer,lease=args.lease)
        if args.command=='reserve':return reserve(db,args.task,args.actor,args.token,args.path)
        if args.command=='heartbeat':return heartbeat(db,args.task,args.actor,args.token,seconds=args.lease)
        if args.command=='submit':return submit(db,args.task,args.actor,args.token,args.commit,args.evidence,args.pr)
        if args.command=='review':return review(db,args.task,args.actor,args.token,args.decision,args.note)
        raise Denied('UNKNOWN_COMMAND')
    finally:db.close()


def main():
    ap=argparse.ArgumentParser(description='PressBuilder work delivery control plane; code reviews are NOT release acceptance')
    ap.add_argument('--db',default='.agent-control/state.sqlite3')
    subs=ap.add_subparsers(dest='command',required=True)
    init=subs.add_parser('init');init.add_argument('--repo-root',default='.')
    subs.add_parser('status')
    a=subs.add_parser('acquire');a.add_argument('--actor',required=True,choices=sorted(ACTORS));a.add_argument('--prefer',choices=['code','review'],default='code');a.add_argument('--lease',type=int,default=LIFETIME)
    for command in ('reserve','heartbeat','submit','review'):
        p=subs.add_parser(command)
        p.add_argument('--actor',required=True,choices=sorted(ACTORS));p.add_argument('--task',required=True);p.add_argument('--token',required=True)
        if command=='reserve':p.add_argument('--path',action='append',required=True)
        if command=='heartbeat':p.add_argument('--lease',type=int,default=LIFETIME)
        if command=='submit':
            p.add_argument('--commit',required=True);p.add_argument('--evidence',required=True);p.add_argument('--pr',required=True)
        if command=='review':
            p.add_argument('--decision',choices=['approve','rework'],required=True);p.add_argument('--note',required=True)
    args=ap.parse_args()
    try:
        print(json.dumps({'ok':True,'result':execute(args)},ensure_ascii=False,sort_keys=True))
    except (Denied,sqlite3.Error,FileNotFoundError,json.JSONDecodeError) as ex:
        code=ex.code if isinstance(ex,Denied) else 'STATE_OR_SOURCE_UNAVAILABLE'
        print(json.dumps({'ok':False,'error':code}))
        return 2
    return 0


if __name__=='__main__':sys.exit(main())

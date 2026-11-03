# M58-R23 — security audit: concurrent releases and receipt immutability

**Scope:** audit of PR #56 (M51 real-audio cockpit API) and its R21 queue.
**Status:** isolated Draft changes; no deploy and no release approval.

## Confirmed weaknesses and fixes

1. **Concurrent releases can overwrite a running project's journal.**
   If release A has a running/queued audio job and P05 switches to B,
   `enqueue(project)` previously admitted B immediately. Both jobs then
   wrote the same `audio-audit-jobs/<project>.json` and an older completion
   could replace the new job's durable state. R23 rejects B with
   `M58_AUDIO_ACTIVE_RELEASE_CONFLICT` (409) until the A job has
   **actually finished or failed**. This also applies while the worker
   is waiting for the shared CPU governor. After A settles as stale/failed,
   an explicit B enqueue is allowed; no automatic replay occurs.

2. **Receipt write has a check-then-write race.** Previously
   `existsSync(destination)` and `renameSync(temp,destination)`
   were separate operations, and the latter silently overwrote a
   receipt created in the gap. R23 creates the candidate JSON in a
   private temporary file and **hard-links it to the final receipt
   filename**. The link fails atomically on `EEXIST`; only the
   temporary file is removed. Same filesystem required (both files
   are placed in one private directory). No previous receipt is
   replaced. Journal updates still use atomic rename because the
   active job legitimately changes status.

3. **Storage path symlink redirection / file read race.**
   Audit journal and receipt parent directories are now checked
   with `lstatSync` before writes and reads. The exact job/receipt
   inode is opened with Linux `O_NOFOLLOW`, verified using
   `fstatSync` on the opened descriptor, and decoded from that same
   descriptor. Symbolic-link journal/receipt files are rejected.
   Security regression tests place hostile directory and file
   symlinks and verify no external file is created or returned.

## Boundaries / residual risks

- These are **process-local** protections. The app still requires
  its existing single-writer `flock`; multiple replicas on the same
  volume without a shared lock are **not supported**. No database
  transaction or distributed lease is created.
- Directory `lstat` and use are distinct operations. A hostile
  same-UID process with write permission to the audio storage
  directories may still exploit directory-replacement races.
  R23 reduces risk; **it is not a proof of race-free filesystem
  confinement**. True multi-user separation should use a private
  writer-owned volume, permissions and/or descriptor-relative
  `openat2` / dedicated worker sandbox.
- The real MP4 analyzer still invokes FFmpeg with a path after
  checking the P05 master inode. An attacker who can replace the
  master or its containing directory concurrently may race that
  file open. SHA before and after FFmpeg detects many changes but
  is not an atomic file identity proof. Do not enable production
  for untrusted local filesystem tenants.
- `receipt_sha256` and `report_sha256` remain **integrity digests,
  not signatures**. A malicious same-UID writer can forge both.
  `publication_allowed`, `may_publish`, and `may_deploy`
  remain false, independent of any findings.
- No browser visual screenshot or production replay is claimed by
  these tests. The existing Docker CI verifies the real HTTP/MP4
  path and the editor's TS compilation.

## Reproduce

```bash
node --test tests/cloud-real-master-audio-hardening.test.mjs
npm run test:cloud
npm run build
```

Negative tests prove release-A/B racing while **RUNNING** and while
**QUEUED on the shared governor**, receipt pre-existence mid-run,
hostile journal/receipt symlink directories, and symlinked files.
Prior R20-R22 real MP4 and REST tests must pass on the **exact PR HEAD**.

**Follow-up:** code-owner security review, worker file descriptor
confinement on untrusted hosts, real browser visual review, and signed
receipt issuer if audio metadata ever becomes higher-assurance
evidence. The current release gate remains manual.

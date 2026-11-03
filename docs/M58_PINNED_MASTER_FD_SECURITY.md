# M58-R24 — pinned P05 master inode for FFprobe / FFmpeg

**Status: Draft, stacked on PR #59; production feature flag OFF.**

## Confirmed threat and correction

The earlier M58-R20 audio checker did `stat(path)`, hash `path`,
launch `ffprobe path` and `ffmpeg path`, then hash `path` again.
A local process able to replace the P05 `final.mp4` between those
operations could cause the decoder to see a different inode than the
one whose SHA-256 was approved at the beginning. An eventual checksum
failure was useful but did **not prevent opening** an intervening path.

R24 opens the selected P05 MP4 **once**, with Linux
`O_RDONLY | O_NOFOLLOW | O_NONBLOCK`, verifies it is a bounded **regular
file**, and computes its SHA-256 from the **opened descriptor** using
positional `readSync(fd, ..., position)`. The same descriptor is passed
as **fd 3** to both FFprobe and FFmpeg:

```text
proc path read by children: /proc/self/fd/3
child stdio: ignore, pipe, pipe, <pinned master fd>
```

The user/public P05 pathname is never passed to FFprobe or FFmpeg.
A symlink directly at `final.mp4` fails at open. Device nodes,
directories or FIFO-like special inputs fail the bounded regular-file
requirement; `O_NONBLOCK` prevents a named pipe from blocking at open.

After analysis, the master must retain the same **device + inode +
size** at its P05 path, and its pinned descriptor SHA-256 must still
equal the manifest's committed SHA-256. The P05 current pointer must
still name the same release and master SHA. Any rename/replacement
during a probe/decode thus **fails closed**, not cached as audio QA.

The fd is closed in `finally`, including probe and decoder failures.
Linux `/proc` is a required runtime dependency. **No insecure
pathname fallback** is allowed on Windows/macOS or in Linux containers
without an accessible `/proc`: this experimental real MP4 audit
reports unsupported/decode error rather than silently losing
the safety property. Synthetic PCM screening remains portable.

## Negative controls and real-media evidence

`tests/cloud-real-master-audio-pinned-fd.test.mjs` creates actual
H.264/AAC fixtures, then checks:

1. Genuine stereo MP4 is decoded with valid SHA and review-only
   receipt, with no publish authority.
2. Symlinked MP4, `/dev/null`, and directory cannot be decoded.
3. A malicious FFprobe wrapper renames the approved MP4 and replaces
   the pathname with a different valid H.264/AAC movie **after initial
   hashing but before FFprobe**. FFprobe runs on the inherited fd,
   never the substituted pathname; final inode compare produces
   `M58_REAL_MASTER_CHANGED_DURING_ANALYSIS`. Both files' distinct
   SHA-256 values are checked.

Also run all existing R20-R23 real FFmpeg, worker, receipt, HTTP CAS,
and browser/visual tests in the **same Docker CI**. Host CI without
FFmpeg may skip media E2E, but Docker must execute them.

## Deliberate limitations

This is a **narrow local-file-descriptor hardening**, not complete
filesystem confinement. The worker still opens P05 manifest and
current pointer using pathnames, and checks parent directories with
`lstatSync` before later use; hostile same-UID processes allowed to
replace those directories can race them. P05 `assembly.current()` and
`assembly.download()` also SHA-check synchronously on the HTTP
thread before a queue job, a performance/DoS concern under request
flooding. These require separate work.

A malicious process with write permission to the **same opened
inode** can modify bytes while FFmpeg is decoding and restore them
before the final check. Protection from this requires read-only
immutable media stores, different OS credentials, sandboxing or
verified sealed copies.

This remains unsigned reviewer guidance: neither an audio receipt
nor a scan can authorize release, copyright, human listening,
accurate A/V PTS, deployment or publication. No independent
third-party security signoff or merge is claimed by this PR.

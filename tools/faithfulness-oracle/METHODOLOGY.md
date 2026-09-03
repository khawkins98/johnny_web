# Faithfulness oracle — methodology

How we verify that this JS reimplementation of the 1993 DGDS "Johnny Castaway" engine
behaves like the original, and how we caught real faithfulness bugs. The content is
frozen (the shipped `SCRANTIC.SCR` + `RESOURCE.*`), so "faithful" means: does our engine
make the same *sequencing* decisions the original does, over the same data. This file +
the tooling beside it are the durable record — the working build tree, patched dosbox-x
checkout, and captured traces live in an ephemeral scratchpad (`scratchpad/dosbox-x-src`,
out of repo) and are not committed (only the small derived artifacts — patches, tools, and
committed reference fingerprints — are).

The current, reproducible, CI-friendly verification is the **thread/behavioral timeline
diff** (below): per-tick "who is drawing" compared between the original binary and our
engine. An earlier **pixel-diff** approach (framebuffer capture + PPM compare) was retired
in favor of it — see "Retired: pixel-diff approach" at the end of this file.

## The problem it solves
Faithfulness had been a *judgment call*, and that cost us: bugs (campfire blips, telescope
"multiple Johnnies", a crash, a fishing "teleport") were only found by live soak + fresh
reverse-engineering, one at a time. The goal here is to turn "is this faithful?" into an
automated **diff against ground truth**.

## The layered oracle (cheapest → most authoritative)
1. **JS transliteration of the completion model** (`src/dgds/scripting/oracle/completion-model.mjs`).
   A read-only port of the binary's completion oracle `FUN_1048_0766` (live-thread drain;
   see `docs`/RE notes). Diffed against production over all gags × seeds
   (`__tests__/oracle-completion-diff.test.mjs`). Proved production's completion model is
   faithful (the `KEEP_GOING` exclusion never decides on shipped content: 0 divergences).
2. **Reachability net** (`__tests__/gag-terminal-sweep.test.mjs`). Binary-independent:
   every gag completes and reaches its authored terminal drain (ACTIVITY 7 → 4:23,
   FISHING → 1:39). Catches the "gag never finishes / stalls" class.
3. **Cross-check vs an existing reimplementation — jc_reborn** (xesf/castaway). Build it,
   patch for determinism (`srand(FIXED)`) + full speed, and use `debug ... ads <ADS> <tag>`
   to dump a per-run ADS/TTM opcode-fire trace; diff against our engine's sequence. CHEAP
   (hours) and it surfaced all three bugs below. CAVEAT: jc_reborn is same-lineage (an
   approximation) — a *cross-check*, not ground truth; it cannot catch a case where
   jc_reborn is itself wrong. (ScummVM's `dgds` engine does NOT support Johnny Castaway —
   it detects `dgds:castaway` but crashes before the interpreter; not usable.)
4. **Ground truth — the original binary under a patched DOSBox-X** (see "Binary trace"
   below). The only true oracle; use it to ARBITRATE cross-check candidates and for exact
   ordering. This is what confirmed B1 and let us trust the decompile for B2.
5. **Manual arbitration tier** — the same DOSBox-X + Win3.1 environment run interactively
   for any one-off "what does the original actually do here?" question.

Rule learned the hard way: **an oracle is only worth building if it can be validated as
ground truth.** A Ghidra transliteration you can't check against the running binary is just
a second guess that emits false divergences. (We dropped Ghidra p-code emulation of the
four functions for this reason — they're the interpreter core, ~2173 global refs + Win16
imports = rebuilding the engine.)

## Binary trace (ground truth) — reproducible recipe
Runs the actual 16-bit `SCRANTIC.SCR` headless and logs each entry to the four ADS
functions with decoded stack args.

1. **Assets** (Internet Archive, preservation): the game packaged for DOSBox
   `johnny-castaway-screensaver/scrantic-run.zip` and a minimal real Win3.1
   `emularity_win31/win31_nonshell.zip`. Put OUR `public/data` (SCRANTIC.SCR as
   SCRANTIC.EXE + RESOURCE.001/.MAP) on drive C so the trace matches our data; Win3.1 on
   drive D. (`dbx.conf` here is the DOSBox config; `SCRANTIC.INI` StartTime/date are the
   determinism knobs.)
2. **Build a debug DOSBox-X**: clone joncampbell123/dosbox-x, apply
   `dosbox-x-trace.patch` to `src/cpu/core_normal.cpp`, then `./build-debug-macos-sdl2`
   (`--enable-debug=heavy`, ~7 min on macOS ARM). The patch, in `CPU_Core_Normal_Run()`
   right after `LOADIP` (`core.cseip = SegBase(cs)+reg_eip`), matches each instruction's
   linear address against the four functions' 24-byte ENTRY SIGNATURES and, on a hit,
   writes regs + stack words to `$DBX_TRACE`.
3. **Why entry-signature match, not address arithmetic**: Win3.1 runs 386-enhanced with
   PAGING, so a physical-memory scan address ≠ the LINEAR `core.cseip` the hook sees, and
   NE segments relocate to LDT selectors at load. The first 24 entry bytes of each target
   are (a) never touched by the NE relocation table (reloc-safe — verify with `ne_reloc.py`
   / `ne_mask.py`) and (b) file-unique at 20 bytes (`ne_entry.py`), so matching them is
   paging- and relocation-independent. (Note: the director's `4c 33` operand is a FIXED
   DGROUP offset, NOT relocated — an earlier assumption to the contrary was wrong.)
4. **Run** (MUST pin `core=normal` — the dynamic core bypasses the hook; MUST use
   `timeout -s KILL` — dosbox-x ignores SIGTERM):
   ```
   SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy DBX_TRACE=/abs/oracle-trace.log \
     timeout -s KILL 60 .../dosbox-x -conf dbx.conf -set "cpu core=normal" -nogui
   ```
   Output: the cycle `director(FUN_1018_06bf) → tick(FUN_1048_1acb) → action(FUN_1048_1925
   ×N) → completion(FUN_1048_0766)`; completion arg0 = the ADS completion tag.

## The four functions (our binary; Ghidra lays NE seg N at 0x1000+(N-1)*8)
- `FUN_1018_06bf` director (NE seg 4, off 0x06bf)
- `FUN_1048_1acb` tick driver (NE seg 10, off 0x1acb)
- `FUN_1048_1925` action executor / handoff firing (NE seg 10, off 0x1925)
- `FUN_1048_0766` completion oracle — live-thread drain (NE seg 10, off 0x0766)
- weighted-RANDOM pick: `FUN_1048_0cda` (+ weight getter `FUN_1048_0c8d`)

## RNG (PORTED + validated bit-for-bit vs the binary; see rng-port.md)
The binary's RNG `FUN_1018_1e86` is a **56-word additive lagged-Fibonacci generator whose
seed is BAKED into `SCRANTIC.SCR` at file offset 0x19ae2** (`table[i] += table[j]` 16-bit
wrap, returns updated `table[i]`, then i=(i+1)%56, j=(j+1)%56; the returned/updated index
**i starts at 55**, the addend index **j at 24** — first draw = table[55]+table[24] =
0xea0b). There is NO `srand`/clock seed — the stream is identical every boot. Our
engine uses `Math.random` (injected `state.random`). Porting the LFG + baked seed would
make our engine's *story* reproduce the original's exactly, which (a) is the last missing
piece for a full per-tick sequencing diff and (b) removes the alignment caveat below.
Determinism caveat today: RTC-pinning does NOT align the boot phase — GetTickCount-paced
intro frames consume a non-deterministic *number* of pre-window RNG draws under
`cycles=max`; the LFG port is the real lever, not clock pinning.

## Bugs this found (all in `src/dgds/scripting/script-runner.mjs`; fixes in this PR)
- **B2 — weighted RANDOM** (decompile-confirmed, was real on `main`): `RANDOM_END` picked
  uniformly; the original (`FUN_1048_0cda`) weights by each candidate's `proportion`
  (4th ADD_SCENE arg). FISHING broke to its exit 3× too often. Fixed + regression test.
- **B1 — 0x1070 one-shot** (binary-arbitrated): `0x1070`/`0x1520` are
  `IF_LASTPLAYED_LOCAL`/terminator (a one-shot local completion override), not
  WHILE_RUNNING/END_WHILE; ACTIVITY-7's reading loop played twice. Fixed + regression test.
  (Goldens didn't move because ACTIVITY-7 is exercised by NO golden — it was under-tested.)
- **B3 — dedup-before-random-staging** (confirmed, NOT shipped): a localized fix regresses
  FISHING; a faithful fix needs the concurrency/completion scheduler rework. Documented as
  future work.

## Reusable takeaways
- Reproduce gag behavior on the REAL completion path (`singleAdsScene` via `adsSceneTag` —
  the `driveGag` helper), NEVER `jumpToScene`'s free-run path; the divergence between them
  caused a long mis-diagnosis.
- Prefer the cheap cross-check (jc_reborn) to surface candidates, then arbitrate with the
  binary (or the decompile, when it settles it unambiguously) before fixing.

## Deterministic single-gag ORIGINAL capture (`capture-original-gag.mjs`) — director injection

To diff one gag against ground truth you need the original binary to run **exactly that
gag, alone, on a known slot**. The old selection-forcing approach (a since-removed
`force-gag.py`, which patched the on-disk catalogue file to force the director's hand,
then captured the whole screensaver and filtered) failed at scale: it doesn't reliably
make many gags run (director selection also depends on spot/tide/story/reachability), and
the binary allocates TTM slots dynamically by resource load order, so a whole-screensaver
capture mixes gags on shifting slots.

`node tools/faithfulness-oracle/capture-original-gag.mjs <adsIdHex> <tag> <outdir>`
solves both with **director injection (option A)**. A patched dosbox-x hooks the scene
director `FUN_1018_06bf` at entry: when `DBX_FORCE_ADS`/`DBX_FORCE_TAG` are set, it finds
the catalogue record matching `(adsId, tag)` in the in-memory catalogue (`DS:0x1756`,
79 records × 0x11) and **pins the director's scene queue** `DAT_1068_30f4[] = { thatRecord, 0 }`,
index `DAT_1068_30f2 = 0`, `startSpot(+3) = 0`, and sets the record's active bit
(`+0xd |= 0x8000`) once to bootstrap. The binary then loads → runs → **loops** exactly that
one gag forever, bypassing story/spot/tide/reachability selection. No file patch is needed,
and the capture is that gag alone on the single ADS context the
binary binds for it — so `threads.log` is inherently un-mixed. Each run uses an isolated
driveC copy (reset to the `.prepatch` baseline) and the dosbox-x child is killed by its own
PID on timeout (never a global `pkill`), so many captures run concurrently.

The dosbox-x source change lives in the ephemeral scratchpad (`<sp>/dosbox-x-src/src/cpu/
core_normal.cpp`, guarded by the `DBX_FORCE_*` env; ~40 lines added next to the existing
`DBX_THREADS`/`DBX_TRACE`/`DBX_FB` hooks) and is **not** committed here. Rebuild:
`cd <sp>/dosbox-x-src/src && make -C cpu && make dosbox-x`. The `#FORCE ads=.. tag=.. recoff=..`
line in `trace.log` confirms the pin armed; `timeline.jsonl` is the capture in the shared
per-tick format for diffing against `our-thread-timeline.mjs`.

## The reproducible flow: thread/behavioral timeline diff

The full pipeline, ORIGINAL side to CI gate:

```
patched dosbox-x (DBX_THREADS + DBX_TRACE, DBX_FORCE_ADS/DBX_FORCE_TAG director injection)
  └─► capture-original-gag.mjs <adsIdHex> <tag> <outdir>   (isolated single-gag capture)
        └─► threads-to-timeline.mjs   (drawing = runstate ∈ {1,2,3} -> {"t","live":[...]})
              └─► build-vocab.mjs     (union per-tick live-sets across N runs -> vocabulary)
                    └─► gen-refs.mjs  (drives the above end-to-end; writes committed
                                        test/faithfulness-refs/<NAME>_<tag>.json + index.json)

OUR ENGINE:
  our-thread-timeline.mjs   (drives driveGag(), same "drawing" predicate as composeTtmFrame:
                              !isTtmFinished(scene) || scene.agedOut === false)
        └─► test/faithfulness-diff.mjs  (`npm run test:faithful`; vitest, NO emulator --
                                          compares our fingerprint against the committed ref)
```

The patched dosbox-x checkout lives out-of-repo in `scratchpad/dosbox-x-src` (see "Binary
trace" above for the base `DBX_TRACE` patch and `DBX_THREADS` gate). Only the derived
JSON fingerprints are committed — no raw captures, PPMs, or `threads.log` files.

### The runstate/"drawing" definition
`threads-to-timeline.mjs` reads the emulator's `DBX_THREADS` log — one line per director
tick (`FUN_1048_1acb`), listing every live thread node as `<slot>:<tag>:<runstate>`
(`runstate` at node offset `+0x2f`). A thread counts as **drawing** when
`runstate ∈ {1 (run-once), 2 (count), 3 (timed)}` — `4` (finished) and `5` (unknown/idle)
are excluded. This mirrors the "drawing" predicate our engine's `our-thread-timeline.mjs`
and `composeTtmFrame` use (`!isTtmFinished(scene) || scene.agedOut === false`), so the two
sides' per-tick "who is on screen" sets are directly comparable as `"slot:tag"` strings.

### The CI gate (`npm run test:faithful`, `test/faithfulness-diff.mjs`)
Drives OUR engine (via the sanctioned `driveGag()` helper — the real completion path, same
as `building8-double-johnny.test.mjs` — never the free-run `jumpToScene`) for each committed
ref, computes `{vocab, maxConc}`, and compares against the ref:

- **HARD FAIL** — `ours.maxConc >= ref.maxConc + 2`. An "extra concurrent body" regression
  (the double-Johnny bug class). A +1 slack is allowed: a single extra concurrent actor is
  within the noise of a 3-run union vs. our one deterministic run; two or more is the
  reliable signal.
- **HARD FAIL** — our engine produced zero live/drawing ticks for the gag (it silently did
  nothing).
- **REVIEW ONLY** (`console.warn`, not a failing assertion) — vocab set-differences:
  `missing` = `ref.vocab \ ours.vocab` (behaviors the original shows we don't hit with this
  seed) and `extra` = `ours.vocab \ ref.vocab` (behaviors we show the reference union didn't
  cover).

**Why vocab is warn-only and maxConc is the reliable gate:** the ref vocabulary is a
*coverage lower-bound* (a union over only 3 original-binary runs), not an exhaustive listing
of every RANDOM branch the original can take — and our single deterministic run only samples
one RNG path too. So a vocab set-difference is expected noise, not proof of a bug; it's a
triage signal for a human, not something an assertion can be trusted to gate on without
flooding CI with false failures. `maxConc` is different: the *peak* concurrent-actor count is
far less sensitive to which RNG branch either side happens to sample, so a peak that blows
past the reference by 2+ is a real structural regression (extra actors drawing that never
coexist in the original) rather than branch-coverage noise.

### The reference model
Each `test/faithfulness-refs/<NAME>_<tag>.json` has the shape:
```json
{ "name": "ACTIVITY", "adsId": "0x65", "tag": 10, "slot": "4",
  "runs": 3, "vocab": ["4:24", "4:82", ...], "maxConc": 3, "states": 16, "drainTick": null }
```
`vocab` and `maxConc` are the UNION over `runs` original-binary captures — a coverage
lower-bound, **not a byte-exact reference**. This is unavoidable today: the original's boot
phase is `GetTickCount`-paced, so under `cycles=max` it consumes a non-deterministic number
of pre-window RNG draws before the game even starts (see "RNG" above) — every capture of the
"same" gag enters at a different LFG stream offset, so no single run's timeline is
authoritative. `gen-refs.mjs` resolves the gag's TTM slot from the unfiltered captures (the
slot with the most live-entries, summed across runs), re-slices each run's `threads.log` to
that slot, and unions the sliced timelines with `build-vocab.mjs`. `index.json` lists every
committed ref (`{name, tag, file}`); `test/faithfulness-diff.mjs` asserts it stays in sync
with the files on disk.

Twenty gags (the 19 that sat at "ours = ref+1" plus BUILDING:2) were regenerated at `runs: 8`
to turn `maxConc` from a 3-run lower bound into a reliable ceiling; those refs also carry a
`lifespans` field — `{ "slot:tag": { "min": <ticks>, "max": <ticks> } }`, the per-actor
drawn-tick range across the runs — consumed by `compare-lifespans.mjs` as a warn-only
duration signal (a stuck-on or dropped-early actor that `maxConc` alone can't see).

### Known coverage & documented follow-ups
- **2 gags are not injectable** (excluded from `index.json`, so untested by the gate):
  **STAND:14** is not a gag — it's "STAND INIT", a shared macro every STAND:1-12 gag
  `RUN_SCRIPT`-inlines at load, so it has no catalogue record and is *transitively covered* by
  all twelve STAND refs. **VISITOR:3** ("VISITOR 6") is genuine orphaned content, structurally
  identical to its 5 catalogued siblings (VISITOR:1/4/5/6/7) which *are* tested; standalone
  isolation would need an ADS-load-path injection hook (director injection only patches
  existing catalogue records). Low marginal value — deferred.
- **The 19 "ours = ref+1" gags are a test-harness artifact, not engine bugs.** Each opens with
  a one-time `IF_NOT_PLAYED[S,X] -> ADD(S,X)` "establishing shot"; `driveGag` builds a fresh
  runtime (empty `playedHistory`) per gag, so it replays that shot every time, while the binary
  ref was captured mid-session where it had already played. Confirmed structural: regenerating
  at N=8 collapsed *zero* of them. Fix = seed the gate's `playedHistory` (17 of 19 have a
  verified-safe single-key seed map in `scratchpad/findings/establishing-shot-seedmap.md`;
  ACTIVITY:11 and JOHNNY:6 are excluded — see next point). Deferred.
- **JOHNNY:6 / ACTIVITY:11 over-count is an oracle-predicate limitation, not an engine bug.**
  `isDrawing` here counts a scene live when it is not finished-and-aged-out, but `composeTtmFrame`
  *also* skips empty-`frameOps` scenes; asset-preload pseudo-scenes (load-only, no draw opcode)
  are counted here but never painted. A naive per-tick `frameOps` check can't fix it (frameOps
  is a per-tick transient not set at sample time — it regressed 12 STAND gags); the faithful fix
  needs a scene-level "ever drew" flag. Deferred.
- **BUILDING:2 under-count (ours 6 vs binary 7)** is a real but low-severity 1-tick gap:
  `#runAdsController` (evaluating `IF_PLAYED`) runs before `#runTtmController` (which ages the
  finishing frame), so a one-tick held finish frame is gone before the handoff commits. The fix
  shares tick ordering with the double-Johnny fix — needs a careful dedicated cycle. Deferred.

**Deferred exact-match path:** the LFG generator itself is already ported and validated
bit-for-bit against the binary (`rng-port.md`) — what's missing is wiring our engine to
consume it (instead of `Math.random`) with the same baked seed, which would remove the
boot-phase alignment variance and let a future oracle diff against a single deterministic
original run instead of an N-run union. Tracked as future work, not required for today's
maxConc-gated CI check.

### Regenerating refs / adding a new gag
1. Build the patched dosbox-x in the scratchpad (see "Binary trace" above), with the
   `DBX_FORCE_*` director-injection hook applied (see "Deterministic single-gag ORIGINAL
   capture" above).
2. Find the gag's ADS id (see `ADS_NAME_TO_HEX` in `gen-refs.mjs`: ACTIVITY=0x65,
   BUILDING=0x66, FISHING=0x68, JOHNNY=0x69, MARY=0x6a, STAND=0x6c, SUZY=0x6d, VISITOR=0x6e,
   WALKSTUF=0x6f) and its tag.
3. Run:
   ```
   node tools/faithfulness-oracle/gen-refs.mjs --gags NAME:tag,NAME2:tag2,... \
     --out test/faithfulness-refs [--runs 3] [--conc 4] [--secs 90]
   ```
   This captures each gag `--runs` times (concurrency-limited across the whole batch by
   `--conc`), resolves its slot, unions the vocabulary, and writes/updates
   `test/faithfulness-refs/<NAME>_<tag>.json` + `index.json` (merging with existing entries,
   never dropping refs not in this run's `--gags`).
4. `npm run test:faithful` picks up every ref listed in `index.json` automatically — no test
   file changes needed for a new gag.

## Retired: pixel-diff approach

An earlier iteration of this oracle extended sequencing verification to *rendering*
(transparency / z-order / scene-clearing) by capturing the original binary's VGA framebuffer
(`dosbox-x-framebuffer.patch`, still present) as scene-labeled PPMs and diffing them
pixel-for-pixel against our engine's render of the same scene (`render-ours.mjs` +
`diff-frames.mjs` + `ppm-bbox.mjs` for alignment, plus supporting `soft-canvas.mjs`,
`mask-diff.mjs`, `ppm-lib.mjs`, `actor-timeline.mjs`, `compare-gag.mjs`, `rank.mjs`). It
proved useful once — the SUZY scene-1 "city dweller" divergence (a 30% pixel-diff no
sequencing oracle could see) — but was **retired** in favor of the thread/behavioral flow
above, because it wasn't reproducible enough to run unattended or gate CI on:

- Alignment was **per-scene, by content** (matching bounding boxes), not per-tick, because
  of the same RNG boot-phase variance described above — every capture needed a human to pick
  matching frames, which doesn't scale to a regression gate.
- It needed a second dosbox-x patch (`dosbox-x-framebuffer.patch`) and a working headless
  raw-VGA-capture pipeline that was fragile and slow (whole-frame PPM dumps vs. one line of
  text per tick).
- Its verdict was a single point-in-time pixel diff on one hand-picked frame pair, not an
  RNG-tolerant union — noisier and less amenable to "run N times, take the union" than the
  live-actor-set model the thread timeline uses.

The thread-timeline approach captures the same class of divergence (an extra concurrent
actor drawing — the exact class the SUZY finding and the later "double Johnny" bug both are)
as a per-tick text log instead of pixels, which is cheap to capture, cheap to diff, and
naturally supports the N-run union model refs rely on. `dosbox-x-framebuffer.patch` is kept
for one-off manual pixel arbitration (tier 5, "what does the original actually do here?")
but is no longer part of the reproducible/CI flow.

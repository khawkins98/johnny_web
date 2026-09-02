# Faithfulness oracle — methodology

How we verify that this JS reimplementation of the 1993 DGDS "Johnny Castaway" engine
behaves like the original, and how we caught real faithfulness bugs. The content is
frozen (the shipped `SCRANTIC.SCR` + `RESOURCE.*`), so "faithful" means: does our engine
make the same *sequencing* decisions the original does, over the same data. (For *rendering*
faithfulness — transparency / z-order / scene-clearing, which sequencing cannot see — see the
sibling **[RENDERING-ORACLE.md](./RENDERING-ORACLE.md)**, which captures the original's VGA
framebuffer and pixel-diffs it against our render.) This file +
the tooling beside it are the durable record — the working build tree and captured traces
lived in an ephemeral scratchpad and are not committed (only the small artifacts are).

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

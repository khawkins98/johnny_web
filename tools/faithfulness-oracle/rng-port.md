# Faithful RNG port — the binary's exact random stream

This is the piece that lets our engine reproduce the original 1993 "Johnny Castaway"
screensaver's *exact* RNG-driven story. The binary has no `srand`/clock seed, so its
random stream is byte-identical on every boot — a fixed, extractable sequence we can
reproduce in JS and validate against the running binary.

## The algorithm (RE'd from `FUN_1018_1e86`, validated bit-for-bit)

`FUN_1018_1e86` (NE seg 4, offset 0x1e86) is a **56-word additive lagged-Fibonacci
generator**. Decompile (`$SP/ghidra/out/decompiled.c:6930`):

```c
iVar2  = DAT_1068_1ce4 * 2;                        // i = DAT_1068_1ce4 (updated/returned index)
piVar1 = (int *)(iVar2 + 0x1ce6);                  // &table[i]
*piVar1 = *piVar1 + *(int *)(DAT_1068_1ce2*2 + 0x1ce6);  // table[i] += table[j]  (j = DAT_1068_1ce2)
DAT_1068_1ce4 = DAT_1068_1ce4 + 1; if (==0x38) =0; // i = (i+1) % 56
DAT_1068_1ce2 = DAT_1068_1ce2 + 1; if (==0x38) =0; // j = (j+1) % 56
return *(undefined2 *)(iVar2 + 0x1ce6);            // return the just-updated table[i]
```

- Add is a plain **16-bit wraparound** (mod 2^16). Confirmed: the binary's returned `AX`
  equals `(table[i] + table[j]) & 0xffff` on every one of 20000 traced draws (`sum == ax`).
- The returned value is the **raw unsigned 16-bit word**.
- The entry disassembly confirms operand order: `8b 1e e2 1c` (`mov bx,[0x1ce2]`), `d1 e3`
  (`shl bx,1`), `8b 87 e6 1c` (`mov ax,[bx+0x1ce6]`) reads `table[j]` first, `j` = the
  word at DGROUP 0x1ce2.

### The baked seed (in `public/data/SCRANTIC.SCR` @ file offset 0x19ae2)

DATA seg 1068:0000 maps to file 0x17e00, so 1068:1ce2 == file 0x19ae2. Little-endian:

| file off | DGROUP | meaning | value |
|----------|--------|---------|-------|
| 0x19ae2 | 0x1ce2 `DAT_1068_1ce2` | `j` (addend index) | **24** (`18 00`) |
| 0x19ae4 | 0x1ce4 `DAT_1068_1ce4` | `i` (updated/returned index) | **55** (`37 00`) |
| 0x19ae6 | 0x1ce6 | `table[0..55]` | 56 non-zero words, `23 dd`=`0xdd23`, … |

> NOTE — corrects an earlier writeup. `oracle-debug-findings.md`/`METHODOLOGY.md` stated
> "i=24, j=55" but mapped the byte at 0x19ae2 to `DAT_1068_1ce4`. The bytes + the code
> disagree: 0x19ae2 is `DAT_1068_1ce2` (=`j`=24) and 0x19ae4 is `DAT_1068_1ce4` (=`i`=55).
> The **updated/returned** index starts at **55**, the **addend** index at **24**. The
> first draw is `table[55] + table[24] = 0xda2d + 0x0fde = 0xea0b`. (The lag pair is
> unchanged; only the two index names were swapped.)

## Implementation

`src/dgds/scripting/faithful-rng.mjs`:
- `extractFaithfulSeed(scrBuffer, offset=0x19ae2)` → `{ i, j, table }`
- `createFaithfulRng(seed)` →
  - `nextWord()` — raw unsigned 16-bit draw (the ground-truth primitive)
  - `random()` — `nextWord() / 2^16`, a Math.random-compatible drop-in for `state.random`
  - `pick(total)` — faithful weighted-index draw `abs((int16)word % total) + 1` (see below)

### How the binary consumes a word (per use) — final consumption-site table

The TTM/ADS opcode jump table (`$SP/jt_out.txt`) resolves each opcode to its handler; the
engine's `state.random`/`random` sites were then RE'd against those handlers. The result:
**exactly one engine site consumes the baked LFG stream** — the ADS RANDOM pick.

| engine site (`src/dgds/scripting`) | opcode / handler | binary behavior | draws | verdict |
|---|---|---|---|---|
| RANDOM_END weighted pick (`script-runner.mjs`) | `0x3010` → `FUN_1048_1629` → `FUN_1048_0cda` (`decompiled.c:14458`) | `word = rng(); i = abs((int16)(word % total)) + 1` (→ 1..total); walk staged weights, subtract each, select first where running value `< 1` | **1** | **FAITHFUL** via `state.faithfulPick` = `pick(total)`; the one validated LFG consumer |
| SET_TIMER (`script-runner.mjs`) | `0x2020` → `FUN_1048_15ea` → `FUN_1048_0ec8` (`decompiled.c:14554`) | looks up the scene thread (`FUN_1048_0bf4`) and re-initialises it (`FUN_1048_0b3e`); **draws NO rng word** — no random sleep at all | **0** | our random sleep is a **PORT INVENTION**; MUST stay on `state.random` (cosmetic), NEVER the faithful stream, or it injects a phantom draw and desyncs every downstream RANDOM |
| cloud spawn `cloudIdx/X/Y` (`runtime.mjs`) | main-loop ambient `FUN_1010_*` (e.g. `decompiled.c:4654,4712,5455`) | ambient particle loops DO draw the LFG (`word % N`), but **interleaved by `GetTickCount` wall-clock** in the frame loop | wall-clock, uncountable | keep on `state.random` (cosmetic); no reproducible draw count to align — see "boot-phase offset" below |
| cloud drift `cloudElapsed` (`frame-renderer.mjs`) | same ambient class (`policy.random`) | same wall-clock interleave | wall-clock | keep on cosmetic `policy.random` |
| day-ocean tint `selectOceanIndex` (`background-resources.mjs`) | background setup (`FUN_1010_*`) | LFG `word % dayCount`, but part of the same wall-clock ambient setup | not alignable | keep on `state.random` (cosmetic) |

Key correction vs the earlier note: SET_TIMER (`0x2020`) is **not** a `low + rng()%range` site —
its binary handler draws no word. So the *only* faithful-stream consumer is the RANDOM pick,
which is exactly what the default now routes through the faithful RNG (`pick()`).

## Validation (the gate) — PASSED

Ground truth: extended the DOSBox-X trace patch (`dosbox-x-trace.patch`) with a 5th target
that detects the RNG entry by its 24-byte signature, snapshots the DGROUP state
(`i`, `j`, `table[i]`, `table[j]`) at entry, and captures the **true returned `AX`** at the
return address (the RNG is a leaf, so no nesting). Ran the real 16-bit binary headless
(recipe in `METHODOLOGY.md`), capturing 20000 consecutive draws.

`$SP/validate-rng.mjs` compares the JS `nextWord()` against every traced draw — not only
the returned word but the pre-update `i`, `j`, `table[i]`, `table[j]`:

- **20000 / 20000 draws match bit-for-bit; 0 divergences** (indices, both table entries,
  and the returned word all identical at every step).
- **Boot-invariant:** two independent headless boots produced identical streams (the first
  captured draw already has the pristine seed state `i=55, j=24` — no clock seeding).

CI proof without the emulator: `src/dgds/scripting/__tests__/faithful-rng.test.mjs` bakes
the ground-truth first-64 words and asserts the port reproduces them, plus the seed layout,
range, and the `pick()` mapping. 7/7 pass.

## Wiring & default — NOW THE DEFAULT

The faithful RNG is the engine's **default** story random source. Wiring:

- `browser-presentation.mjs` builds one shared `faithfulRandomFromArchive(arcBuf)` per session
  (matching the binary's single generator) and passes **only its `pick`** to each event's
  `startProcess` as `faithfulPick`. It deliberately does **not** override `state.random`: the
  raw stream is consumed by the RANDOM pick alone, so cosmetic/timer draws can never perturb it.
- `process.mjs` → `runtime.mjs`: `faithfulPick` flows through the runtime-initial-state spread
  onto `state.faithfulPick`.
- `RANDOM_END` (`script-runner.mjs`) prefers `state.faithfulPick(total)` (the binary
  `abs((int16)word%total)+1` mapping + `<1` cumulative walk), falling back to the legacy
  `floor(random()*total)` when no faithful pick is injected. Both consume one draw and honor
  the per-branch weighting, so draw accounting is preserved either way.
- Escape hatch: `?faithfulRng=off` restores the Math.random weighted pick.
- `state.random` stays `Math.random` (default) for cosmetic sites (cloud spawn/drift, the
  SET_TIMER sleep, day-ocean tint) — see the table above for why each must stay off the stream.

Tests/harnesses inject only a `random()`-shaped source (LCG), so they take the fallback path
and are unchanged. The **rendering goldens** (`test/render-goldens.mjs`) deliberately stay on
their deterministic LCG seed: they are a rendering-pipeline conformance baseline, orthogonal to
story-RNG faithfulness, and regenerating them onto a faithful stream would re-pin an arbitrary
baseline (still not bit-exact vs the binary — see below) while baking different, unvetted ambient
frames into the fingerprints. The faithful *story*'s health is instead guarded by reachability
invariants under the faithful pick (`__tests__/faithful-story.test.mjs`): all 10 ADS gags run to
completion, and FISHING #2 reaches its break tag 15 + return-walk tag 39 from every sampled
stream offset. The `pick()` word→bucket mapping is unit-tested in `ads-random-weighted.test.mjs`.

## STOP / documented limits (full bit-exact per-tick story is NOT achievable)

Making the RANDOM pick faithful reproduces the original's *weighted-pick value stream and
formula*, driven in the engine's story order. It is **not** bit-exact against a running binary,
for two RE'd, unavoidable reasons — both documented here rather than papered over:

1. **Ambient interleave (fundamental).** In the binary the same LFG feeds both the story RANDOM
   picks and the wall-clock-paced ambient particle loops (clouds/birds/waves, `FUN_1010_*`). The
   number of ambient draws between two story picks depends on `GetTickCount` timing, so the story
   picks land at a nondeterministic offset in the shared stream. Our engine cannot reproduce that
   interleave (its clouds are not draw-for-draw the binary's), so the absolute pick *values* will
   not match the binary's in-situ values. We therefore keep cosmetic randomness off the story
   stream — that is the faithful-*reproducible* story (deterministic, original stream + formula),
   which is the best achievable without pinning the emulated PIT.
2. **Boot-phase offset (measured).** The intro/clouds consume a boot-nondeterministic number of
   draws before the first story pick (two captures: ~400 vs >20000). Aligning to the binary would
   require pinning the PIT (`cycles=N` + fixed CMOS) or counting the intro draws for a capture.

Net: the default now plays the original's exact RNG-driven *pick logic and stream*; a
draw-for-draw diff vs a live binary boot remains gated on items (1)+(2) above and is out of scope.

## Payoff: how far the per-tick diff aligns now

The full per-tick sequencing diff (our engine vs the binary trace) was previously blocked by
"RNG drift." That blocker is now **eliminated**: the stream is bit-exact, extractable, and
boot-invariant. Re-running the combined trace (RNG + the four sequencing functions in one
patched binary) isolated the *real* remaining blocker and quantified it:

- **Boot-phase draw offset is boot-nondeterministic (the residual blocker).** The intro/clouds
  frames are `GetTickCount`-paced, so the number of RNG draws consumed *before the first story
  `director` call* varies run-to-run under `cycles=max`. Two captures measured **400** draws in
  one boot vs **>20000** in another — same fixed stream, different starting offset into it.
- Within the story, ~**152** RNG draws occur between the first `director` and first `completion`
  (one gag's ambient/selection draws) — a tractable per-tick window *once the offset is fixed*.

Conclusion: a bit-exact per-tick diff is now gated on two smaller, well-defined items rather
than on RNG stream drift:
1. **Story-window offset** — either count the intro draws exactly for a given capture and
   fast-forward the JS RNG by that many, or pin the emulated PIT deterministically
   (`cycles=N` + pinned CMOS) so the intro always consumes a fixed count. **Still open.**
2. **Per-site raw-word consumption** — **DONE (and refined by RE).** The only faithful-stream
   consumer is the weighted RANDOM pick, now `abs((int16)word%total)+1` via `state.faithfulPick`
   (`pick()`). The earlier assumption that SET_TIMER also consumes `word%range` was **wrong**:
   RE of `0x2020` (`FUN_1048_0ec8`) shows it draws no word, so it must not touch the stream (see
   the consumption-site table). Cloud/ocean ambient draws are wall-clock-interleaved (item 1) and
   stay cosmetic.

With item 1 done, the ~152-draw-per-gag window could be diffed tick-for-tick against the trace;
item 2 no longer blocks it. Item 1 (PIT/offset pinning) is the sole remaining blocker and is the
STOP boundary for claiming draw-for-draw story equality with a live binary boot.

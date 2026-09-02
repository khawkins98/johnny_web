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

### How the binary consumes a word (per use)

- **Weighted RANDOM pick** `FUN_1048_0cda` (`decompiled.c:14458`): `uVar2 = rng();
  iVar3 = abs((int16)(uVar2 % total)) + 1;` then walks the cumulative weight, subtracting
  until `< 1`, and dispatches that op. This is `word % total`, **not** `floor(word/2^16 *
  total)` — so a faithful weighted pick must use `pick(total)`, not `floor(random()*total)`.
  Exactly one word consumed per pick. `pick()` reproduces this exactly.
- **Generic float sites** (SET_TIMER `low + rng()%(range)`, cloud pacing, etc.) each apply
  their own `% N`. `random()` (word/2^16) is a faithful *stream* but not a faithful *mapping*
  for these; matching each site exactly needs those call sites to consume `nextWord() % N`.
  That per-site rework is the default-flip follow-up (see Wiring).

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

## Wiring & default

The engine takes an injected `state.random` (`process.mjs:119`, default `Math.random`).
`createFaithfulRng(extractFaithfulSeed(scr)).random` is a drop-in for the *stream*; a fully
faithful *story* additionally needs the weighted RANDOM pick to use `pick()` (mod-based) and
the other `%N` sites to consume `nextWord()`. Because flipping the default changes the story
(gag/golden shifts) and the per-site `%N` rework is non-trivial, the port is landed
**validated but not yet the default** — the raw stream is proven; the default flip + per-site
consumption is the documented next step.

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
   (`cycles=N` + pinned CMOS) so the intro always consumes a fixed count.
2. **Per-site raw-word consumption** — the engine's weighted RANDOM (`floor(random()*total)`)
   and SET_TIMER (`floor*`) must consume raw words the binary's way
   (`abs((int16)word % total)+1` / `word % range`) via `pick()`/`nextWord()`, or selections
   won't match even when aligned.

With those two done, the ~152-draw-per-gag window can be diffed tick-for-tick against the trace.

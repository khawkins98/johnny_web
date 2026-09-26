# Reproducing the original random choices

The original *Johnny Castaway* program contains a fixed random-number state. It produces the same sequence after every clean start; it is not seeded from the clock. The browser port can use this sequence experimentally for confirmed authored choices.

## Algorithm and seed

`FUN_1018_1e86` is a 56-word additive lagged-Fibonacci generator. On each draw it adds two 16-bit table entries, stores the wrapped result, advances both indexes, and returns the updated word.

The seed begins at file offset `0x19ae2` in `SCRANTIC.SCR`:

| File offset | Meaning | Initial value |
| --- | --- | --- |
| `0x19ae2` | addend index (`j`) | 24 |
| `0x19ae4` | updated index (`i`) | 55 |
| `0x19ae6` | 56-word state table | original data |

The first result is `table[55] + table[24] = 0xea0b`, with 16-bit wraparound.

`src/dgds/scripting/faithful-rng.mjs` exposes:

- `extractFaithfulSeed()` to read the indexes and table
- `nextWord()` to return the next unsigned 16-bit value
- `random()` for a `Math.random`-shaped value
- `pick(total)` for the original game's weighted-choice formula

## Where the stream is used

The opt-in stream is shared by confirmed host decisions: the keyframe gate, weighted final and intermediate selection, idle repeat count, ocean choice, walking route and opposite-turn tie, TTM random delays, and ADS `RANDOM`. Each site uses its recovered raw-word mapping rather than a floating-point adapter.

The original shares this stream across its scene director, walking, island setup, ADS scripts, and ambient effects. Confirmed authored mappings are:

| Decision | Original mapping |
| --- | --- |
| Day-keyframe gate | `word % 10 === 0` |
| Finale and intermediate roulette | `word % totalWeight + 1` |
| Idle-repeat and percentage buckets | successive `weight * 655` thresholds |
| Walk-route choice | `word % 100` |
| Opposite-heading turn | `word & 1` |
| Island coordinates | separate `word % width` and `word % height` draws |
| TTM opcode `0x2020` | `minimum + word % (maximum - minimum)` |
| ADS `RANDOM` | `word % totalWeight + 1` |

For ADS `RANDOM`, `FUN_1048_0cda` divides the **unsigned** raw word by the
unsigned sum of weights, then takes the absolute value of the signed 16-bit
remainder. The largest shipped ADS block total is 7, so the last step does not
change the result. The port previously signed the raw word *before* dividing,
which could send a choice to a different branch without changing the draw count.

Forced BUILDING:8 captures of the original show ADS caller `13DF:0D5C` drawing
at the three-way choice after `3:140`. Counting completion calls before each
draw aligns it to the first live frame of the selected branch:

| Isolated capture | Choice sample | Raw word | `raw % 3 + 1` | Next live branch |
| --- | ---: | ---: | ---: | --- |
| 120-second probe | 452 | `0xCF7C` | 2 | `3:47` boot |
| 150-second probe A | 635, 1587 | `0x0328`, `0x4F1F` | 2, 3 | `3:47` boot, `3:48` squid |
| 150-second probe B | 633, 1585 | `0x0328`, `0x4F1F` | 2, 3 | `3:47` boot, `3:48` squid |
| First fish probe | 487 | `0xA74F` | 1 | `3:49` fish |
| Fish-chain probe | 801 | `0xDD22` | 1 | `3:49` fish, then `3:74` and `3:70` |

The `0xCF7C` draw is decisive for operation order: signing the raw word first
would give bucket 1 (`3:49`, fish), contrary to the observed boot. The raw word
stream and draw count were already correct; only `pick(total)` needed changing.
Across 18 new starts, 17 reached the choice and made 19 choices: 10 boot,
7 squid, and 2 fish. There were **17 distinct choice words**; the two
150-second boots repeated the same ADS draw sequence. The fish-chain capture
shows `3:49` live at samples 801–866, `3:74` starting at 868, and `3:70`
starting at 952. It stopped while `3:70` was still live, so that actor's
duration is censored. The 24-run reference union's lack of BUILDING:8 fish
actors was a coverage gap, not evidence that the original cannot take fish:
those old captures kept only their union, without per-run reached-choice counts.
BUILDING:7 has the same authored choice and also reaches fish in original captures.

In deterministic engine probes, faithful-stream offsets 0–23 produced the full
BUILDING:8 fish chain in 14/24 runs with the old signed-first mapping and 7/24
with the corrected mapping. The default seeded-LCG path remains 9/24 for seeds
1–24 because it does not call `faithful-rng.pick()`. These engine seed counts
cannot be compared as independent trials with the original capture union: the
intro and ambient draws put the binary at different, often repeated stream phases.

Opcode `0x2020` is an RNG consumer. Its actual TTM handler is `1058:0e08` (the earlier `1048:0ec8` attribution was an unrelated ADS reinitialization path). On an active interpreter pass it consumes one word and sets the delay staging global to `minimum + (word % (maximum - minimum))`; the maximum is exclusive. The tick driver copies a changed staged value into the thread delay and sets its deadline before deciding whether the current frame may advance. If the interpreter's execution gate is inactive, the handler exits without drawing.

A focused JOHNNY:2 capture observed arguments `(60,180)`, RNG ordinal 49,533 with word `0x1f2f`, and thread delay 123: `60 + (0x1f2f % 120) = 123`. This confirms both the machine-code formula and the live state transition.

Island layout is not randomly selected. Catalogue `flagsB` is the little-endian word at record offset `+0x0b`; bit `0x0200` on any planned scene forces layout 0. The browser preserves that semantic flag and, after planning the complete chain, draws ocean, X, and Y in the original order and ranges.

Holiday-specific coordinate modifiers are not connected because their raw `flagsD` field is not yet preserved. Timing-dependent ambient consumers also remain outside the shared browser stream, so this does not reproduce the original draw order end to end.

Other apparent randomness stays on the browser's cosmetic random source:

| Feature | Why it is separate |
| --- | --- |
| Clouds and other ambient motion | Their draws are interleaved according to wall-clock timing. |
| Per-runtime fallback ocean choice | Johnny's host supplies its confirmed shared-stream ocean choice; the generic DGDS fallback remains cosmetic. |
| Browser-created clouds | Their model and draw count differ from the original. |

Ordinary island positioning is connected. Holiday fixed quadrants and range modifiers remain deferred until raw `flagsD` is decoded and validated; the browser does not guess them.

Keeping these separate makes the experimental path deterministic, but it also means its choices do not line up with a live original-program session. Add `?faithfulRng=on` to enable it; the default remains `Math.random`.

## Validation

The DOSBox-X trace patch records the generator's indexes, table inputs, and returned `AX`. The JavaScript implementation matched **20,000 of 20,000** consecutive draws across two clean boots, with no differences.

The patch also records the caller CS:IP. To summarize a raw local capture without committing it:

```sh
node tools/faithfulness-oracle/rng-consumer-report.mjs scratchpad/capture/trace.log
```

`rng-consumer-evidence.json` is the non-proprietary derived record from one normal boot. It observed 47,942 draws before the first director call; that number is deliberately recorded as a sample, not a stable offset.

`src/dgds/scripting/__tests__/faithful-rng.test.mjs` keeps the first 64 traced words as a compact CI check. It can also record each JavaScript draw as an ordinal, call-site label, and raw word for comparison with emulator traces. `faithful-story.test.mjs` confirms that sampled story streams complete, including the fishing return path.

## Limit of exact replay

The generator is exact, but a live DOSBox-X session cannot yet be replayed draw for draw. In the original program, intro and ambient animation share the generator with story logic. Their wall-clock-driven loops consume a different number of words depending on emulator timing; observed boots reached the story after roughly 400 to more than 20,000 draws.

The browser therefore reproduces the original generator and weighted-choice rule, but not the timing-dependent ambient interleave. A fully aligned trace would require a fixed emulator clock or a measured starting offset. Until then, claims of exactness apply to the generator and choice formula, not to every choice made during a live original-program session.

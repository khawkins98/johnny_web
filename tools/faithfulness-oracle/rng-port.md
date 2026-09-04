# Reproducing the original random choices

The original *Johnny Castaway* program contains a fixed random-number state. It produces the same sequence after every clean start; it is not seeded from the clock. The browser port can use this sequence experimentally for ADS random choices.

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

Only authored ADS `RANDOM` choices use the faithful stream in the browser engine. The original maps one word to a weighted choice with `abs((int16)word % total) + 1`.

Other apparent randomness stays on the browser's cosmetic random source:

| Feature | Why it is separate |
| --- | --- |
| Opcode `0x2020` delay | Later emulator instrumentation contradicted the earlier decompile-based “no draw” finding. Its raw mapping and draw count must be captured again before it is connected to this stream. |
| Clouds and other ambient motion | Their draws are interleaved according to wall-clock timing. |
| Ocean tint | It belongs to the same ambient setup rather than the scripted choice stream. |

Keeping these separate makes the experimental path deterministic, but it also means its choices do not line up with a live original-program session. Add `?faithfulRng=on` to enable it; the default remains `Math.random`.

## Validation

The DOSBox-X trace patch records the generator's indexes, table inputs, and returned `AX`. The JavaScript implementation matched **20,000 of 20,000** consecutive draws across two clean boots, with no differences.

`src/dgds/scripting/__tests__/faithful-rng.test.mjs` keeps the first 64 traced words as a compact CI check. It can also record each draw as an ordinal, call-site label, and raw word for comparison with emulator traces. `faithful-story.test.mjs` confirms that sampled streams complete, including the fishing return path.

## Limit of exact replay

The generator is exact, but a live DOSBox-X session cannot yet be replayed draw for draw. In the original program, intro and ambient animation share the generator with story logic. Their wall-clock-driven loops consume a different number of words depending on emulator timing; observed boots reached the story after roughly 400 to more than 20,000 draws.

The browser therefore reproduces the original generator and weighted-choice rule, but not the timing-dependent ambient interleave. A fully aligned trace would require a fixed emulator clock or a measured starting offset. Until then, claims of exactness apply to the generator and choice formula, not to every choice made during a live original-program session.

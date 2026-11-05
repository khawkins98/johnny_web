# Faithfulness oracle tools

These tools compare the browser engine with the original 1993 program. Start with [METHODOLOGY.md](./METHODOLOGY.md) for the approach and reproduction steps, and see [docs/oracle-coverage.md](../../docs/oracle-coverage.md) for current results.

## Choose a check

| Question | Entry point | Inputs |
| --- | --- | --- |
| Do actor combinations, concurrency or durations diverge? | `pnpm run test:faithful`; [method and reference workflow](METHODOLOGY.md) | Extracted game data; committed fingerprints. No DOSBox-X needed for replay. |
| Do rendered gag frames match the original? | [Pixel oracle](pixel-oracle/README.md) | Game data and original-program captures |
| Does normal playback choose and draw the same visits? | [Normal-play capture](METHODOLOGY.md#capturing-normal-play), [scoring and limits](pixel-oracle/README.md#normal-play) | Game data, patched DOSBox-X, Windows 3.1 and captures |
| How often does our planner choose each gag? | [`simulate.mjs`](../story-mix/simulate.mjs) | Runs without game data on the seeded Math.random path; the faithful-RNG path needs `SCRANTIC.SCR`. |
| Which behaviors are deliberately different? | [Accepted differences](../../docs/accepted-deviations.md) | No local assets needed to read |

Start with [local extraction](../../CONTRIBUTING.md#local-game-data) for engine replay. Use the [original-program capture setup](METHODOLOGY.md#capturing-one-original-gag) when you need new evidence. **A skipped data-dependent check is not a fidelity pass.** CI has no game data.

The sequencing check fails on zero live ticks or peak concurrency at least two actors above the reference. Actor-combination coverage and duration differences are review warnings; read them even when the command passes. A pass does not establish exact timing or pixel equality.

For a small planner-only smoke run from the repository root:

```sh
node tools/story-mix/simulate.mjs --batches 1
```

This plans one batch for each story day/clock phase. Increase `--batches` for a distribution study; a smoke run does not establish fidelity.

## Tools and references

- `capture-original-gag.mjs` records one forced gag; `gen-refs.mjs` turns recordings into stable fingerprints; `our-thread-timeline.mjs` records our engine in the matching format.
- `coverage-report.mjs` regenerates the [sequencing report](../../docs/oracle-coverage.md). Pixel and normal-play reporters own their sections; see the [pixel tool inventory](pixel-oracle/README.md#files).
- [Random-number port](rng-port.md) explains algorithm, seed and replay limits. JavaScript draws can be recorded with matching ordinal, site and raw-word fields through `createFaithfulRng(..., { onDraw })`.
- [Ghidra helpers](ghidra/README.md) decompile `SCRANTIC.SCR` and inspect handlers/catalogue data; `ne_entry.py`, `ne_reloc.py` and `ne_mask.py` locate Win16 functions.
- [Measurement probes](measure/README.md) revisit game-clock, frame-hold, island, walk and wave questions.
- [Earlier normal-play runner](normal-play/README.md) and [legacy browser capture helpers](browser/README.md) retain earlier investigation workflows and their limitations.
- `rendering-oracle/` converts DOSBox-X thread logs into timelines/fingerprints. `dosbox-x-oracle.patch` adds tracing and capture hooks to the pinned DOSBox-X revision. `dbx.conf` is an illustrative configuration template.

## Evidence retention

The patched DOSBox-X checkout, raw captures and anything decompiled or extracted from the game remain uncommitted. See [maintainer assets](METHODOLOGY.md#maintainer-assets) for permitted local paths, provenance and private backups. The small patches, scripts and derived reference files are kept in this repository.

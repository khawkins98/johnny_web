# Faithfulness oracle tools

These tools compare the browser engine with the original 1993 program. Start with [METHODOLOGY.md](./METHODOLOGY.md) for the approach and reproduction steps, and see [docs/oracle-coverage.md](../../docs/oracle-coverage.md) for current results.

The sequencing check uses:

- `capture-original-gag.mjs` to record one forced gag from the original program
- `gen-refs.mjs` to turn several recordings into stable reference fingerprints
- `our-thread-timeline.mjs` to record the browser engine in the same format
- `pnpm run test:faithful` to compare the engine with the committed references
- `coverage-report.mjs` to regenerate the coverage report

Other checks:

- `pixel-oracle/` compares rendered pixels with tick-aligned framebuffer captures of the original, for forced gags and for normal play; see [pixel-oracle/README.md](./pixel-oracle/README.md).
- `capture-normal-play.mjs` records the original in normal play (no forced gag), for the host canvas and the planner's gag mix.
- [`../story-mix/simulate.mjs`](../story-mix/simulate.mjs) plans many visits with our story controller and reports the gag mix, to compare with the original's.
- [rng-port.md](./rng-port.md) describes the original's random-number generator and our port of it.

Supporting files:

- `rendering-oracle/` converts DOSBox-X thread logs into timelines and fingerprints.
- `ghidra/` holds the headless Ghidra scripts that decompile `SCRANTIC.SCR` and dump its TTM handlers and scene catalogue.
- `normal-play/` holds an earlier, simpler normal-play runner; `measure/` holds one-question measurement probes (game clock, frame holds, island and walk placement, waves); `browser/` drives our build in Chromium for comparison shots.
- `dosbox-x-oracle.patch` adds tracing, gag isolation, host-state logging and optional frame capture to the pinned DOSBox-X revision.
- JavaScript draws can be recorded with matching ordinal, site, and raw-word fields through `createFaithfulRng(..., { onDraw })`.
- `ne_entry.py`, `ne_reloc.py`, and `ne_mask.py` locate functions safely in the Win16 executable.
- `dbx.conf` configures the DOSBox-X test environment.

The patched DOSBox-X checkout, raw captures, and anything decompiled or extracted from the game are never committed; see "Maintainer assets" in [METHODOLOGY.md](./METHODOLOGY.md#maintainer-assets). The small patches, scripts, and derived reference files are kept in the repository.

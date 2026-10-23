# Faithfulness oracle tools

These tools compare the browser engine with the original 1993 program. Start with [METHODOLOGY.md](./METHODOLOGY.md) for the approach and reproduction steps.

The normal test path uses:

- `capture-original-gag.mjs` to record one gag from the original program
- `gen-refs.mjs` to turn several recordings into stable reference fingerprints
- `our-thread-timeline.mjs` to record the browser engine in the same format
- `npm run test:faithful` to compare the engine with the committed references

Supporting files:

- `rendering-oracle/` converts DOSBox-X thread logs into timelines and fingerprints.
- `pixel-oracle/` compares rendered pixels with tick-aligned framebuffer captures of the original; see [pixel-oracle/README.md](./pixel-oracle/README.md).
- `ghidra/` holds the headless Ghidra scripts that decompile `SCRANTIC.SCR` and dump its TTM handlers and scene catalogue.
- `normal-play/` captures the original in unforced play, `measure/` holds one-question measurement probes (game clock, frame holds, island and walk placement, waves), and `browser/` drives our build in Chromium for comparison shots.
- `dosbox-x-oracle.patch` adds tracing, gag isolation, and optional frame capture (tick-labelled with `DBX_FB_TICKS`) to the pinned DOSBox-X revision.
- JavaScript draws can be recorded with matching ordinal, site, and raw-word fields through `createFaithfulRng(..., { onDraw })`.
- `ne_entry.py`, `ne_reloc.py`, and `ne_mask.py` locate functions safely in the Win16 executable.
- `dbx.conf` configures the DOSBox-X test environment.

The patched DOSBox-X checkout, raw captures, and anything decompiled or extracted from the game are not committed; see "Maintainer assets" in [METHODOLOGY.md](./METHODOLOGY.md#maintainer-assets). The small patches, scripts, and derived reference files are kept in the repository.

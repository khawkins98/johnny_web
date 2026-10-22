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
- `dosbox-x-oracle.patch` adds tracing, gag isolation, and optional frame capture (tick-labelled with `DBX_FB_TICKS`) to the pinned DOSBox-X revision.
- JavaScript draws can be recorded with matching ordinal, site, and raw-word fields through `createFaithfulRng(..., { onDraw })`.
- `ne_entry.py`, `ne_reloc.py`, and `ne_mask.py` locate functions safely in the Win16 executable.
- `dbx.conf` configures the DOSBox-X test environment.

The patched DOSBox-X checkout and raw captures are temporary and are not committed. The small patches, scripts, and derived reference files are kept in the repository.

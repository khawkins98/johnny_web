# Faithfulness oracle tools

These tools compare the browser engine with the original 1993 program. Start with [METHODOLOGY.md](./METHODOLOGY.md) for the approach and reproduction steps.

The normal test path uses:

- `capture-original-gag.mjs` to record one gag from the original program
- `gen-refs.mjs` to turn several recordings into stable reference fingerprints
- `our-thread-timeline.mjs` to record the browser engine in the same format
- `npm run test:faithful` to compare the engine with the committed references

Supporting files:

- `rendering-oracle/` converts DOSBox-X thread logs into timelines and fingerprints.
- `dosbox-x-trace.patch` adds script and random-number tracing to DOSBox-X.
- `dosbox-x-framebuffer.patch` captures frames for manual visual checks.
- `ne_entry.py`, `ne_reloc.py`, and `ne_mask.py` locate functions safely in the Win16 executable.
- `dbx.conf` configures the DOSBox-X test environment.

The patched DOSBox-X checkout and raw captures are temporary and are not committed. The small patches, scripts, and derived reference files are kept in the repository.

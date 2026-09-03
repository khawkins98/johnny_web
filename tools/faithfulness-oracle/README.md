# tools/faithfulness-oracle

Durable record of how we verify this engine against the original 1993 binary, and the
small tooling to reproduce it. Full write-up: **[METHODOLOGY.md](./METHODOLOGY.md)**.

The runnable JS oracle lives in the engine itself (committed):
- `src/dgds/scripting/oracle/completion-model.mjs` — transliterated completion oracle
- `src/dgds/scripting/oracle/report.mjs` — standalone diff report
- `src/dgds/scripting/__tests__/oracle-completion-diff.test.mjs`,
  `oracle-completion-decision.test.mjs`, `gag-terminal-sweep.test.mjs` — the automated net
- `src/dgds/scripting/__tests__/support/drive-gag.mjs` — the real-path gag driver

Files here (the ground-truth binary-trace tooling; the DOSBox-X build tree + captured
traces are large/ephemeral and NOT committed — rebuild from these):
- `METHODOLOGY.md` — the layered-oracle approach, the reproduce recipe, the RNG finding,
  the bugs found, and the reusable takeaways.
- `dosbox-x-trace.patch` — patch for `src/cpu/core_normal.cpp` in joncampbell123/dosbox-x;
  logs entries to the four ADS functions (by 24-byte entry signature) to `$DBX_TRACE`.
  Apply, then `./build-debug-macos-sdl2`; run with `-set "cpu core=normal"` (see METHODOLOGY).
  Now also adds a 5th signature (ADS-file loader `FUN_1018_0c88`) that tags framebuffer dumps
  with the active ADS scene.
- `dosbox-x-framebuffer.patch` — patch for `src/hardware/vga_draw.cpp`; dumps the emulated VGA
  framebuffer as scene-labeled PPMs (reuses the built-in raw-screenshot / DAC path, headless).
  Superseded by the thread-timeline approach for the CI gate (see METHODOLOGY.md "retired:
  pixel-diff approach"); kept as a manual arbitration tool.
- `capture-original-gag.mjs` — deterministic single-gag ORIGINAL capture (director injection).
- `gen-refs.mjs` — generate committed, RNG-tolerant reference fingerprints from N captures.
- `our-thread-timeline.mjs` — per-tick "live actor" timeline extractor for OUR engine.
- `rendering-oracle/` — supporting tooling: `threads-to-timeline.mjs` (DBX_THREADS log ->
  shared per-tick JSONL), `build-vocab.mjs` (union a coverage vocabulary from N timelines),
  `compare-vocab.mjs` (RNG-tolerant vocab/maxConc verdict), `compare-thread-timelines.mjs`
  (LCS-aligned state-sequence diff), `parallel-capture.mjs` / `run-diff-sweep.mjs` /
  `sweep-catalogue.mjs` (batch capture + sweep orchestration), `force-gag.py` /
  `force-scene-patches.py` (selection-only director forcing), `capture-original.sh` /
  `capture-gag.sh` (original-binary capture drivers).
- `ne_entry.py` — extract each target function's entry signature (file-unique) from SCRANTIC.SCR.
- `ne_reloc.py` / `ne_mask.py` — parse the NE relocation table / prove a signature is
  relocation-safe.
- `dbx.conf` — DOSBox-X config (drive C = our data, drive D = minimal Win3.1).

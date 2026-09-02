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
- `ne_entry.py` — extract each target function's entry signature (file-unique) from SCRANTIC.SCR.
- `ne_reloc.py` / `ne_mask.py` — parse the NE relocation table / prove a signature is
  relocation-safe.
- `dbx.conf` — DOSBox-X config (drive C = our data, drive D = minimal Win3.1).

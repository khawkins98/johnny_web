# Normal-play runner (earlier version)

For new normal-play captures, use [`../capture-normal-play.mjs`](../capture-normal-play.mjs). It logs the planner's queue and the island bake through the `DBX_HOST` hook and takes the Start Time, story day and clock options; see [METHODOLOGY.md, "Capturing normal play"](../METHODOLOGY.md#capturing-normal-play).

`run-normal.mjs` is the simpler runner used before that, for the island-offset and night/tide fixes (#58, #61). It runs the original screensaver in the patched DOSBox-X **without forcing a gag** and dumps every Nth presented frame.

```sh
export SP_DOSBOX=/path/to/scratchpad/dosbox        # driveC/ + driveD/, see METHODOLOGY.md
export DBX=/path/to/scratchpad/dosbox-x-src/src/dosbox-x   # patched build (dosbox-x-oracle.patch)
node tools/faithfulness-oracle/normal-play/run-normal.mjs scratchpad/maintainer/captures/np-run1 120 70
```

Arguments: output directory, seconds to run (default 90), dump every Nth present (default 70), and the present to start dumping from (default 0). Frames land in `fb/fb_NNNNNN_frame.ppm`, at most 400 of them, next to `threads.log`, `trace.log` and a per-run copy of drive C. Several runs can go in parallel.

The output is a capture of the original program. Keep it under `scratchpad/` and never commit it. The measurement scripts in [../measure/](../measure/) read these frames.

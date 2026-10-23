# Wave measurements

Scripts that read tick-labelled framebuffer captures of the original and measure how the island's three (low tide: four) wave patches step. They established the round-robin stepping and the one-or-two-tick cadence fixed in #64.

| Script | What it prints |
| --- | --- |
| `steps.py <gag> [dx dy] [high\|low]` | Ticks at which each wave region changes, and the gap histogram. |
| `multi.py high\|low <gag>...` | The same over several gags: round-robin order, multi-region ticks, mean ms per step. |
| `ident.py <gag> [dx dy] [high\|low] [maxTicks]` | Which `BACKGRND.BMP` wave frame each region shows per tick. |
| `offset.py <gag> <tick> [low]` | The screen offset at which each wave frame matches best. |
| `peek.py <gag>` | Per-tick changed-pixel bounding boxes, and the middle frame as a PNG. |
| `dump-wave-frames.mjs [outDir]` | Extracts the wave frames that `ident.py` and `offset.py` match against. Needs `public/data/`. |

`load.py` reads captures from `$WAVE_CAPTURES/<gag>/fb/tNNNNNN.ppm[.gz]` (default `scratchpad/pixel-oracle/captures`, the layout `../../pixel-oracle/capture-gags.mjs` writes) and wave frames from `$WAVE_FRAMES` (default `scratchpad/maintainer/waves/frames`).

```sh
node tools/faithfulness-oracle/measure/waves/dump-wave-frames.mjs
python3 -I tools/faithfulness-oracle/measure/waves/multi.py high ACTIVITY_1 FISHING_1
```

Captures and extracted frames are game-derived: keep them in `scratchpad/`, never commit them.

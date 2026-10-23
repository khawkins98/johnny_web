# Measurement scripts

Small one-question probes from the #53 render-fidelity work. Each one reads a capture of the original, our engine, or both, and prints numbers; none of them changes anything. They are kept so the same measurement can be repeated when a related fix is revisited.

Inputs and outputs that come from the game (captures, extracted sprites, JSON dumps) are proprietary-derived. Keep them under `scratchpad/` (for example `scratchpad/maintainer/`) and never commit them. See "Maintainer assets" in [../METHODOLOGY.md](../METHODOLOGY.md).

## Game clock and frame holds

| Script | Question it answers |
| --- | --- |
| `capture-delay-set.sh` | Captures a set of gags in parallel with the `DBX_DELAY` game-clock log. Needs `SP_DOSBOX` and `DBX` as for `capture-original-gag.mjs`. |
| `delay-log.mjs <delay.log> <slot:tag>` | How many 16 ms game-clock ticks pass per present, and how long each frame of one thread is held, grouped by authored delay. |
| `clock-jumps.mjs <delay.log> <timeline.jsonl>` | Where the game clock jumps, and which threads started or stopped there (the load-time jumps in METHODOLOGY.md). |
| `measure-holds.mjs <ADS> <tag>` | The same holds in **our** engine, driven headless through `drive-gag.mjs`. Needs `public/data/`. |

## Island and walk placement

| Script | Question it answers |
| --- | --- |
| `match.py` | Where in an original frame a crop of ours matches best (island position). |
| `fgmatch.py` | Best whole-pixel shift of our foreground onto an original frame. |
| `dump-walk.mjs <out.json>` | Writes the walk table, walk sprites and island layer 0 for `walkmatch.py`. |
| `walkmatch.py <walk.json> <frames...>` | Whether Johnny's walk positions relative to the island match the original's. |
| `trunkcheck.py` | Whether the palm-trunk occluder is redrawn over Johnny in our canvases. |
| `composite-canvases.py` | Composites the two canvases saved by `../browser/browse-canvases.mjs`. |
| `catalogue-flags.mjs` | Each scene-catalogue record's `flagsB` bits by name (high tide, night, waves off, black background, ...), tide window and day. |

Python scripts need `numpy` and `Pillow`. Run them with `python3 -I` when they read captures.

## Waves

See [waves/README.md](./waves/README.md).

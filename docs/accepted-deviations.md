# Accepted differences from the original

This port aims to look and behave like the original *Johnny Castaway* screensaver (`SCRANTIC.SCR`). The [pixel oracle](../tools/faithfulness-oracle/pixel-oracle/README.md) compares our frames with captures of the original. The [sequencing oracle](../tools/faithfulness-oracle/README.md) compares which scenes run and when. The differences below are known and kept on purpose. Each says why. Anything not listed here that the oracles find is treated as a bug.

The rendering model behind these notes is the buffer contract in [scrantic-re-findings.md, Part C](scrantic-re-findings.md). The work that produced this list is tracked in [#53](https://github.com/khawkins98/johnny_web/issues/53).

## Drawing

- **Island, clouds, waves and walks are drawn on the host canvas.** The original draws them into the same buffers as the scenes. We keep them on a separate canvas so that Enhanced mode and the local-time features (clouds, holidays, Live Local Clock) can work. Pixel results match where the oracle can check them.
- **Stale screen pixels.** The original only redraws the screen where something changed. Areas nothing touches keep whatever was there before. One example is the title-screen leftovers below row 350 under the "meanwhile" clock in forced captures. We always present a clean frame.
- **Wipes.** The original's wipe effects draw straight to the screen. Ours go through the normal frame.
- **Palette.** On a 16-colour display, Windows 3.1 swaps some of the game's colours for its own system colours (for example `#ff0000` to `#ffffff`, `#0000a8` to `#0000ff`, `#d4d4d4` to `#c3dfc3`). We show the colours the artists drew. The pixel oracle counts these swaps as remaps, not differences.

## Timing

- **The clock jump while loading.** The original's game clock keeps running while it reads a scene from disk. How much it advances depends on the machine: 190 ms to 1.8 s in our captures. So in the original, the first frame of a newly loaded scene can pass almost at once, and a scene loaded mid-gag can leave its actor a couple of frames ahead. We have no load cost, so the first frame holds for its scripted delay. The same frames play in the same order. Details: [METHODOLOGY, "Load-time clock jumps"](../tools/faithfulness-oracle/METHODOLOGY.md).

## Not yet verified

- **The host canvas in normal play.** Pixel checks so far use forced-gag captures, which skip the original's island setup. A check of the island, ocean, night sky, waves and raft in normal play is in progress under #53.
- **Story picker.** Four known differences in which gags the planner picks are tracked in [#68](https://github.com/khawkins98/johnny_web/issues/68). They are bugs to fix, not accepted differences.

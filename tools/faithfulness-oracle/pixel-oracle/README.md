# Pixel oracle

Compares what the browser draws with what the original program draws, one keyframe
at a time, for every isolable gag (#53 Phase 1). The sequencing oracle
(`npm run test:faithful`) already checks which scenes run and when. This one checks
pixels. Scores and tooling are committed; captures and frames are not.

```sh
# 1. capture the original (about 7 minutes for all 64 gags at --conc 6)
SP_DOSBOX=$PWD/scratchpad/dosbox DBX=$PWD/scratchpad/dosbox-x-src/src/dosbox-x \
  node tools/faithfulness-oracle/pixel-oracle/capture-gags.mjs
# 2. score every gag (3-7 minutes at --conc 8), refresh scores.json and the doc
node tools/faithfulness-oracle/pixel-oracle/sweep.mjs
# one gag, with orig | ours | category map | backdrop PNGs for eyeballing
node tools/faithfulness-oracle/pixel-oracle/compare.mjs SUZY:1 --dump scratchpad/pixel-dump
# our render alone, any gag x seed
node tools/faithfulness-oracle/pixel-oracle/render-ours.mjs SUZY 1 --seed 3 --every 100
```

DOSBox-X has to be built from `../dosbox-x-oracle.patch` (see
[METHODOLOGY.md](../METHODOLOGY.md)). Without game data or a capture, every script
exits 0 with a message, and the local gate in
`src/dgds/scripting/__tests__/pixel-oracle.test.mjs` is skipped.

## Files

| File | Role |
|------|------|
| `capture-gags.mjs` | Batch forced captures with `capture-original-gag.mjs --fb`, into `scratchpad/pixel-oracle/captures/<NAME>_<tag>/`. |
| `render-ours.mjs` | Headless browser render: `driveGag` plus the browser's own `createBrowserFramePresenter` (`composeTtmFrame`, `drawBackground`) on a software canvas. |
| `soft-canvas.mjs` | The Canvas 2D subset that the presenter and `drawBackground` use. |
| `align.mjs` | Live-set spans, span alignment, keyframe choice. Pure. |
| `score.mjs` | Masked per-keyframe score, palette substitution, offset check, host masks. Pure. |
| `compare.mjs` | Single-gag comparator. |
| `sweep.mjs` / `report.mjs` | All gags in parallel; `scores.json`; the "Pixel oracle" section of `docs/oracle-coverage.md`. `coverage-report.mjs` keeps that section when it regenerates the file. |

## Tick alignment

The THREADS hook already numbers every call of the ADS tick function `FUN_1048_1acb`.
That number is the row index of `timeline.jsonl`. With `DBX_FB_TICKS=1` (set by
`--fb`), the same hook arms a framebuffer dump and labels it with that tick number,
`fb/t<tick>.ppm.gz`. A dump is armed on every tick by default (`--fb-every`), plus
the two ticks after each live-set change. The dump is written at the end of the
next VGA frame, about 14 ms after tick entry, so it shows that tick's drawing. Each
load of the forced ADS adds `#FBLOAD n=<k> tick=<t>` to the trace and an
`fb/L<k>_t<t>.ppm.gz` dump. `L1` is the screen the gag starts on. Dumps stop after
the first episode (load 1 to load 2) and the capture is then killed, so the run
needs no fixed duration. Dumps are gzipped while the capture runs, at 5-40 KB each.
All 64 gags take about 660 MB.

Our engine ticks every 20 ms and the original samples at about 55 ms, and the two
sides can take different random branches. So frames are matched through the live
sets, not by clock time:

1. Both streams are cut into spans of a constant, non-empty live set.
2. For seeds 1..16, our span sequence is aligned to the original's
   (longest-common-subsequence, weighted by original samples). The seed that covers
   the most original samples is used. "Live-set coverage" in the table is that
   fraction.
3. Keyframes come from matched spans: the first sample (the transition), one to
   three mid-span samples, and the tick after each of our LOAD_SCREEN / STORE_AREA
   bakes (the samples Phase 0 says are most likely to show plate differences).
   They are capped at 48 per gag.
4. Each keyframe is mapped to our tick at the same fraction of our span. The best
   pair is then chosen over our ticks within ±6 and original ticks within ±1.

## Score

`score.mjs` explains the mask in its header. In short:

- **Mask**: pixels where our foreground is opaque, where a gag-loaded screen
  (SUZBEACH, JOFFICE, THEEND, INTRO) is non-black, or where the original changed
  since `L1`. Our host-owned background (island, ocean) is never painted, because a
  forced capture skips the planner's island bake. The plate is the never-baked
  bitmap, black, so our side is composited over black.
- **Not scored**: host drawing in the original's first live frame that our first
  frame does not explain (`hostRemnant`). The host's animated shoreline-wave
  rectangles, where our gag drew nothing. Stale screen below row 350 that only the
  original changed (`stale`, counted separately). Phase 0 found these are leftovers
  of dirty-rectangle presentation.
- **Palette**: under Windows 3.1 some palette entries come out as static system
  colours. For example, our `#d4d4d4` grey shows as `#c3dfc3` "money green" in the
  SUZY city. A colour that maps one-to-one (at least 80% of at least 32 pixels) is
  a substitution and is not counted (`remapped`). `raw` keeps it.
- **Black plate (top)**: the percentage of the backdrop's non-black top-350 rows
  where the original shows black and ours draws nothing. This is the original
  restoring its black plate over leftovers: the actor-shaped "holes" in island
  gags, and MEANWHIL's 640x350 area. Phase 0 says off-island plates are black, so
  this is diagnostic and not a divergence. `diffOnBackdrop` is the same keyframe
  scored with ours over the original's backdrop instead of black.
- **Offset**: `foregroundShift` finds the `(dx, dy)` within ±2 that best aligns our
  opaque foreground with the original. The gag's dominant offset is applied for the
  `aligned` score. A keyframe keeps its unshifted score when that is better.

Verdicts use the aligned median and max (`report.mjs` `THRESHOLDS`): median
<= 2% is faithful, marked "outlier keyframe" when one keyframe is above 8%; median
<= 5% is close; anything else is divergent.

## Findings (2026-10-22 sweep)

- **SUZY:1 is faithful**: aligned median 1.0%, max 2.6%, coverage 100%. SUZY:2,
  JOHNNY:1 and JOHNNY:6 (which also open on the MEANWHIL card) are between 0% and
  1%.
- **Sprites line up at (0,0) in all 64 gags** since render-ours' `forced` host uses
  the binary's TTM offset. `FUN_1010_00fc` draws TTM sprites at `30c6 + 1`, or
  `30c6 + 0x111` for LEFT_ISLAND scenes. A forced capture never runs the island
  bake, so `30c6` is 0, and the planner never sets `30b4 = 2`, so off-island scenes
  (the MEANWHIL clock) get the `+1` too. The forced host therefore offsets every
  scene by 1, or 273 for LEFT_ISLAND (FISHING:4/7/8, MARY:5, VISITOR:5). With the
  old 0 / 272, every gag needed a (1,0) shift: the STAND poses were 11-39% raw.
  Normal play is set by the story controller (#58), not by this host.
- **Palette substitution** of static colours shows up wherever those entries are
  used (SUZY's city). This is a deviation in what the browser shows. Decide whether
  to accept it or emulate it.
- **Double ship in BUILDING:4/6 (`2:64` to `2:68`)**: at the handoff, ours draws the
  finished scene's last frame for one more tick (`agedOut === false`) while the
  successor draws the ship further along, so two ships overlap. The original shows
  one ship. This is a real compositor divergence for Phase 2.
- **Palm trunk drawn by the original** in FISHING:4 and WALKSTUF:1 forced captures
  (orig-only pixels) is missing from our foreground. Check whether a TTM redraws the
  trunk over passing actors, or whether it is a plate/host artefact of forced mode.

The worst gags are mostly harness noise. BUILDING:2 (divergent, 12.6% median) has
low live-set coverage (66%) and a moving ship at a different phase. Its result is
the same with a ±20 tick window (8.9%), so it needs eyeballing. Outlier keyframes
above 8% are mostly moving objects at a different phase within a long span (the
plane in VISITOR:1, the boat in WALKSTUF:1, the pose phase in STAND:16), or the
first keyframe of a gag.

## Limitations

- Captures are forced. There is no island, the plate is black, and a gag starts on
  title-screen leftovers. So nothing under our host canvas (island, ocean, night,
  clouds, waves) is checked, and plate-restore differences show as black instead
  of island. A normal-play capture would need the planner's bake. Phase 0 explains
  how it builds the plate.
- One episode per gag is used, so branches the capture did not take are not scored.
  Low coverage (below 80%) means our best seed took a different branch for part of
  the gag.
- Matching is by span fraction. Steady motion inside a long span can be out of
  phase by more than the ±6 tick window.
- A dump is written up to one VGA frame after tick entry. A few ticks have no dump
  (two ticks fell inside one frame). `±1` original tick absorbs both.
- The `hostRemnant` and wave-area masks can hide real drawing by the original
  inside those areas when our side draws nothing there.

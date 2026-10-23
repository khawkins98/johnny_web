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
   They are capped at 48 per gag. The transition into the gag's first span is its
   own kind, `first-frame`, when both sides' first spans are the matched pair
   (54 of 64 gags; the STAND gags and ACTIVITY:8/11 start on a span our seed does
   not match).
4. Each keyframe is mapped to our tick at the same fraction of our span. The best
   pair is then chosen over original ticks within ±1 and, for each of those, our
   ticks within ±6 of the mapped tick moved by the same number of samples (2.85 of
   our ticks each; a span's first tick often has no dump, so the next sample is
   used). Mid-span keyframes widen the ±6 to a fifth of our span, up to ±40
   (`align.mjs` `searchWindows`): steady motion drifts when the two sides pace a
   span differently, and pacing is the sequencing and lifespan oracles' job.
   Transitions and bakes keep ±6. The `first-frame` keyframe keeps −6 behind the
   mapped tick and reaches forward by the number of our ticks the gag's first frame
   was held (`compare.mjs` measures it on our render: 8 to 10 ticks in most gags),
   capped at 40. That covers the accepted deviation below (the original passes a
   loading first frame at its next sample; ours holds its delay) and nothing else.
   `scores.json` records the hold, the lag at which the best pair was found and the
   score under `firstFrame`.

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

The 2026-10-22 sweep had three gags with a keyframe above 8%, all from one timing
difference: a `SET_DELAY 7` frame lasted about 147 ms in ours against about 120 ms
in the original (2.13 samples a frame in WALKSTUF:1 `1:2`), because ours rounded
112 ms up to six 20 ms ticks and then waited for a present. Frame holds are now the
binary's deadline on the 16 ms game clock, read once per present (see the
[methodology](../METHODOLOGY.md#frame-holds-53)). The re-run sweep:

- BUILDING:2 `1:35`/`1:40`/`1:41`: 26% to 3.1% (the ship, delay 7, no longer lags
  `1:40`'s delays 30/15/8); live-set coverage 66% to 80%, so the median moved from
  0.03% to 1.24% over more keyframes.
- WALKSTUF:1 `1:4`: 30.5% to 0.3%.
- BUILDING:8 `3:78`: the delay-7 fire cycle keyframes went from up to 8.1% to at
  most 0.13%, but a `3:44 3:48` transition keyframe is at 8.4% (it was 6.0% before,
  with fewer keyframes matched). That one is the load-time clock jump, below.
- Lifespan oracle: in-band actor spans went from 195/651 to 331/651, with no new
  review beyond 3x.
- ACTIVITY:8 (7.5% to 1.5%), MARY:1 (5.1% to 0.9%) and MARY:4 (6.1% to 1.1%) lost
  their worst keyframes.
- Two gags gained a keyframe above 8% at the gag's first frame: FISHING:5 `5:19`
  (0.2% to 13.4%) and VISITOR:5 `5:1 5:8` (0.7% to 12.0%). The first frame of those
  threads loads the screen and bitmaps, and in the original the game clock jumps
  at a sample that loads, so that frame passes at the next sample whatever its
  delay. Ours has no load cost, so the frame holds its full delay (four presents,
  since a changed SET_DELAY also redraws the frame at the present its hold
  elapses). The ±6 window used to hide this. (JOHNNY:5 `2:9` 2.3% and MARY:2 1.5%
  were listed with them at the time; their first-frame keyframes score 0% and
  those figures are mid-span pacing on `2:9` and `2:105 2:106`.)

### The first frame: an accepted deviation (2026-10-23)

The jump is not an engine rule. Eight `DBX_DELAY` captures (BUILDING:7 and MARY:4
run alone for #40; FISHING:5, VISITOR:5, JOHNNY:5, MARY:2, SUZY:1 and BUILDING:2
run six at a time) show that `now` advances by the load's emulated wall time: the
`emu=` and `host=` deltas agree within a few percent at every jump, and the
thread's deadline is always the pre-load clock plus its delay (`deadline - now`
after the jump is exactly `delay - jump`). The size depends on the host: the first
sample of a gag jumped 18 units (190 ms) in the lone runs and 28 to 113 units
(316 to 1,804 ms) in the six-way runs, and the same FISHING:5 first sample ranged
31 to 59 units across one capture's episodes. Mid-gag TTM adds jumped 7 to 55,
samples with an image load inside a running thread 6 to 10, and the director's
reload between episodes 20 to 230. So there is no per-load constant to calibrate,
and in wall time the original shows the previous picture for the load and then the
first frame for one sample (245 ms to 1.9 s in all), while ours shows the first
frame for its hold (about 220 ms): advancing our clock without stalling would make
every gag start and end a load earlier than the original, and stalling would be
emulating hardware speed. The deviation is accepted and the oracle scores it as
its own keyframe kind (`first-frame`, "Tick alignment" step 4) instead of hiding
it in the ±6 window or reporting it as an outlier. With that, FISHING:5 goes from
13.4% to 0.2% max and VISITOR:5 from 12.0% to 0.7%; MARY:1's max drops from 0.9%
to 0.3% (its first frame); no other gag moved.
Our first frame's best pair lags the mapped tick by 8 to 10 ticks (the whole
hold) in 24 gags and by none in 25, where the first frame is a loader or a long
hold on both sides.
The methodology's "Frame holds" section has the clock evidence.

### BUILDING:8 `3:44 3:48`: the same jump, mid-gag (2026-10-23)

The gag's one outlier keyframe (8.4%, original sample 708) is a mid-gag case of
that jump. It is not a render difference and not the black plate: the plate
holes over the palm are `eb0` and are not scored. The score is all Johnny and the
squid (orange and red in the category map). MJFIRE `3:48` ("J brings squid")
starts with `LOAD_IMAGE FIRE2.BMP` and `SET_DELAY 9`. The original shows that
first frame at sample 659 only. By sample 660 it shows the third frame (x 427);
the second (x 438) never appears in a dump. Ours holds the first frame for 10
ticks and the second for 8 (ticks 1610-1627). From then on the original runs two
frames, about 280 ms, ahead of ours, and the gap stays the same to the end of
the walk.
The live set changes every fire cycle (`3:44` drops out for one sample about
every 9 samples), so the walk is cut into seven short `3:44 3:48` spans. They are
all transition keyframes with the ±6 window, and Johnny's matching pose lies up to
25 of our ticks past the mapped tick.
Searching our ticks 1590-1800 for every original sample from 655 to 720 finds an
exact (0%) match for samples 673, 676, 682, 684, 690, 691 and 693, and nothing
worse than 2.6% for any sample. The remaining 1.5-2.6% is the fire frame paired
with each Johnny frame: the jump also cut short `3:44`'s hold, so the two threads
are out of phase with each other by a different amount than ours.
No harness change was made. Reaching 25 ticks forward from every transition after
a thread load would hide pacing differences elsewhere. The keyframe stays listed
as an outlier and is explained here.

BUILDING:4/6 keep about 4-6% at `2:64 2:68` after the wider window. The original
shows coloured noise in the 175x142 rectangle at (194, 123) from tick 621, where
GJGULIVR `2:64` does `PUT_REGION` and `STORE_AREA` of the region `2:53` saved with
`GET_REGION` at tick 281. The screen there was black at 281, so the original's
saved buffer no longer holds those pixels when it is put back. This is probably a
forced-capture artefact; a normal-play capture of the Lilliput sequence would
settle it.

## Limitations

- Captures are forced. There is no island, the plate is black, and a gag starts on
  title-screen leftovers. So nothing under our host canvas (island, ocean, night,
  clouds, waves) is checked, and plate-restore differences show as black instead
  of island. A normal-play capture would need the planner's bake. Phase 0 explains
  how it builds the plate.
- One episode per gag is used, so branches the capture did not take are not scored.
  Low coverage (below 80%) means our best seed took a different branch for part of
  the gag.
- Matching is by span fraction. Steady motion inside a long span is only
  absorbed up to the mid-span window (a fifth of the span, at most ±40 ticks), and
  transition keyframes still show pacing differences between threads.
- A dump is written up to one VGA frame after tick entry. A few ticks have no dump
  (two ticks fell inside one frame). `±1` original tick absorbs both.
- The `hostRemnant` and wave-area masks can hide real drawing by the original
  inside those areas when our side draws nothing there.

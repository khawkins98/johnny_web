# Pixel oracle

Compares what the browser draws with what the original program draws, one keyframe
at a time, for every isolable gag (#53). The sequencing oracle
(`pnpm run test:faithful`) already checks which scenes run and when. This one checks
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
| `sweep.mjs` / `report.mjs` | All gags in parallel; `scores.json`; the "Pixel oracle" and "Normal play" sections of `docs/oracle-coverage.md`. `coverage-report.mjs` keeps both when it regenerates the file. |
| `normal-play.mjs` | Normal-play captures: parse the `DBX_HOST` log into planned batches, the bake's titleState, the story mix, host verdicts. Pure. |
| `host-check.mjs` | Host-canvas check of normal-play captures (island, ocean, sky, waves per batch). |
| `normal-play-report.mjs` | Story mix + host check over a directory of runs; writes `normal-play-batches.json` and `normal-play-scores.json`, refreshes the doc section. |

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
   bakes (the samples most likely to show plate differences; see
   [findings Part C](../../../docs/scrantic-re-findings.md#part-c--buffer-contract-issue-53-phase-0)).
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
  original changed (`stale`, counted separately). These are leftovers of
  dirty-rectangle presentation (findings C.5).
- **Palette**: under Windows 3.1 some palette entries come out as static system
  colours. For example, our `#d4d4d4` grey shows as `#c3dfc3` "money green" in the
  SUZY city. A colour that maps one-to-one (at least 80% of at least 32 pixels) is
  a substitution and is not counted (`remapped`). `raw` keeps it.
- **Black plate (top)**: the percentage of the backdrop's non-black top-350 rows
  where the original shows black and ours draws nothing. This is the original
  restoring its black plate over leftovers: the actor-shaped "holes" in island
  gags, and MEANWHIL's 640x350 area. Off-island plates are black (findings C.4), so
  this is diagnostic and not a divergence. `diffOnBackdrop` is the same keyframe
  scored with ours over the original's backdrop instead of black.
- **Offset**: `foregroundShift` finds the `(dx, dy)` within ±2 that best aligns our
  opaque foreground with the original. The gag's dominant offset is applied for the
  `aligned` score. A keyframe keeps its unshifted score when that is better.

Verdicts use the aligned median and max (`report.mjs` `THRESHOLDS`): median
<= 2% is faithful, marked "outlier keyframe" when one keyframe is above 8%; median
<= 5% is close; anything else is divergent.

## Findings

- **SUZY:1 is faithful**: aligned median 1.0%, max 2.6%, coverage 100%. SUZY:2,
  JOHNNY:1 and JOHNNY:6 (which also open on the MEANWHIL card) are between 0% and
  1%.
- **Sprites line up at (0,0) in all 64 gags** since render-ours' `forced` host uses
  the binary's TTM offset. `FUN_1010_00fc` draws TTM sprites at `30c6 + 1`, or
  `30c6 + 0x111` for LEFT_ISLAND scenes. A forced capture never runs the island
  bake, so `30c6` is 0, and the planner never sets `30b4 = 2`, so off-island scenes
  (the MEANWHIL clock) get the `+1` too. The forced host therefore offsets every
  scene by 1, or 273 for LEFT_ISLAND (FISHING:4/7/8, MARY:5, VISITOR:5). Normal play
  is set by the story controller (#58), not by this host.
- **Palette substitution** of Windows static colours (SUZY's city) is an
  [accepted difference](../../../docs/accepted-deviations.md).
- **Fixed since the first sweep:** the double ship in BUILDING:4/6 `2:64`–`2:68`
  (#57), the palm trunk over passing actors in FISHING:4 and WALKSTUF:1 (#58), and
  delay-7 frames lasting about 147 ms instead of about 120 ms (#63). The last one
  took BUILDING:2 `1:35` from 26% to 3.1%, WALKSTUF:1 `1:4` from 30.5% to 0.3%, and
  BUILDING:8's fire cycle from 8.1% to 0.13%, and moved in-band lifespans from
  195/651 to 331/651.

### The first frame: an accepted difference

The original's game clock jumps while a gag loads, so a loading first frame passes
at the next sample; ours has no load cost and holds the frame for its delay. The
evidence and the reasons for not modelling it are in the
[methodology, "Load-time clock jumps"](../METHODOLOGY.md#load-time-clock-jumps).
The oracle scores that frame as its own keyframe kind (`first-frame`, "Tick
alignment" step 4) instead of hiding it in the ±6 window or reporting an outlier.
With that, FISHING:5 went from 13.4% to 0.2% max and VISITOR:5 from 12.0% to 0.7%.
Our first frame's best pair lags the mapped tick by 8 to 10 ticks (the whole
hold) in 24 gags and by none in 25, where the first frame is a loader or a long
hold on both sides.

### BUILDING:8 `3:44 3:48`: the same jump, mid-gag

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
  title-screen leftovers. So nothing under our host canvas is checked here, and
  plate-restore differences show as black instead of island. The host canvas is
  checked separately in [normal play](#normal-play).
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

## Normal play

Everything above uses forced captures, which skip the original's planner and island
bake. Normal-play captures (`../capture-normal-play.mjs`: the program runs as
shipped, with `DBX_HOST` logging the planner's queue and the bake's globals, and
`DBX_FB_NORMAL` arming tick-stamped dumps from the first tick; see the
[methodology](../METHODOLOGY.md#capturing-normal-play)) cover the two things the
forced oracle cannot see: the host canvas and the story mix.

```sh
# a 30-minute run; night = StartTime 6-8 h before now (phase >= 12); --story-day sets the INI day
SP_DOSBOX=$PWD/scratchpad/dosbox DBX=$PWD/scratchpad/dosbox-x-src/src/dosbox-x \
  node tools/faithfulness-oracle/capture-normal-play.mjs scratchpad/normal-play/d1 --secs 1800 --fb-every 16 --fb-after 1
# story mix + host canvas over every run in the directory; refreshes docs/oracle-coverage.md
node tools/faithfulness-oracle/pixel-oracle/normal-play-report.mjs scratchpad/normal-play --dump scratchpad/host-dump
# one run, with orig | ours | category map PNGs per batch
node tools/faithfulness-oracle/pixel-oracle/host-check.mjs scratchpad/normal-play/d1 --dump scratchpad/host-dump
```

### Batches

A `HOST` line is written whenever a planner/host global changes. The queue `q=`
(catalogue records as `adsId:tag`, `255:1` = a pure pose) is the whole planned batch
with the ending last, and `qi=` is the record the director is on, so each batch's
gag sequence and the tick each gag started are known without pixels.
`normal-play.mjs` turns the log into batches with the bake's selection: the island
world origin `30c6/30c4` (layer 0 at `+289/+279`), the folded layout word `30c0`
(fixed layout 1/2, quadrants), the tide coin `30c2`, the phase `30ba` (night when
`>= 12`, or `30b4 == 1`), still waves `30b2`, and the story day `2d9b`.
`normal-play-batches.json` keeps every batch of every run as names, ticks and flags
(no pixels or game data); it is the record the story-mix figures come from.

### Story mix

`storyMix` counts, over planned batches: endings, gags per batch, island layouts,
the low-tide coin by phase class, night, still waves, VISITOR#1 and ACTIVITY#11,
day-locked gags with their batch day and phase, and anti-repeat (an ending equal to
the previous batch's, or to the one two back). The same figures for ours come from
`tools/story-mix/simulate.mjs`. Timing-faithful runs cover about two batches per
half hour (a batch is 10-20 records at roughly a minute each). `--turbo` runs the
game clock about 8x faster per present, so gags run far faster than the original's
pacing; the planner does not depend on pacing, so those runs count for the story
mix only and are marked `turbo` in the JSON. The phase advances with the emulated
clock, so a turbo run also sweeps through several phases.

### Replaying the first batch (`align-planner.mjs`)

A headless DOSBox-X boot is deterministic: in eight timing-faithful runs the RNG
trace shows 25,136-25,137 draws before the first director call, and runs with the
same day class and phase class planned the same first batch. `align-planner.mjs`
skips that many words of the faithful RNG and runs our story controller with
`storyRandom` for the captured day and phase, then compares the queues over a
window of offsets. Where positions agree, both planners spent the same words on
the same decisions; where they differ, the rule or the candidate pool differs.
Only the first batch can be replayed: walks, poses and TTM delays draw from the
same stream at a timing-dependent pace.

`node align-planner.mjs --all [runsDir]` replays every timing-faithful run at its
exact offset and reports how many first batches are identical; the same check runs
as `src/games/johnny/__tests__/planner-replay.test.mjs` whenever the game data and
the captures are present (`JOHNNY_NORMAL_PLAY_RUNS` overrides the runs directory).

| Run | Day / phase | Skip | Captured first batch | Ours at the same offset |
|---|---|---:|---|---|
| d1-st230-night | 1 / 14 | 25136 | FISHING#7 ACTIVITY#7 FISHING#8 ACTIVITY#7 STAND#7 BUILDING#1 BUILDING#1 FISHING#1 VISITOR#7 WALKSTUF#3 STAND#6 STAND#9 VISITOR#4 ACTIVITY#10 | identical (14/14) |
| d1-st900-a | 1 / 1 | 25137 | FISHING#1 POSE POSE VISITOR#4 VISITOR#4 ACTIVITY#4 JOHNNY#5 VISITOR#1 FISHING#1 VISITOR#1 POSE POSE BUILDING#3 VISITOR#7 BUILDING#7 POSE ACTIVITY#6 | identical (17/17) |
| d1-st900-b | 1 / 1 | 25136 | FISHING#7 STAND#10 POSE POSE VISITOR#4 VISITOR#4 ACTIVITY#4 JOHNNY#5 VISITOR#1 FISHING#1 VISITOR#1 POSE POSE BUILDING#3 ACTIVITY#5 | identical (15/15) |
| d10-st900 | 10 / 1 | 25137 | (as d1-st900-a) | identical (17/17) |
| d2-st500 | 2 / 9 | 25137 | ACTIVITY#4 POSE POSE VISITOR#4 VISITOR#4 ACTIVITY#4 JOHNNY#5 VISITOR#1 FISHING#1 VISITOR#1 POSE POSE BUILDING#3 BUILDING#7 FISHING#2 POSE POSE POSE FISHING#6 | identical (19/19) |
| d5-st300-night | 5 / 13 | 25137 | BUILDING#3 FISHING#8 ACTIVITY#7 STAND#7 BUILDING#1 BUILDING#1 FISHING#1 VISITOR#7 WALKSTUF#3 STAND#6 STAND#9 POSE ACTIVITY#1 | identical (13/13) |
| d6-st700 | 6 / 5 | 25137 | (as d1-st900-a) | identical (17/17) |
| d9-st330-night | 9 / 12 | 25137 | (as d5-st300-night) | identical (13/13) |

Since the planner was re-derived from `FUN_1018_08b9`/`FUN_1018_0d76` (#77), all
eight first batches, their island layout words and origins replay exactly. Before
that only the intermediates matched. The 160-161 draws of the first
planner call plus bake are: 1 gate, 15 roulette picks (`140F:0E67`), 103 bucket draws
(`140F:1F33`: pose repeat counts and 15 cloud slots), 1 ocean (`1417:01FA`), and 13
cloud positions, speeds and phases.

### Host canvas

For each island batch, `host-check.mjs` paints our host canvas for the batch's
titleState with the browser's own `drawBackground` (`render-ours.mjs` `renderHost`,
no gag, with the clouds found in the batch's first clean dump) and compares it with up to 12 dumps spread over the batch (the
first two right after the bake; dumps taken during the wipe, mostly black, are
dropped):

- A pixel is **matched** when it equals ours (within the DAC tolerance, or through a
  learnt palette substitution) in at least one sampled frame. The original's actors
  and speech bubbles move, so a host pixel is uncovered in some frame. Pixels
  that **never** match in any frame are the host divergence; pixels that differ in
  every frame but match in some are also reported (`persistent`: mostly Johnny).
- **Island layers** (sand, palm, raft, low-tide sand and rock) are the pixels where
  our render differs from the bare ocean screen; the **ocean** is the rest below the
  horizon (row 150 by day, 205 at night); the **sky** is everything above it.
- **Clouds** (`cloud-detect.mjs`): the original lays its clouds out once per bake
  and never moves them in the batch, so they are found in the first clean dump by
  matching BACKGRND frames 15/16/17, plain and mirrored, and painted on ours at the
  same slots before the sky is scored. `--no-clouds` paints none (the old view).
- The **wave** rectangles are scored by matching each region, in each frame, against
  its three BACKGRND frames (the wave phase is not logged).
- The day **ocean index** is the OCEAN screen whose render differs least from the
  frames (the bake draws `rand % 3` straight into the screen).

A batch is faithful when island and ocean "never" are both <= 0.5% and >= 90% of
the wave samples match a frame (`normal-play.mjs` `HOST_THRESHOLDS`). Scores are
in `normal-play-scores.json` and the "Normal play" section of
[docs/oracle-coverage.md](../../../docs/oracle-coverage.md).

### Findings

Captured: 8 timing-faithful runs of 30 minutes (45 batches; StartTime 0900, 0500,
0700 for day phases 1-9 and 0230/0300/0330 for night phases 12-14; story days 1,
2, 5, 6, 9, 10 through the INI) with 27,500 framebuffer dumps, plus 10 turbo
runs of 20 minutes (105 batches, days 1-11, phases 0-5 and 9-15) for the story
mix: 150 planned batches, 132 played to their ending. The tables are in the
"Normal play" section of the coverage report. What the original does:

- **VISITOR#1** is in 58/150 batches (38.7%), always with island layer 0 at
  289/299 (its `+0xd` word pins fixed layout 1).
- **Low tide** by the phase class of the batch: 0/106 in phases 0-11, 9/38 (24%)
  in phases 12-15. The common daytime gags carry flagsB `0x200` (forced high
  tide), so the coin only shows at night.
- **ACTIVITY#11** plays: 4 times as a solo batch (it is `0x205`: an ending that
  is also first-class, so the batch is just that record) and twice as the first
  record of a batch (`FUN_1018_0d76(1, ...)`, the first-slot class).
- **Day-locked intermediates**: JOHNNY#2 in 1 of 30 day-2 batches and JOHNNY#3 in
  1 of 9 day-6 batches, both in the first slot (2/39, about 5%; the binary's
  10%-gate model predicts about 10%; ours, since #77, about 8%).
- **Key scenes outside their tide window**: JOHNNY#6 (window 12-16) ended two
  day-10 batches at phase 1; JOHNNY#1 ended two day-11 batches at phases 3 and 4;
  MARY#3 (window 8-16) ended a day-4 batch at phase 5; MARY#5 ended a day-8 batch
  at phase 11. The keyframe path (`0d76(0x80)`) ignores the window. MARY#1 did not
  come up in the 7 day-5 batches. When the gate passes it also sets `2d9b = 2d9c`,
  so the logged day flips back to the calendar day for that batch.
- **Anti-repeat**: 0/132 endings equal the previous batch's; 8/114 equal the one
  two batches back. The binary excludes only the last ending (`30e8`), and so does
  ours since #77.
- Island layout over 150 batches: fixed layout 1 49%, fixed layout 2 6%, random
  41% (of which quadrant-limited 24%), off-island 4%. Still waves in 28 batches.
- The first record of a multi-record batch is spread over 22 different gags
  (FISHING#1 6, FISHING#7 5, BUILDING#3 3, ...), so the first-slot class
  (flagsB bit 1) is broad, not a single "first" gag.

The host canvas, in short:

- **Island layers match**: layer 0 at exactly 289/299 (fixed layout 1), 17/309
  (fixed layout 2) and the logged random origins, the raft at the day's frame, the
  low-tide sand and rock, and the trunk, with "never matched" at 0.00-0.01% in every
  batch. Wave regions match a BACKGRND frame in 100% of samples, high and low tide.
- **Day ocean, palette index 0** (fixed): the three OCEAN screens use palette
  index 0 for the dark cloud-reflection blobs (9,254-10,013 pixels each). The
  original copies a screen opaque and draws them in colour 0, `(168, 0, 168)`,
  shown as `#c300c3` under its DAC. We used to decode index 0 as transparent on
  screens as well as sprites, so the blobs showed the black canvas and every day
  batch had 2.85-4.61% of its ocean never matching. SCR screens are now opaque
  (`src/dgds/resources/scr.mjs`; sprites keep index 0 as the colour key), we draw
  `#a800a8`, and the oracle learns `#a800a8>#c300c3` as a palette remap. Day ocean
  "never matched" is now 0% in 24 of 25 day batches and 0.22% in the other (a
  standing actor).
- **Clouds** stand still for the whole batch, by day and by night, over the moon
  too. `FUN_1010_0b67`, the only routine that moves them, has one caller,
  `FUN_1010_040e(1)` (near call at `1010:043a`), which only the bake makes. The
  layout is `FUN_1010_0a38`; `src/games/johnny/clouds.mjs` ports it. Replaying it
  on each traced first bake gives the cloud the dumps show (small, slot x 322, y 55,
  mirrored). A mirrored cloud shows one pixel right of its slot x (negative-width
  `StretchBlt`). The earlier "drifting clouds" reading came from the sky columns of
  a check that drew no clouds.
- **Night** batches (phase >= 12 with StartTime moved, and the `--time` clock) match
  NIGHT.SCR with 0% ocean divergence; both tides appear at night, as the coin says.

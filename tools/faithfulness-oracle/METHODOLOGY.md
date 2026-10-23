# Verifying faithfulness to the original

The faithfulness oracle checks whether the browser engine makes the same scene and timing decisions as the original 1993 *Johnny Castaway* program. It compares behavior, not source code.

The quick, repeatable check is `pnpm run test:faithful`. It runs only the browser engine against reference fingerprints previously captured from the original program, so it needs the extracted game data but not Windows 3.1 or DOSBox-X. CI has no game data and skips it.

## What is compared

For each gag, both engines produce a timeline of the actors being drawn on every script tick. Several original-program runs are combined to allow for random branches. The comparison looks at:

- the set of actors and combinations seen
- peak actor concurrency, which catches duplicate or overlapping animation
- actor lifespans, where reference data is available
- whether every gag reaches its intended ending

An "actor" is a live script thread, on both sides. The capture samples each thread's runstate at entry to the tick function (`FUN_1048_1acb`) and keeps runstates 1-3, so a thread that finishes during a tick (runstate 4) is not live at the next sample. On ours, a scene counts from the tick it is added until it finishes. The extra tick during which `composeTtmFrame` still draws a just-finished scene's last frame is not counted. A scene still counts if it never draws a pixel, because the original's traces also record loader threads that only load bitmaps (for example `SUZY:1`'s `1:1`). Filtering out scenes that never draw was tested and rejected: it removed 35 actors that appear in the references, pushed 20 gags below the reference's peak concurrency, and left `STAND:1-12` with nothing at all. The filter remains available as a diagnostic with `our-thread-timeline.mjs --drawn-only`.

Peak concurrency is the hard gate. Actor coverage and duration are review signals because timing and random branch selection vary between captures. See [the generated coverage report](../../docs/oracle-coverage.md) for current results.

## Levels of evidence

Use the cheapest useful check first, then confirm uncertain results against the original:

1. **Engine tests** check gag completion and known ending paths.
2. **jc_reborn** provides a useful independent comparison, but is another reimplementation rather than ground truth.
3. **The original program in patched DOSBox-X** supplies the authoritative script trace.
4. **Interactive comparison** settles visual or one-off questions that a trace cannot answer.

A model translated from decompiled code is helpful only after it has been checked against the running program. Otherwise it can repeat a misunderstanding instead of detecting one.

## Capturing one original gag

`capture-original-gag.mjs` runs the Win16 program in DOSBox-X and asks its scene director to repeat one catalogue entry. This avoids unrelated scenes and keeps the actor slots stable.

Required assets:

- the original `SCRANTIC.SCR`, renamed `SCRANTIC.EXE`, plus `RESOURCE.001` and `RESOURCE.MAP`
- a minimal Windows 3.1 installation
- a DOSBox-X build with `dosbox-x-oracle.patch` applied

### Where the assets come from

None of these files are committed. Download them from the Internet Archive into `scratchpad/dosbox/` (gitignored):

| Item | File | Used for |
|---|---|---|
| [`emularity_win31`](https://archive.org/details/emularity_win31) | [`win31_nonshell.zip`](https://archive.org/download/emularity_win31/win31_nonshell.zip) | drive D: a minimal real Windows 3.1 with `runapp.bat` at its root |
| [`johnny-castaway-screensaver`](https://archive.org/details/johnny-castaway-screensaver) | [`scrantic-run.zip`](https://archive.org/download/johnny-castaway-screensaver/scrantic-run.zip) | optional reference only. Its `SCRANTIC.SCR` and `RESOURCE.001` are not byte-identical to ours, so drive C uses our `public/data` instead |

Assemble the drives:

```sh
mkdir -p scratchpad/dosbox/dl scratchpad/dosbox/driveC scratchpad/dosbox/driveD
curl -L -o scratchpad/dosbox/dl/win31_nonshell.zip \
  https://archive.org/download/emularity_win31/win31_nonshell.zip
unzip -q scratchpad/dosbox/dl/win31_nonshell.zip -d scratchpad/dosbox/driveD
# drive C is OUR data, so the trace describes the same bytes the engine loads
cp public/data/SCRANTIC.SCR scratchpad/dosbox/driveC/SCRANTIC.SCR
cp public/data/SCRANTIC.SCR scratchpad/dosbox/driveC/SCRANTIC.EXE
cp public/data/RESOURCE.001 public/data/RESOURCE.MAP scratchpad/dosbox/driveC/
```

`win31_nonshell.zip` supplies `runapp.bat`. It restores clean INI files, switches to drive C, and starts Windows with the program named on its command line:

```bat
@echo off
path=c:\;d:\windows\;d:\;e:\
copy d:\iniback\*.* d:\windows\
c:
cd \
d:\windows\win %1 %2 %3 %4 %5 %6 %7 %8 %9
```

No `SCRANTIC.INI` is needed. With none present, the program uses its defaults.

### Building DOSBox-X

Use DOSBox-X commit `6676eb916c77c95bd235f9bfc9984684403598a4`. The patch is tied to that revision and contains the director injection, actor-thread trace, RNG trace, delay trace, and optional framebuffer capture:

```sh
git clone https://github.com/joncampbell123/dosbox-x.git scratchpad/dosbox-x-src
git -C scratchpad/dosbox-x-src checkout 6676eb916c77c95bd235f9bfc9984684403598a4
git -C scratchpad/dosbox-x-src apply "$PWD/tools/faithfulness-oracle/dosbox-x-oracle.patch"
cd scratchpad/dosbox-x-src
./autogen.sh
./configure --enable-sdl2
make -C src/cpu
make -C src dosbox-x
```

`--enable-sdl2` is required with Homebrew's SDL2 on macOS. Without it, `configure` fails with "SDL 1.x or SDL 2.x is required" even when SDL2 is installed. A GitHub tarball of the same commit works as well as a clone. Other platform packages vary; follow DOSBox-X's build guide if `configure` reports a missing library. A release build is sufficient. Captures must use the normal CPU core because the dynamic core bypasses the hook.

The resulting layout:

```text
scratchpad/dosbox/
├── driveC/
│   ├── SCRANTIC.SCR
│   ├── SCRANTIC.EXE  (a copy of SCRANTIC.SCR)
│   ├── RESOURCE.001
│   └── RESOURCE.MAP
└── driveD/
    ├── runapp.bat
    ├── iniback/
    └── WINDOWS/
```

The repository's `dbx.conf` is an illustrative template; the capture script writes a per-run configuration with resolved paths.

Example:

```sh
export SP_DOSBOX="$PWD/scratchpad/dosbox"
export DBX="$PWD/scratchpad/dosbox-x-src/src/dosbox-x"
node tools/faithfulness-oracle/capture-original-gag.mjs 0x65 7 scratchpad/activity-7
```

A successful summary says `forced: true` and `isolatedToTarget: true`. The output directory contains `trace.log`, `threads.log`, `timeline.jsonl`, and emulator output in `run.log`.

The patch identifies Win16 functions by unique, relocation-safe entry bytes rather than runtime addresses. `ne_entry.py`, `ne_reloc.py`, and `ne_mask.py` verify those signatures.

For RNG-consumer discovery, run the program normally rather than forcing a gag. Each RNG line includes `caller=CS:IP`; summarize it with `rng-consumer-report.mjs`. The trace cap is 100,000 draws so a timing-heavy intro does not hide the first story window. Raw logs remain local; commit only compact derived evidence such as `rng-consumer-evidence.json`.

## Capturing normal play

`capture-normal-play.mjs` runs the program without a forced gag, so the planner, the island bake and the walks run as shipped. It uses two more hooks in the same patch:

- `DBX_HOST=/absolute/host.log` writes one `HOST <tick> clk=... day=... ph=... c0=... c2=... c4=... c6=... qi=... q=adsId:tag,...` line whenever a host or planner global changes: the planned queue `30f4[]` (the whole batch, ending last), the queue index `30f2` (which record is running), the folded layout word `30c0`, the tide coin `30c2`, the rebased island origin `30c6/30c4`, the phase `30ba`, the night and still-waves flags `30b4`/`30b2`, the story day `2d9b/2d9c`, the holiday code `30bc` and the game clock `2e72`. The day ocean is not logged: the bake draws `rand % 3` straight into the screen.
- `DBX_FB_NORMAL=1` arms the tick-stamped framebuffer dumps (`DBX_FB_TICKS`) from the first tick without a forced ADS, every `DBX_FB_TICK_EVERY` ticks plus a burst after every live-set change and every HOST change (the ticks right after a bake show the bare island behind the wipe).

Settings go through the run's own copy of the Windows directory: `--start-time HHMM` writes `SCRANTIC.INI` `[ScreenSaver.ScreenAntics] StartTime=` (the section is the string at DS `0x90`, not the "Screen Antics" window title at `0x82`), `--story-day N` writes `Introduction`/`NumDays` with the current date, and `--time`/`--date` set the DOS clock before Windows starts. Night is phase >= 12, i.e. 6 to 8 hours after StartTime, so `--start-time` = now minus 6.5 h gives a night run at any wall-clock time. Game time runs at wall speed; `--turbo` runs the game clock about 8x faster per present and is only for story-mix sampling, never for pacing or pixels. Analysis: `pixel-oracle/normal-play-report.mjs` (story mix, committable batch JSON) and `pixel-oracle/host-check.mjs` (host canvas); see the pixel-oracle README, "Normal play".

For timing-opcode work, also set `DBX_DELAY=/absolute/delay.log`. This records each thread's delay and deadline at the tick hook. Correlate the RNG ordinal/caller in `DBX_TRACE` with the first changed thread field in `DBX_DELAY`; JOHNNY:2 is the compact `0x2020` probe used for the committed evidence. Each `DELAY` line also carries `emu=` (emulated milliseconds, the clock the guest timer runs on) and `host=` (host wall-clock milliseconds), which is how the sample cadence below was measured.

## From capture to CI

```text
original program in DOSBox-X
  → capture-original-gag.mjs
  → rendering-oracle/threads-to-timeline.mjs
  → rendering-oracle/build-vocab.mjs
  → gen-refs.mjs
  → test/faithfulness-refs/*.json

browser engine
  → our-thread-timeline.mjs
  → pnpm run test:faithful
```

A reference contains the union of several captures. It is a practical coverage sample, not a frame-perfect recording. The original program's intro and ambient animation consume random numbers according to wall-clock timing, so two otherwise identical captures can enter a gag at different points in the random stream.

### Slots

A reference covers every slot the gag runs, listed in its `slots` field. `slot` is the busiest one and is kept only for information. The trace's slot number is directly comparable with our `sceneIdx`, with no remapping:

- The THREADS hook walks only the current ADS context's thread list, and a forced capture loads exactly one ADS. Every node therefore belongs to the gag's ADS. The list is preallocated per ADS; for FISHING it holds nodes for slots 1-4 even when tag 1 only runs slot 1.
- The binary finds a node by the ADD op's own `(slot, tag)` arguments (`FUN_1048_0bf4` compares node `+0` and `+2`). So node `+0` is the ADS RES id, which is our `sceneIdx`.
- The load-order-dependent index is the TTM's position in the global table, returned by `FUN_1050_0177` from `FUN_1048_0044`. It is never stored in a node.

Before #25, references were sliced to the busiest slot, so actors on other slots could never appear. For example, ACTIVITY:1 reaches `ADD 2 2`. `gen-refs.mjs --dominant-slot` reproduces the old behaviour.

The all-slot catalogue was captured with 8 runs per gag. BUILDING:7, FISHING:1, FISHING:2 and FISHING:7 use 16, because 8 runs missed random branches the older references had sampled. JOHNNY:4 and JOHNNY:5 use 7 because one capture each failed to arm. Each reference's `runs` field records its count. Exactly the eight gags whose tags ADD on more than one slot gained other-slot actors: ACTIVITY:1 and ACTIVITY:9, FISHING:3 and FISHING:5, JOHNNY:1 and JOHNNY:6, and SUZY:1 and SUZY:2.

## Running and updating the checks

Run the committed references:

```sh
pnpm run test:faithful
```

Capture or refresh selected gags:

```sh
export SP_DOSBOX="$PWD/scratchpad/dosbox"
export DBX="$PWD/scratchpad/dosbox-x-src/src/dosbox-x"
node tools/faithfulness-oracle/gen-refs.mjs --gags ACTIVITY:7,FISHING:2 --runs 8
node tools/faithfulness-oracle/coverage-report.mjs
```

Raw traces and the patched DOSBox-X checkout belong in `scratchpad/` and are not committed. Commit the scripts, patches, and derived JSON references.

Two catalogue entries cannot be isolated: `STAND:14` is a shared setup macro, and `VISITOR:3` is orphaned content reached only with another visitor gag. Their callers provide indirect coverage.

## Bugs found by the oracle

- **Weighted random choices:** fishing exited about three times too often because branches were treated equally instead of using their stored weights.
- **One-shot scene handoff:** a reading sequence played twice because opcode `0x1070` was interpreted as a persistent condition.
- **Random frame hold:** opcode `0x2020` was writing an unused timer, making some gags flash by too quickly.
- **Duplicate Johnny:** restarting a whole script block created overlapping copies of Johnny; the engine now resumes the original script slots.
- **PURGE ends the sequence:** opcode `0x0110` was a no-op. In the original it marks the end of the sequence. The thread ends when the PURGE frame's hold elapses, which is in the same tick when the delay is 0, and ops after that frame never run. Zero-delay loaders therefore never appear as live threads. Examples are `JOHNNY:6`'s `3:9`, `ACTIVITY:11`'s `5:20`/`5:42`, and every "establishing shot" key the harness used to filter (see below). `ACTIVITY:11`'s `5:24` "preen timer" had been playing four dead frames after its PURGE, which made the `5:23`/`5:24`/`5:30`/`5:36` chain run several times too long (`5:24`: 1038 to 207 engine ticks).
- **Separate prologue is not a thread frame:** a TTM's first-added thread ran the resource prologue (the ops before the first SET_SCENE, ending in UPDATE) as its own first frame. Its siblings waited for it, so the whole group started a frame late. In the original, each thread node starts at its own SET_SCENE frame (`FUN_1050_04d6` / `FUN_1050_042a`). The browser host still runs the prologue's screen/palette setup when the resource is added because it establishes the visible background, but skips its UPDATE. `WOULDBE.TTM` alone starts with SET_SCENE in frame 0: its setup is inside that thread's first frame and repeats when the thread loops.

One known scheduler issue remains: removing duplicates before staging a random branch needs a wider concurrency/completion change.

## Former filter: establishing shots

`test/faithfulness-refs/establishing-shot-seeds.mjs` once dropped a gag's opening actor from our fingerprint, on the theory that the references were captured after that actor had already played. The theory was wrong: those actors were zero-delay PURGE loaders (see "PURGE ends the sequence" above) or were missing only because references covered one slot. The map is now empty; the file's header records the history.

## Trace sample cadence

One `THREADS`/`DELAY` sample is one call of the ADS tick function `FUN_1048_1acb`. It was
measured on two forced FISHING:1 captures with `DBX_DELAY`, using the `emu=`/`host=` fields
and the game clock `now` (`DAT_1068_2e72/2e74`). One capture ran alone (1,494 samples). The
other ran alongside eight other captures, the load of a catalogue regeneration (1,416 samples).

- **Game clock:** one `now` unit is exactly 16.0 ms of emulated time (15.996 under load).
- **Sample cadence:** the median sample interval is 54 ms in both runs, which is one 18.2 Hz
  PC timer tick (54.9 ms), the resolution of Windows 3.1's timer. The mean is 57 ms alone
  and 58 ms under load, because some intervals are skipped. `now` advances 3 units at the
  median (48 ms, quantized) and 3.56 to 3.65 on average. Emulated and host time agree to
  within 3%, so `cycles=max` kept real time.
- **TTM holds:** the per-thread delay field (`+0x29`) is in `now` units, and a hold is
  rounded up to whole samples. `delay=7` (112 ms) lasts 2 to 3 samples (mean 124 ms);
  `delay=8` lasts 3 samples (164 ms); `delay=12` lasts 4; `delay=16` lasts 5; `delay=209`
  lasts 209 units (3347 ms) over 61 samples.

### Frame holds

The hold rule, from `FUN_1048_196e` and its caller `FUN_1048_1acb` (the node pass):

- The thread keeps a delay (`+0x29`) and a 32-bit deadline (`+0x37`/`+0x39`) on the
  game clock `now` (`DAT_1068_2e72/2e74`, one unit per `FUN_1008_16ce` timer call,
  16 ms). `FUN_1048_0b3e` zeroes both when the thread is created.
- Each tick runs the current frame's ops again, then `FUN_1048_196e`: with delay 0
  the thread advances at once; otherwise it advances only when `now >= deadline`,
  and then sets `deadline = now + delay` for the next frame. `now` is read at the
  tick, so a deadline is only ever checked once per ~55 ms sample.
- A `SET_DELAY` whose value differs from the stored delay (compared through
  `DAT_1068_46e8` after the ops run) sets `deadline = now + delay` at that tick and
  stores the new delay. The frame that changes the delay is therefore drawn at the
  tick its deadline is set and again at every tick up to and including the one
  where it elapses, one sample longer than the frames after it.

A frame with an unchanged delay is drawn at the samples after the previous frame
passed, up to and including the sample where `now` reaches the previous pass's
`now` plus the delay. With 3.44 clock units per 55 ms sample and `now` rounded
down to whole units, the holds are: delay 1-3 one sample; 5 two; 7 two or three
(110 ms is 6.875 units, so the pair passes only when the clock phase rounds up);
8 three; 12 four; 16 five; 30 nine. These are the measured holds above.

The browser applies the same rule. The runtime keeps a present counter and reads the
game clock at each present's nominal time, `floor(presentIndex * 55 / 16)`
(`timingCompatibility.gameClockAtPresent`); the frame run at a present gets
`frameDeadline = clock + delay` and advances at the first later present whose clock
has reached it, with the delay-change frame drawn once more (`holdRedraw`). The
clock is read at the nominal present time, not at the 20 ms fine tick that carries
the present, because on the fine-tick grid two presents are 100 or 120 ms apart and
a delay-7 hold would round up to three presents half the time. On an exact 55 ms
cadence the clock phase at each frame start follows from the previous hold, so
delay-7 holds cycle 2,2,2,3,2,2,3 presents: a mean of 2.29 presents (126 ms). The
original's 2.13 samples a frame (WALKSTUF:1 `1:2`) is lower because some of its
sample intervals are skipped. Before this rule the browser rounded the 112 ms delay
up to six 20 ms ticks and then waited for a present, 7.4 ticks (147 ms) a frame,
which made delay-7 threads fall behind the others (BUILDING:2 `1:35`, WALKSTUF:1
`1:2`, BUILDING:8 `3:44`). Delays 5, 8, 10 and 30 were already within a few percent
and are unchanged; delay 3 goes from 73 ms to one present and delay 9 from 218 ms
to three presents.

The `DBX_DELAY` logs of the #40 captures confirm the rule directly (`now` and each
thread's `+0x29`/`+0x37` fields are sampled at tick entry): BUILDING:7 `3:82`
holds 37 delay-8 frames for 3 samples each; `3:139`'s SET_DELAY 10 frame shows
the pass-tick deadline replaced one sample later by its own `now + 10`; `3:36`
holds delay 7 for 2 samples 21 times and 3 samples 10 times. They also show what
the rule does not cover: `now` advances 3 or 4 units a sample (mean 3.47) except
at samples that load resources, where it jumps. A frame whose ops load the screen
or bitmaps therefore usually passes at the next sample regardless of its delay.
The browser's clock has no load cost, so a gag's first frame holds its full delay
(FISHING:5 `5:19`, VISITOR:5 `5:1`, both delay 8 or 9: one sample in the original,
four presents in ours). This is an accepted deviation; the next section has the
evidence.

### Load-time clock jumps

This difference is accepted ([accepted differences](../../docs/accepted-deviations.md)). What the jump is, from eight `DBX_DELAY` captures (BUILDING:7 and MARY:4 run alone
for #40, 2,732 samples; FISHING:5, VISITOR:5, JOHNNY:5, MARY:2, SUZY:1 and
BUILDING:2 run six at a time with `--secs 75`, 6,372 samples), each line carrying
`now`, `emu=` and `host=`:

- **It is wall time.** At every jump the emulated and host-clock deltas agree
  within 1 to 5%, and the jump is roughly the delta in 16 ms units (0.9 to 1.5
  times it; the timer sometimes delivers more ticks than the time, a catch-up of
  the emulated PIT). `FUN_1048_196e` and the SET_DELAY-change path in
  `FUN_1048_1acb` read `DAT_1068_2e72` live, but the thread's deadline after a
  jump is always the pre-load clock plus the delay (`deadline - now` after the
  jump equals `delay - jump` at all 35 samples where a thread was added), so the
  clock catches up after the ops that loaded, and the load's wall time counts
  against the hold.
- **Its size is the host's.** With `cycles=max` the load takes as long as the host
  takes to emulate it. The first sample of a gag (ADS load, first TTM, screen and
  bitmaps) jumped 18 units (190 ms) in both lone runs and 28 to 113 units (316 to
  1,804 ms) in the six-way runs; the same FISHING:5 first sample ranged 31 to 59
  units across one capture's five episodes, and JOHNNY:5's 48 to 113. A TTM added
  mid-gag jumped 7 to 55 units (BUILDING:2 `1:35` 17 and 24, VISITOR:5 `5:3` 17 to
  28, SUZY:1 `1:2` 31 and 44, FISHING:5 `3:1` 41 to 55), a sample with an image
  load inside a running thread 6 to 14 (SUZY:1 `1:13`/`1:14`, JOHNNY:5 `2:9`,
  MARY:2 `2:106`, BUILDING:2's `1:7x` group), and the director's reload between
  episodes 10 to 230. Every other sample stays at 3 or 4 units (median interval
  54 ms in all eight runs).
- **It shortens every live hold at once.** The clock is global, so a mid-gag load
  by one thread passes or shortens the holds of all the others at that sample
  (BUILDING:2 tick 531: a 10-unit jump leaves `1:46`, delay 4, and `1:74`, delay
  3, 6 and 7 units past their deadlines).
- **A mid-gag load leaves a lasting lead.** BUILDING:8 `3:48` loads FIRE2.BMP in
  its first frame. In the original, its second frame never shows, and the walk then
  stays two frames (about 280 ms) ahead of ours to its end. This is the pixel
  oracle's one outlier keyframe (see its README).

Why it is not modelled:

- There is no constant to calibrate. The same load costs 2 to 6 times more under
  host load, and on the 1992 hardware the game was written for it cost something
  else again. A fixed per-load advance would encode this capture rig.
- It is not an engine rule to port. The binary has no load-cost arithmetic; the
  timer simply keeps running while the loader blocks.
- A clock advance without the stall is less faithful in wall time, not more. The
  original shows the previous picture for the load (190 ms to 1.8 s here) and then
  the first frame for one sample (55 ms); ours shows the first frame for its hold
  (four presents, about 220 ms) and then the second. The two sides reach the second
  frame at about the same time in the lone-run case. Advancing our clock would
  make every gag start, and every later load pass, a load time earlier than the
  original; stalling instead would be emulating a hardware speed.

What the deviation looks like: at the start of a gag (and at a mid-gag TTM add),
ours holds the loading thread's first frame for its authored delay where the
original holds it for one sample, so our second frame is up to about four presents
late relative to the original's sample count. It does not change which frames are
shown or their order. The pixel oracle scores the gag's first frame as its own
keyframe kind (`first-frame`) with a window that reaches forward by exactly our
measured first-frame hold (capped at 40 ticks), so the deviation neither counts
as an outlier nor hides behind the ±6 window (pixel-oracle README, "Tick
alignment"). The lifespan oracle already sees it as the one-sample phase
allowance for loaders.

## Actor lifespans

A reference span of N samples is about N × 57 ms (the mean sample interval in "Trace sample cadence"), and our actor spans count 20 ms engine ticks. So for the same duration ours reads about 2.85 times the reference value. Both sides count live threads, not rendered frames: the binary samples at tick entry and our engine after each tick. That one-sample phase difference is small for long actors but matters for short-lived loaders.

**Completed-gag references.** The original director repeats a forced gag for the whole capture, so the old references, which summed an actor's samples over every repeat, could not be compared with our single run. For example, ACTIVITY:4's `2:1` lasts 213–215 samples in each episode but totalled 895 over one capture. `completed-gag-v2` references split the trace into complete episodes at ADS reload markers and drop the last episode if the capture cut it short. Per episode they record:

- `lifespans`: the min/max length of each contiguous live span;
- `occupancy`: the total samples the actor was live;
- `occurrences`: how many spans the actor had.

A gap closes a span but does not end the episode. Two instances of the same key with no absent sample between them count as one span. References without a `lifespanBasis` label are legacy totals and get no duration verdict.

**Comparison.** The browser compares its longest contiguous span over `ref.runs` deterministic seeds with the original's span range. A span seen at N samples can really last N−1 to N+1 intervals, so the comparator widens the range by one sample at each end (clamping the lower bound to zero) before applying the 2.85 conversion. This keeps a one-sample loader from being called more than 3× long just because the browser kept it for 9–12 short ticks. The stored raw ranges are unchanged.

**Status.** All 64 drivable gags have completed-gag references: 199 complete episodes give span data for 651 of 680 vocabulary keys. The coverage report shows zero spans beyond 3×, zero vocabulary extras and zero concurrency failures. Getting there took the completed-gag spans, the one-sample allowance, the TTM continuation fix (FISHING:7/8 `4:44` now runs on through the following frames: 2 → 54 ticks, against 15–18 samples), the unsigned ADS choice fix ([rng-port.md](./rng-port.md)), and the coordinated clock model calibrated on BUILDING:7 and MARY:4 ([BUILDING handoff timing](../../docs/building-handoff-timing.md)). SUZY:1 `1:1` and SUZY:2 `2:6` appear in only one sample of their complete episodes; the allowance covers them, and one-sample captures alone don't justify a loader change.

Duration and vocabulary stay advisory. 29 keys lack completed-episode evidence, many gags have only one or two complete original episodes, and the browser uses up to 33 seeds against a much smaller original sample. The BUILDING:8 fish branch (`3:49` → `3:74` → `3:70`) was missing from 24 original captures before a later capture found it, which is why an unobserved key can't yet fail the gate. That capture stopped during `3:70`, so those three keys have vocabulary and concurrency evidence but no completed-episode span. Peak concurrency stays the failing check. Open follow-up: triage the remaining span differences before making duration a failing gate.

**Merging references.** To add captures to a reference, generate the new batch into a separate directory and merge each fingerprint with `merge-refs.mjs`. It unions vocabulary, compatible sample ranges, slots and the concurrency maximum, and adds the run counts. A completed-gag-v2 batch replaces an incompatible legacy duration range but keeps the older capture's vocabulary and concurrency evidence. `states` becomes `null` because the old raw timelines are gone; no gate uses it.

## Random-number behavior

The original uses a fixed 56-word generator stored in `SCRANTIC.SCR`. Our port matches 20,000 traced values exactly. An opt-in experiment shares it across confirmed host, walking, ocean, and ADS choices. Ambient animation remains separate because its draw count depends on real-time DOSBox execution. See [rng-port.md](./rng-port.md).

## Pixel comparison

An earlier tool captured VGA frames on a wall-clock cadence and compared pixels. It was slow and sensitive to palette and capture timing, so the actor timeline replaced it as the automated gate. The [pixel oracle](./pixel-oracle/README.md) brings pixels back without those problems. `capture-original-gag.mjs --fb` sets `DBX_FB_TICKS`, which labels every framebuffer dump with the THREADS tick number, so frames line up with `timeline.jsonl`. The comparator matches keyframes through the live-set spans, masks host-owned pixels, and treats Windows palette substitutions separately. Scores are in the "Pixel oracle" section of [the coverage report](../../docs/oracle-coverage.md). They are advisory; no CI gate uses them. Normal-play captures extend the pixel check to the host canvas and the planner's gag mix; see the pixel-oracle README, "Normal play".

## Maintainer assets

Some fidelity evidence can't live in this repository because it is derived from the proprietary program or its data:

- **Decompilation and listings.** Ghidra's C decompilation of `SCRANTIC.SCR` (`decompiled.c`), the analysed Ghidra project, and the Phase 0 listings (TTM jump tables and handler disassembly, the scene catalogue, data-segment values) that `docs/scrantic-re-findings.md` cites by address. Made with [`ghidra/`](./ghidra/).
- **Captures of the original.** DOSBox-X framebuffer dumps (forced gags, normal play, the MEANWHIL/SUZY card), `DBX_DELAY` game-clock logs, thread and trace logs, and the copies of drive C stored with them.
- **Extracted sprites and pixel triage.** Wave frames and walk sprites pulled out for the [`measure/`](./measure/) scripts, and the ours-vs-original keyframe dumps behind the pixel-oracle triage (BUILDING:4, BUILDING:8, and others).

**Never commit any of these**, not even a cropped frame or a short excerpt of the decompilation. The scripts that make and read them are committed (`ghidra/`, `normal-play/`, `measure/`, `browser/`); their outputs are not.

Locally they live in one place, `scratchpad/maintainer/` (ignored through the `scratchpad/` rule). Its `README.md` indexes each folder: what it holds, which issue or PR cites it, and how it was made. A few older items sit next to it: the Ghidra project in `scratchpad/ghidra/proj/` (with the first `decompiled.c` in `scratchpad/ghidra/out/`; new `run-ghidra.sh` output goes to `scratchpad/maintainer/ghidra/`), the patched DOSBox-X build in `scratchpad/dosbox-x-src/`, and the lifespan-triage captures this document cites in `scratchpad/lifespan-triage-raw/`.

A copy is kept in the private, maintainer-only repository `khawkins98/johnny-assets` on the maintainer's Forgejo server (`git-home.allaboutken.com`). It is not public and nothing in this repository or its CI depends on it. Each asset is a `.tar.gz` of the `scratchpad/...` paths above, stored as Git LFS parts of at most 90 MiB with SHA-256 hashes in `manifest.json`; each `parts/<name>/README.md` says what the asset is, why it is kept, how it was made and how to use it. The `driveC/` copies of the game files are left out of every archive, because they are identical to `public/data/`. Clone without downloading the parts, then pull only the asset you need:

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone https://git-home.allaboutken.com/khawkins98/johnny-assets.git
cd johnny-assets
git lfs install --local
python3 assets.py list
git lfs pull --include="parts/<name>/**" --exclude=""
python3 assets.py fetch <name> --out restore/<name>.tar.gz   # checks every part and the whole-file SHA-256
tar -xzf restore/<name>.tar.gz -C /path/to/johnny_web
```

Access needs a maintainer account on that server. The server is not the only copy: its weekly dumps leave out LFS data, so don't delete `scratchpad/maintainer/`. When you add evidence, store it as a new dated asset with `assets.py store` (see that repository's README).

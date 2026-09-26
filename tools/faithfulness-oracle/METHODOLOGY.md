# Verifying faithfulness to the original

The faithfulness oracle checks whether the browser engine makes the same scene and timing decisions as the original 1993 *Johnny Castaway* program. It compares behavior, not source code.

The quick, repeatable check is `npm run test:faithful`. It runs only the browser engine against reference fingerprints previously captured from the original program, so CI does not need Windows 3.1, DOSBox-X, or the proprietary game files.

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
  → npm run test:faithful
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
npm run test:faithful
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

## Former test-harness filter: establishing shots

19 gags used to gate at `OVER+1`. Many open with a one-time
`IF_NOT_PLAYED[S,X] -> ADD_SCENE(S,X) + ADD_SCENE(S,Y)`. The explanation was that the
references were captured mid-session, after `X` had already played, so
`test/faithfulness-refs/establishing-shot-seeds.mjs` dropped `X` from our fingerprint
(fingerprint only; the engine was never seeded). That explanation was wrong. Every filtered `X` outside SUZY is a one-frame, zero-delay PURGE loader, and
the original ends those in the tick they are added (see "PURGE ends the sequence"
above). With that engine fix, the filter changes no fingerprint in any of the 64 gags
(vocab, peak concurrency and per-actor ticks are all identical), so those entries were
removed. The same bug produced the two gags that had been left at `OVER+1`, `JOHNNY:6`
(`3:9`) and `ACTIVITY:11` (`5:20`, `5:42`).

The last entries were `SUZY:1`/`SUZY:2`'s `3:1` (MEANWHIL, a 49-frame drawing
animation), kept only because references used to be sliced to one TTM slot and `3:1` is
on slot 3. The all-slot references (#25) contain `3:1` at peak concurrency 2, so the map
is now empty. The mid-session explanation was wrong for SUZY too. A forced capture
reloads the ADS, which resets its nodes, so the `IF_NOT_PLAYED` guard is open on every
loop. The same slicing produced the review-only extras on `ACTIVITY:1` (`2:2`),
`ACTIVITY:9`, `FISHING:3`, `FISHING:5`, `JOHNNY:1` and `JOHNNY:6` (`4:1`); all of them
now match.

## Trace sample cadence (#26)

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

So a reference span of N samples is about N x 57 ms, and our actor spans count 20 ms
engine ticks. For the same duration, ours reads about 2.85x the reference value. Both
side counts are live-thread observations, rather than rendered frames: the binary samples
at tick entry and our engine samples after each tick. The one-sample phase difference is
small for long actors but matters for short-lived loaders. The earlier "about 16 ms per
sample" estimate was the `now` unit, not the sample. The "about 50 ms" estimate was close.

The lifespan comparator scales the reference range by 2.85. The 2026-09-26 report
showed 136 >=3x differences in 35 gags, but these were based on incompatible units:
the original director repeats the forced gag throughout each capture, and the old
`gen-refs.mjs` summed an actor's samples over every repeat. Our side drives one gag.
For example, a fresh 90-second ACTIVITY:4 capture contained 1,292 timeline samples.
Its ADS reloads began at sample indices 0, 314, 627, 940 and 1,252. Actor `2:1`
lasted 213–215 samples in each completed gag, while it totaled 895 samples across
the capture including a 39-sample unfinished tail. The old committed range was
1,070–1,075 samples from longer captures. Our engine counted 554 ticks for `2:1`;
214 original samples × 2.85 = 610 engine ticks, much closer than the old aggregate
comparison suggested.

New `completed-gag-v2` references use ADS reload markers in the original trace to
split full gag episodes and exclude the final episode when capture timeout
right-censors it. Within each complete episode they record three separate
observations: `lifespans` is the min/max length of each contiguous actor-live span;
`occupancy` is the total samples the actor was live in the episode; and
`occurrences` is how many spans that actor had in the episode. A gap in one
actor's presence closes its span, but never ends the gag episode. These are
observable live-key spans, so two distinct instances of the same key without
an intervening absent sample would count as one span.
The old full-capture totals have no `lifespanBasis` label and are excluded from
duration comparison until recaptured. Peak concurrency remains the hard gate; the
new span-duration metric remains advisory while its coverage and residuals are
reviewed. The browser fingerprint compares its longest contiguous span over
`ref.runs` deterministic seeds with the original span range. Occupancy and
occurrence counts remain diagnostic for branch and retry frequency. Original
episode counts can be much smaller than browser seed counts; the coverage report
shows both counts alongside each duration result.

The binary observes a live actor only at periodic sample instants. A span seen
at N consecutive samples can begin just after an earlier sample and end just
before a later one, so its actual duration can be roughly N−1 to N+1 sample
intervals. V2 review comparisons expand the observed min/max by one original
sample at each end (clamping the lower bound to zero), then apply the measured
2.85 conversion. This is an uncertainty allowance for the coarse observation,
not a change to the measured sample cadence or to the raw stored ranges. It
prevents a one-sample loader from being called >3× long solely because the
browser retained it for 9–12 short ticks. Skipped or uneven original samples
still limit the precision of this advisory comparison.

After recapturing all 64 drivable gags, 199 complete original episodes yield
contiguous-span data for 651 of 680 reference vocabulary keys. The earlier
full-capture comparison flagged 136 spans beyond 3× (130 short, 6 long) and
three vocabulary extras. Completed-gag spans, the one-sample phase allowance,
the original fish-branch observation, and the TTM continuation fix reduce
those to three long-span reviews and zero vocabulary extras. The remaining
reviews are BUILDING:7/8 `3:83` and MARY:4 `5:37`. FISHING:7/8 `4:44` now
continues through the following TTM frames as the original binary does;
its browser span increased from 2 to 54 ticks versus 15–18 original samples.
The BUILDING
handoff has a paired timing analysis in
[building-handoff-timing.md](../../docs/building-handoff-timing.md). Its global
episode duration is close even though three local clock offsets make `3:83`
overlap too long; changing timed ADDs alone worsens the whole episode.

MARY:4 has a similar order-sensitive handoff. The original complete episode
has `5:19` at samples 37–103, `5:33` at 37–133, `5:28` at 105–120, and
`5:37` at 122–134 (13 samples); a second complete episode shows 12 samples
for `5:37`. Browser seed 1 has `5:19` at ticks 85–313, `5:33` at 85–323,
`5:28` at 315–356, and `5:37` at 358–613 (256 ticks). The original
`IF_PLAYED 5:33` STOP catches `5:37` just after its ADD; the browser reaches
that STOP 33 ticks before the ADD, leaving `5:37` to finish naturally.
`5:19` is a negative timed ADD of `-230`, which the binary measures on its
16 ms `now` clock and the browser currently counts in 20 ms ticks. An isolated
16/20 scaling trial changed browser `5:19` from 229 to 183 ticks and `5:37`
from 256 to 17, but also shortened BUILDING:7's full episode from 3405 to
3215 ticks versus about 3420 ticks observed. That global patch was reverted;
coordinated timed ADD and frame-delay calibration is still needed.

SUZY:1 `1:1` and SUZY:2 `2:6` each appeared in only one sample of the new
complete episodes. The older eight-run reference fields recorded 3 and 3–4
samples respectively, although those fields used the legacy full-capture
aggregation and are only corroborating evidence. Both loaders have authored
SET_DELAY (10 and 12) before PURGE. Their browser spans are 9 and 12 ticks;
the one-sample phase allowance removes their >3× labels. No loader runtime
change is supported by the new one-sample captures alone.

Duration and vocabulary remain advisory. The three duration outliers reflect
real order-sensitive timing interactions, but changing the shared timed-ADD
clock alone worsens full-gag alignment. A uniform duration failure would
therefore fail known unresolved cases without identifying a safe local fix.
Only 651/680 vocabulary keys have completed-episode span evidence, many gags
have just one or two complete original episodes, and the browser uses up to
33 deterministic seeds while the original branch sample is much smaller.
The fish branch was absent from 24 valid original runs before a later capture
found it, demonstrating why an unobserved vocabulary key cannot yet be a
hard failure. Peak concurrency retains its existing failing check.

When supplementing a reference with new captures, generate the new batch into a separate
directory and merge each JSON fingerprint with `merge-refs.mjs`. It unions vocabulary,
compatible sample ranges, slots, and the concurrency maximum while adding successful
run counts. A completed-gag-v2 batch replaces an incompatible legacy duration range;
it still preserves the older capture's vocabulary and concurrency evidence.
The `states` count becomes `null` because the old raw timelines are no longer available
to calculate the exact number of distinct live sets across both batches; no gate uses it.

For #29, two 60-second batches added 48 successful isolated captures, each validated by
the forced-gag and single-ADS checks in `gen-refs.mjs`. The first added eight runs each
for `BUILDING:7`, `BUILDING:8`, `FISHING:2`, and `FISHING:8`; the second added eight
more for `BUILDING:8` and `FISHING:2`. Nine of the twelve vocabulary extras entered the
reference union: `BUILDING:7` gained `3:72` and `3:75`; `BUILDING:8` gained `3:48`,
`3:76`, and `3:78`; `FISHING:2` gained `1:28`, `1:30`, and `1:37`; and `FISHING:8`
gained `4:62`. At that point, `BUILDING:8`'s `3:49`, `3:70`, and `3:74` remained
unmatched after 24 total reference runs. Absence from that finite sample alone
did not establish an engine bug.

The three remaining keys are one authored branch, not three unrelated actors.
`BUILDING.ADS` tag 8 has `IF_PLAYED 3:140` followed by a `RANDOM_START` with three
equal-weight additions: fish `3:49`, boot `3:47`, or squid `3:48`. The fish path then
has explicit `IF_PLAYED 3:49 -> ADD 3:74` and `IF_PLAYED 3:74 -> ADD 3:70`
handoffs. The reference union contains the boot and squid paths and their successors,
so the original captures reached this choice; none of the 24 sampled the fish path.
Our engine reached the complete fish chain in 9 of seeds 1–24. Its control flow
was plausible from the authored ADS, and the different observed frequency led
to the RNG investigation described below.

The follow-up investigation found an unsigned modulo bug in the browser ADS
choice path. An additional isolated original BUILDING:8 capture reached the
fish branch: trace `#FORCE ads=66 tag=8`, only ADS `0x66` loaded, and only
tag 8 completed. The capture at `/tmp/building8-fish-probe18` observed
`3:49` at sample 801, `3:74` at 868, and `3:70` at 952. Its raw trace and
timeline were copied to ignored
`scratchpad/lifespan-triage-raw/BUILDING_8_fish_censored/`. The vocabulary
union gained `3:49`, `3:74`, and `3:70`, clearing the last three extras.
This capture was stopped 18 samples into `3:70`; it contributes vocabulary
and peak concurrency but no completed-gag span, occupancy, or occurrence
range. Those three keys therefore still lack completed-episode duration data.

Open follow-up: triage residual contiguous-span differences before promoting
duration to a failing gate. The reference ranges are drawn from a small random
sample, and sample phase matters most for short spans.

## Random-number behavior

The original uses a fixed 56-word generator stored in `SCRANTIC.SCR`. Our port matches 20,000 traced values exactly. An opt-in experiment shares it across confirmed host, walking, ocean, and ADS choices. Ambient animation remains separate because its draw count depends on real-time DOSBox execution. See [rng-port.md](./rng-port.md).

## Retired pixel comparison

An earlier tool captured VGA frames and compared pixels. It was slow and sensitive to palette and capture timing, so the actor timeline replaced it as the automated gate. `dosbox-x-oracle.patch` still contains optional framebuffer hooks for manual visual investigations.

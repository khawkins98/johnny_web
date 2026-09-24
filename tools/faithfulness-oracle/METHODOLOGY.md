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

Use DOSBox-X commit `6676eb916c77c95bd235f9bfc9984684403598a4`. The patch is tied to that revision and contains the director injection, actor-thread trace, RNG trace, delay trace, and optional framebuffer capture:

```sh
git clone https://github.com/joncampbell123/dosbox-x.git scratchpad/dosbox-x-src
git -C scratchpad/dosbox-x-src checkout 6676eb916c77c95bd235f9bfc9984684403598a4
git -C scratchpad/dosbox-x-src apply "$PWD/tools/faithfulness-oracle/dosbox-x-oracle.patch"
cd scratchpad/dosbox-x-src
./autogen.sh
./configure
make -C src/cpu
make -C src dosbox-x
```

Platform packages required by `./configure` vary; follow DOSBox-X's build guide if it reports a missing library. A release build is sufficient. Captures must use the normal CPU core because the dynamic core bypasses the hook.

Create this local layout:

```text
scratchpad/dosbox/
├── driveC/
│   ├── SCRANTIC.SCR
│   ├── SCRANTIC.EXE  (a copy of SCRANTIC.SCR)
│   ├── RESOURCE.001
│   └── RESOURCE.MAP
└── driveD/
    ├── runapp.bat
    └── <minimal Windows 3.1 installation>
```

`runapp.bat` must start the named Windows program. The repository's `dbx.conf` is an illustrative template; the capture script writes a per-run configuration with resolved paths.

Example:

```sh
export SP_DOSBOX="$PWD/scratchpad/dosbox"
export DBX="$PWD/scratchpad/dosbox-x-src/src/dosbox-x"
node tools/faithfulness-oracle/capture-original-gag.mjs 0x65 7 scratchpad/activity-7
```

A successful summary says `forced: true` and `isolatedToTarget: true`. The output directory contains `trace.log`, `threads.log`, `timeline.jsonl`, and emulator output in `run.log`.

The patch identifies Win16 functions by unique, relocation-safe entry bytes rather than runtime addresses. `ne_entry.py`, `ne_reloc.py`, and `ne_mask.py` verify those signatures.

For RNG-consumer discovery, run the program normally rather than forcing a gag. Each RNG line includes `caller=CS:IP`; summarize it with `rng-consumer-report.mjs`. The trace cap is 100,000 draws so a timing-heavy intro does not hide the first story window. Raw logs remain local; commit only compact derived evidence such as `rng-consumer-evidence.json`.

For timing-opcode work, also set `DBX_DELAY=/absolute/delay.log`. This records each thread's delay and deadline at the tick hook. Correlate the RNG ordinal/caller in `DBX_TRACE` with the first changed thread field in `DBX_DELAY`; JOHNNY:2 is the compact `0x2020` probe used for the committed evidence.

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
- **Prologue is not a frame:** a TTM's first-added thread ran the resource prologue (the ops before the first SET_SCENE, ending in UPDATE) as its own first frame. Its siblings waited for it, so the whole group started a frame late. In the original, each thread node starts at its own SET_SCENE frame (`FUN_1050_04d6` / `FUN_1050_042a`). The setup ops still run when the thread is added, but they no longer take up a frame.

One known scheduler issue remains: removing duplicates before staging a random branch needs a wider concurrency/completion change.

## Former test-harness filter: establishing shots

19 gags used to gate at `OVER+1`. Many open with a one-time
`IF_NOT_PLAYED[S,X] -> ADD_SCENE(S,X) + ADD_SCENE(S,Y)`. The explanation was that the
references were captured mid-session, after `X` had already played, so
`test/faithfulness-refs/establishing-shot-seeds.mjs` dropped `X` from our fingerprint
(fingerprint only; the engine was never seeded). That explanation was wrong for all but
two gags. Every filtered `X` outside SUZY is a one-frame, zero-delay PURGE loader, and
the original ends those in the tick they are added (see "PURGE ends the sequence"
above). With that engine fix, the filter changes no fingerprint in any of the 64 gags
(vocab, peak concurrency and per-actor ticks are all identical), so those entries were
removed. The same bug produced the two gags that had been left at `OVER+1`, `JOHNNY:6`
(`3:9`) and `ACTIVITY:11` (`5:20`, `5:42`).

The map now keeps only `SUZY:1`/`SUZY:2`'s `3:1` (MEANWHIL, a 49-frame drawing
animation). Each SUZY reference is sliced to one TTM slot (1 or 2), and `3:1` is on
slot 3, so a reference cannot contain it.

Open follow-ups:

- **Slot slicing.** References are sliced to the gag's main TTM slot (`gen-refs.mjs`), but our fingerprint counts every slot. The remaining SUZY filter entries and review-only extras such as `JOHNNY:6`'s `4:1` come from this. Slicing ours the same way would be the principled replacement for the seed map.
- **Lifespan sample cadence.** Reference lifespans count tick-function samples, about one per 50 ms WM_TIMER (`SUZY:1`'s `1:1`, SET_DELAY 10 = 200 ms, lives 4 samples). `actorTicks` on ours counts 20 ms engine ticks, so our lifespans read about 2.5x long. After that scaling, `ACTIVITY:11`'s `5:23`/`5:24`/`5:36` now fall inside the reference ranges.

## Random-number behavior

The original uses a fixed 56-word generator stored in `SCRANTIC.SCR`. Our port matches 20,000 traced values exactly. An opt-in experiment shares it across confirmed host, walking, ocean, and ADS choices. Ambient animation remains separate because its draw count depends on real-time DOSBox execution. See [rng-port.md](./rng-port.md).

## Retired pixel comparison

An earlier tool captured VGA frames and compared pixels. It was slow and sensitive to palette and capture timing, so the actor timeline replaced it as the automated gate. `dosbox-x-oracle.patch` still contains optional framebuffer hooks for manual visual investigations.

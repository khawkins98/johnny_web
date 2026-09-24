# Verifying faithfulness to the original

The faithfulness oracle checks whether the browser engine makes the same scene and timing decisions as the original 1993 *Johnny Castaway* program. It compares behavior, not source code.

The quick, repeatable check is `npm run test:faithful`. It runs only the browser engine against reference fingerprints previously captured from the original program, so CI does not need Windows 3.1, DOSBox-X, or the proprietary game files.

## What is compared

For each gag, both engines produce a timeline of the actors being drawn on every script tick. Several original-program runs are combined to allow for random branches. The comparison looks at:

- the set of actors and combinations seen
- peak actor concurrency, which catches duplicate or overlapping animation
- actor lifespans, where reference data is available
- whether every gag reaches its intended ending

An "actor" is a live script thread, on both sides. On ours, a scene counts from the tick it starts until the tick after it finishes. It still counts if it never draws a pixel, because the original's traces also record loader threads that only load bitmaps (for example `SUZY:1`'s `1:1`). Filtering out scenes that never draw was tested and rejected: it removed 35 actors that appear in the references, pushed 20 gags below the reference's peak concurrency, and left `STAND:1-12` with nothing at all. The filter remains available as a diagnostic with `our-thread-timeline.mjs --drawn-only`.

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

One known scheduler issue remains: removing duplicates before staging a random branch needs a wider concurrency/completion change.

## Test-harness artifact: establishing-shot peak-concurrency inflation

19 gags used to gate at `OVER+1` (our peak concurrency one above the reference).
17 of those traced to a single test-harness artifact rather than an engine bug:
many gags open with a one-time `IF_NOT_PLAYED[S,X] -> ADD_SCENE(S,X) + ADD_SCENE(S,Y)`
"establishing shot" for a location, where `X` (a short location intro) and `Y`
(the gag's real first actor) are added together, guarded on whether `X` has ever
played. `driveGag()` (the sanctioned single-gag path used by the whole
faithfulness suite) always builds a fresh runtime with empty
`state.playedHistory`, so `X` always fires -- but the original-binary reference
captures were taken mid-session, after `X` had already played once elsewhere, so
a real capture never shows the `X`+`Y` overlap. Pre-seeding `playedHistory` with
`X` to compensate was tried and is unsafe: `X` and `Y`'s `ADD_SCENE`s share the
same guarded branch, so marking `X` "already played" up front skips the whole
branch and the gag never runs (verified: this produced "zero live ticks" for 15
of the 17 gags). Instead, `test/faithfulness-refs/establishing-shot-seeds.mjs`
lists, per gag, the "sceneIdx:tagId" key(s) to drop from the **fingerprint only**
(`tools/faithfulness-oracle/fingerprint.mjs`'s `establishingKeys` parameter) --
the engine itself runs completely unseeded. This is verified behaviorally
equivalent to a mid-session capture: the established key and the real actor
co-occur only for a short natural window before the establishing shot finishes
and drops out on its own (e.g. ACTIVITY:1's `1:12`/`1:13` overlap lasts 5 ticks
of a 5000-tick run). `test/faithfulness-diff.mjs` looks up each gag's entry in
that map and passes it through; all 17 listed gags now report `EXACT`.

Two gags were investigated and deliberately left unseeded/`OVER+1` because
seeding would mask a different, unexplained divergence instead of converging:

- **ACTIVITY:11** -- removing its own establishing guard still leaves peak
  concurrency one below the reference, and a second, unrelated actor (another
  tag's own establishing-shot key) is also absent from the reference vocabulary.
- **JOHNNY:6** -- its peak does not even involve its own establishing shot; the
  extra actor there has no `IF_NOT_PLAYED` guard anywhere in `JOHNNY.ADS`, so
  it is not an establishing-shot artifact at all.


Open follow-ups:

- **`JOHNNY:6` and `ACTIVITY:11` extras.** Our engine runs loader threads (`3:9`; `5:20` and `5:42`) that never appear in these references. They never draw, but references for other gags do include loader threads, so ignoring non-drawing scenes does not explain the gap. The cause is still unknown.
- **`STAND:1-12` never pose.** In a single-gag drive, these gags run only the `1:42` init loader and never add a pose scene. They pass the peak-concurrency gate only because that loader counts as one live actor, so actor coverage for them is 0%.

## Random-number behavior

The original uses a fixed 56-word generator stored in `SCRANTIC.SCR`. Our port matches 20,000 traced values exactly. An opt-in experiment shares it across confirmed host, walking, ocean, and ADS choices. Ambient animation remains separate because its draw count depends on real-time DOSBox execution. See [rng-port.md](./rng-port.md).

## Retired pixel comparison

An earlier tool captured VGA frames and compared pixels. It was slow and sensitive to palette and capture timing, so the actor timeline replaced it as the automated gate. `dosbox-x-oracle.patch` still contains optional framebuffer hooks for manual visual investigations.

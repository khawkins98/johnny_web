# Verifying faithfulness to the original

The faithfulness oracle checks whether the browser engine makes the same scene and timing decisions as the original 1993 *Johnny Castaway* program. It compares behavior, not source code.

The quick, repeatable check is `npm run test:faithful`. It runs only the browser engine against reference fingerprints previously captured from the original program, so CI does not need Windows 3.1, DOSBox-X, or the proprietary game files.

## What is compared

For each gag, both engines produce a timeline of the actors being drawn on every script tick. Several original-program runs are combined to allow for random branches. The comparison looks at:

- the set of actors and combinations seen
- peak actor concurrency, which catches duplicate or overlapping animation
- actor lifespans, where reference data is available
- whether every gag reaches its intended ending

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

## Random-number behavior

The original uses a fixed 56-word generator stored in `SCRANTIC.SCR`. Our port matches 20,000 traced values exactly. An opt-in experiment uses it for ADS random choices, but ambient animation remains separate because its draw count depends on real-time DOSBox execution. See [rng-port.md](./rng-port.md).

## Retired pixel comparison

An earlier tool captured VGA frames and compared pixels. It was slow and sensitive to palette and capture timing, so the actor timeline replaced it as the automated gate. `dosbox-x-oracle.patch` still contains optional framebuffer hooks for manual visual investigations.

# Architecture

This document describes the current implementation. For setup and diagnostics,
see the [README](../README.md). For reverse-engineering conclusions, see
[LEARNINGS.md](../LEARNINGS.md).

## System overview

`johnny_web` parses the original DGDS resources in JavaScript and runs their
ADS/TTM scripts in a browser-hosted engine.

```text
RESOURCE.MAP + RESOURCE.001
            │
            ▼
      resource parsers
            │
       ADS controller
            │ starts/stops
            ▼
       TTM sequences ──► per-scene logical surfaces
                              │
                              ▼
                     DGDS frame compositor
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
       browser background             foreground canvas
```

The engine-facing code uses logical ticks, injected host services, and a
drawing-surface contract. Canvas, animation-frame timestamps, storage, device
metadata, and trace persistence remain at browser/tooling boundaries.

## Repository map

| Path | Responsibility |
|---|---|
| `src/scrantic/main.mjs` | Startup, resource fetch, user-gesture/audio gate, repeated ADS cycles |
| `src/dgds/resource.mjs` | `RESOURCE.MAP`/`.001` index and loader dispatch |
| `src/dgds/resources/` | ADS, TTM, BMP, SCR, and PAL parsers |
| `src/dgds/compression/` | DGDS RLE/LZW decoding |
| `src/dgds/scripting/process.mjs` | Active process, fixed-step loop, ADS/TTM coordination, presentation |
| `src/dgds/scripting/script-runner.mjs` | Opcode callbacks, dispatch tables, interpreter |
| `src/dgds/scripting/scene-factory.mjs` | TTM environments and per-scene runtime state |
| `src/dgds/scripting/composition.mjs` | Rebuilds the foreground composition from stored areas and scene layers |
| `src/dgds/scripting/surface.mjs` | Logical surface plus Canvas and recording adapters |
| `src/dgds/scripting/timing.mjs` | Browser timestamp to bounded DGDS tick conversion |
| `src/dgds/scripting/compatibility.mjs` | Injected settings, wall time, and randomness |
| `src/dgds/scripting/diagnostics.mjs` | Runtime diagnostics mode controller |
| `src/dgds/scripting/trace.mjs` | Structured JSONL event recording |
| `src/debug-ui.mjs`, `src/settings-ui.mjs` | Runtime controls and human-readable diagnostics |

## Startup

1. Fetch `RESOURCE.MAP` and `RESOURCE.001`.
2. Parse the resource index and draw `INTRO.SCR`.
3. Wait for a click; construct `AudioContext` synchronously inside that user
   gesture to satisfy browser autoplay rules.
4. Load `ACTIVITY.ADS` and call `startProcess()`.
5. When the ADS program completes, start a fresh cycle.

The game data is not committed. `pnpm run extract -- <zip>` populates
`public/data/`; see the README for prerequisites.

## Resource and script model

`RESOURCE.MAP` indexes entries in `RESOURCE.001`. `resource.mjs` dispatches an
entry by extension:

| Extension | Meaning |
|---|---|
| `ADS` | High-level Animation Director Script |
| `TTM` | Per-frame Tiny Templated Movie |
| `BMP` | Indexed sprite frames |
| `SCR` | Screen/background image |
| `PAL` | Palette data |

ADS scripts sequence gags and start, stop, or test TTM scenes. TTM scripts load
assets and execute drawing, timing, sound, and control opcodes. ADS and TTM use
separate dispatch tables because identical opcode values can mean different
things in the two formats.

TTM raw opcodes encode their integer argument count in the low nibble. A low
nibble of `15` denotes a string payload. `SET_SCENE` divides a TTM stream into a
resource prologue and named sequences.

## Logical execution

`runScript(state, script)` uses `state.reentry` as its program counter. It runs
until an opcode blocks, normally `UPDATE`, then resumes from that opcode on a
later logical tick. Completion sets `played`, increments `runs`, and resets the
counter. `GOTO` requests a restart or switches to another tagged TTM script.

The root process uses a fixed 60 Hz logical tick. Browser animation timestamps
feed an accumulator; late frames may execute several ticks, capped at five, and
a suspended tab cannot trigger an unbounded replay. `SET_DELAY` and random
delays remain integer DGDS ticks. Browser wall time does not enter opcode
execution.

## TTM environments and scenes

A TTM resource owns one environment containing its decoded image slots,
background assets, palette-related values, and GET/PUT buffers. Environments
are keyed by ADS resource ID; resources never share these mutable caches.

The first requested scene for a resource owns its prologue. Siblings wait until
that prologue completes, then share the environment's assets. Each scene still
has fresh execution state and its own transparent logical surface. This prevents
one scene from being captured into another scene's saved background.

ADS queues scene additions and removals until `PLAY_SCENE`:

- `ADD_SCENE` stages a TTM scene.
- `PLAY_SCENE` applies stops and additions, then blocks until new scenes finish
  their first pass.
- `STOP_SCENE` stages removal.
- completed scenes retain their final layer until ADS explicitly stops them;
  looping scenes remain active.

## Frame composition

The browser page has a background canvas and a foreground presentation canvas.
TTM opcodes never address either directly.

For every rendered logical frame, `composeTtmFrame()`:

1. clears the process composition surface;
2. paints stored areas;
3. paints active/retained scene surfaces in ADS order;
4. optionally records a structured composition event and pixel fingerprint;
5. presents the result on the foreground canvas.

Removing a scene therefore removes its pixels on the next composition; there is
no scene-removal clear heuristic. A scene surface retains its current TTM frame
while a logical delay elapses.

GET/PUT operations are overwrite operations. The Canvas adapter clears the
destination region before drawing saved pixels so transparent saved pixels also
erase prior content. `STORE_AREA` and saved GET/PUT slots are owned by the
faithful scripting/composition layer, not the browser presenter.

`frame-renderer.mjs` draws the ocean/island background separately. Optional
cloud/wave behavior uses the injected compatibility profile.

## Host boundaries

| Engine need | Injected/browser implementation |
|---|---|
| Frame scheduling | `requestAnimationFrame` → fixed-step clock |
| Drawing | logical surface → Canvas adapter |
| Settings | compatibility profile → `localStorage` |
| Randomness | injected random function |
| Optional wall time | compatibility profile |
| Audio | Web Audio manager created after a user gesture |
| Diagnostics export | JSONL recorder → browser download; optional Vite endpoint for automation |

Tests use recording surfaces and deterministic host functions without Canvas or
wall time.

## Diagnostics

Diagnostics can start at page load or change at runtime from Settings (`S`):

| Setting | Output |
|---|---|
| Off | No diagnostics |
| On | Concise console events plus structured events and pixel fingerprints |

Enabling diagnostics starts a new session at the current engine tick. Its first JSONL
record contains application/build, engine, page, browser-reported capability,
and display metadata. Disabling diagnostics writes a stop record. The developer
panel downloads the capture in the browser. Automation may read events directly
or persist them through the Vite-only endpoint. `?debug=verbose` adds noisy live
sprite logging without changing the exported trace.

## Current limitations

- The production drawing adapter is RGBA Canvas, not a faithful indexed-color
  framebuffer; palette transitions remain approximate.
- Several parsed TTM/ADS opcodes are still no-ops, including TTM fades,
  `SAVE_BACKGROUND`, `SAVE_REGION`, `DRAW_SCREEN`, and some sound/palette
  controls. Unknown ADS control opcodes are retained but not interpreted.
- The root process is module-level and supports one active ADS process.
- Audio sample offsets are hardcoded for the supported Johnny Castaway data.
- The browser background renderer is still separate from the logical TTM
  composition, so some original buffer-copy behavior may require more work.

Treat these as explicit compatibility gaps. Opcode behavior should be corrected
in the faithful layer; browser accommodations belong in adapters or profiles.

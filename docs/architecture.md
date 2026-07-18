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

The engine-facing code uses logical ticks, instance-owned execution state,
injected host services, and a drawing-surface contract. Browser animation-frame
timestamps are converted by a host adapter, and audio opcodes emit logical
operations consumed by a Web Audio host. Canvas remains an injected presenter
dependency of the transitional runtime; replacing drawing calls with logical
frame operations is the next machine-extraction step. See [ADR 0001](adr/0001-runtime-boundaries.md)
for the target dependency direction.

## Repository map

| Path | Responsibility |
|---|---|
| `src/scrantic/main.mjs` | Startup, resource fetch, user-gesture/audio gate, repeated ADS cycles |
| `src/dgds/resource.mjs` | `RESOURCE.MAP`/`.001` index and loader dispatch |
| `src/dgds/resources/` | ADS, TTM, BMP, SCR, and PAL parsers |
| `src/dgds/compression/` | DGDS RLE/LZW decoding |
| `src/games/johnny/manifest.mjs` | Johnny version identity, entry points, and audio sample catalogue |
| `src/dgds/scripting/process.mjs` | Browser host composition and legacy active-session/debug façade |
| `src/dgds/scripting/runtime.mjs` | Instance-owned ADS/TTM coordination and transitional presentation |
| `src/dgds/hosts/browser-scheduler.mjs` | Animation-frame timestamp to logical-tick host adapter |
| `src/dgds/hosts/browser-audio.mjs` | Logical sample-operation to Web Audio host adapter |
| `src/dgds/scripting/script-runner.mjs` | Opcode callbacks, dispatch tables, interpreter |
| `src/dgds/scripting/audio-operation.mjs` | Host-neutral audio operation contract |
| `src/dgds/scripting/frame-operation.mjs` | Host-neutral drawing operation contract |
| `src/dgds/scripting/surface-frame-presenter.mjs` | Applies frame operations to retained logical surfaces |
| `src/dgds/scripting/execution-outcome.mjs` | Interpreter/scheduler outcome contract |
| `src/dgds/scripting/frame-timing.mjs` | Faithful authored frame-boundary values |
| `src/dgds/scripting/scene-factory.mjs` | TTM environments and per-scene runtime state |
| `src/dgds/scripting/scene-frame.mjs` | Logical frame reset and GET/PUT restoration |
| `src/dgds/scripting/composition.mjs` | Rebuilds the foreground composition from stored areas and scene layers |
| `src/dgds/scripting/surface.mjs` | Logical surface plus Canvas and recording adapters |
| `src/dgds/scripting/timing.mjs` | Browser timestamp to bounded DGDS tick conversion |
| `src/dgds/scripting/timing-compatibility.mjs` | Named authored-to-host timing mappings |
| `src/dgds/scripting/compatibility.mjs` | Browser profile: timing, settings, wall time, and randomness |
| `src/dgds/scripting/diagnostics.mjs` | Runtime diagnostics mode controller |
| `src/dgds/scripting/trace.mjs` | Structured JSONL event recording |
| `src/debug-ui.mjs`, `src/settings-ui.mjs` | Runtime controls and human-readable diagnostics |

## Startup

1. Fetch `RESOURCE.MAP` and `RESOURCE.001`.
2. Use the Johnny game manifest to select the resource archive and draw its
   configured intro screen.
3. Wait for a click; construct `AudioContext` synchronously inside that user
   gesture to satisfy browser autoplay rules.
4. Load the manifest's activity ADS and call `startProcess()`, which constructs
   a fresh `DgdsRuntime` and connects it to a browser scheduler.
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
until an opcode blocks, normally `UPDATE`, then returns a structured `yielded`,
`looped`, or `completed` outcome. `UPDATE` emits an authored frame boundary with
the current `SET_DELAY` value; it does not count browser ticks. The scheduler
maps that directive through the compatibility profile and owns the resulting
wait. `GOTO` requests a restart or switches to another tagged TTM script.

Each `DgdsRuntime` owns its mutable script, scene, and composition state. The
browser scheduler supplies a fixed 60 Hz logical tick. Animation timestamps feed
an accumulator; late frames may execute several ticks, capped at five, and a
suspended tab cannot trigger an unbounded replay. `SET_DELAY` and random delays
remain integer DGDS ticks. The default `faithful-browser` timing profile
preserves them and applies one named compatibility rule:
`browser-yield-floor` makes a zero-delay frame visible for one logical tick.
Browser wall time does not enter opcode execution.

`PLAY_SAMPLE` emits a logical `play-sample` operation into the current tick
result. The opcode does not inspect, resume, load, or await browser audio. The
browser audio adapter consumes those operations after the tick and separately
records whether playback started or was unavailable. Audio host state therefore
cannot block ADS/TTM scheduling.

Drawing opcodes similarly emit logical frame operations. Primitive drawing,
sprites, saved regions, GET/PUT frame starts, and script-requested clears do not
call a retained surface. The current surface presenter consumes each operation
synchronously so a later opcode in the same script observes the faithful
GET/PUT result. `DgdsRuntime.tick()` returns the emitted operations for
conformance tests and future non-Canvas presenters.

## TTM environments and scenes

A TTM resource owns one environment containing its decoded image slots,
background assets, palette-related values, stored areas, and initial GET/PUT
templates. Environments are keyed by ADS resource ID.

The first requested scene for a resource owns its prologue. Siblings wait until
that setup completes, then share decoded assets. Each scene gets fresh execution
state, a transparent logical surface, and private working GET/PUT buffers copied
from the environment template. Concurrent scenes therefore cannot overwrite one
another's saved regions.

ADS condition branches stage scene additions and removals:

- `ADD_SCENE` stages a TTM scene.
- `END_SCENE_BRANCH` (`0x1510`) commits staged changes and continues; it does
  not wait for unrelated scenes.
- `IF_PLAYED` supplies the authored dependency barrier for its referenced scene.
- `STOP_SCENE` stages removal.
- completed scenes retain their final layer until ADS explicitly stops them;
  looping scenes remain active until stopped.

## Frame composition

The browser page has a background canvas and a foreground presentation canvas.
TTM opcodes never address either directly. They emit frame operations; the
retained-surface presenter applies them to per-scene logical surfaces.

For every rendered logical frame, `composeTtmFrame()`:

1. clears the process composition surface;
2. paints stored areas;
3. paints active/retained scene surfaces in TTM resource/declaration order;
4. optionally records a structured composition event and pixel fingerprint;
5. presents the result on the foreground canvas.

Removing a scene therefore removes its pixels on the next composition; there is
no scene-removal clear heuristic. A scene surface retains its current TTM frame
while a logical delay elapses.

GET/PUT operations are overwrite operations. The Canvas adapter clears the
destination region before drawing saved pixels so transparent saved pixels also
erase prior content. On a scene layer, `CLEAR_SCREEN` first discards the entire
previous frame, then restores the saved region; saved rectangles do not always
cover sprites moving elsewhere on screen. `STORE_AREA` and saved GET/PUT slots
are owned by the faithful scripting/composition layer, not the browser presenter.

`frame-renderer.mjs` draws the ocean/island background separately. Optional
cloud/wave behavior uses the injected compatibility profile.

## Host boundaries

| Engine need | Injected/browser implementation |
|---|---|
| Frame scheduling | browser scheduler → fixed-step clock → `DgdsRuntime.tick()` |
| Drawing | frame operations → retained-surface presenter → Canvas adapter |
| Settings | compatibility profile → `localStorage` |
| Randomness | injected random function |
| Optional wall time | compatibility profile |
| Audio | `play-sample` operation → game sample catalogue → Web Audio adapter |
| Enhanced controls | runtime control API → scene navigation, playback rate, HUD, full screen |
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
record contains application/build, engine, timing profile, page,
browser-reported capability, and display metadata. `frame-timing-map` events
record authored and mapped delays with applied patch names; `audio-sample` events
distinguish sample requests from actual playback starts. Disabling diagnostics
writes a stop record. The developer panel downloads the capture in the browser;
automation may read it directly or use the Vite-only persistence endpoint.
`?debug=verbose` adds noisy sprite logging without changing the exported trace.

## Current limitations

- The production drawing adapter is RGBA Canvas, not a faithful indexed-color
  framebuffer; palette transitions remain approximate.
- Several parsed TTM/ADS opcodes are still no-ops, including TTM fades,
  `SAVE_BACKGROUND`, `SAVE_REGION`, `DRAW_SCREEN`, and some sound/palette
  controls. Unknown ADS control opcodes are retained but not interpreted.
- The browser application intentionally exposes one active runtime through a
  legacy developer-UI façade, but engine state itself is instance-owned.
- The Johnny game package currently identifies its supported version by label;
  automatic resource fingerprint verification has not been added yet.
- The browser background renderer is still separate from the logical TTM
  composition and still contains Johnny-specific asset names/layout, so some
  original buffer-copy behavior and the game-package boundary require more work.
- Opcode drawing and audio are now logical operations. Final scene composition,
  background selection, fades, and Canvas presentation still live in
  `DgdsRuntime`; those must be extracted before it becomes the deterministic
  `DgdsMachine` described by ADR 0001.

Treat these as explicit compatibility gaps. Opcode behavior should be corrected
in the faithful layer; browser accommodations belong in adapters or profiles.

# Architecture

A public reference outlining the execution model, module boundaries, and known compatibility gaps of the johnny_web engine.

**tl;dr**

- johnny_web runs original DGDS resources through an experimental engine called Bottle DGDS.
- Logical execution runs at a fixed 50 Hz tick recovered from the host's 20 ms timer unit, decoupled from browser wall time and presentation logic.
- Background canvases handle enhancements (like moving clouds) independently of the faithful DGDS software surface.
- Runtime patches are allowed when they are isolated as host-compatibility adapters, not as changes to authored opcode semantics.

## System overview

`johnny_web` parses the original DGDS resources in JavaScript and runs their ADS and TTM scripts through **Bottle DGDS**, the experimental engine developed in this repository. "Bottle" names the reusable package and host surface; "DGDS" still names the faithful resource and execution model.

```text
RESOURCE.MAP + RESOURCE.001
            │
            ▼
      resource parsers
            │
       ADS controller ── starts/stops ──► TTM sequences
                                              │ frame operations
                                              ▼
                                  per-scene software surfaces
                                              │
                                  software foreground compositor
                                              │ RGBA upload
                                              ▼
                                      foreground canvas

game background metadata + decoded assets ──► browser background renderer
                                              │
                                              ▼
                                      background canvas
```

The engine uses logical ticks, instance-owned state, injected resources, and a software drawing surface. Host adapters convert browser timestamps, consume logical audio operations, and present composed RGBA frames on Canvas.

## Repository map

| Path                                             | Responsibility                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `src/bottle/browser-presentation.mjs`            | Browser startup, resource fetch, audio gate, and repeated ADS presentation cycles                    |
| `src/bottle/game-package.mjs`                    | Validates and freezes base title identity and archive metadata; hosts validate optional capabilities |
| `src/bottle/debug-ui.mjs`                        | Generic active-session diagnostics and developer controls                                            |
| `src/dgds/resource.mjs`                          | `RESOURCE.MAP`/`.001` index and loader dispatch                                                      |
| `src/dgds/palette.mjs`                           | Default DGDS palette pending complete authored PAL switching                                         |
| `src/dgds/resource-provider.mjs`                 | Adapts archive entries to synchronous named-resource resolution                                      |
| `src/dgds/resources/`                            | ADS, TTM, BMP, SCR, and PAL parsers                                                                  |
| `src/dgds/compression/`                          | DGDS RLE and LZW decoding                                                                            |
| `src/games/johnny/browser-app.mjs`               | Composes the Bottle browser host with Johnny's package and UI                                        |
| `src/games/johnny/manifest.mjs`                  | Johnny identity, entry points, aliases, audio, and background metadata                               |
| `src/games/johnny/story-controller.mjs`          | Host-level sequence planning, scene eligibility, and transition/walk injection                        |
| `src/games/johnny/walking.mjs`                   | Host-owned walking route decode, interpolation, and path selection                                      |
| `src/games/johnny/island-presenter.mjs`          | Persistent island layer composition and per-sequence presentation identity                                |
| `src/games/johnny/ui/transitions.mjs`            | Host-owned sequence-end wipe rendering                                                                |
| `src/games/johnny/ui/`                           | Johnny-specific settings and Enhanced-mode presentation                                              |
| `src/dgds/scripting/process.mjs`                 | Browser session wiring and legacy active-session and debug façade                                    |
| `src/dgds/scripting/runtime.mjs`                 | Instance-owned ADS/TTM coordination and logical presentation directives                              |
| `src/dgds/hosts/browser-scheduler.mjs`           | Animation-frame timestamp to logical-tick host adapter                                               |
| `src/dgds/hosts/browser-audio.mjs`               | Logical sample-operation to Web Audio host adapter                                                   |
| `src/dgds/hosts/browser-frame-presenter.mjs`     | Foreground RGBA upload plus browser backgrounds and fades                                            |
| `src/dgds/hosts/browser-presentation-policy.mjs` | Enhancement settings, wall time, and presentation randomness                                         |
| `src/dgds/scripting/script-runner.mjs`           | Opcode callbacks, dispatch tables, interpreter                                                       |
| `src/dgds/scripting/audio-operation.mjs`         | Host-neutral audio operation contract                                                                |
| `src/dgds/scripting/frame-operation.mjs`         | Host-neutral drawing operation contract                                                              |
| `src/dgds/scripting/surface-frame-presenter.mjs` | Applies frame operations to retained logical surfaces                                                |
| `src/dgds/scripting/background-resources.mjs`    | Loads background assets described by an injected game package                                        |
| `src/dgds/scripting/execution-outcome.mjs`       | Interpreter and scheduler outcome contract                                                           |
| `src/dgds/scripting/frame-timing.mjs`            | Faithful authored frame-boundary values                                                              |
| `src/dgds/scripting/scene-factory.mjs`           | TTM environments and per-scene runtime state                                                         |
| `src/dgds/scripting/scene-frame.mjs`             | Logical frame reset and GET/PUT restoration                                                          |
| `src/dgds/scripting/composition.mjs`             | Rebuilds the foreground composition from stored areas and scene layers                               |
| `src/dgds/scripting/surface.mjs`                 | Deterministic RGBA software surface plus recording adapter                                           |
| `src/dgds/scripting/timing.mjs`                  | Browser timestamp to bounded DGDS tick conversion                                                    |
| `src/dgds/scripting/timing-compatibility.mjs`    | Named authored-to-host timing mappings                                                               |
| `src/dgds/scripting/diagnostics.mjs`             | Runtime diagnostics mode controller                                                                  |
| `src/dgds/scripting/trace.mjs`                   | Structured JSONL event recording                                                                     |

## Startup

1. Fetch `RESOURCE.MAP` and `RESOURCE.001`.
2. The Johnny application passes its validated game package and UI factories to the Bottle browser host. The host selects the resource archive and draws the configured intro screen.
3. Wait for a click — construct `AudioContext` synchronously inside that user gesture to satisfy browser autoplay rules.
4. Create the named-resource provider, ask the optional title selector for an ADS resource and tag, then call `startProcess()` to construct a fresh `DgdsRuntime` and connect it to the browser scheduler.
5. When the selected ADS program completes, ask the title selector for the next cycle. Packages without a selector fall back to the manifest's activity ADS.

The game data is not committed. The browser application includes an extractor that accepts a `.zip` or `.ima` file via drag-and-drop or file picker, parsing and decompressing the resources directly into IndexedDB on the client.

CLI extraction writes the three proprietary runtime archives under ignored `public/data/`. `pnpm run dump` reads those archives through the same resource parsers and regenerates disposable inspection output under ignored `dumps/`, including the resource index, compressed entries, decoded images, ADS/TTM listings, and samples. Reverse-engineering evidence that must persist belongs in tests and documentation rather than generated asset dumps.

## Resource and script model

`RESOURCE.MAP` indexes entries in `RESOURCE.001`. `resource.mjs` dispatches an entry by extension:

| Extension | Meaning                              |
| --------- | ------------------------------------ |
| `ADS`     | High-level Animation Director Script |
| `TTM`     | Per-frame Tiny Templated Movie       |
| `BMP`     | Indexed sprite frames                |
| `SCR`     | Screen and background image          |
| `PAL`     | Palette data                         |

ADS scripts sequence gags and start, stop, or test TTM scenes. TTM scripts load assets and execute drawing, timing, sound, and control opcodes. ADS and TTM use separate dispatch tables because identical opcode values can mean different things in the two formats.

TTM raw opcodes encode their integer argument count in the low nibble. A low nibble of `15` denotes a string payload. `SET_SCENE` divides a TTM stream into a resource prologue and named sequences.

## Fidelity policy and patch surface

The project goal is to keep the DGDS interpreter and scene lifecycle running as faithfully as possible and inject behavior only where the original executable owned it.

Current rule:

- The core runtime (`src/dgds/scripting/`) executes bytecode scheduling, DRAW timing, and scene composition semantics; it should not read wall time, storage, audio availability, or title policy.
- Corrections that alter host timing should stay in `src/dgds/scripting/timing-compatibility.mjs`.
- Enhancements and presentation behavior changes should stay in `src/dgds/hosts/*` and `src/games/johnny/*` (clouds/waves/holidays/walking/story policy/transitions).
- Runtime-facing diagnostics should record these layers separately so we can distinguish faithful execution differences from presentation/policy differences.

When a change is needed to behavior:

1. Ask whether it belongs to the original bytecode model first; if yes, patch the script runtime path.
2. If it is playback or environment adaptation, place it in host/johnny policy.
3. If it is an intentional timing compatibility change, add a named patch in timing compatibility and cover it with a test.

## Logical execution

`runScript(state, script)` uses `state.reentry` as its program counter. It runs until an opcode blocks, normally `UPDATE`, then returns `yielded`, `looped`, or `completed`. `UPDATE` emits an authored frame boundary with the current `SET_DELAY`. The scheduler maps it through the named timing profile and owns the wait. `GOTO` requests a restart or switches to another tagged TTM script.

ADS `ADD_SCENE` has a separate execution-lifetime parameter. A positive value is a finite run count; zero allows the child TTM to run normally; a negative value starts a time-limited child for that many DGDS timer ticks. A time-limited child restarts its TTM body after `END` until the cutoff, just as it continues through a `GOTO` loop; the cutoff, rather than the shape of the TTM body, determines when ADS may advance. It must not be folded into `SET_DELAY`, which controls only the interval between that child's authored frames.

For a host-selected ADS tag, reaching ADS `END` stops interpreting that tag but does not discard finite children it started in its final branch. The runtime continues ticking those children without entering the next ADS tag. Once they complete, it clears the complete child batch—including any unbounded ambient loop—and reports the selected tag complete to the host controller.

Each `DgdsRuntime` owns its mutable script, scene, and composition state. The browser scheduler supplies the recovered fixed 50 Hz logical tick. Animation timestamps feed an accumulator. A late browser frame advances at most one logical tick and discards stale whole ticks, so a delayed paint or suspended tab cannot trigger an animation/audio burst. `SET_DELAY` and random delays remain integer DGDS ticks. The default `faithful-browser` timing profile preserves them and applies one named compatibility rule — `browser-yield-floor` makes a zero-delay frame visible for one logical tick. Browser wall time does not enter opcode execution.

The runtime receives randomness and timing compatibility directly; it does not retain storage, wall time, or presentation policy. The browser policy owns enhanced cloud and wave state without writing it into authored scene state. Thus enhancements cannot alter interpreter timers, random choices, or scene state. The browser clock coalesces overdue timer events to one logical tick per paint: replaying several ticks synchronously would hide intermediate Canvas frames and start their audio operations as a burst, unlike the original message-driven timer.

`PLAY_SAMPLE` emits a logical `play-sample` operation into the current tick result. The opcode does not inspect, resume, load, or await browser audio. The browser audio adapter consumes those operations after the tick and separately records whether playback started or was unavailable. Audio host state therefore cannot block ADS and TTM scheduling.

Drawing opcodes similarly emit logical frame operations. Primitive drawing, sprites, saved regions, GET/PUT frame starts, and script-requested clears do not call Canvas. The retained-surface presenter consumes each operation synchronously into deterministic RGBA pixels so a later opcode in the same script observes the faithful GET/PUT result. `DgdsRuntime.tick()` also returns the emitted operations for conformance tests and alternate hosts.

The tick result also directs the host to clear the foreground, update a background, and request composition of retained layers. The engine's `composeTtmFrame()` owns foreground layer ordering and RGBA composition. The browser presenter uploads that result and owns the separate background Canvas, enhanced backgrounds, and fades. Runtime state retains no Canvas context or completion callback.

The application injects the Johnny game package into the runtime. `LOAD_SCREEN`, `LOAD_IMAGE`, ocean selection, and the browser background renderer obtain file names, aliases, layouts, sprite layers, and enhancement-setting keys from that package. Generic DGDS modules contain no Johnny resource names or layout indices. Runtime session diagnostics include the injected game ID and version label.

The interpreter and runtime never inspect raw archive entries or invoke parser dispatch directly. They synchronously resolve names through an injected resource provider. Synchronous resolution is intentional — an authored TTM stream may `LOAD_IMAGE` and draw it later in the same interpreter pass. The browser and app composition layer adapts the loaded archive entry collection to this contract.

## TTM environments and scenes

A TTM resource owns one environment containing its decoded image slots, background assets, palette-related values, stored areas, and initial GET/PUT templates. Environments are keyed by ADS resource ID.

The first requested scene for a resource owns its prologue. Siblings wait until that setup completes, then share decoded assets. Each scene gets fresh execution state, a transparent logical surface, and private working GET/PUT buffers copied from the environment template. Concurrent scenes therefore cannot overwrite one another's saved regions.

ADS condition branches stage scene additions and removals:

- `ADD_SCENE` stages a TTM scene.
- `END_SCENE_BRANCH` (`0x1510`) commits staged changes and continues. It does not wait for unrelated scenes.
- `IF_PLAYED` supplies the authored dependency barrier for its referenced scene.
- `STOP_SCENE` stages removal.
- Completed scenes retain their final layer until ADS explicitly stops them or a later GET/PUT frame restore overwrites their occupied region, matching DGDS's shared composition buffer.
- Looping scenes remain active until stopped.

The collection mutations are normally staged, but running-state tests later in the same branch observe and materialize pending additions and removals. This mirrors the original engine's immediate sequence run flags: after `ADD_SCENE`, an `IF_NOT_RUNNING` in that branch already sees the child as running even though JavaScript ordinarily commits scene-array changes at the branch boundary. A finite running child holds that condition at its program counter while TTM ticks advance it; an unbounded self-loop remains a false conditional without deadlocking ADS completion.

## Frame composition

The browser has background and foreground canvases. TTM opcodes address neither — the retained-surface presenter applies their operations to per-scene software surfaces.

The title host selects the ADS resource and tag to run. This mirrors the original split: ADS bytecode coordinates one selected scene, while executable-level policy chooses among ambient scene files. Johnny's controller also supplies immutable story/island state, walk endpoints, a shared presentation identity, and a sequence-end wipe; the browser renderer consumes those directives without moving their policy into DGDS. A title-owned selection presenter keeps the island layer alive across otherwise independent ADS runtimes and walking interludes. Debug preview directives are created by that same controller, while anchored debug runs replace its queue and continue through the normal host path. One host-attempt cancellation token spans the captured selection's walk, ADS runtime, audio, and sequence-end wipe, so a new debug run atomically invalidates every part of the old selection rather than only stopping DGDS. Optional title-owned background decorators run after background composition; Johnny uses this hook to decode and stamp `HOLIDAY.BMP` without shipping converted image assets. [Johnny's host-behavior notes](johnny-host-behavior.md) document the recovered sequence, tide, walking, transition, and debug process and the one known route-selection approximation.

When retained foreground state changes, `composeTtmFrame()`:

1. clears the process composition surface;
2. paints stored areas;
3. paints active and retained scene surfaces in TTM resource/declaration order;
4. optionally records a structured composition event and pixel fingerprint.

The browser presenter then uploads the composed RGBA surface to the foreground canvas. It caches the retained-layer revision to avoid recomposing and uploading an unchanged frame.

Removing a scene therefore removes its pixels on the next composition; there is no scene-removal clear heuristic. A scene surface retains its current TTM frame while a logical delay elapses.

GET/PUT operations overwrite RGBA values, including transparent pixels. On a scene layer, `BEGIN_SCENE_FRAME` starts a new frame and discards the previous frame when the slot is not restoreable, then restores the saved region when present. This prevents stale movement trails for sprites whose restore region does not cover the full previous frame. `STORE_AREA` and GET/PUT slots belong to the scripting and composition layer, not the browser.

`frame-renderer.mjs` draws the configured background separately. Optional cloud, wave, and local-time behavior uses the injected game metadata and browser presentation policy. Local-time selection overrides the presented ocean without mutating the faithful runtime's selected background.

## Host boundaries

| Engine need                                  | Injected/browser implementation                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Frame scheduling                             | browser scheduler → fixed-step clock → `DgdsRuntime.tick()`                            |
| Resource decoding                            | archive entries → named-resource provider → runtime                                    |
| Drawing                                      | frame operations → software retained surfaces → RGBA upload by browser frame presenter |
| Enhancement settings                         | browser presentation policy → `localStorage`                                           |
| Randomness                                   | injected random function                                                               |
| Optional wall time and enhancement animation | browser presentation policy                                                            |
| Audio                                        | `play-sample` operation → game sample catalogue → Web Audio adapter                    |
| Enhanced controls                            | runtime control API → scene navigation, playback rate, HUD, full screen                |
| Diagnostics export                           | JSONL recorder → browser download; optional Vite endpoint for automation               |
| Title scene/story policy                     | game-owned selector or scheduler → ADS resource and tag                                |
| Title background overlays                    | game-owned decorator → browser background presenter                                   |

Tests use software or recording surfaces plus deterministic runtime inputs and presentation policies without Canvas or wall time. `pnpm run test:golden` replays four historically fragile Johnny sequences from extracted local data and compares logical-operation digests and retained-frame fingerprints.

## Diagnostics

Diagnostics can start at page load or change at runtime from Settings (`S`):

| Setting | Output                                                               |
| ------- | -------------------------------------------------------------------- |
| Off     | No diagnostics                                                       |
| On      | Concise console events plus structured events and pixel fingerprints |

Enabling diagnostics starts a session at the current engine tick. Its first JSONL record contains application and build, engine, timing profile, page, browser-reported capability, and display metadata. `frame-timing-map` events record authored and mapped delays with applied patch names. `audio-sample` events distinguish sample requests from actual playback starts. Disabling diagnostics writes a stop record. The developer panel downloads the capture in the browser; automation may read it directly or use the Vite-only persistence endpoint. `?debug=verbose` adds noisy sprite logging without changing the exported trace.

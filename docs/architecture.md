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
                              one shared, host-owned software raster
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
| `src/dgds/scripting/surface-frame-presenter.mjs` | Applies frame operations to the one shared raster, routing GET/PUT through the global save-under registry |
| `src/dgds/scripting/background-resources.mjs`    | Loads background assets described by an injected game package                                        |
| `src/dgds/scripting/execution-outcome.mjs`       | Interpreter and scheduler outcome contract                                                           |
| `src/dgds/scripting/frame-timing.mjs`            | Faithful authored frame-boundary values                                                              |
| `src/dgds/scripting/scene-factory.mjs`           | TTM environments and per-scene runtime state                                                         |
| `src/dgds/scripting/scene-frame.mjs`             | Emits `BEGIN_SCENE_FRAME`; the frame op restores the save-under region, never the whole raster        |
| `src/dgds/scripting/composition.mjs`             | Immediate-mode compositor: clears the raster and redraws every active scene each tick; content-signature revision |
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

### Reference provenance

The original resources and traces are primary evidence. The project also cross-checks ambiguous behavior against ScummVM's GPL-3.0-or-later DGDS implementation, especially [`ads.cpp`](https://github.com/scummvm/scummvm/blob/master/engines/dgds/ads.cpp), [`ttm.cpp`](https://github.com/scummvm/scummvm/blob/master/engines/dgds/ttm.cpp), and [`ttm.h`](https://github.com/scummvm/scummvm/blob/master/engines/dgds/ttm.h). These references informed opcode identities, the repeated evaluation of active ADS segments, TTM run types, sequence ordering, and reset/frame progression. Bottle keeps an independently structured JavaScript runtime and records adopted behavioral conclusions in tests and documentation rather than vendoring upstream files. Full acknowledgement and licensing context are in [NOTICE](../NOTICE).

## Logical execution

`runScript(state, script)` uses `state.reentry` as its program counter. It runs until an opcode blocks, normally `UPDATE`, then returns `yielded`, `looped`, or `completed`. `UPDATE` emits an authored frame boundary with the current `SET_DELAY`. The scheduler maps it through the named timing profile and owns the wait. `GOTO` requests a restart or switches to another tagged TTM script.

ADS `ADD_SCENE` has a separate execution-lifetime parameter. A positive value is a finite run count; zero allows the child TTM to run normally; a negative value starts a time-limited child for that many DGDS timer ticks. A time-limited child restarts its TTM body after `END` until the cutoff, just as it continues through a `GOTO` loop; the cutoff, rather than the shape of the TTM body, determines when ADS may advance. It must not be folded into `SET_DELAY`, which controls only the interval between that child's authored frames.

For a host-selected ADS tag, reaching ADS `END` stops interpreting that tag but does not discard finite children it started in its final branch. The runtime continues ticking those children without entering the next ADS tag. Once they complete, it clears the complete child batch—including any unbounded ambient loop—and reports the selected tag complete to the host controller.

ADS `RUN_SCRIPT` is a synchronous subroutine call to another named ADS segment. The runtime expands those calls with recursion protection while retaining the selected segment as the host-visible execution boundary. This is required by `STAND.ADS`: every ordinary stand segment calls its initializer, which loads `MJ_AMB.BMP` before the chosen ambient sequence draws from it.

Each `DgdsRuntime` owns its mutable script, scene, and composition state. The browser scheduler supplies the recovered fixed 50 Hz logical tick. Animation timestamps feed an accumulator. A late browser frame advances at most one logical tick and discards stale whole ticks, so a delayed paint or suspended tab cannot trigger an animation/audio burst. `SET_DELAY` and random delays remain integer DGDS ticks. The default `faithful-browser` timing profile preserves them and applies one named compatibility rule — `browser-yield-floor` makes a zero-delay frame visible for one logical tick. Browser wall time does not enter opcode execution.

The runtime receives randomness and timing compatibility directly; it does not retain storage, wall time, or presentation policy. The browser policy owns enhanced cloud and wave state without writing it into authored scene state. Thus enhancements cannot alter interpreter timers, random choices, or scene state. The browser clock coalesces overdue timer events to one logical tick per paint: replaying several ticks synchronously would hide intermediate Canvas frames and start their audio operations as a burst, unlike the original message-driven timer.

`PLAY_SAMPLE` emits a logical `play-sample` operation into the current tick result. The opcode does not inspect, resume, load, or await browser audio. The browser audio adapter consumes those operations after the tick and separately records whether playback started or was unavailable. Audio host state therefore cannot block ADS and TTM scheduling.

Drawing opcodes similarly emit logical frame operations. Primitive drawing, sprites, saved-background (STORE_AREA) stores, and script-requested clears do not call Canvas. The surface-frame presenter applies each operation synchronously into deterministic RGBA pixels (so an in-pass STORE_AREA reads the pixels drawn earlier in the same pass) and records each scene's draw ops so `composeTtmFrame` can replay them (see [Frame composition](#frame-composition)). `DgdsRuntime.tick()` also returns the emitted operations for conformance tests and alternate hosts.

The tick result also directs the host to update a background and, on a present tick, recompose the one shared raster (immediate mode: clear + redraw every active scene — see [Frame composition](#frame-composition)) and upload it. The browser presenter uploads the raster and owns the separate background Canvas, enhanced backgrounds, and fades. Runtime state retains no Canvas context or completion callback.

The application injects the Johnny game package into the runtime. `LOAD_SCREEN`, `LOAD_IMAGE`, ocean selection, and the browser background renderer obtain file names, aliases, layouts, sprite layers, and enhancement-setting keys from that package. Generic DGDS modules contain no Johnny resource names or layout indices. Runtime session diagnostics include the injected game ID and version label.

The interpreter and runtime never inspect raw archive entries or invoke parser dispatch directly. They synchronously resolve names through an injected resource provider. Synchronous resolution is intentional — an authored TTM stream may `LOAD_IMAGE` and draw it later in the same interpreter pass. The browser and app composition layer adapts the loaded archive entry collection to this contract.

## TTM environments and scenes

A TTM resource owns one environment containing its decoded image slots, background assets, palette-related values, stored areas, and initial GET/PUT templates. Environments are keyed by ADS resource ID.

The first requested scene for a resource owns its prologue. Siblings wait until that setup completes, then share decoded assets. Each scene gets fresh execution state, but all scenes in a sequence draw into the same shared, host-owned raster (see [Frame composition](#frame-composition)); there is no per-scene surface. Sprite save-under (GET/PUT) has no pixel effect under the immediate-mode renderer — the per-tick clear+redraw is the erase — so overlapping scenes can never collide over a shared save slot; there is no save-under registry.

ADS condition branches stage scene additions and removals:

- `ADD_SCENE` stages a TTM scene.
- `END_SCENE_BRANCH` (`0x1510`) commits staged changes and continues. It does not wait for unrelated scenes.
- `IF_PLAYED` supplies the authored dependency barrier for its referenced scene.
- `STOP_SCENE` stages removal.
- Stopping a scene removes it from the next composition: a finished scene is no longer redrawn, so it ages out (immediate mode — the raster is cleared and every active scene redrawn each present tick), matching how the original re-erased and redrew each `WM_TIMER`. There is no retained-final-layer heuristic and no persistence: a stopped actor neither freezes on screen nor lingers.
- Looping scenes remain active until stopped.

The collection mutations are normally staged, but running-state tests later in the same branch observe and materialize pending additions and removals. This mirrors the original engine's immediate sequence run flags: after `ADD_SCENE`, an `IF_NOT_RUNNING` in that branch already sees the child as running even though JavaScript ordinarily commits scene-array changes at the branch boundary. A finite running child holds that condition at its program counter while TTM ticks advance it; an unbounded self-loop remains a false conditional without deadlocking ADS completion.

Branch commit is explicitly remove-before-add. An ADS branch may therefore finish, remove, and re-add the same zero-run-count TTM tag to keep a visual layer alive across a longer actor routine. The replacement is a fresh execution, clears the removed instance's completion history, and restarts its body until an explicit `STOP_SCENE`. This models the original ADS host's repeated active-segment evaluation without making every ordinary zero-run-count actor animation loop. Johnny's campfire uses this pattern to cycle the very-large-fire layer while Johnny walks to the tree, returns with the boot, and cooks it; retaining a completed replacement lets later GET/PUT restores retire the fire even though ADS has not stopped it.

## Frame composition

This section describes the shared-raster model that shipped as Track A of the rendering
refidelity refactor (`docs/scrantic-re-findings.md` Part A, the reverse-engineering spec
this implements). It replaces an earlier per-scene-surface design; see the historical note
at the end of this section for what changed and why.

The browser has background and foreground canvases. TTM opcodes address neither directly —
they emit frame operations that the surface-frame presenter (`src/dgds/scripting/surface-frame-presenter.mjs`)
applies to **one persistent, host-owned raster** (`state.surface`), shared by every scene in
the sequence. `browser-presentation.mjs` allocates that raster once per sequence (story day)
and injects it into each per-event `DgdsRuntime` created for that sequence, so it persists
across ADS runtimes within the sequence exactly as the original engine's once-allocated
buffer did. A new raster is created only at a sequence boundary.

The title host selects the ADS resource and tag to run. This mirrors the original split: ADS bytecode coordinates one selected scene, while executable-level policy chooses among ambient scene files. Johnny's controller also supplies immutable story/island state, walk endpoints, a shared presentation identity, and a sequence-end wipe; the browser renderer consumes those directives without moving their policy into DGDS. A title-owned selection presenter keeps the island layer alive across otherwise independent ADS runtimes and walking interludes. Debug preview directives are created by that same controller, while anchored debug runs replace its queue and continue through the normal host path. One host-attempt cancellation token spans the captured selection's walk, ADS runtime, audio, and sequence-end wipe, so a new debug run atomically invalidates every part of the old selection rather than only stopping DGDS. The coordinator also overlays the browser's active one-scene preview on the paused story-controller status; the debug UI follows that host status by default while leaving nested TTM stage reporting to the runtime diagnostics. Optional title-owned background decorators run after background composition; Johnny uses this hook to decode and stamp `HOLIDAY.BMP` without shipping converted image assets. [Johnny's host-behavior notes](johnny-host-behavior.md) document the recovered sequence, tide, walking, transition, and debug process and the one known route-selection approximation.

**Immediate mode: redraw every active scene each tick.** Reproducing the original engine's
render loop (`docs/scrantic-re-findings.md` Part A; frame-cadence findings), every composed
frame is rebuilt from scratch: `composeTtmFrame()` (`src/dgds/scripting/composition.mjs`)
**clears the shared raster to transparent, then redraws every _active_ scene's current frame
in z-order** by replaying the draw ops each scene recorded that frame (`scene.state.frameOps`,
reset on `BEGIN_SCENE_FRAME`). A **finished** scene is not redrawn and therefore vanishes —
the original's aged-out behavior, which is what prevents both a stopped actor freezing on
screen and a moving actor leaving a trail. Persistent stored backgrounds (STORE_AREA plates,
see below) are drawn first, beneath the actors.

`getCompositionRevision()` returns a **content signature** — the active scenes plus each
scene's `layerRevision` (bumped on `BEGIN_SCENE_FRAME` and each draw), the island offset, and
the live stored-plate revisions. The browser presenter (and the golden harness) compose and
upload only when that signature changes, so a genuinely held frame is neither recomposed nor
re-uploaded, while a frame advance, a scene finishing, an offset shift, or a plate change all
trigger a fresh compose.

**Z-order is execution order.** Every tick, `#runTtmController()` sorts the active scenes by
the mutable `ttmSequenceOrder` (`src/dgds/scripting/ttm-sequence-order.mjs`) before ticking
and drawing them, so later-painted scenes draw over earlier ones on the shared raster. This
list is mutated by `MOVE_SEQUENCE_TO_BACK` (`moveSequenceToBack`), which removes and
re-appends a scene's key, so that opcode actually re-layers the scene instead of only
recording a paint-order hint.

**Sprite save-under (GET/PUT) has no pixel effect.** In immediate mode the per-tick
clear+redraw *is* the erase, so `SAVE_IMAGE_REGION` (DGDS GET) is a no-op on the raster: the
opcode is still emitted for conformance/trace, but the presenter does nothing with it, and
`BEGIN_SCENE_FRAME` only resets the scene's recorded frame — it neither clears nor restores
the raster. There is no save-under registry; the earlier `save-under.mjs` module and its
per-region snapshot/restore machinery were removed once the shared raster became
immediate-mode. (`STORE_AREA`, below, is a separate persistent mechanism and does still copy
pixels.)

**Frame cadence is gated to the original's 50 ms `WM_TIMER`.** The engine runs two clocks
(`docs/scrantic-re-findings.md` frame-cadence findings): a fine ~20 ms tick that only counts
down delays and ADS time-limits, and a 50 ms present cadence that advances animation frames —
at most one TTM frame per sequence per 50 ms, as the original's `WM_TIMER`-driven render did.
`runtime.tick()` accumulates elapsed time into a present gate; countdowns run every fine tick,
but the frame ADVANCE (running a scene's script to emit its next frame) only fires on a present
tick. The authored `SET_DELAY` operand (in the original's ~16 ms game-tick unit) is rescaled to
fine ticks by the injected `timing-compatibility` hook (`wm-timer-frame-cadence`), and the 50 ms
gate supplies the minimum on-screen time — so a zero-delay animation plays at ~20 fps, not the
fine tick's 50 fps.

**Backgrounds are re-baked at the ADS-tag boundary, not per frame.** `clearAdsSceneBatch`
(`src/dgds/scripting/script-runner.mjs`) clears the shared raster and prunes every TTM
environment's stored-background `canDraw` flag; a scene that owns a persistent background
re-emits `STORE_AREA` on its next frame to re-bake it onto the freshly cleared raster.
`jumpToScene` prunes the same way on the old environment map before discarding it, so a
persistent background cannot survive a debug jump onto the raster.

The campfire branch-rearm (re-adding a completed zero-run-count TTM tag from the same ADS
branch to keep an ambient layer animating) remains ordinary ADS scheduling, unchanged by
this refactor — see the branch-commit discussion above.

Across host-managed event boundaries, the browser presenter retains the previous
foreground — or the final walking frame — until the next runtime produces a non-empty
frame. Initializer-only transparent frames therefore cannot expose the bare background,
while an explicit wipe, cancellation, or return to the title still clears immediately. This
cross-event retention and fade behavior in the presenter is unchanged by this refactor.

`frame-renderer.mjs` draws the configured background separately. Optional cloud, wave, and local-time behavior uses the injected game metadata and browser presentation policy. Cloud drift and its origin are owned by the persistent title presentation key, so starting a new ADS runtime cannot introduce a random offset jump. Local-time selection overrides the presented ocean without mutating the faithful runtime's selected background.

### Historical note: superseded per-scene-surface design

The rendering model was reached in two steps. The original port gave each scene its own
transparent software surface with private GET/PUT slots, recomposited every tick, plus a
"retained-final-layer" rule and a `BEGIN_SCENE_FRAME` full-surface clear-or-restore.
Reverse-engineering the 16-bit executable (`docs/scrantic-re-findings.md` Part A) showed the
original uses exactly one shared raster with no per-scene isolation, so that design was
replaced with a single host-owned raster. An interim version of that shared-raster model was
*retained* ("overwrite is the clear": stopping a scene left its last pixels until a neighbor
overwrote them, with a global rect-keyed save-under registry doing the per-sprite erase). A
further reverse-engineering pass (the frame-cadence findings) established that the original is
**immediate-mode** — it redraws every active actor and re-erases every drawn region on each
50 ms `WM_TIMER` — so the retained model, the save-under registry, and the footprint machinery
were all removed in favor of the clear+redraw-every-tick model described above (a finished
scene simply stops being redrawn, so it ages out rather than persisting). `sequencePaintIndex`
is retained as a name, but it now indexes into the mutable `ttmSequenceOrder` execution-order
list rather than a static declaration order.

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

Enabling diagnostics starts a bounded 50,000-event flight-recorder session at the current engine tick. Its first JSONL record contains application and build, engine, timing profile, page, browser-reported capability, and display metadata. The recorder spans successive ADS runtimes so host selections, walking interludes, transitions, and relevant settings/debug actions can be correlated with engine events. It deliberately records named controls and values rather than arbitrary pointer movement, typing, or page content. `frame-timing-map` events record authored and mapped delays with applied patch names; `browser-presentation` events record foreground clear/upload/reuse decisions, retained-composition identity, pixel fingerprints, fades, and cloud count; `audio-sample` events distinguish sample requests from actual playback starts. If the bound is reached, the oldest events are discarded and the dropped count is reported.

During Vite development, every runtime stop automatically overwrites one bounded JSONL snapshot for the current diagnostic session through the localhost-only `/__dgds_trace` endpoint in the ignored `traces/` directory. Disabling diagnostics writes a stop record and persists once more. A new diagnostics session gets a new file, but successive ADS events do not multiply cumulative snapshots. Production builds never post automatically; the developer panel can still download the capture explicitly. Automation may read the active recorder directly. `?debug=verbose` adds noisy console logging without changing the structured trace.

The developer panel heading displays the same injected build identifier written to `session-start`, making stale dev-server traces visible before download. Its console-detail selector exposes the existing standard and verbose diagnostics modes, synchronized with the Off/On/Verbose selector in Settings and the `?debug=verbose` URL mode. On first open the panel converts its initial right-edge placement to a fixed left/top anchor; native bottom-right resizing then grows in the pointer's direction, while title dragging continues to update that same anchor. The height-limited outer panel owns scrolling with a stable gutter and contained overscroll, so every control and the resize corner remain reachable in short viewports or when browser developer tools are open.

# Proposal: Canonical Execution Path + Emulation Hooks

**Status:** DECISION ADOPTED (post red-team) · **Scope:** architecture refactor of the DGDS engine and its host adaptations

## 0. Decision (adopted) — supersedes the registry recommendation below

After a red-team focused on **readability + maintainability first, fidelity second**, we are NOT building a hook registry, and NOT adopting the `override_<name>` naming convention. Both are over-built for what this codebase actually has: the good core/host split **already exists** via constructor injection (the libretro "core takes a callbacks struct" pattern) plus the data-first `timing-compatibility` `patches:[{name,map}]` array. The gags are TTM/ADS **bytecode**, so there is no default JS behavior to pair an `override_` against; and 4 of the 5 proposed "seams" are already injection points, most with a single member — a framework for hooks that don't exist.

**What we WILL do (in order), using patterns already in the tree:**
1. **CI import-boundary guard** — files in `src/dgds/scripting/` may not import from `hosts/`, `games/`, or the diagnostics layer. Makes the canonical/override boundary *structural*, not convention. Highest leverage; do first, with a short documented allow-list for fields not yet evicted.
2. **Fix the doc drift + relocate mislocated host code** — `docs/architecture.md` §"Frame composition" still describes `composeTtmFrame` as "no clearing/redraw" and `getCompositionRevision` as returning `surface.revision`; both are false after the immediate-mode rewrite. Fix the doc. `composeTtmFrame` + `getCompositionRevision` have zero core callers (only `browser-frame-presenter.mjs`) — `git mv` them to the host; keep `pruneEnvironmentBackground` (the only core-called export) in `composition.mjs`.
3. **Evict the ~3 real canonical-core leaks** into named functions (existing patterns, each with a one-line reason): the WM_TIMER present gate (`presentAccumulatorMs`/`isPresentTick` in `runtime.mjs`) → a named `present-cadence` function beside `timing-compatibility.mjs`; `playbackRate`/`speedRemainder`; `fadingOut`/`fadeOpacity`/`isNightMode`.
4. **A tested `OVERRIDES` index** — a plain exported array `[{name, category, reason, where}]` with a snapshot test. This delivers Ken's "see every override and why in one place" as an *executable* table of contents (can't drift), with none of a runtime registry's indirection or lost grep-ability.

**Fidelity reframing (important):** the 50 ms WM_TIMER present cadence is **canonical observable behavior** (like a console's vblank), NOT a host correction. The genuine host adaptation is the rAF-timestamp → logical-tick clock *recovery* that feeds that cadence on a browser's variable clock. So a "no-hooks" run does NOT equal the binary for cadence; the deterministic no-hooks fixture proves **op-stream determinism + authored delay values**, and is billed as such — not "reproduces the binary."

**Explicitly deferred (pull into existence only when a second real hook needs it):** a runtime registry, category enums/toggles/cross-category ordering, the `override_<name>` resolver, and the physical move to `src/dgds/core/` (the CI guard delivers ~90% of the "structural" value without moving files).

Sections 1–11 below are the original analysis pass; where they recommend a registry or `src/dgds/core/` move, section 0 supersedes them.

## 1. Goal

Split the codebase into two clearly separated things:

1. **A canonical execution path** — the pure, deterministic reproduction of the original DGDS engine as recovered from `SCRANTIC.SCR`. Given the same resources, randomness, and authored bytecode, it produces the same logical frames the 1993 engine produced. It knows nothing about browsers, wall-clock time, diagnostics, enhancements, or Johnny-specific policy.
2. **An emulation-override layer** — every adaptation we add *on top of* the canonical engine to make it run well on a modern machine or to observe it: timing corrections (the 50 ms `WM_TIMER` gate), diagnostics/tracing, host rendering/present, visual enhancements (clouds, waves, holidays), and title/story policy (scene selection, walking, tides). Each override is an explicit, **named hook** attached at a defined seam.

The success test is the one Ken stated: **you can read the faithful engine's behavior in one place, and see every override — and *why* each exists — in another.** Today that separation exists as documented *convention* (the "Fidelity policy" section of `docs/architecture.md`); this proposal makes it *structural*.

This is a refactor of a working, tested system (312 unit tests + a golden conformance suite). It must be incremental and keep tests green at every step — no big-bang rewrite.

## 2. Current state: the boundary is convention, and it leaks

`src/dgds/scripting/` is *intended* to be the canonical core, but today it co-mingles the canonical engine with host concerns. Concrete leaks:

| Leak | Where | Why it's not canonical |
| --- | --- | --- |
| **WM_TIMER present gate** | `runtime.mjs` `tick()` — `presentAccumulatorMs`, `isPresentTick`, `wmTimerMs` (lines ~220-225), gate in `#runTtmController` (`if (!rootState.isPresentTick) return;`) | The 50 ms render cadence is a *host-timing correction* (a compatibility hook), not part of the authored bytecode model. It currently lives in the core loop. |
| **Diagnostics/trace calls** | `traceEvent(...)` sprinkled through `runtime.mjs`, `script-runner.mjs`, `composition.mjs`, `scene-frame.mjs`, `process.mjs` | Observability is an override. The canonical path should emit structured *events*; a diagnostics hook decides whether/how to record them. |
| **Host playback state** | `runtime.state.playbackRate`, `speedRemainder` (`runtime.mjs`), consumed by `process.mjs` session loop | Playback-rate is a host control, not engine state. |
| **Night-mode / title state** | `runtime.setNightMode()`, `state.isNightMode`, `state.titleState.*` read inside `frame-renderer.mjs` | Title/day-night policy is Johnny-host, not canonical DGDS. |
| **Fade state** | `state.fadingOut`, `state.fadeOpacity` in `runtime.mjs` | Fades are a host presentation transition (the five-wipe sequence is Johnny-host). |
| **Enhancement renderer** | `frame-renderer.mjs` (clouds, waves, ocean, local-time) physically lives under `src/dgds/scripting/` and reads `presentationPolicy` | Clouds/waves are enhancements, not canonical rendering. Wrong layer. |
| **Compose/host identity conflation** | `getCompositionRevision()` in `composition.mjs` mixes canonical layer identity with a host "should I re-upload" signal | Two different concerns (what the frame *is* vs. whether the host needs to paint) in one function. |
| **Session loop** | `process.mjs` wires scheduler + presenter + policy and owns the tick loop | Correctly a host file, but it reaches into runtime state (`playbackRate`, `speedRemainder`) that should be hook-owned. |

The one place we already do this *right* is `timing-compatibility.mjs`: a **named, data-first, opt-in patch array** (`patches: [{ name: 'wm-timer-frame-cadence', map }]`) that transforms an authored value without the interpreter knowing. That is the seed of the whole proposal — generalize it.

## 3. Target architecture

```
        CANONICAL CORE (pure, deterministic, no host)          OVERRIDE LAYER (named hooks)
        ────────────────────────────────────────────          ────────────────────────────
  resources → interpreter → scene model → logical frame  ──►   timing hooks   (transform)
  (ADS/TTM bytecode, authored frame-timing, opcode &            lifecycle hooks (observe)
   scene/GET-PUT semantics, deterministic surface)              draw/compose interceptors
                                                                selection providers
                    ▲  emits events, exposes seams                resource-resolution hooks
                    └──────────── HOOK REGISTRY ─────────────►    diagnostics listeners
                       (declares, orders, enables, lists)         enhancement renderers
                                                                  host present + scheduler
```

- **Canonical core** = a package (e.g. `src/dgds/core/`) with a hard rule: it imports nothing from `hosts/`, `games/`, diagnostics, or the hook registry. It runs the bytecode faithfully and exposes *seams* (transform points and event streams).
- **Override layer** = named hooks, each in the appropriate category package, registered in one place. A hook is either a **transform** (it changes a canonical value on its way through a seam — e.g. delay mapping) or a **listener** (it observes a canonical event without changing it — e.g. tracing).
- **Hook registry** = the single "table of contents" of overrides: what's active, in what order, and a one-line reason each exists.

## 4. The canonical execution path (definition)

**Belongs in the core:**
- ADS + TTM bytecode interpretation and dispatch (`script-runner.mjs`), scene lifecycle, GET/PUT and STORE_AREA semantics, remove-before-add / branch-rearm, z-order = execution order.
- Authored frame-timing *values* (`frame-timing.mjs`) — the raw `SET_DELAY` operands as the binary specifies them, in the original's units, with **no host floor or rescale**.
- The deterministic software surface (`surface.mjs`) and the immediate-mode compose *mechanism* (clear → redraw active scenes' recorded frames → draw STORE_AREA plates), expressed as pure pixel operations.
- Resource decoding contracts (via an injected resolver — already a seam).
- Structured *event emission* (frame boundaries mapped, scene begins, samples requested) — but the core only *emits*; it does not record.

**Must be evicted (today's leaks, see §2):** the WM_TIMER present gate, the trace *recording*, `playbackRate`/`speedRemainder`, `isNightMode`/`titleState` reads, fade state, the clouds/waves/ocean renderer, and the host half of `getCompositionRevision`.

**The litmus test:** the core, run with an empty hook set, should execute a gag deterministically and produce the authored logical frames at the authored (unclamped) cadence — matching the binary's intent — with zero host behavior. That headless "no-hooks" run becomes a fidelity fixture (see §10).

## 5. Hook taxonomy

Five categories. Each hook declares its **category**, a **name**, a one-line **reason**, and whether it **observes** or **transforms**.

| Category | Purpose | Observe / Transform | Current examples to migrate |
| --- | --- | --- | --- |
| **timing / compatibility** | Adapt authored delays & tick cadence to the host machine | Transform | `wm-timer-frame-cadence` (delay rescale), the 50 ms present gate, `browser-yield-floor` (retired), catch-up/coalescing, `playbackRate` |
| **rendering / present** | Turn the canonical surface into host pixels; decide when to paint | Transform + listener | `browser-frame-presenter` upload, `getCompositionRevision`'s host half, cross-event foreground retention, five-wipe transitions, fades |
| **diagnostics / observability** | Record the canonical event stream | Listener only | every `traceEvent(...)`, `diagnostics.mjs`, JSONL/`trace.mjs` |
| **enhancements** | Optional visual additions the original lacked | Transform (additive) | clouds, animated waves, holiday overlay, ocean/local-time selection, night-mode presentation |
| **title / story policy** | Choices the original executable made *above* DGDS | Provider (supplies canonical inputs) | `story-controller` scene/tag selection, walking interludes, tides/raft/day counter, island layout |

Key distinction: **enhancements and diagnostics may never change canonical logical state**; timing and selection hooks *feed* the canonical path defined inputs; rendering hooks consume canonical output. Nothing in the core reads a hook back.

## 6. Extension-point / hook interfaces (the seams)

Five seams cover every current override. Interface sketches are **illustrative** (no code is being changed by this doc); the shapes generalize the existing `timingCompatibility.mapFrameBoundary` pattern.

**6.1 Frame-boundary / timing transform** (transform). Already exists as `mapFrameBoundary`; generalize its `patches` array into the registry.
```
// input: faithful boundary { delayTicks } + context { sceneIdx, tagId }
// output: { runtimeDelayTicks }   (chain of transforms, data-first)
timingHook.mapFrameBoundary(boundary, ctx) -> boundary'
```

**6.2 Tick / present lifecycle** (transform for cadence, listener for the rest). This is where the WM_TIMER present gate moves *out of* `runtime.mjs`.
```
lifecycleHook.beforeTick(clock)          // e.g. advance the 50ms present accumulator; returns { isPresent }
lifecycleHook.gateFrameAdvance(scene, clock) -> boolean   // present gate: may frame advance this tick?
lifecycleHook.afterTick(result)          // listeners (diagnostics) observe
```
The core loop calls these seams; with no hook, `gateFrameAdvance` defaults to `true` (pure per-tick advance = the unclamped canonical cadence).

**6.3 Draw-op / compose interceptor** (transform + listener). Lets rendering/enhancement hooks observe or post-process composition without the core knowing about canvases.
```
renderHook.onComposed(surface, frame)    // host uploads; enhancements draw clouds/waves; retention decides
renderHook.compositionIdentity(frame) -> key   // the host half of getCompositionRevision, moved out
```
The canonical `composeTtmFrame` stays pure (clear + replay active scenes + STORE_AREA plates → a surface); *whether to upload* and *what to paint around it* is the hook.

**6.4 Scene-selection provider** (provider). The title/story policy supplies the next ADS resource+tag and immutable per-sequence state; DGDS runs one selected tag.
```
selectionHook.nextSelection(storyState) -> { adsResource, tag, islandState, walk, wipe }
```
This already exists informally as the Johnny `story-controller` → `process.startProcess` contract; formalize it as a named provider hook.

**6.5 Resource-resolution hook** (provider/transform). Already a seam (`resourceProvider.resolve`). Keep; list it in the registry for completeness (e.g. holiday `HOLIDAY.BMP` fetch, walk-table extraction).

## 7. A formal hook registry

One module (e.g. `src/dgds/hooks/registry.mjs`) is the single source of truth. Hooks are **named, opt-in, data-first**, ordered explicitly, and self-describing:

```
createHookRegistry([
  { name: 'wm-timer-frame-cadence', category: 'timing',       reason: 'Rescale 16ms authored delays to fine ticks', ...seam },
  { name: 'wm-timer-present-gate',  category: 'timing',       reason: 'Advance ≤1 frame per 50ms WM_TIMER', ...seam },
  { name: 'browser-present',        category: 'rendering',    reason: 'Upload the shared raster to canvas', ...seam },
  { name: 'diagnostics-jsonl',      category: 'diagnostics',  reason: 'Record the event stream', enabled: false, ...seam },
  { name: 'clouds', 'waves', 'holiday-overlay', ...           category: 'enhancement', ... },
  { name: 'johnny-story',           category: 'title',        reason: 'Select ADS scenes, tides, walking', ...seam },
])
```

Properties: enumerable (a `describe()` prints the table Ken wants — "every override and why"), each entry `enabled` toggle, deterministic ordering per category, and a build that assembles the canonical core + a chosen registry. Tests and the golden harness assemble the core with a *minimal or empty* registry.

## 8. Migration mapping

| Current override | Lives today in | → Category | → Seam (§6) | Delta |
| --- | --- | --- | --- | --- |
| Delay rescale (`round(N·16/20)`) | `timing-compatibility.mjs` | timing | 6.1 | already a patch; register it |
| 50 ms present gate + accumulator | `runtime.mjs` (core!) | timing | 6.2 | **extract from core** → lifecycle hook |
| `playbackRate` / `speedRemainder` | `runtime.mjs` + `process.mjs` | timing | 6.2 | move to a playback lifecycle hook |
| Foreground upload / retention | `browser-frame-presenter.mjs` | rendering | 6.3 | already host; consume `onComposed` |
| `getCompositionRevision` (host half) | `composition.mjs` (core!) | rendering | 6.3 | **split**: keep canonical layer id, move "should upload" to hook |
| Fades + five-wipe transitions | `runtime.mjs` + `ui/transitions.mjs` | rendering | 6.3 | move fade state out of core |
| Clouds / waves / ocean / local-time | `scripting/frame-renderer.mjs` (core dir!) | enhancement | 6.3 | **relocate** out of `scripting/` |
| Holiday overlay | `games/johnny/ui/holidays.mjs` | enhancement | 6.3 | already a decorator; register it |
| Night-mode | `runtime.setNightMode` + `frame-renderer` | enhancement/title | 6.3/6.4 | move off core state |
| Scene/tag selection, tides, raft, day counter | `games/johnny/story-controller.mjs` | title | 6.4 | formalize as provider hook |
| Walking interludes | `games/johnny/walking.mjs` | title | 6.4 | provider + host present |
| `traceEvent(...)` everywhere | core files | diagnostics | 6.2 listener | core emits; hook records |

## 9. Phased migration plan (tests green at each step)

Incremental; each phase is independently shippable and leaves `pnpm test` + `pnpm test:golden` green.

1. **Introduce the registry + seam interfaces, no behavior change.** Add `src/dgds/hooks/` with the registry and the five seam signatures. Wrap the *existing* `timingCompatibility` as the first registered timing hook. Prove parity (goldens unchanged).
2. **Extract the WM_TIMER present gate** out of `runtime.mjs` into a `wm-timer-present-gate` lifecycle hook (6.2) — the highest-value first move, since it's the freshest and most obvious leak, and it exercises the lifecycle seam end-to-end. Core defaults to per-tick advance with no hook. Goldens regenerate only if cadence math shifts (it shouldn't — same values, relocated).
3. **Move diagnostics to a listener.** Replace inline `traceEvent` with core event *emission* + a `diagnostics` listener hook. Trace output identical.
4. **Split `getCompositionRevision`** into canonical layer-identity (core) + host "should upload" (rendering hook); move fade/`playbackRate`/`isNightMode` off `runtime.state`.
5. **Relocate `frame-renderer.mjs`** (clouds/waves/ocean) out of `scripting/` into an enhancement package behind the render seam; register clouds/waves/holiday as enhancement hooks.
6. **Formalize selection + walking** as a `johnny-story` provider hook (6.4).
7. **Land the canonical package boundary + CI guard** (§10): move the pure files under `src/dgds/core/`, add the import-boundary check.

Phases 1-2 deliver most of the conceptual win (a working registry + the marquee leak evicted) and can ship first; 3-7 are steady cleanup.

## 10. Testability & fidelity guarantees

- **Headless no-hooks fidelity fixture.** Assemble the canonical core with an *empty* registry and run gags; assert deterministic logical frames at the authored (unclamped) cadence. This is the "pure engine" contract and the strongest anti-regression net — it fails loudly if any host behavior creeps back into the core.
- **Per-hook isolation tests.** Each hook tested against a stub core seam (the timing hook already is, via `wmTimerMs` injection). Rendering/enhancement hooks tested by feeding a canned canonical frame.
- **Golden harness split.** The golden conformance suite runs the core + the timing/rendering hooks that define the *shipped* cadence (so goldens capture the real 50 ms behavior), while the no-hooks fixture guards pure faithfulness. Continuity asserts stay as-is.
- **Boundary enforcement (CI).** A structural check (lint rule or a tiny script) that files under `src/dgds/core/` import nothing from `hosts/`, `games/`, `hooks/`, or diagnostics. This is what makes the separation *structural* rather than convention — the thing Ken asked for. Pairs with the existing no-AI-coauthor CI as a second repo-invariant check.
- **Registry `describe()` snapshot test.** A test that prints the active-hook table; doubles as living documentation of "every override and why."

## 11. Risks, trade-offs, open questions

- **Over-abstraction (the main risk).** A generic plugin framework would be YAGNI. Mitigation: only five seams, all derived from overrides that *already exist*; data-first hooks like the current `patches` array, not a lifecycle megaclass. If a seam has exactly one hook forever, it can stay a plain function — the registry is for *visibility*, not indirection for its own sake.
- **Goldens will move in some phases** (cadence relocation, compose split). Each such phase must regenerate goldens deliberately and confirm the continuity + trail guards, exactly as the recent render/cadence work did.
- **The core/host state split is the fiddly part.** `runtime.state` currently holds a mix; teasing `playbackRate`/fade/night-mode/present-accumulator out without breaking the ADS/TTM interplay needs care (the immediate-mode + present-gate work showed how subtle this state is). Do it in small, test-guarded steps (phases 2, 4).
- **Selection provider ordering.** The Johnny story controller feeds immutable per-sequence state; making it a hook must preserve the "island initialized once per sequence, persists across ADS runtimes" lifecycle. Low risk (it's already an informal contract) but call it out.
- **Open question: how far to push "no-hooks = pure binary."** The core still can't be *bit*-identical to the 386 (separate background canvas vs. baked `eb2`, 20 ms fine tick vs. 16 ms). The no-hooks fixture proves *logical* faithfulness (op stream + authored cadence), not pixel-identity. Worth agreeing that "canonical" means logical/behavioral fidelity, with the residual host-grid artifacts owned by timing/rendering hooks.
- **Effort.** Phases 1-2: small and high-value. 3-6: moderate, mechanical-ish with test coverage. 7: a file move + one CI rule. Total is a steady refactor, not a rewrite — safe to interleave with Track B.


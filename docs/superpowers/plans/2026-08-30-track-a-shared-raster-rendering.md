# Track A — Shared-Raster Rendering Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-scene-surface compositor with the original engine's single shared persistent raster + shared/aged save-under, so a stopped scene's pixels are cleared by overwrite (as in the original `eb2`) instead of frozen on a private surface — fixing the "Johnny left behind" and "sprites not cleared" glitches.

**Architecture:** Every TTM scene draws into ONE persistent world raster owned by the host (allocated once per sequence in `browser-presentation.mjs`, injected through the runtime's existing surface seam), never cleared per tick. GET/PUT save-under moves from per-scene indexed slots to a single **global, content-addressed (rect-keyed) aged registry** on the runtime — faithful to the original's display list (`FUN_1060_007e`/`_05a7`/`_03d3`, phase1b Q1/Q2): each save is keyed by its region rect (so two concurrent scenes never collide by construction — the hazard the per-scene clones defended against is eliminated, not guarded), restore is LIFO, and the secondary node is aged one tick. `BEGIN_SCENE_FRAME` restores the saved region into the shared raster instead of clearing it. The per-tick "clear + redraw all layers in `sequencePaintIndex` order" is removed; z-order instead comes from ticking scenes in the mutable `ttmSequenceOrder` (so `MOVE_SEQUENCE_TO_BACK` still works). The background is re-baked at the ADS-tag boundary (`clearAdsSceneBatch`). The campfire branch-rearm (real ADS scheduling) and the presenter's cross-event retention + fade logic are left intact.

**Tech Stack:** JavaScript ESM, Vitest (`pnpm test` / `pnpm vitest run <file>`), custom software surfaces (`src/dgds/scripting/surface.mjs`). Golden regression harness (`test/render-goldens.mjs`, `pnpm test:golden` / `test:golden:update`) — requires the user-supplied `public/data/` archives to be present.

**Spec:** `docs/scrantic-re-findings.md` (Part A — Rendering model). Full decompilation evidence: scratchpad `findings/phase1-render-loop.md`, `phase1b-rechecks.md`.

## Global Constraints

From `docs/architecture.md` "Fidelity policy and patch surface" — every task respects these:

- Core runtime (`src/dgds/scripting/`) executes bytecode scheduling, DRAW timing, and composition semantics; it MUST NOT read wall time, storage, audio availability, or title policy.
- Composition *semantics* change here, so this refactor lives in `src/dgds/scripting/` + the host presenter (`src/dgds/hosts/browser-frame-presenter.mjs`) + the host raster owner (`src/bottle/browser-presentation.mjs` / `src/dgds/scripting/process.mjs`). It must not push new policy into `src/games/johnny/*`.
- Drawing opcodes emit host-neutral frame operations (`frame-operation.mjs`) applied synchronously (`presentSurfaceFrameOperation`) so a later opcode in the same pass observes the GET/PUT result. Preserve this synchronous contract.
- `DgdsRuntime.tick()` keeps returning emitted operations for conformance tests and alternate hosts.
- **KEEP the campfire branch-rearm** (`isSelfRearmingSequence` in `scene-factory.mjs`; the `restart-until-stopped` path in `runtime.mjs`) — it is ADS scheduling, proven in `phase1b-rechecks.md` Q4. Do not touch it.
- **OUT OF SCOPE:** the missed-tick "burst to catch up" policy (findings A.5). The port deliberately advances one tick and discards the rest. Leave it; revisit only if timing glitches persist.

## Model recap (why the flip is coupled)

Today: `createTtmRuntimeState` (`scene-factory.mjs:90`) gives each scene a **private** `surface: parent.surfaceFactory()`. Draw ops in `presentSurfaceFrameOperation` write into that scene surface. `composeTtmFrame` (`composition.mjs:10`) then `state.surface.clear()`s the ROOT surface, paints stored backgrounds, and redraws every scene's private surface sorted by `sequencePaintIndex`. `BEGIN_SCENE_FRAME` (`surface-frame-presenter.mjs:23`) `state.surface.clear()`s (the private scene surface) then restores its save-under.

Target: `scene.state.surface === state.surface === the one host raster`. Then compose is a no-op, `BEGIN_SCENE_FRAME` must NOT clear the whole raster, and z-order must move from compose-sort to tick-order. These are mutually dependent, so **Task 5 is one explicitly-declared behavioral flip**; Tasks 1–4 are additive and keep the suite green; Tasks 6–9 verify and document.

---

## File Structure

| File | Change | Responsibility after refactor |
| --- | --- | --- |
| `src/dgds/scripting/surface.mjs` | Modify | Add a `revision` counter bumped by every mutator (`clear`/`fillRect`/`fillCircle`/`drawLine`/`drawSprite`/`drawSurface`/`replaceRegionFrom`) on both `createSoftwareSurface` and `createRecordingSurface`. |
| `src/dgds/scripting/save-under.mjs` | Create | Global rect-keyed aged save-under registry on the root state: `registerSaveUnder`/`restoreSaveUnder` (content-addressed by region, LIFO), `queueDeferredRestore`/`flushDeferredRestores` (age-1 node at next tick start). No per-scene pixel state. |
| `src/bottle/browser-presentation.mjs` | Modify | Allocate ONE shared raster per sequence and pass it into `startProcess` (host-owned, faithful to once-allocated `eb2`). |
| `src/dgds/scripting/process.mjs` | Modify | Thread the injected `surface` into the runtime's `initialState`; keep upload-after-tick and finish-without-clear. |
| `src/dgds/scripting/scene-factory.mjs` | Modify | Scenes reference the shared raster (`surface: parent.surface`); delete the `needsPrivateSave`/`prepareTtmScene`/`cloneSaveSlots` per-scene clone path; sprite save-under moves off the scene entirely into the global registry (scenes keep only a `savedRects` slot→rect pointer map). |
| `src/dgds/scripting/runtime.mjs` | Modify | Don't recreate the raster if injected; tick scenes in `sequencePaintIndex` order; call `flushDeferredRestores` at tick start; prune env `saveBkg` in `jumpToScene`. |
| `src/dgds/scripting/surface-frame-presenter.mjs` | Modify | `BEGIN_SCENE_FRAME` restores save-under only (no full clear). |
| `src/dgds/scripting/composition.mjs` | Modify | `composeTtmFrame` no longer clears/redraws; add `bakeEnvironmentBackground(state, sceneIdx)`; `getCompositionRevision` keys off `state.surface.revision`. |
| `src/dgds/scripting/script-runner.mjs` | Modify | In `clearAdsSceneBatch`, after `CLEAR_SURFACE`, bake the incoming environment's stored background and prune dead environments' `saveBkg`. |
| `src/dgds/hosts/browser-frame-presenter.mjs` | Modify | Keep retention + fading; `composeTtmFrame` becomes trace-only. |
| `src/dgds/scripting/__tests__/*` | Modify | Rewrite the contradicting assertions in `scene-factory.test.mjs` and `composition.test.mjs` inside the flip task. |
| `test/goldens/*` | Regenerate | Golden pixels legitimately move (siblings now snapshot each other's pixels — faithful to `eb2`). |
| `docs/architecture.md` | Modify | "Frame composition" rewritten for the shared raster. |

---

## Task 1: Surface revision counter (additive; stays green)

**Files:**
- Modify: `src/dgds/scripting/surface.mjs` (`createSoftwareSurface` ~55-369, `createRecordingSurface` ~371-393)
- Test: `src/dgds/scripting/__tests__/surface.test.mjs`

**Interfaces:**
- Produces: `surface.revision` (integer), starts at 0, increments on every mutating call. Read by `getCompositionRevision` in Task 5.

- [ ] **Step 1: Write the failing test**

```js
// surface.test.mjs — add to the existing describe or a new one
import { createSoftwareSurface, createRecordingSurface } from '../surface.mjs';

describe('surface revision counter', () => {
    it('bumps revision on each mutating op (software surface)', () => {
        const s = createSoftwareSurface();
        const r0 = s.revision;
        s.fillRect(0, 0, 4, 4, 1);
        expect(s.revision).toBe(r0 + 1);
        s.clear();
        expect(s.revision).toBe(r0 + 2);
    });
    it('bumps revision on the recording surface too', () => {
        const s = createRecordingSurface();
        const r0 = s.revision;
        s.drawLine(0, 0, 1, 1, 'white');
        expect(s.revision).toBe(r0 + 1);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/dgds/scripting/__tests__/surface.test.mjs`
Expected: FAIL — `revision` is `undefined`.

- [ ] **Step 3: Implement**

In `createSoftwareSurface`, add a closure counter and bump it in every mutator body (`clear`, `drawSprite`, `fillRect`, `fillCircle`, `drawLine`, `drawSurface`, `replaceRegionFrom`; `copyRegionTo` already calls `clear`/`replaceRegionFrom` on the target and reads from source, so it bumps the target via those). Expose it:

```js
    let revision = 0;
    const touch = () => { revision += 1; };
    // …in each mutator, call touch() after the pixel write…
    return {
        // …existing members…
        get revision() { return revision; },
    };
```

Do the same in `createRecordingSurface` (bump in `record()` for mutating ops; do not bump for `fingerprint`). Add `get revision()`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/dgds/scripting/__tests__/surface.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dgds/scripting/surface.mjs src/dgds/scripting/__tests__/surface.test.mjs
git commit -m "feat(dgds): surfaces expose a mutation revision counter"
```

---

## Task 2: Global content-addressed aged save-under registry (additive; not yet wired)

Build the faithful save-under registry in isolation so Task 5 can wire it without inventing logic mid-flip. This is the original's display list (phase1b Q1/Q2): a single global registry (per runtime state, tied to the shared raster), each entry **keyed by its region rect** — so two concurrently-running scenes that save different regions never collide even if their scripts use the same `saveIndex` (the rect is the key; per-scene isolation is unnecessary). Restore is LIFO; the primary restore is immediate (age 0, at frame begin), one secondary node is deferred exactly one tick and applied at the START of the next tick before scene scripts (findings A.3).

**Files:**
- Create: `src/dgds/scripting/save-under.mjs`
- Test: `src/dgds/scripting/__tests__/save-under.test.mjs` (create)

**Design notes:**
- The registry lives on the root runtime state as `state.saveUnder` (a plain array used as a LIFO stack — new/replaced entries unshifted to the head so overlapping restores unwind newest-first, matching the original's head-push buckets).
- An entry: `{ key, x, y, width, height, surface, age }`. `key` is the rect signature `` `${x}:${y}:${width}:${height}` `` (content-addressed). `surface` is a snapshot of the raster region taken at save time (the port already snapshots via `copyRegionTo`; the registry just relocates ownership from per-scene `state.save[slot]` to the global stack).
- Saving the same rect again **replaces** the existing entry (matched-or-first-free in the original) rather than stacking duplicates.

**Interfaces:**
- Consumes: `state.surface` (shared raster).
- Produces:
  - `registerSaveUnder(state, rect)` → snapshots `state.surface` at `rect` into a new/replacing entry at the head of `state.saveUnder`; returns the entry `key`.
  - `restoreSaveUnder(state, rect)` → immediate (age-0) restore: find the entry whose `key` matches `rect`, `state.surface.replaceRegionFrom(entry.surface, entry)`, and remove it from the stack. No-op if absent.
  - `queueDeferredRestore(state, entry)` → push `{ ...entry, age: 1 }` to `state.pendingRestore`.
  - `flushDeferredRestores(state)` → for each queued node: if `age <= 0` apply `replaceRegionFrom` into `state.surface`, else re-queue with `age - 1`. Called at tick start (Task 5).

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest';
import { createRecordingSurface } from '../surface.mjs';
import {
    registerSaveUnder, restoreSaveUnder, queueDeferredRestore, flushDeferredRestores,
} from '../save-under.mjs';

describe('global content-addressed save-under', () => {
    it('restores by rect key, independent of any per-scene slot index', () => {
        const surface = createRecordingSurface();
        const state = { surface, saveUnder: [] };
        registerSaveUnder(state, { x: 5, y: 6, width: 8, height: 8 });
        restoreSaveUnder(state, { x: 5, y: 6, width: 8, height: 8 });
        expect(surface.commands.at(-1)).toMatchObject({ operation: 'replaceRegionFrom' });
        expect(state.saveUnder).toHaveLength(0); // consumed
    });

    it('keeps two same-index saves of different rects distinct (no collision)', () => {
        const surface = createRecordingSurface();
        const state = { surface, saveUnder: [] };
        registerSaveUnder(state, { x: 0, y: 0, width: 4, height: 4 });   // "scene A slot 0"
        registerSaveUnder(state, { x: 40, y: 40, width: 4, height: 4 }); // "scene B slot 0"
        restoreSaveUnder(state, { x: 0, y: 0, width: 4, height: 4 });    // A's rect only
        expect(state.saveUnder.map((e) => e.key)).toEqual(['40:40:4:4']); // B's entry survives
    });

    it('defers a queued node exactly one tick', () => {
        const surface = createRecordingSurface();
        const state = { surface, pendingRestore: [] };
        queueDeferredRestore(state, { surface: createRecordingSurface(), x: 0, y: 0, width: 4, height: 4 });
        flushDeferredRestores(state); // tick T: age 1 -> requeued age 0, no draw yet
        expect(surface.commands.some((c) => c.operation === 'replaceRegionFrom')).toBe(false);
        flushDeferredRestores(state); // tick T+1: age 0 -> applied
        expect(surface.commands.some((c) => c.operation === 'replaceRegionFrom')).toBe(true);
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/dgds/scripting/__tests__/save-under.test.mjs`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `save-under.mjs`**

```js
/**
 * Global content-addressed aged save-under registry — the original's display list
 * (phase1b Q1/Q2). Entries are keyed by region rect and held on a LIFO stack, so
 * concurrent scenes that save different regions never collide (no per-scene slot
 * isolation needed). Snapshots relocate ownership from per-scene `state.save[slot]`.
 */
const rectKey = ({ x, y, width, height }) => `${x}:${y}:${width}:${height}`;

export const registerSaveUnder = (state, rect) => {
    const key = rectKey(rect);
    const snapshot = state.surface.snapshotRegion(rect); // small surface holding the region
    const entry = { key, x: rect.x, y: rect.y, width: rect.width, height: rect.height, surface: snapshot };
    const stack = (state.saveUnder ||= []);
    const existing = stack.findIndex((e) => e.key === key);
    if (existing !== -1) stack.splice(existing, 1);
    stack.unshift(entry); // head-push => LIFO restore
    return key;
};

export const restoreSaveUnder = (state, rect) => {
    const key = rectKey(rect);
    const stack = state.saveUnder || [];
    const idx = stack.findIndex((e) => e.key === key);
    if (idx === -1) return;
    const [entry] = stack.splice(idx, 1);
    state.surface.replaceRegionFrom(entry.surface, entry);
};

export const queueDeferredRestore = (state, entry) => {
    (state.pendingRestore ||= []).push({ ...entry, age: entry.age ?? 1 });
};

export const flushDeferredRestores = (state) => {
    const queue = state.pendingRestore || [];
    state.pendingRestore = [];
    for (const node of queue) {
        if (node.age <= 0) state.surface.replaceRegionFrom(node.surface, node);
        else queueDeferredRestore(state, { ...node, age: node.age - 1 });
    }
};
```

> **`snapshotRegion` note:** `surface.mjs` already has `copyRegionTo(target, rect)`. If no `snapshotRegion(rect)` convenience exists, add a tiny one that allocates a region-sized surface and calls `copyRegionTo` into it (cover it with a one-line assertion in `surface.test.mjs`), or have `registerSaveUnder` take a caller-provided snapshot surface — the executor picks whichever fits `surface.mjs`'s real API. Keep the registry rect-keyed regardless.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/dgds/scripting/__tests__/save-under.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dgds/scripting/save-under.mjs src/dgds/scripting/__tests__/save-under.test.mjs
git commit -m "feat(dgds): global content-addressed aged save-under registry (unwired)"
```

> **Verification gate (for Task 5 wiring):** the age-1 secondary node is proven in the engine but may not fire for Johnny's shipped TTM scripts. Wire the immediate age-0 restore first; only emit a deferred node where a script actually saves a secondary region. If shipped scripts show single-node saves, leave `queueDeferredRestore` unused (a no-op path) and note it — do not synthesize a second node.

---

## Task 3: Host-owned shared raster injection (additive; behavior unchanged)

Allocate one raster in the host and inject it. Scenes still use private surfaces at this point, and `composeTtmFrame` still clears the root surface each tick, so behavior is unchanged and the suite stays green. This makes the raster persist across the per-event `DgdsRuntime` instances (faithful to once-allocated `eb2`).

**Files:**
- Modify: `src/bottle/browser-presentation.mjs` (the per-selection `startProcess` loop, ~198)
- Modify: `src/dgds/scripting/process.mjs` (pass `surface` into runtime `initialState`, ~117)
- Modify: `src/dgds/scripting/runtime.mjs:139` (already `this.state.surface ||= surfaceFactory()` — confirm injected surface is honored)
- Test: `src/dgds/scripting/__tests__/runtime.test.mjs`

**Interfaces:**
- Consumes: an optional `surface` on the runtime `initialState`.
- Produces: when a `surface` is injected, `runtime.state.surface === injectedSurface` (not a fresh factory surface).

- [ ] **Step 1: Write the failing test**

```js
it('uses an injected host-owned surface instead of allocating one', () => {
    const injected = createRecordingSurface();
    const runtime = makeAdsRuntime({ surface: injected }); // test helper that builds a minimal ADS runtime
    expect(runtime.state.surface).toBe(injected);
});
```

(Adapt `makeAdsRuntime` to the existing test setup in `runtime.test.mjs`; it must pass `surface` through `initialState`.)

- [ ] **Step 2: Run to verify it fails or passes**

Run: `pnpm vitest run src/dgds/scripting/__tests__/runtime.test.mjs`
Expected: PASS already if `initialState.surface` survives the constructor's spread (line 134 `...runtimeInitialState`, then line 139 `||=`). If the constructor deletes/overwrites it, FAIL — fix by ensuring `surface` is not in the stripped host-key list and the `||=` keeps the injected value.

- [ ] **Step 3: Implementation**

In `process.mjs` where the runtime `initialState` is assembled (~117), forward a `surface` option if the caller provided one. In `browser-presentation.mjs`, allocate one raster per sequence and pass it to `startProcess`:

```js
// browser-presentation.mjs — once per sequence (outside the per-event startProcess loop)
const sharedRaster = createSoftwareSurface();
// …then in each startProcess call for that sequence:
startProcess(/* …existing args… */, { surface: sharedRaster });
```

Import `createSoftwareSurface` from `../dgds/scripting/surface.mjs`. Keep the raster for the lifetime of the sequence (recreate it when a new sequence/selection begins, matching the original re-bake at transitions).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/dgds/scripting/__tests__/runtime.test.mjs && pnpm test`
Expected: PASS (full suite still green — no behavioral change yet).

- [ ] **Step 5: Commit**

```bash
git add src/bottle/browser-presentation.mjs src/dgds/scripting/process.mjs src/dgds/scripting/runtime.mjs src/dgds/scripting/__tests__/runtime.test.mjs
git commit -m "feat(dgds): host owns one shared raster, injected into per-event runtimes"
```

---

## Task 4: Background bake helper anchored on the ADS-tag boundary (additive; unwired)

Add the bake helper and prune logic, unit-tested, but do not remove the per-tick stored-background redraw yet (that happens in Task 5). Anchor point is `clearAdsSceneBatch` (`script-runner.mjs:165`), the real ADS-tag transition that emits `CLEAR_SURFACE`.

**Files:**
- Modify: `src/dgds/scripting/composition.mjs` (add `bakeEnvironmentBackground`)
- Test: `src/dgds/scripting/__tests__/composition.test.mjs`

**Interfaces:**
- Consumes: `state.surface`, `state.ttmEnvironments` (Map keyed by `sceneIdx`), `environment.assets.saveBkg[0]`.
- Produces: `bakeEnvironmentBackground(state, sceneIdx)` draws only THAT environment's stored background onto `state.surface` (no iteration over all environments); `pruneEnvironmentBackground(state, sceneIdx)` sets its `saveBkg[0].canDraw = false`.

- [ ] **Step 1: Write the failing test**

```js
import { bakeEnvironmentBackground, pruneEnvironmentBackground } from '../composition.mjs';

it('bakes only the named environment background onto the shared raster', () => {
    const surface = createRecordingSurface();
    const stored = createRecordingSurface();
    const other = createRecordingSurface();
    const state = { surface, ttmEnvironments: new Map([
        [3, { assets: { saveBkg: [{ canDraw: true, surface: stored }] } }],
        [4, { assets: { saveBkg: [{ canDraw: true, surface: other }] } }],
    ])};
    bakeEnvironmentBackground(state, 3);
    expect(surface.commands).toEqual([{ operation: 'drawSurface', source: stored, rect: undefined }]);
});

it('prune clears the environment background canDraw flag', () => {
    const stored = { canDraw: true, surface: createRecordingSurface() };
    const state = { ttmEnvironments: new Map([[3, { assets: { saveBkg: [stored] } }]]) };
    pruneEnvironmentBackground(state, 3);
    expect(stored.canDraw).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/dgds/scripting/__tests__/composition.test.mjs`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement**

```js
// composition.mjs
export const bakeEnvironmentBackground = (state, sceneIdx) => {
    const stored = state.ttmEnvironments?.get?.(sceneIdx)?.assets?.saveBkg?.[0];
    if (stored?.canDraw) state.surface.drawSurface(stored.surface);
};

export const pruneEnvironmentBackground = (state, sceneIdx) => {
    const stored = state.ttmEnvironments?.get?.(sceneIdx)?.assets?.saveBkg?.[0];
    if (stored) stored.canDraw = false;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/dgds/scripting/__tests__/composition.test.mjs`
Expected: PASS (existing composition tests still green — old `composeTtmFrame` untouched).

- [ ] **Step 5: Commit**

```bash
git add src/dgds/scripting/composition.mjs src/dgds/scripting/__tests__/composition.test.mjs
git commit -m "feat(dgds): environment background bake/prune helpers (unwired)"
```

---

## Task 5: THE FLIP — shared raster is the frame

**This is the one behavioral-flip task.** It swaps every scene onto the shared raster and simultaneously removes the now-wrong clears/recompose, so the suite would be red if these landed separately. It rewrites the contradicting assertions in `scene-factory.test.mjs` and `composition.test.mjs` in the same task.

**Files:**
- Modify: `src/dgds/scripting/scene-factory.mjs` (`createTtmRuntimeState:90`; delete `cloneSaveSlots`/`prepareTtmScene`/`needsPrivateSave`, lines ~140-159, 190-195, 258-263)
- Modify: `src/dgds/scripting/runtime.mjs` (`import`/call of `prepareTtmScene` at :10/:305; sort `#runTtmController` by `sequencePaintIndex`; call `flushDeferredRestores` at tick start; `jumpToScene` env prune)
- Modify: `src/dgds/scripting/surface-frame-presenter.mjs:23-28` (BEGIN_SCENE_FRAME restore-only)
- Modify: `src/dgds/scripting/composition.mjs` (`composeTtmFrame` no-op-ish; `getCompositionRevision` → `state.surface.revision`; delete `sequencePaintIndex` import if now unused here)
- Modify: `src/dgds/scripting/script-runner.mjs` (`clearAdsSceneBatch`: bake incoming env + prune dead envs after `CLEAR_SURFACE`)
- Modify: `src/dgds/hosts/browser-frame-presenter.mjs` (keep retention/fading; `composeTtmFrame` trace-only)
- Rewrite: `src/dgds/scripting/__tests__/scene-factory.test.mjs` (sibling-surface + save-isolation assertions), `src/dgds/scripting/__tests__/composition.test.mjs`

**Interfaces:**
- Produces: `scene.state.surface === state.surface` for every scene; `getCompositionRevision(state) === state.surface.revision`; `composeTtmFrame(state)` records a trace event only.

- [ ] **Step 1: Rewrite the contradicting scene-factory tests to the shared-raster invariant**

In `scene-factory.test.mjs`, replace the assertions that require distinct sibling surfaces (~59, ~86) and private save isolation (~147-166) with:

```js
it('every scene draws into the runtime shared raster', () => {
    const state = makeTtmParent(); // existing helper building a parent/root state with a `surface`
    const a = getSceneState(state, /* sceneIdx */ 1, /* tagId */ 3, 0, 100);
    const b = getSceneState(state, 1, 21, 0, 100);
    expect(a.state.surface).toBe(state.surface);
    expect(b.state.surface).toBe(state.surface);
});

it('sibling scenes of one environment share save slots (no per-scene clone)', () => {
    const state = makeTtmParent();
    const a = getSceneState(state, 1, 3, 0, 100);
    const b = getSceneState(state, 1, 21, 0, 100);
    expect(a.state.save).toBe(b.state.save);
});
```

(Use the real `getSceneState` signature — `(state, sceneIdx, tagId, runCount, proportion)`. Build `makeTtmParent` from the existing test's setup; it must expose `state.surface` and a `scenesRes` with a two-scene TTM resource at index 1.)

- [ ] **Step 2: Run to verify these fail**

Run: `pnpm vitest run src/dgds/scripting/__tests__/scene-factory.test.mjs`
Expected: FAIL — scenes still get private `parent.surfaceFactory()` surfaces and cloned saves.

- [ ] **Step 3: Point scenes at the shared raster; delete the clone path**

In `scene-factory.mjs`:
- `createTtmRuntimeState`: change `surface: parent.surfaceFactory(),` (line 90) to `surface: parent.surface,`.
- Delete `cloneSaveSlots` (140-159) and its use; delete `prepareTtmScene` (190-195) and `needsPrivateSave` assignment (260); in `getSceneState`, drop the `s.needsPrivateSave = true` / `if (environment.ready) prepareTtmScene(s)` branch (258-263) — siblings already share `environment.assets.save` via `createTtmRuntimeState` line 113.
- Keep `createSaveSlot` (used by `createTtmEnvironmentAssets`).

In `runtime.mjs`:
- Remove the `prepareTtmScene` import (line 10) and its call (line 305).

- [ ] **Step 4: Route save/restore through the global rect-keyed registry; restore-only frame begin; wire the aged flush**

The registry lives on the ROOT runtime state (`rootState.saveUnder`), not per scene. The presenter receives the per-scene `state`; reach the root via the runtime's existing scene→root linkage (the executor confirms the field — scenes are created from the root `state` in `getSceneState`, so thread a `state.root` reference or pass the root into the presenter; do NOT store pixels per scene).

In `surface-frame-presenter.mjs`:
- `SAVE_IMAGE_REGION` (39-45): instead of snapshotting into per-scene `state.save[slot]`, register the rect into the global registry AND record the slot→rect pointer on the scene so a later `BEGIN_SCENE_FRAME` can resolve it:

```js
        case FrameOperationType.SAVE_IMAGE_REGION: {
            const shifted = shiftRect(operation, state); // existing offset logic
            registerSaveUnder(state.root, shifted);       // pixels live in the global registry
            (state.savedRects ||= [])[operation.slot] = shifted; // per-scene index→rect pointer only
            break;
        }
```

- `BEGIN_SCENE_FRAME` (23-28): restore by the rect the scene saved under that slot — NOT a full clear:

```js
        case FrameOperationType.BEGIN_SCENE_FRAME: {
            // Persistent shared raster (findings A.2): a new logical frame erases only
            // the previous sprite by restoring its save-under REGION from the global
            // registry, never the whole surface. Overwrite is the clear.
            const rect = state.savedRects?.[operation.restoreSlot];
            if (rect) restoreSaveUnder(state.root, rect);
            break;
        }
```

Import `registerSaveUnder`, `restoreSaveUnder` from `./save-under.mjs`. Leave `CLEAR_SURFACE` (19-21) and `STORE_AREA` (background store, `state.saveBkg`) intact — background stores are the separate bake path (Task 4), not the sprite save-under registry.

In `runtime.mjs` `tick()` (209), call `flushDeferredRestores(this.state)` at the very START (before `#runScripts`), so any age-0 deferred node lands before this tick's scripts draw. Import it from `./save-under.mjs`.

> The rect-keyed registry is what makes per-scene save isolation unnecessary: scene A and scene B may both use `saveIndex` 0, but their saves live under different rect keys in one global stack, so neither clobbers the other. This is the faithful model (phase1b Q1) and removes the collision hazard by construction rather than guarding against it.

- [ ] **Step 5: Neuter composeTtmFrame; revision-based host key; move z-order to tick order**

Rewrite `composition.mjs` `composeTtmFrame` to trace-only, and `getCompositionRevision` to the raster revision (keep `bakeEnvironmentBackground`/`pruneEnvironmentBackground` from Task 4):

```js
export const composeTtmFrame = (state) => {
    // Scenes draw directly into the one shared raster (findings A.1); there is no
    // per-tick clear/redraw. Kept as the host contract seam + trace point.
    if (state.trace?.active) {
        state.trace.record('composition', {
            tick: state.tick,
            ...(state.trace.pixelHashes ? { pixels: state.surface.fingerprint?.() ?? null } : {}),
        });
    }
};

export const getCompositionRevision = (state) => state.surface?.revision ?? 0;
```

Remove the now-unused `sequencePaintIndex` import from `composition.mjs`. Rewrite `composition.test.mjs` to assert `composeTtmFrame` emits no `clear`/`drawSurface` and `getCompositionRevision` tracks `surface.revision` (mirror the Task 1 counter test).

In `runtime.mjs` `#runTtmController` (290), tick scenes in mutable paint order so draw order == z-order:

```js
        const ordered = [...rootState.scenes].sort(
            (a, b) => sequencePaintIndex(rootState, a) - sequencePaintIndex(rootState, b),
        );
        ordered.forEach((scene) => { /* existing per-scene body unchanged */ });
```

Import `sequencePaintIndex` from `./ttm-sequence-order.mjs` in `runtime.mjs`.

- [ ] **Step 6: Bake background + prune at the ADS-tag boundary**

In `script-runner.mjs` `clearAdsSceneBatch` (165-176), after `emitFrameOperation(state, { type: CLEAR_SURFACE })`, prune the just-cleared environments and bake the incoming one. Because the incoming scene set is added right after this in the ADS flow, bake lazily instead: prune all environments' `saveBkg` here (they will re-`STORE_AREA` when they next run), matching the original re-bake-at-transition:

```js
    emitFrameOperation(state, { type: FrameOperationType.CLEAR_SURFACE });
    if (state.saveBkg?.[0]) state.saveBkg[0].canDraw = false;
    for (const sceneIdx of state.ttmEnvironments?.keys?.() || []) {
        pruneEnvironmentBackground(state, sceneIdx);
    }
```

Import `pruneEnvironmentBackground` from `./composition.mjs`. (A scene that owns a persistent stored background re-emits `STORE_AREA` on its next frame, which re-bakes it onto the cleared raster — so no explicit `bakeEnvironmentBackground` call is needed at the boundary; keep the helper for the `jumpToScene` path and future callers.)

In `runtime.mjs` `jumpToScene` (419-420), after `state.surface?.clear()`, prune environment backgrounds too:

```js
        state.surface?.clear();
        for (const sceneIdx of state.ttmEnvironments?.keys?.() || []) pruneEnvironmentBackground(state, sceneIdx);
```

(`state.ttmEnvironments` is reset to a new Map on the next line region — order the prune BEFORE `state.ttmEnvironments = new Map()` at line 409, or prune the old map reference. Place the prune loop immediately before line 409's reset.)

- [ ] **Step 7: Presenter keeps retention + fading**

In `browser-frame-presenter.mjs`, the `present` path (59-73) already gates upload on `changed || fading` and preserves the initial foreground via `preserveInitialForeground && !hasPresentedForeground && state.surface.bounds == null`. Leave that logic intact. Only change: `composeTtmFrame(state)` (line 64) is now trace-only (no behavior change needed here — it already calls it then `presentForeground(state.surface)`). Confirm no code path assumed `composeTtmFrame` rebuilt pixels.

- [ ] **Step 8: Run the flip's tests, then the whole suite**

Run: `pnpm vitest run src/dgds/scripting/__tests__/scene-factory.test.mjs src/dgds/scripting/__tests__/composition.test.mjs src/dgds/scripting/__tests__/surface-frame-presenter.test.mjs`
Expected: PASS.
Run: `pnpm test`
Expected: PASS except goldens (Task 9). If a `process.test.mjs`/`runtime.test.mjs` case asserts the OLD compose behavior (clear+redraw, per-scene layers), update it to the shared-raster invariant here — that is part of this flip, not a separate task.

- [ ] **Step 9: Commit**

```bash
git add src/dgds/scripting/ src/dgds/hosts/browser-frame-presenter.mjs
git commit -m "refactor(dgds): shared raster is the frame; drop per-scene surfaces + recompose"
```

---

## Task 6: Guarantee z-order follows the mutable sequence order (MOVE_SEQUENCE_TO_BACK)

The compose-time sort is gone; z-order now comes from tick order (Task 5 step 5). Prove `MOVE_SEQUENCE_TO_BACK` still re-layers (the campfire "moved behind the actors") by exercising the opcode, not just static declaration order.

**Files:**
- Test: `src/dgds/scripting/__tests__/runtime.test.mjs`

- [ ] **Step 1: Write the test**

```js
it('draws scenes in mutable ttmSequenceOrder so MOVE_SEQUENCE_TO_BACK re-layers', () => {
    // Two scenes A(1:3) and B(1:21) both drawing an identifiable sprite into the shared raster.
    // Default order [1:3, 1:21] => B draws last (on top).
    // After moveSequenceToBack(order, 1, 21), order [1:3 stays, 1:21 appended] – but to send
    // A behind, call moveSequenceToBack(order, 1, 3): now [1:21, 1:3] => A draws last (on top).
    const order = ['1:3', '1:21'];
    moveSequenceToBack(order, 1, 3);
    expect(order).toEqual(['1:21', '1:3']);
    // Drive one tick and assert the recorded draw order into the shared raster matches `order`.
});
```

(Use `moveSequenceToBack` from `ttm-sequence-order.mjs`; drive the runtime with a recording raster and assert the order sprite draws hit it.)

- [ ] **Step 2: Run**

Run: `pnpm vitest run src/dgds/scripting/__tests__/runtime.test.mjs`
Expected: PASS (Task 5 made the tick sort read the mutable order). If FAIL, the sort in `#runTtmController` isn't reading the live `ttmSequenceOrder` — fix it there.

- [ ] **Step 3: Commit**

```bash
git add src/dgds/scripting/__tests__/runtime.test.mjs
git commit -m "test(dgds): z-order follows mutable sequence order (MOVE_SEQUENCE_TO_BACK)"
```

---

## Task 7: Regression tests for the two glitches

**Files:**
- Test: `src/dgds/scripting/__tests__/shared-raster-regression.test.mjs` (create)

- [ ] **Step 1: Write the regression tests**

```js
it('a neighbor draw overwrites a stopped scene\'s stale pixels (no frozen frame)', () => {
    // Scene A draws a sprite at (100,100); A stops (emits nothing further).
    // Scene B draws over (100,100). Assert the raster shows B, not A — overwrite is the clear.
});
it('an untouched region of a stopped scene persists (background not wiped each tick)', () => {
    // Scene A draws at (100,100), stops; nothing else touches it.
    // Assert those pixels persist across several ticks (persistence-until-overwrite).
});
```

Drive these through the real `#runTtmController` + presenter path against a `createSoftwareSurface` raster and assert pixels via `surface`'s pixel accessor.

- [ ] **Step 2: Run**

Run: `pnpm vitest run src/dgds/scripting/__tests__/shared-raster-regression.test.mjs`
Expected: PASS if Task 5 is correct; a FAIL localizes a remaining per-scene-surface leak.

- [ ] **Step 3: Commit**

```bash
git add src/dgds/scripting/__tests__/shared-raster-regression.test.mjs
git commit -m "test(dgds): regression coverage for frozen-frame and stale-clear glitches"
```

---

## Task 8: Regenerate and review golden frames

Golden pixels legitimately change: with a shared raster, `STORE_AREA`/`SAVE_IMAGE_REGION` now snapshot sibling pixels too (faithful to `eb2`), so campfire/overlap sequences move. Regenerate deliberately; do not blind-accept.

**Files:**
- Modify: `test/goldens/*` (regenerated), possibly `test/render-goldens.mjs` if it assumed per-scene layers.

- [ ] **Step 1: See current golden diffs** — Run: `pnpm test:golden` (requires `public/data/`). Expected: the four Johnny sequences differ.
- [ ] **Step 2: Regenerate** — Run: `pnpm test:golden:update`.
- [ ] **Step 3: Review each diff** — confirm each change is the intended shared-raster behavior (stopped scenes overwrite correctly; no per-scene-layer artifacts), not a regression. Record what changed and why in the commit body.
- [ ] **Step 4: Full suite** — Run: `pnpm test`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add test/goldens test/render-goldens.mjs
git commit -m "test(golden): regenerate goldens for shared-raster rendering (reviewed)"
```

---

## Task 9: Update architecture docs

**Files:**
- Modify: `docs/architecture.md` ("Frame composition" section), cross-link `docs/scrantic-re-findings.md`.

- [ ] **Step 1: Rewrite "Frame composition"** — one persistent host-owned raster; background re-baked at the ADS-tag boundary; GET/PUT save-under into the shared raster with environment-shared slots + one-tick-deferred secondary restore; no per-tick clear/recompose; z-order = mutable `ttmSequenceOrder` tick order; campfire branch-rearm remains ADS scheduling. Remove the per-scene-surface, retained-final-layer, and BEGIN_SCENE_FRAME-clear paragraphs.
- [ ] **Step 2: Check for stale references** — Run: `grep -n "per-scene surface\|retained.*layer\|sequencePaintIndex\|private working GET/PUT" docs/architecture.md`. Expected: no live matches (only clearly-marked historical notes).
- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: describe shared-raster frame composition"
```

---

## Self-Review

**Spec coverage (against `docs/scrantic-re-findings.md` Part A):**
- A.1 single shared raster → Tasks 3 (host-owned), 5 (scenes point at it). ✓
- A.2 overwrite-is-the-clear / no per-scene isolation → Task 5 (delete clone + BEGIN_SCENE_FRAME no-clear); Task 7 (regression). ✓
- A.2 background re-bake at transitions → Task 4 (helpers) + Task 5 step 6 (`clearAdsSceneBatch` prune-then-restore-via-STORE_AREA). ✓
- A.3 restore timing (age-0 immediate + one-tick deferral) → Task 2 helper, wired in Task 5 step 4 (gated). ✓
- A.4 z-order = execution order → Task 5 step 5 (tick sort) + Task 6 (MOVE_SEQUENCE_TO_BACK guard). ✓
- A.6 delete retained-final-layer + BEGIN_SCENE_FRAME clear → Task 5. ✓
- Keep campfire branch-rearm (B.5) → Global Constraints; untouched. ✓
- A.5 missed-tick burst → deliberately OUT OF SCOPE (documented). ✓

**Fable red-team mandatory fixes — where each is addressed:**
1. Content-addressed save-under instead of naive shared indexed slots → Task 2 builds the **full global rect-keyed aged registry** (chosen over the lighter guarded-slots option); Task 5 step 4 routes `SAVE_IMAGE_REGION`/`BEGIN_SCENE_FRAME` through it. The concurrency hazard is **eliminated by construction** (the rect is the key), not guarded — no per-script guard/escalation needed.
2. Host-owned raster + keep presenter retention/fading → Task 3 (host-owned) + Task 5 step 7 (retention/fading preserved). ✓
3. Bake re-anchored on `clearAdsSceneBatch` with env pruning → Task 4 + Task 5 step 6; `jumpToScene` prune included. ✓
4. Z-order unconditional by mutable `ttmSequenceOrder` + `MOVE_SEQUENCE_TO_BACK` test → Task 5 step 5 + Task 6. ✓
5. Deferred restore at START of next tick → Task 5 step 4 (`flushDeferredRestores` at `tick()` start). ✓
- Green-between-tasks → Tasks 1-4 additive; single declared flip in Task 5; contradicting `scene-factory.test.mjs`/`composition.test.mjs` rewritten inside Task 5. ✓
- Mechanical: no `createTtmScene` export (use `getSceneState`); `getCompositionRevision`→`surface.revision` (Task 1 bumps on `clear`/`replaceRegionFrom`); goldens need `public/data`. ✓

**Placeholder scan:** test helpers `makeAdsRuntime`/`makeTtmParent`/`makeTtmParent` and the pixel-assertion drives (Tasks 3, 5, 6, 7) reference the existing test-setup style in `runtime.test.mjs`/`scene-factory.test.mjs` — the executor builds them from those files' existing fixtures (a minimal ADS/TTM runtime with a `scenesRes` resource at index 1 and a `surface`). Every production-code change is literal with exact file:line targets.

**Type consistency:** `surface.revision` (Task 1) is read by `getCompositionRevision` (Task 5). `restoreSaveSlot`/`queueDeferredRestore`/`flushDeferredRestores` (Task 2) are the only save-under API, imported by `surface-frame-presenter.mjs` and `runtime.mjs` in Task 5. `bakeEnvironmentBackground`/`pruneEnvironmentBackground` (Task 4) imported by `script-runner.mjs`/`runtime.mjs` in Task 5. `sequencePaintIndex`/`moveSequenceToBack` are existing exports of `ttm-sequence-order.mjs`.

## Executor risks (flagged, not fully resolvable in a plan)

1. **Root-state linkage for the registry.** The rect-keyed registry lives on the root runtime state, but the presenter is handed the per-scene `state`. The executor must thread a reliable `state.root` (or pass the root into the presenter) so `registerSaveUnder`/`restoreSaveUnder` hit the one global stack. Confirm the scene→root reference in `getSceneState`/`createTtmRuntimeState` before wiring Task 5 step 4. (The collision hazard itself is gone — rect-keying makes concurrent same-`saveIndex` saves distinct by construction.)
2. **Deferred age-1 node may never fire** for Johnny's scripts (Task 2 gate). Keep it a no-op path unless a real secondary save is observed; do not synthesize one.
3. **STORE_AREA now snapshots sibling pixels** (shared raster) — this is faithful but is the reason goldens move; the Task 8 reviewer must expect campfire/overlap changes and verify them as correct, not regressions.
4. **`preserveInitialForeground` may be redundant** once the raster persists across events (host-owned). Leaving it in place is harmless; a follow-up can retire it after the regression suite confirms cross-event retention is carried by the persistent raster.

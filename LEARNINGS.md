# LEARNINGS

Discoveries, design decisions, and hard-won insights from reverse-engineering
and modernising the DGDS animation engine that powers _Castaway_ (the Johnny
adventure demo).

---

## Engine Architecture

### The Two-Tier Model: ADS → TTM

The engine has two layers that operate concurrently every animation frame.

**ADS (Animation Director Script)** is the high-level sequencer. One ADS
script runs at a time and steps through a list of _scenes_ in order. Each
scene is a slice of the ADS opcode stream delimited by `TAG` markers. The ADS
controls pacing (via `PLAY_SCENE` / `IF_PLAYED` gates), resource lists, and
transitions (fade, stop, random selection).

**TTM (Tiny Templated Movie)** is the per-frame animation layer. Each active
TTM _child scene_ owns a private canvas and `reentry` counter. On every
animation frame, `runScript` advances it one opcode-group until it hits
`UPDATE` (frame boundary), then suspends. The ADS compositor draws all live
TTM canvases on top of the background.

### requestAnimationFrame Game Loop

`mainloop` runs at 60 fps via `requestAnimationFrame`. Each tick:

1. `runScripts` runs the ADS opcode stream one step (until `continue` becomes
   false or the scene ends).
2. While `state.continue === false`, all active TTM child scenes each advance
   one frame.
3. Each TTM canvas is composited onto the main canvas.
4. A fade overlay is drawn last if `state.fadingOut === true`.

### `state.continue` as the Execution Gate

`state.continue` is the shared pause/resume flag. Setting it to `false` inside
a callback suspends the ADS script until the callback (or a subsequent frame)
sets it back to `true`. TTM child scenes run _while_ `continue === false`. This
is how `PLAY_SCENE` blocks the ADS until all spawned TTMs have completed their
first loop.

### Scene Lifecycle

TTM child scenes go through these states:

| State | Meaning |
|-------|---------|
| `'active'` | just added via `ADD_SCENE`, has not completed a loop yet (`runs === 0`) |
| `'running'` | completed at least one loop (`runs > 0`), still animating |
| `'completed'` | `played === true` for this cycle |

`PLAY_SCENE` blocks only on `'active'` scenes. This prevents early
advancement before the first frame of a new animation plays.

---

## Binary Format Insights

### ADS Resource Block (RES)

The ADS binary begins with three un-compressed header blocks: `VER`, `ADS`,
`RES`. The `RES` block lists all TTM files used by this script. Each entry is:

```
uint16  id    — non-sequential ID, used as the index key for ADD_SCENE params
string  name  — null-terminated filename, e.g. "MJREAD.TTM"
```

For `ACTIVITY.ADS` the IDs are **1, 2, 4, 5, 6, 7** (note the gap at 3 — no
resource 3 exists). The engine stores TTMs at `state.scenesRes[r.id]` so
`ADD_SCENE 4 110` correctly looks up `state.scenesRes[4]` = `MJREAD.TTM`.

**Critical**: do NOT use sequential array position for the index. Always use
`r.id` directly. Early versions indexed by position, which shifted MJBATH.TTM
to slot 4 and broke all `ADD_SCENE 4 *` references.

### ADS Script Block (SCR)

The `SCR` block is LZW-compressed. After `VER`/`ADS`/`RES`, the parser
decompresses the opcodes into a `DataView` and continues parsing. The `TAG`
block (after SCR) names each scene tag.

### TTM Scene Layout

The TTM opcode stream is a flat sequence delimited by `SET_SCENE` opcodes
(opcode `0x1110`). The parser (`ttm.mjs`) splits the stream into
`scenes: [{ tagId, script }]`. The first entry has `tagId = 0` (prologue —
loads palettes, sprites, backgrounds). Subsequent entries are individual
animation clips.

Scene lookup: `scenes.find(s => s.tagId === tagId)`.

### GOTO is Always a Self-Loop in MJREAD.TTM

Every `GOTO` in `MJREAD.TTM` targets the same tag the script belongs to:

- `GOTO 25` inside tag 25 "john sleep"
- `GOTO 113` inside tag 113 "flip pages"
- `GOTO 112` inside tag 112 "gull book"
- `GOTO 82` inside tag 82 "johnny mad"

The implementation restarts the current scene's script from index 0, which is
correct for all observed self-loops. If cross-tag GOTOs are ever needed, the
handler would need to switch the scene's `script` reference and reset `reentry`.

### PLAY_SCENE_2 is ADD_SCENE + PLAY_SCENE Combined

`PLAY_SCENE_2` (opcode `0x1520`) encodes an `ADD_SCENE` opcode as its first
parameter:

```
PLAY_SCENE_2  8197  4  22  0  1
             └────┘ └──────────┘
              0x2005 = ADD_SCENE  ADD_SCENE args
```

It is shorthand for "add this scene and immediately block waiting for it."
Before this was implemented, the MUNDANE JOHN READ gag silently skipped adding
scene 4:22 ("read").

### Resource File Layout

`RESOURCE.MAP` is a compact index of `RESOURCE.001` entries:
- MAP header: 6 bytes (byte 4 = number of resource volumes)
- Per volume: 12-char name + null + uint16 numEntries = 15 bytes
- Per entry in MAP: uint16 uncompressed size + uint32 offset into .001 = 8 bytes
- Per entry in .001: 12-char name + null + uint32 compressedSize + data

The entry `data` view starts 17 bytes after the entry's offset in `.001` (skipping the name header).

---

## Bugs Found and Fixed

### 1. Background Regression (commit ~ac6bbff, prior sessions)

**Symptom**: Background rendered as solid black; only active sprites visible.

**Root cause**: Background was drawn from `state` (the ADS root state), which
never runs a `LOAD_SCREEN` opcode — that only runs in TTM child scenes.

**Fix**: In `runScripts`, find the first child scene that has a loaded
`bkgScreen` and use its state for `drawBackground`:
```js
const bgState = state.scenes.find(s => s?.state?.bkgScreen)?.state ?? state;
```

### 2. Permanent Black Screen After Fade-Out (commit ac6bbff)

**Symptom**: After the first fade-to-black, the screen never recovered.

**Root cause**: The `fadingOut` clear condition included `&& state.continue`:
```js
if (state.fadingOut && state.fadeOpacity >= 1 && state.continue) { ... }
```
But `END` sets `state.continue = false` before `runScripts` could evaluate
this condition, so it always evaluated to false and the overlay was never
removed.

**Fix**: Remove the `&& state.continue` guard. Clear `fadingOut`
unconditionally after drawing the fully-black frame:
```js
if (state.fadeOpacity >= 1) {
    state.fadingOut = false;
}
```

### 3. `s is undefined` TypeError in runScripts (prior session)

**Symptom**: `Uncaught TypeError: can't access property "state", s is undefined`
in `runScripts`.

**Root cause**: `state.scenes.forEach` iterated while `state.scenes` could
contain `undefined` slots (e.g. from a failed `getSceneState`).

**Fix**: Guard `getSceneState` return value — if `undefined`, don't push to
`scenes`. Also null-check child scene iteration.

### 4. ADD_SCENE Failed for Resource 4 (MJREAD.TTM)

**Symptom**: Console errors `add failed script 4 110 undefined` (and 113, 98).

**Root cause**: Early code indexed `state.scenesRes` by array position (0,1,2…)
instead of by the binary `r.id` (1,2,4,5,6,7). This put MJBATH.TTM (binary
id=5, sequential position 3→slot 3) at the wrong offset, placing MJBATH where
MJREAD should be at slot 4.

**Fix**: Use `state.scenesRes[r.id]` — already in place in current code.

### 5. PLAY_SCENE_2 Was a No-Op

**Symptom**: MUNDANE JOHN READ gag's "read" animation (scene 4:22) never
started.

**Root cause**: `PLAY_SCENE_2` stub did nothing.

**Fix**: Implemented as ADD_SCENE (sceneIdx, tagId, retriesDelay, unk) +
PLAY_SCENE — the first parameter is the embedded ADD_SCENE opcode (0x2005 =
8197), followed by the standard ADD_SCENE arguments.

### 6. Completed Scenes Re-Run Every Frame (fixed this session)

**Symptom**: `TTM done: 1:12(LOAD SHAPES)` and `TTM done: 1:11(FREE SHAPES)`
appearing **once per frame** throughout the session (1000+ times in a
2725-line debug log), causing visual glitching because `FREE SHAPES`
re-runs `DRAW_BACKGROUND` (clearing sprites) on every frame.

**Root cause**: `runScripts` called `runScript` on every scene in
`state.scenes` regardless of `lifecycle`. Scenes with `played=true`
(completed) had their `reentry` reset to 0 after end-of-script, so they
started again on the next frame. Short scenes with no `UPDATE` (like
`LOAD SHAPES`) completed in a single tick; scenes with `UPDATE` as the
last command (like `FREE SHAPES`) took two ticks (one to set the delay,
one to fire). Both looped forever.

**Fix** (`process.mjs`): Skip `runScript` for scenes where
`lifecycle === 'completed'`. Still draw their last frame and tick their
timers:
```js
if (s.lifecycle !== 'completed') {
    runScript(s.state, s.script);
    if (s.state.played) { s.lifecycle = 'completed'; }
    else if (s.state.runs > 0) { s.lifecycle = 'running'; }
}
if (s.state.timer > 0) { ... }  // always tick timers
```

### 7. GOTO Was a Silent No-Op (fixed this session)

**Symptom**: Animation scenes that use `GOTO` (looping animations like
"flip pages", "john sleep", "gull book", "johnny mad") would complete
after a single pass instead of looping. No observable crash, but all
looping animations in `MJREAD.TTM` would play once and freeze.

**Root cause**: `GOTO` callback set `state.reentry = 0`, but immediately
after the callback returned, the `runScript` for-loop ran:
```js
state.reentry = i;  // ← overwrote GOTO's reentry=0 with the GOTO command's own index
```
If GOTO was the last command (`i === script.length - 1`), the end-of-script
check fired: `played=true`, `reentry=0`, `runs++`. The scene then sat in
`state.scenes` with `played=true`, appearing 'completed' after one pass.

**Fix** (`script-runner.mjs`):
1. `GOTO` sets `state.gotoRestart = true; state.continue = false; state.runs++;`
   instead of `state.reentry = 0`. The flag survives the `state.reentry = i`
   overwrite.
2. At the **top** of `runScript` (before the for-loop): if `gotoRestart` is set,
   clear it, reset `reentry = 0`, and restore `continue = true` so the fresh run
   isn't blocked.
3. End-of-script condition gates on `!state.gotoRestart` to prevent a GOTO that
   is the last command from falsely completing the script on the same frame.

**Interaction with Bug 6**: Both fixes must be applied together. Fixing "skip
completed scenes" without fixing GOTO would cause looping animations to play
once and freeze (they'd still reach `played=true` since GOTO was broken). With
both fixes: GOTO-looping scenes loop indefinitely until `STOP_SCENE` removes
them, and single-play scenes complete once and freeze on their last frame.



### Phase 3 Extraction Order

The monolithic `process.mjs` was split into focused modules. The extraction
order mattered: extracting `SceneRegistry` first (as originally planned) would
have created circular dependencies because lifecycle transitions happen in
`runScripts`, not in the queue logic. Correct order:

1. `script-runner.mjs` — execution contract (`runScript`, dispatch tables)
2. `scene-factory.mjs` — scene object factory (`getSceneState`, `initialState`)
3. `frame-renderer.mjs` — canvas compositing primitives
4. `process.mjs` — thin coordinator (mainloop, resource loading)

### Scene State: Shared vs. Fresh Fields

When a TTM child scene is created (`getSceneState`), some fields are shared
from the first sibling scene (to share loaded assets), others are fresh:

**Shared** (from first sibling): `res`, `bkgScreen`, `bkgRes`, `bkgRaft`,
`bkgOcean`, `saveBkg`, `save`, `tmpContext`, `foregroundColor`,
`backgroundColor`.

**Fresh per scene**: `reentry`, `played`, `runs`, `continue`, `context`
(each scene gets its own canvas).

**From ADS state** (base): `audioManager`, `entries`, `island`, `scenesRes`,
`data`.

### ADS Two-Part END Structure

Each ADS gag tag has **two** `END` opcodes:

1. The first `END` (non-last command): toggles `state.continue` (intermediate
   gate, used after `FADE_OUT`).
2. The second `END` (last command, `state.lastCommand = true`): triggers
   batch-clear of all child scenes and advances `currentScene++`.

`FADE_OUT` always appears before the first `END`.

### Dev-Mode Debug Logging

`isDebugMode` is evaluated once at module load:

```js
export const isDebugMode = (() => {
    try {
        return window.location.hostname === 'localhost' ||
               window.location.hostname === '127.0.0.1' ||
               new URLSearchParams(window.location.search).has('debug');
    } catch { return false; }
})();
```

In production, `debugLog` is a no-op (zero cost). In dev mode (localhost or
`?debug`), it prefixes messages with `[DGDS]`.

---

## Known Remaining Stubs

| Opcode | Handler | Status |
|--------|---------|--------|
| `SAVE_REGION` | no-op | deferred |
| `RESTORE_REGION` | no-op | deferred |
| `FADE_IN` | no-op (TTM) | deferred |
| `SAVE_BACKGROUND` | no-op | deferred |
| `SET_FRAME1` | no-op | deferred |
| `AND` / `OR` | no-op | deferred |
| GOTO (cross-tag) | falls back to self-restart | self-loops work; cross-tag not tested |

---

## Open Questions

- Do cross-tag GOTO calls exist in any other TTM file? MJREAD.TTM only uses
  self-loops. If cross-tag GOTOs exist elsewhere, the GOTO handler needs
  to switch the scene's active `script` reference.
- What does the ADS `adsUnknown01` / `adsUnknown02` header field do?
  (Values seen: 1199 / 32768 in ACTIVITY.ADS.)
- What is resource id=3 that is _absent_ from ACTIVITY.ADS? Possibly a
  resource that was removed during development.
- `PLAY_SCENE` blocks on `'active'` scenes. Should it also block on
  `'running'` scenes in some contexts? The current behaviour matches the
  observed sequencing in dev console output.

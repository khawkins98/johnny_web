# johnny_web — Architecture

> **Audience:** A JavaScript developer who is new to this codebase and to the DGDS engine format. No prior knowledge of the original screensaver is assumed.

---

## 1. Overview

`johnny_web` is a browser-native reimplementation of the *Johnny Castaway* animated screensaver (1992, Dynamix/Sierra On-Line). The original ran on DOS and Windows 3.1 using the **Dynamix Game Development System (DGDS)** engine. This project reads the proprietary binary resource files from the original floppy disk image, parses them entirely in JavaScript, and renders the animation on an HTML5 Canvas.

The project does **not** include any original game data — users must supply their own copy of the floppy disk image (freely available on the Internet Archive). A Node.js extraction script (`npm run extract`) automates the pipeline from the Archive.org ZIP to the three game files the browser needs: `RESOURCE.MAP`, `RESOURCE.001`, and `SCRANTIC.SCR`.

This is a working but incomplete implementation. Several opcodes are stubs, multiple known bugs affect scene sequencing, and the audio system uses hardcoded byte offsets tied to a specific version of the game data. The "Known bugs and limitations" section is mandatory reading before touching `process.mjs`.

---

## 2. Repository layout

```
johnny_web/
├── index.html                  # Single page: two canvases + two overlay divs
├── vite.config.js              # Vite config; VITE_BASE_PATH controls deploy prefix
├── package.json                # Scripts: dev | build | preview | extract | dump
├── src/
│   ├── index.mjs               # Entry point: imports run() from scrantic/main.mjs
│   ├── extract.mjs             # CLI tool: ZIP → floppy image → public/data/
│   ├── scrantic/               # High-level game logic (orchestration layer)
│   │   ├── main.mjs            # run(): resource fetch, error handling, play loop
│   │   ├── story.mjs           # Story class: picks random scene, calls startProcess
│   │   ├── palette.mjs         # Hardcoded 16-colour EGA palette (PALETTE[])
│   │   └── metadata/
│   │       ├── scenes.mjs      # StoryScenes[]: 10 scene descriptors for ACTIVITY.ADS
│   │       └── types.mjs       # FlagType, PointType, HeadingType enums
│   └── dgds/                   # Low-level DGDS engine implementation
│       ├── resource.mjs        # RESOURCE.MAP + RESOURCE.001 parser; dispatch to loaders
│       ├── graphics.mjs        # drawImage / drawScreen helpers (pixel object → ImageData)
│       ├── audio.mjs           # Web Audio manager; sampleOffsets[]; AudioContext factory
│       ├── compression.mjs     # Dispatch table: None / RLE / LZW / RLE2
│       ├── compression/
│       │   ├── rle.mjs         # DGDS RLE decompressor
│       │   ├── lzw.mjs         # DGDS LZW decompressor (non-standard variant)
│       │   └── rle2.mjs        # Stub; throws on call (no known files use this type)
│       ├── data/
│       │   └── scripting.mjs   # TTMCommandType[] and ADSCommandType[] opcode tables
│       ├── resources/
│       │   ├── ads.mjs         # ADS (Animation Director Script) parser
│       │   ├── bmp.mjs         # BMP sprite sheet parser
│       │   ├── pal.mjs         # PAL (VGA palette) parser
│       │   ├── scr.mjs         # SCR (background screen) parser
│       │   └── ttm.mjs         # TTM (Tiny Templated Movie) script parser
│       ├── scripting/
│       │   └── process.mjs     # Engine core: opcode interpreter, rAF loop, all state
│       └── utils/
│           └── string.mjs      # getString(): DataView → null-terminated ASCII string
├── docs/
│   ├── architecture.md         # This file
│   └── resindex.md             # RESOURCE.MAP format reference (partial, original spec)
└── public/
    └── data/                   # Game data (not committed; populated by npm run extract)
        ├── RESOURCE.MAP        # Asset index file
        ├── RESOURCE.001        # Asset data blob
        └── SCRANTIC.SCR        # Audio sample data
```

---

## 3. Startup flow

1. **`index.html` loads** — declares two stacked `<canvas>` elements (`#mainCanvas` z-index 0, `#canvas` z-index 1) and two hidden overlay `<div>`s (`#start-overlay`, `#data-error`). Includes `src/index.mjs` as a `type="module"` script.

2. **`src/index.mjs`** immediately calls `run()` from `scrantic/main.mjs`.

3. **`main.mjs: run()`** fetches `data/RESOURCE.MAP` and `data/RESOURCE.001` in parallel via `Promise.all`. Missing files are detected by checking the HTTP status and `Content-Type` (Vite's dev server returns `text/html` for non-existent paths rather than a 404). On failure, the `#data-error` overlay is shown and execution halts.

4. **`loadResources()`** parses both files synchronously into a resource index (see §6).

5. The intro screen (`INTRO.SCR`) is decoded and drawn to `#mainCanvas` immediately — this is the first visible output.

6. **`waitForStart()`** shows the `#start-overlay` (▶ Play button) and returns a `Promise` that resolves only after the user clicks.

7. **Inside the click handler** (still synchronous relative to the user gesture): `createAudioManager()` constructs a new `AudioContext`. This **must** happen synchronously in the click handler; constructing `AudioContext` after any `await` loses the browser's user-activation context and the audio will be blocked.

8. **`story.play(audioManager)` is called in an infinite `while(true)` loop.** Each call picks a random scene from `StoryScenes`, loads the corresponding `ACTIVITY.ADS` entry, and calls `startProcess()`. The promise resolves when `state.onComplete()` fires at the end of the scene, at which point the loop iterates for the next scene.

```
page load
  └─ run()
       ├─ fetch RESOURCE.MAP + RESOURCE.001  (parallel)
       │    └─ on error → show #data-error
       ├─ loadResources()
       ├─ drawScreen(INTRO.SCR, mainContext)
       ├─ waitForStart()  →  [user clicks]
       │    └─ createAudioManager()   ← must be synchronous in click handler
       └─ while(true)
            └─ story.play(audioManager)
                 └─ startProcess({ type:'ADS', data, ... })
                      └─ rAF mainloop → onComplete → next iteration
```

---

## 4. Rendering model

The page contains two `<canvas>` elements, both 640 × 480 px, absolutely positioned and stacked:

| Canvas | ID | z-index | What is drawn |
|---|---|---|---|
| Background | `#mainCanvas` | 0 | Ocean, island, palm trees, clouds, raft — the static scene environment |
| Foreground | `#canvas` | 1 | Animated sprite layer — cleared each frame, sprites composited on top |

`drawBackground()` in `process.mjs` renders the background layer. It picks a random ocean variant (`OCEAN00.SCR`–`OCEAN02.SCR`, or `NIGHT.SCR`), composites the island (`BACKGRND.BMP` sprite sheet), palm trees, raft (`MRAFT.BMP`), and an animated cloud drawn from a randomly chosen frame in `BACKGRND.BMP`. The cloud moves left one pixel at a time, driven by wall-clock time via `Date.now()` (not the frame-delta tick — see §12 bug 12).

The background layer is only redrawn when a `DRAW_BACKGROUND` opcode executes. The foreground layer is cleared at the start of every rAF tick via `clearContext(state.context)`.

A third level of compositing exists in theory: the `save[]` and `saveBkg[]` slot arrays were designed to capture and restore rectangular screen regions (for score overlays and partial-screen compositing). In practice `SAVE_IMAGE_REGION` is commented out and `state.save[]` is never populated, making this layer a no-op (see §12 bug 5).

Each child TTM scene also renders into its own off-screen `<canvas>` (created dynamically in `getSceneState()`). After the child scenes run, their canvases are composited onto the foreground layer via `context.drawImage(s.state.context.canvas, 0, 0)`.

An additional off-screen `tmpContext` canvas (640 × 480) is used as a scratch surface: `drawImage()` blits a pixel-object array into it, then `context.drawImage()` copies the relevant region to the visible canvas. This indirection is necessary because `putImageData` does not respect the canvas clipping region.

---

## 5. Game data extraction

The original Johnny Castaway files are not redistributable and are not committed to this repository. The `npm run extract -- "<path-to-zip>"` script automates the full extraction pipeline.

**Prerequisites:** `unzip` (system), `mtools` (system — `mcopy`/`mdir`), `node-pkware` (npm dependency).

**Pipeline:**

```
Archive.org ZIP
  └─ unzip -j
       └─ *.ima  (FAT12 1.44 MB floppy disk image)
            └─ mcopy i:RESOURCE.MAP   → RESOURCE.MAP     (no compression)
               mcopy i:SCRANTIC.SC$   → SCRANTIC.SC$     (TSComp archive)
               mcopy i:RESOURCE.00$   → RESOURCE.00$     (TSComp archive)
                    └─ decompressTSComp() (node-pkware: PKWARE DCL Implode)
                         ├─ SCRANTIC.SCR   → public/data/SCRANTIC.SCR
                         └─ RESOURCE.001   → public/data/RESOURCE.001
RESOURCE.MAP copied as-is → public/data/RESOURCE.MAP
```

**TSComp format** (magic bytes `65 5D 13 8C`):

| Offset | Field |
|---|---|
| 0–3 | Magic: `0x65 0x5D 0x13 0x8C` |
| 4–7 | Version/flags |
| 8–11 | File count (uint32 LE) |
| 12–27 | Per-archive metadata (unused by the extractor) |
| 28 | Original filename length (uint8) |
| 29…28+len | Original filename (ASCII, null-terminated) |
| 29+len+1… | PKWARE DCL Implode compressed stream |

The `decompressTSComp()` function slices off the header, passes the compressed stream through `node-pkware`'s `explode()` transform, and writes the result to `public/data/`.

The floppy disk uses the `.SC$` and `.00$` suffixes (dollar sign) for compressed files — a convention used by various Sierra/Dynamix game distributors to pack files onto limited-capacity disks.

---

## 6. Resource pipeline

`RESOURCE.MAP` is the index. `RESOURCE.001` is the data blob. Together they implement a simple indexed asset store.

### RESOURCE.MAP structure

```
Header (6 bytes):
  u8  unk0
  u8  unk1
  u8  unk2
  u8  unk3
  u8  numResources   ← number of resource files (always 1 for Johnny Castaway)
  u8  unk5

For each resource file (15 bytes):
  char[12]  name           ← e.g. "RESOURCE.001"
  u8        unk
  u16 LE    numEntries     ← number of assets in this file

For each entry (8 bytes, read in parallel with RESOURCE.001):
  u16 LE    uncompressedSize
  u16       (unknown)
  u32 LE    offset         ← byte offset of this entry in RESOURCE.001
```

### RESOURCE.001 entry structure

At each `offset` read from RESOURCE.MAP:

```
char[12]  name              ← e.g. "BACKGRND.BMP", "ACTIVITY.ADS"
u8        unk
u32 LE    compressedSize
byte[]    compressedData    ← compressedSize bytes of payload
```

The entry type is the file extension of `name` (e.g. `BMP`, `ADS`, `TTM`). `loadResources()` in `resource.mjs` builds an `entries[]` array for the single resource file. Callers use `resource.loadEntry(name)` which calls `loadResourceEntry(entry)`, which looks up the matching loader in the `ResourceType` dispatch table:

| Extension | Loader | Description |
|---|---|---|
| `ADS` | `ads.mjs` | Animation Director Script — high-level sequencer |
| `BMP` | `bmp.mjs` | Sprite sheet — multiple indexed-color frames |
| `PAL` | `pal.mjs` | VGA palette — 256 RGB entries |
| `SCR` | `scr.mjs` | Background screen — single full-screen image |
| `TTM` | `ttm.mjs` | Tiny Templated Movie — per-frame animation script |

Each loader receives the raw entry (including the compressed payload buffer) and is responsible for invoking the decompressor before parsing the type-specific block structure.

---

## 7. Compression

All four types share a single dispatch table in `compression.mjs`. The compression type byte is embedded in each resource block header (one byte, value 0–3).

| Index | Name | Callback | Status |
|---|---|---|---|
| 0 | None | `null` (data passed through) | Implemented |
| 1 | RLE | `decompressRLE` | Implemented |
| 2 | LZW | `decompressLZW` | Implemented |
| 3 | RLE2 | `decompressRLE2` | **Stub — throws** |

### RLE (`compression/rle.mjs`)

Each byte is a control byte:

- High bit set (`0x80`): run-length sequence. The lower 7 bits are the repeat count; the next byte is the value to repeat.
- High bit clear: literal sequence. The value itself is the count of literal bytes that follow.

Returns a plain `number[]` array of decoded bytes.

### LZW (`compression/lzw.mjs`)

A DGDS-specific LZW variant. Key differences from standard LZW:

- Code `256` is the clear/reset signal (not an end-of-data marker).
- After a reset, `freeEntry` is set to 256, so the first post-reset entry occupies slot 256. This is non-standard.
- Initial code width is 9 bits; it grows up to 12 bits as `freeEntry` exceeds the current power-of-two threshold.
- Bits are read LSB-first across byte boundaries via a rolling `current` byte + `nextBit` cursor.
- The entire main loop is wrapped in a `try/catch`. Any error (including malformed input) is swallowed silently, returning whatever partial output was decoded. Callers cannot detect truncation.

### RLE2

No known Johnny Castaway files use this type. The slot is reserved and calling it throws immediately.

---

## 8. ADS format

ADS (**Animation Director Script**) files are the high-level sequencers. A single ADS file (`ACTIVITY.ADS`) coordinates all Johnny Castaway scenes.

### Block structure

Blocks are read in strict order (the parser throws on any unexpected block tag):

```
VER block
  char[3]  "VER"
  u32      (padding/size)
  char[n]  version string  (e.g. "4.09")

ADS block
  char[3]  "ADS"
  u8       (padding)
  u16      unk01
  u16      unk02

RES block                           ← TTM resources used by this ADS
  char[3]  "RES"
  u8       (padding)
  u32      blockSize
  u16      numResources
  for each resource:
    u16    id
    char[] name (null-terminated)   ← e.g. "ACTIVITY.TTM"

SCR block                           ← main ADS opcode stream
  char[3]  "SCR"
  u8       (padding)
  u32      blockSize
  u8       compressionType          ← 0=None, 1=RLE, 2=LZW
  u32      uncompressedSize
  byte[]   compressedOpcodes

TAG block                           ← named scene boundaries
  char[3]  "TAG"
  u8       (padding)
  u32      tagSize
  u16      numTags
  for each tag:
    u16    id
    char[] description (null-terminated)
```

### Opcode encoding

ADS opcodes are 16-bit values, each followed by a fixed number of 16-bit signed integer parameters. The parameter count is defined statically in `ADSCommandType[]` in `data/scripting.mjs` — there is no per-opcode encoding of parameter count (unlike TTM; see §9).

Opcodes with a value ≤ `0x100` are treated as **tag boundary markers** rather than commands. Their 16-bit value is matched against the TAG block's `id` fields to identify which named scene section begins.

### Scene model

After parsing, the opcode stream is split into `scenes[]` by tag boundary opcodes. Each element is `{ tagId, script[] }`. Index 0 holds any commands before the first tag opcode (a global prologue). The engine in `process.mjs` iterates `scenes[]` in order, running one scene at a time via `runScript()`.

**Bug:** The last scene's commands are accumulated in `sceneScripts` but never pushed into `scenes[]`. The final tagged section of any ADS file never runs. See §12.

---

## 9. TTM format

TTM (**Tiny Templated Movie**) files are the per-frame animation scripts — sequences of opcodes that draw sprites, play audio, set delays, and define frame boundaries.

### Block structure

```
VER block
  char[3]  "VER"
  u32      (padding/size)
  char[n]  version string  (e.g. "4.09")

PAG block
  char[3]  "PAG"
  u8       (padding)
  u32      numPages
  u16      unk02

TT3 block                           ← main TTM opcode stream
  char[3]  "TT3"
  u8       (padding)
  u32      blockSize
  u8       compressionType          ← 0=None, 1=RLE, 2=LZW
  u32      uncompressedSize
  byte[]   compressedOpcodes

TTI block
  char[3]  "TTI"
  u8       (padding)
  u16      unk01
  u16      unk02

TAG block                           ← named scene boundaries
  char[3]  "TAG"
  u8       (padding)
  u32      tagSize
  u16      numTags
  for each tag:
    u16    id
    char[] description (null-terminated)
```

### Opcode encoding

Each raw TTM opcode is a 16-bit value with embedded parameter metadata:

```
raw = data.getUint16(offset)
paramCount  = raw & 0x000f    ← lower 4 bits
opcode      = raw & 0xfff0    ← upper 12 bits (canonical opcode)
```

The parameter count controls how many 16-bit signed integers follow (consumed by the parser). Exception: if `paramCount === 15`, the parameter is a null-terminated ASCII string rather than a sequence of integers.

Special case: `opcode 0x1110` (`SET_SCENE`) always reads one 16-bit tag ID that locates the start of a named scene boundary in the TAG block. This opcode marks scene transitions within the TTM stream.

### Scene model

The parser splits the opcode stream into `scenes[]` at every `SET_SCENE` (0x1110) opcode. Each element is `{ tagId, script[] }`. The first scene (tagId 0) holds the global prologue commands before the first `SET_SCENE`. Unlike ADS, the trailing scene after the last `SET_SCENE` is correctly pushed (the loop's final `scenes.push()` call is unconditional).

---

## 10. Process engine

`src/dgds/scripting/process.mjs` is the engine core. It interprets both ADS and TTM opcodes using a single `requestAnimationFrame` loop.

### Module-level state

All runtime state is module-level (not instance-based). There is exactly one active process at a time. Calling `startProcess()` replaces any running process by resetting all module globals and cancelling the previous rAF registration.

Key globals:

| Variable | Purpose |
|---|---|
| `state` | Current process state object (see below) |
| `currentScene` | Index into `state.data.scenes[]` for the active ADS scene |
| `scenesRes[]` | Parsed TTM resources loaded from `data.resources` at startup |
| `scenes[]` | Active child TTM scenes (run concurrently each frame) |
| `addScenes[]` | Buffer: TTM scenes staged to start next PLAY_SCENE tick |
| `removeScenes[]` | Buffer: TTM scenes staged to stop next PLAY_SCENE tick |
| `bkgScreen`, `bkgRes`, `bkgOcean[]`, `bkgRaft` | Cached background assets (survive across scenes; reset on `startProcess`) |

### State object

`startProcess()` constructs `state` by spreading caller-supplied fields over a set of defaults:

```js
{
  data,          // parsed ADS or TTM resource
  type,          // 'ADS' or 'TTM'
  context,       // CanvasRenderingContext2D for #canvas (sprites)
  mainContext,   // CanvasRenderingContext2D for #mainCanvas (background)
  tmpContext,    // off-screen scratch canvas context
  entries,       // full resource entry list (for on-demand asset loading)
  audioManager,  // Web Audio manager
  save[],        // 3 off-screen canvases for region capture (currently unused)
  saveBkg[],     // 1 off-screen canvas for background region restore
  res[],         // slot-indexed BMP resources (loaded via SLOT_IMAGE + LOAD_IMAGE)
  slot,          // active BMP slot (set by SLOT_IMAGE)
  reentry,       // program counter: index into current script[]
  continue,      // execution gate: false = pause this frame
  delay,         // current delay in ms (set by SET_DELAY)
  elapsed,       // absolute timestamp when current UPDATE delay expires
  timer,         // timer value (set by SET_TIMER; never consumed — see §12)
  island,        // 0=no island, 1=island at x=288, 2=island at x=16
  foregroundColor, backgroundColor,  // PALETTE[] entries for drawing
  clip,          // clipping rectangle { x, y, width, height }
  played,        // true once the script has run to completion
  runs,          // number of times this script has run to completion
  frameId,       // rAF handle for cancellation
  onComplete,    // callback fired when the process ends
}
```

### Program counter and execution gate

`runScript(state, script)` iterates `script[]` starting at `state.reentry`:

1. Calls the opcode's callback function with `(state, ...params)`.
2. After each call, sets `state.reentry = i` (so execution can resume at this opcode next frame).
3. If `state.continue` becomes `false`, breaks out of the loop immediately. The next rAF tick will resume from `state.reentry`.
4. When `state.reentry` reaches `script.length - 1`, the script is marked complete: `state.played = true`, `state.runs++`, `state.reentry = 0` (reset to start). If this was the main ADS script, `currentScene++` advances to the next scene.

The `UPDATE` opcode is the primary way scripts pause. When hit:
- First call: sets `state.continue = false` and records `state.elapsed = Date.now() + state.delay`.
- Subsequent calls (same frame or future frames): no-op until `Date.now() > state.elapsed`, at which point `state.continue = true` and the loop continues.

### ADS scene loop

`runScripts()` manages the ADS top-level loop:

1. Clears the foreground canvas.
2. If `state.island` is set, calls `drawBackground()` to redraw the background.
3. Calls `runScript(state, data.scenes[currentScene].script, true)` (the `true` flag marks it as the main script, enabling `currentScene++` on completion).
4. If `state.continue` is `false` (UPDATE delay active), also ticks all child TTM scenes: `scenes.forEach(s => runScript(s.state, s.script))`.
5. Composites child scene canvases onto the foreground canvas.
6. Returns `true` when all scenes are exhausted and `scenes` is empty, signalling the rAF loop to stop and call `onComplete()`.

### Child scene concurrency (ADD_SCENE / PLAY_SCENE / STOP_SCENE)

ADS opcodes can spawn TTM clips as concurrent child scenes:

- **`ADD_SCENE` (0x2005):** Pushes a `{ sceneIdx, tagId, retriesDelay, unk }` record into `addScenes[]`. If `state.randomize` is set (inside a `RANDOM_START`…`RANDOM_END` block), pushes into `scenesRandom[]` instead.
- **`PLAY_SCENE` (0x1510):** Flushes `addScenes[]` into `scenes[]` (via `getSceneState()`) and `removeScenes[]` removes departed scenes. Sets `state.continue = false` until all active scenes have `runs > 0`.
- **`STOP_SCENE` (0x2010):** Pushes a record into `removeScenes[]` for deferred removal at the next `PLAY_SCENE`.

`getSceneState()` constructs a child state object per scene:
- Looks up the TTM resource by `sceneIdx - 1` in `scenesRes[]` (1-based index).
- Finds the matching `tagId` scene in the TTM's `scenes[]`.
- Creates a new off-screen 640 × 480 canvas.
- Initialises a fresh `state` inheriting context from the parent.

### Opcode dispatch

Both TTM and ADS opcodes are dispatched through a single `CommandType[]` array. `CommandType.find(ct => ct.opcode === c.opcode)` returns the first match.

**Bug:** Several ADS opcodes have values that collide with TTM opcode values already earlier in the array. Those ADS entries are unreachable:

| ADS opcode | Value | Shadowed by |
|---|---|---|
| `STOP_SCENE` | `0x2010` | `SET_FRAME1` (TTM) |
| `ADS_FADE_OUT` | `0xF010` | `LOAD_SCREEN` (TTM) — `0xf010 === 0xF010` in JS |
| `ADS_UNKNOWN_6` | `0x4000` | `SET_CLIP_REGION` (TTM) |

The fix is to maintain separate TTM and ADS dispatch tables and select the appropriate one based on `state.type`.

### Main animation loop

```js
const mainloop = () => {
    state.frameId = requestAnimationFrame(mainloop);
    tick = Date.now();
    elapsed = tick - prevTick;
    if (elapsed > fps) {
        prevTick = tick - (elapsed % fps);
    }
    if (runScripts()) {
        cancelAnimationFrame(state.frameId);
        state.onComplete();
    }
};
```

Target is 60 fps (`fps = 1000 / 60`). The frame delta is computed but only used to adjust `prevTick` for catch-up — scripts do not receive the delta and use `Date.now()` for their own timing (`UPDATE`, cloud movement).

---

## 11. Audio

### AudioContext lifecycle

`createAudioManager()` in `src/dgds/audio.mjs` constructs an `AudioContext` and returns a manager object. This must be called synchronously inside a browser user-gesture handler (the `#start-btn` click) to satisfy the autoplay policy.

The manager exposes one method: `getSoundFxSource()`, which returns a single shared sound-effects source object. The source object wraps a `createBufferSource()` node, a `GainNode`, and an allpass `BiquadFilterNode` (the filter is type `allpass` — it has no audible effect and appears to be placeholder for future equalisation).

### Sample storage and loading

Audio data is embedded in `SCRANTIC.SCR` as raw audio blocks. There is no separate index — `sampleOffsets[]` in `audio.mjs` hardcodes the byte offset of each sample:

```js
export const sampleOffsets = [
    -1,           // index 0: no sample
    0x1DC00, 0x20800, 0x20E00,
    0x22C00, 0x24000, 0x24C00,
    0x28A00, 0x2C600, 0x2D000,
    0x2DE00,
    -1,           // index 11: no sample
    0x34400, 0x32E00,
    0x39C00, 0x43400, 0x37200,
    0x37E00, 0x45A00, 0x3AE00,
    0x3E600, 0x3F400, 0x41200,
    0x42600, 0x42C00, 0x43400
];
```

These offsets are calibrated for Johnny Castaway **v1.01 (Int. 1.4.93)**. A different build of the game data would require recalibrating all offsets.

Each sample block starts with a 4-byte header; the compressed size is a `int32` at `offset + 4`, and the audio data occupies bytes `offset + 8` through `offset + 8 + size`.

### Loading and caching

On the first `PLAY_SAMPLE` opcode for a given index, `source.load()`:

1. Fetches the full `SCRANTIC.SCR` file (~295 KB) from the network.
2. Slices the relevant byte range.
3. Calls `AudioContext.decodeAudioData()` to decode it into an `AudioBuffer`.
4. Stores the result in `samplesSourceCache[index]`.

Subsequent calls for the same index use the cached `AudioBuffer` directly, skipping the network fetch. The cache lives for the lifetime of the `AudioContext` (i.e. the entire session after the first click).

Note: an index beyond the bounds of `sampleOffsets` will not be caught by the `-1` guard (`undefined !== -1`), causing a fetch with `sampleOffsets[index]` as `undefined`, which evaluates to offset 0 — yielding corrupt/wrong audio data silently.

---

## 12. Known bugs and limitations

### Bug 1: Duplicate opcode values in `CommandType[]`

`CommandType[]` in `process.mjs` merges TTM and ADS opcodes into a single array. `Array.find()` returns the **first** match, so these ADS callbacks are permanently unreachable:

- `STOP_SCENE` (0x2010) — shadowed by TTM `SET_FRAME1`
- `ADS_FADE_OUT` (0xF010) — shadowed by TTM `LOAD_SCREEN`
- `ADS_UNKNOWN_6` (0x4000) — shadowed by TTM `SET_CLIP_REGION`

**Fix:** Split into separate `TTMCommandType[]` and `ADSCommandType[]` dispatch tables, selected by `state.type`.

### Bug 2: `GOTO` ignores its `tagId` parameter

The `GOTO` (0x1200) handler always resets `state.reentry` to 0, sending execution back to the start of the current script regardless of the intended target tag. The correct offset for a given `tagId` is not tracked during parsing.

### Bug 3: Conditional ADS opcodes are unimplemented

`IF_NOT_PLAYED` (0x1330), `IF_NOT_RUNNING` (0x1360), and `IF_RUNNING` (0x1370) are empty stubs. All three do nothing, so all conditional blocks in ADS scripts execute unconditionally. A commented-out stub in `IF_NOT_PLAYED` also contains a type error (`state.played` is a boolean, not an array). `IF_PLAYED` (0x1350) has a partial implementation but is gated on `STOP_SCENE` which is itself unreachable (see Bug 1).

### Bug 4: `SET_TIMER` dead code

`SET_TIMER` (via TTM opcode 0x2020, which maps to `SET_TIMER` in the dispatch table — note `scripting.mjs` labels 0x2020 as `UNKNOWN_3` but `process.mjs` maps it to `SET_TIMER`) sets `state.timer` but nothing in the main loop decrements or checks it. Any timer-based scene branching logic is dead. The comment in `IF_PLAYED` checks `scene.state.timer === 0`, which is always true.

### Bug 5: `SAVE_IMAGE_REGION` is commented out

The `SAVE_IMAGE_REGION` handler body is commented out. The `state.save[]` slots are initialised (three off-screen canvases) but `canDraw` is never set to `true`. `drawContext()`, which would composite these saved regions, is effectively a no-op. Scorecard/overlay compositing via `SET_BACKGROUND → drawContext` does not work.

### Bug 6: `getSceneState` mutates shared parsed data

The first time a TTM scene is added (when `scenes` is empty), `getSceneState` calls:

```js
s.script.unshift(...ttm.scenes[0].script);
```

This mutates the `script` array that belongs to the parsed TTM resource in `scenesRes[]`. If the same TTM scene is ever added again in a future run, its prologue commands are prepended again, permanently corrupting the sequence. The parsed resource is not treated as immutable.

### Bug 7: Last ADS scene never runs

In `ads.mjs`, the scene-splitting loop pushes a `scenes[]` entry only when it encounters a tag opcode (which terminates the *previous* scene). The final scene's commands accumulate in `sceneScripts` but `scenes.push()` is never called after the loop ends. The last tagged section of any ADS file is silently dropped. Contrast with `ttm.mjs`, which correctly calls `scenes.push()` unconditionally after its loop.

### Bug 8: `StoryScenes` tag metadata is never used

`StoryScenes` in `metadata/scenes.mjs` has 10 entries, all pointing at `ACTIVITY.ADS` with different `tag` values, distinct `description` strings, and scene flags (`FlagType`, `PointType`, `HeadingType`). However, `story.play()` only passes `scene.name` to `resource.loadEntry()` and then calls `startProcess()` without forwarding the `tag` or any flag. Every "random" scene selection loads and plays the same complete `ACTIVITY.ADS` from the beginning, ignoring the intended tag-based scene selection entirely.

### Bug 9: Hardcoded 16-colour palette

`src/scrantic/palette.mjs` exports a hardcoded 16-entry EGA palette. All BMP and SCR pixel data is decoded using this palette. The PAL resource loader (`pal.mjs`) correctly parses 256-entry VGA palettes from game data (with 6-bit RGB values scaled by 4 to 8-bit), but the parsed palette is never wired into the rendering path. Dynamic palette switching (e.g. for a night mode) requires extending the pipeline.

### Bug 10: Single-process-only state

All engine state (`state`, `scenes[]`, `scenesRes[]`, `bkgScreen`, etc.) is module-level. There is no support for running multiple concurrent ADS processes. Calling `startProcess()` unconditionally replaces any running process without cleanly stopping it (though it does cancel the previous rAF frame via reset of `state`).

### Bug 11: Cloud timing tied to wall clock

`drawBackground()` uses `Date.now()` comparisons for cloud movement, independent of the rAF frame delta. Cloud speed is therefore tied to wall-clock time, not to the 60 fps frame budget. On a machine that drops frames, the cloud will still advance at the same real-time rate, creating a disconnect between cloud speed and animation playback speed.

### Bug 12: Debug `console.log` calls throughout `process.mjs`

Multiple active `console.log` calls remain in `runScript`, `startProcess`, and `PLAY_SCENE`. These produce continuous output during normal operation and should be removed before any production deployment.

---

## 13. Potential improvements

- **Separate TTM and ADS dispatch tables** — resolves the unreachable opcode bug (Bug 1) and simplifies future opcode work.
- **Typed pixel buffers** — replace per-pixel `{index, a, r, g, b}` objects with `Uint8ClampedArray` or construct `ImageData` directly during decode. A 640 × 480 image currently allocates 307,200 plain objects.
- **Implement `GOTO` correctly** — record each tag's opcode index during parsing; use it in `GOTO` to set `state.reentry` to the correct position.
- **Implement ADS conditionals** — `IF_NOT_PLAYED`, `IF_NOT_RUNNING`, `IF_RUNNING` need working implementations, including a boolean-to-array fix for `state.played`.
- **Implement `SET_TIMER` / decrement loop** — decrement `state.timer` each tick and gate the `IF_PLAYED` timer check on it.
- **Tag-based scene selection** — pass `scene.tag` from `StoryScenes` through to `startProcess` and use it to seek to the correct ADS scene, enabling the 10 distinct scene variants.
- **Fix last-ADS-scene bug** — add `scenes.push({ tagId: prevTagId, script: sceneScripts })` after the parse loop in `ads.mjs`.
- **Load palette from PAL resource** — wire `pal.mjs` output into the BMP/SCR rendering path to support palette-swapped backgrounds.
- **Implement `SAVE_IMAGE_REGION`** — restore the commented-out region capture to enable scorecard compositing.
- **Immutable parsed resources** — copy scene scripts before `unshift` in `getSceneState` rather than mutating shared parsed data.
- **Audio range requests** — replace the full `SCRANTIC.SCR` fetch on each cache miss with an HTTP range request for the relevant byte slice.
- **Remove debug logs** — strip `console.log` calls from `process.mjs` before deployment.
- **Day/night cycle** — `isNight` in `loadOcean()` is hardcoded `false`; wire it to `story.currentDay` or a time-of-day check to enable `NIGHT.SCR`.
- **Multi-process support** — refactor module-level state into a class to support concurrent or layered processes.

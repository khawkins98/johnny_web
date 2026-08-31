# Reverse-engineering findings: original `SCRANTIC.SCR`

Ground-truth recovery of the original 1993 Johnny Castaway screensaver's **rendering
model** and **scene-management logic**, decompiled from the shipped 16-bit executable
and used to diagnose two long-standing visual glitches in this port:

- **"Johnny left behind"** — a completed scene's sprite frozen on screen.
- **Sprites / scenes not cleared** — stale pixels persisting after a scene ends.

## Provenance

- Binary: `public/data/SCRANTIC.SCR` — 16-bit NE (Windows 3.1), Borland C++ 1991,
  built on the stock Microsoft `SCRNSAVE.LIB` skeleton. 14 segments (13 code + 1 data).
- Method: Ghidra headless decompilation of all 590 functions, cross-checked against the
  import/relocation tables (Wine `*.spec` ordinal maps) and jc_reborn's clean-room C.
- **On any conflict, the binary wins.** jc_reborn is cited where it corroborates and
  flagged where it diverges — several defects below trace to inherited jc_reborn errors.
- Addresses are Ghidra logical `segment:offset`. Full evidence, decompiled snippets, and
  the recovered dispatch tables are archived in the investigation scratchpad; the
  load-bearing facts are reproduced here.

---

## Part A — Rendering model (root cause of the glitches)

### A.1 The original uses ONE shared, persistent raster

The engine allocates three full-screen GDI buffers once at init (`FUN_1038_1744`),
freed only at shutdown. Only **one** is the compositing surface:

| Buffer | Role |
| --- | --- |
| `eb2` (`DAT_1068_1eb2`) | **The world raster** — island background **and every scene's sprites** |
| `eb4` | PRESENT buffer (double-buffer / transition pipeline) |
| `eb0` | SCRATCH (transitions) |

`eb4`/`eb0` are a present/transition pipeline, **not semantic layers**. The TTM
interpreter forces both draw handles to `eb2` on *every* opcode
(`FUN_1058_040c`: `DAT_1068_1eb8 = DAT_1068_1eb6 = DAT_1068_1eb2`). There are **no
per-scene surfaces and no transparent layers.** Sprites are drawn with a two-pass
masked blit (DSna AND-mask, then SRCPAINT OR-color).

### A.2 Clearing is not an operation — overwrite is the clear

The invariant that makes the original self-cleaning:

> A scene's pixels sit in the shared `eb2` and are erased only by (a) a neighbor's
> draw, (b) a save-under restore, or (c) the next background re-bake. **Stopping a TTM
> clears nothing** — persistence is the intended default; overwrite is the clear.

- **GET / save-under** (`FUN_1030_01c4`, sole caller the zone-save opcode `0xa054` →
  `FUN_1058_1747`): BitBlt a rect of `eb2` → temp → `GetBitmapBits` → freshly allocated
  RAM stored in **one fixed slot in the current TTM environment** (`DAT_1068_2638+0x3c`).
  No id, no shared array.
- **PUT / restore** (`FUN_1030_0250`): `SetBitmapBits` → BitBlt back into `eb2`.
- **Display list** (`FUN_1060_007e`, 20 buckets): a **content-addressed** registry keyed
  by `(key1, key2, age)`, *not* by any scene identity. Overlapping restores unwind LIFO,
  so nesting of overlapping save-unders is correct for free.
- **Background re-bake** happens only at scene/environment transitions
  (`FUN_1010_0136`), not per frame.

**There is no shared slot-index model anywhere in the binary; save-slot collisions
between concurrent scenes are structurally impossible.**

### A.3 Restore timing

Two-phase per tick. `FUN_1060_03d3(0)` runs last (after draw + present): restores
`age==0` nodes, then decrements all ages. The standard save emits an age-0 and an age-1
node, so the **primary erase is same-tick (post-present)** and a secondary node is
**deferred exactly one tick by design**. No multi-frame trailing.

### A.4 Z-order is execution order

Threads paint in a deterministic **painter's order via a linked-list walk** (thread
records chained at `+0x3b`; each run by `FUN_1050_074a(rec[4]) → FUN_1058_040c`). It is
**not** a numeric sequence-index sort.

### A.5 Frame cadence

50 ms Windows timer (`SETTIMER …,0x32`) with `GetCurrentTime` delta-accounting driving a
finer logical tick. On missed ticks the original **bursts to catch up**
(`FUN_1040_089a` fires `while(scheduled <= now)`).

### A.6 How the current port diverges

The port replaced §A.1's single shared raster + global save-under with **per-scene
private surfaces + per-scene private GET/PUT slots** (`docs/architecture.md` "Frame
composition"; `composition.mjs`, `surface-frame-presenter.mjs`). Consequences:

1. A retained/completed scene re-paints **its own private surface forever**
   (`composition.mjs`), and **no other scene's restore can reach those pixels** → the
   frozen "Johnny left behind" frame.
2. To fake the shared-buffer self-clean across private surfaces, the port added three
   heuristics — the **retained-final-layer rule**, the **`BEGIN_SCENE_FRAME` per-scene
   clear + conditional restore**, and (partly) the **campfire branch-rearm**. The first
   two are emulating a mechanism (§A.2) that only exists in a *shared* buffer.
3. The port's justification for private slots ("concurrent scenes cannot overwrite one
   another's saved regions") defends against a hazard the binary does not have (§A.2).
4. Missed-tick policy is **inverted**: the port advances at most one tick and discards
   the rest (a deliberate anti-burst valve); the original bursts (§A.5).

**The campfire branch-rearm is the exception:** it is real ADS scheduling, not a render
heuristic (§B.5) — it must be **kept**.

---

## Part B — Scene director (accuracy defects)

The port's 63-entry `JOHNNY_SCENES` table is a **direct copy of jc_reborn's
`story_data.h`** (`NUM_SCENES 63`) and inherits its reverse-engineering errors. The real
executable catalogue at `1068:1756` has **79 records**. Ranked defects:

| # | Defect | Ground truth | Glitch-relevant |
| --- | --- | --- | --- |
| 1 | Low tide is `random() >= 0.5` | **Deterministic 16-step tide phase from time-of-day** (`FUN_1018_0540` → `FUN_1018_0c48`); each scene gated by a `[tideMin,tideMax)` window (record bytes `+8/+9`); low-tide render at phase ≥ 12 | Behavioral |
| 2 | 16 scenes missing | BUILDING #8/#9 are the **high-tide variants** of low-tide 5/7 (jc dropped them; its boolean `LOWTIDE_OK` can't express a two-sided window) + **14 pure-pose idle records** (`adsId=0xFF`, drawn straight from the walk sheet) | Newly-reachable → may surface latent bugs |
| 3 | **MARY #5 / VISITOR #3 have spurious walk endpoints** the binary lacks | Binary has **no** start/end spot there → the port **fabricates walks that never existed** | **Yes — directly** |
| 4 | **6 wrong headings** (ACTIVITY7, BUILDING3, JOHNNY2, MISCGAG1, STAND10, WALKSTUF3) | Johnny faces/turns the wrong way at scene seams | **Yes — directly** |
| 5 | Intermediate count "6–19 random" | A **300-unit island walk-span budget** (`FUN_1018_08b9(tide, 300)`), subtracting each scene's `width` byte, tide/width-gated, weighted idle repeats | Pacing |
| 6 | Day advance = `day++` per calendar day | **Dual `SCRANTIC.INI` counter**: `Introduction` (target day, advances only when a keyframe scene plays) + `NumDays` (calendar counter chasing it). Raft `clamp(day-1,1,5)` and the story-day gate **do** match | Behavioral |
| 7 | Walk graph flattened to `BOOKMARKS[from][next]` | Original is **3-D** `walkMatrix[prev][cur][next]` (prev-node dependent) | Behavioral |

Minor: the `Clouds` INI key is mislabeled "Waves" in the port's mapping; the finale is a
10%-gated keyframe else an ordinary `flagsB & 4` ending.

### B.5 Campfire rearm is real ADS scheduling (keep it)

The ADS interpreter re-evaluates IF-conditionals **every tick** (`FUN_1048_1223`:
`0x1030`=IF run-count==0, `0x1040`=IF running, `0x1050`=IF finished) and, when true,
re-arms the segment (`FUN_1048_1758`/`_17a0` write the target into `seg+0x292/+0x294`,
then `FUN_1048_1925`); `FUN_1048_1acb` auto-resets finished segments (state 3/4) to
running. This is exactly the "keep the zero-run-count fire animating while Johnny fetches
the boot" behavior. **First-class scheduling — must be preserved.**

### Open items (not yet ground-truthed)

- The exact **day/night hour boundary** (binary entangles it with config + tide; both the
  port's `<6 || >=18` and jc's `hour%8` are unverified).
- Independent confirmation of the **five-wipe count/order** (the sequence-end `0x19` call
  is the wipe *sound*, not the renderer; the rotation is only cross-checked via jc_reborn).

---

## Empty frames are background-reveals, not blanks to fix (verified)

A TTM frame that does `BEGIN_SCENE_FRAME` and reaches the next boundary with **no draw
op** is an *empty frame*. The original does **not** persist the previous sprite through
it: the frame registers no dirty node (the age-triple registrar `FUN_1050_0a85` runs
only on the `0xAxxx` draw-op tail) and `BEGIN_SCENE_FRAME` clears nothing (§A/P1.4). The
previous real frame's own unconditional age-0 `eb0→eb2` erase already restored the island
background under its rect, and its age-1 present repaints that background on the empty
tick. So the actor's rect **ages out to the island background within ~1 tick and stays
background** — for a one-off empty frame and for a *held* empty frame alike (re-running an
empty frame still emits no draw). True persistence exists only for `COPY_ZONE_TO_BG`
(0x4204) writes into the `eb0` plate, never for a normal `0xA5xx` sprite.

Consequence for the port: the immediate-mode renderer already reproduces this — an empty
frame clears the foreground and the separate island-background canvas shows through. The
handful of single-frame "blanks" a full-gag sweep finds at empty frames (e.g. gag 1's
gull pausing) are **faithful background-reveals, not bugs**; do not "fix" them by
retaining the prior frame (that would wrongly keep an actor the original retires).

---

## Implications for the refactor

The findings split the work into two independent tracks:

- **Track A — Rendering (architectural).** Replace per-scene surfaces + private GET/PUT
  slots with **one persistent shared raster** (never cleared per frame; background
  re-baked only at scene/env transitions) + a **global, content-addressed save-under
  registry** with LIFO restore. **Delete** the retained-final-layer rule and the
  `BEGIN_SCENE_FRAME` per-scene clear. **Replace** `sequencePaintIndex` with thread
  *execution order* — only after verifying the JS thread iteration matches the original's
  list order (§A.4). **Keep** the campfire branch-rearm (§B.5). Restore timing per §A.3.
- **Track B — Catalogue accuracy (data correctness).** Re-derive the 79-record table
  directly from the binary rather than inheriting jc_reborn's 63-entry copy; fix
  defects #1–#7. Defects #3/#4 are a *second, independent* source of wrong Johnny
  movement, separate from Track A's rendering glitch.

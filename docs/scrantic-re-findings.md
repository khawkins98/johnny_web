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
| `eb4` (`DAT_1068_1eb4`) | The **screen**. A "present" node copies a rect of `eb2` to it; in the shipped configuration (`DAT_1068_42a0 = 1`) the copy goes straight to the window DC (`FUN_1038_06ce` → `FUN_1038_07e8`) |
| `eb0` (`DAT_1068_1eb0`) | The **background plate**. Every drawn rect is restored from it at the end of the tick; `LOAD_SCREEN`, `STORE_AREA`, `SAVE_BACKGROUND`, `FADE_OUT` and the host background bake write it |

*(Corrected by Part C. An earlier version of this table called `eb4` a double-buffer
and `eb0` "scratch". `eb0` is the semantic background layer the engine erases to.)*

The TTM interpreter forces both draw handles to `eb2` on *every* opcode
(`FUN_1058_040c`: `DAT_1068_1eb8 = DAT_1068_1eb6 = DAT_1068_1eb2`). There are **no
per-scene surfaces and no transparent layers.** Sprites are drawn with a two-pass
masked blit (DSna AND-mask, then SRCPAINT OR-color).

### A.2 Clearing is not an operation — overwrite is the clear

**Superseded — see Part C.** The paragraph below was written before the seg-1058
draw handlers were disassembled. It is wrong as a general rule: every draw op registers
a same-tick restore of its own rect from the background plate `eb0`
(`FUN_1050_0a85`), so a sprite that is not redrawn next tick is gone next tick.
Persistence exists only for pixels that reach `eb0`. What the paragraph gets right is
that stopping a TTM thread does nothing on its own, and that there is no per-scene clear.

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

*(Precision, from Part C: the age-1 node is a second **present**, not a second
restore. The triple is present@0, present@1, restore@0. The deferred present shows the
restored background one tick after the sprite was shown.)*

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
| 7 | Walk graph flattened to `BOOKMARKS[from][next]` | A **precomputed route table** `route[from][to]` → weighted walk-segment lists (not a `[prev][cur][next]` matrix — see §B.6.4) | Behavioral |

Minor: the `Clouds` INI key is mislabeled "Waves" in the port's mapping; the finale is a
10%-gated keyframe else an ordinary `flagsB & 4` ending.

### B.5 Campfire rearm is real ADS scheduling (keep it)

The ADS interpreter re-evaluates IF-conditionals **every tick** (`FUN_1048_1223`:
`0x1030`=IF run-count==0, `0x1040`=IF running, `0x1050`=IF finished) and, when true,
re-arms the segment (`FUN_1048_1758`/`_17a0` write the target into `seg+0x292/+0x294`,
then `FUN_1048_1925`); `FUN_1048_1acb` auto-resets finished segments (state 3/4) to
running. This is exactly the "keep the zero-run-count fire animating while Johnny fetches
the boot" behavior. **First-class scheduling — must be preserved.**

### B.6 Recovered selection/movement algorithms (all implemented in Track B)

Exact ground truth for defects #1/#5/#6/#7. The catalogue is 79 records at file `0x19556`, 17-byte
stride, terminated by `word@0 == 0`; fields: `+2` weight, `+3/+4` start spot/heading, `+5/+6`
end spot/heading, `+7` width, `+8/+9` tide window `[min,max)`, `+0xa` story day, `+0xb` flagsB,
`+0xf` adsId (`0xFF` = pure pose), `+0x10` adsTag. Spots 1-based (1=A…6=G); headings
`0=S,1=SW,2=W,3=NW,4=N,5=NE,6=E,7=SE`.

**B.6.1 Tide phase (`FUN_1018_0540` + `FUN_1018_0c48`)** — time-of-day, half-hour resolution, not random:
`hphase(x) = (⌊x/50⌋ + ⌊(x%100)/30⌋ + 14) % 16`;
`tidePhase = ( hphase(hour*100 + (minute<30?0:30)) − hphase(StartTime) + 16 ) % 16`, stored in
`30ba` once per batch (`FUN_1018_0540`, before `FUN_1018_08b9(30ba, 300)`), so it advances one
phase per half hour and wraps every 8 hours. `StartTime` (`DAT_1068_00be`) is the HHMM
"Start Time" of the settings dialog: `FUN_1008_12f7` (1008:12f7) rounds it to the half hour and
the ±30-minute buttons (`0x78`/`0x79`) step it; the data segment defaults it to `900` and
`SCRANTIC.INI` `StartTime` persists it (it is *not* a date). Scene eligibility uses the
`[tideMin,tideMax)` window. The phase's only render effect is the sky: at the bake
(`FUN_1010_0136`, 1010:0136) `30b4 == 0 && 30ba < 12` draws one of three day oceans
(`rand % 3`), otherwise `NIGHT.SCR`; so phases 12–15 (6–8 h after StartTime, e.g. 15:00–17:00,
23:00–01:00 and 07:00–09:00 with the default) are night, whatever the wall clock. `30b4 == 1`
(flagsB `0x800`, MARY #1 only) forces `NIGHT.SCR`; `30b4 == 2` (flagsB `0x2000`) draws solid
colour 5. The low-tide *render* is **not** the phase: it is `30c2`, a per-batch coin flip
(B.6.3a). Verified by normal-play captures with no INI (StartTime 900): 21:15 local (phase 8)
drew the day sky, 23:20 (phase 12) drew `NIGHT.SCR`; the wall-clock rule 06–18 h would have
drawn night at both.

**B.6.2 Dual-counter day advance (`FUN_1018_0ba5`)** — `target` (unlocked keyframe day) + `cur`
(calendar). Per real-date change: `if (cur<target) cur++; if (cur>11||cur<2){target=1;cur=1;}`.
`target++` only when a new sequence ran **and** a day-locked keyframe actually played **and**
`target ≤ cur`. Range 1..11; selection uses `cur`.

**B.6.3 300-unit walk-span budget (`FUN_1018_08b9(tide,300)`)** — place the ending first, then fill
`while (budget != 0 && slot < 298)`: a candidate needs its `[tideMin,tideMax)` window satisfied and
`width/2 < budget`, chosen by weight-roulette (`weight` = byte `+2`); `flagsB & 0x08` idle scenes
repeat 1..6× via buckets `{10,20,30,20,10,10}`; each placement subtracts `width`.

**B.6.3a Island origin (`FUN_1010_1c41` at `1010:1c41`, `FUN_1010_1b00` at `1010:1b00`)** — the
planner resets `30c0 = 30c2 = -1` (`FUN_1010_1c41(-1,-1)` from `FUN_1018_0540`), then calls
`FUN_1010_1c41(flagsB, flagsD)` for every planned record, ending first (`FUN_1018_08b9`). `flagsD`
is the record word `+0xd`: `0x20 → 30c0 = 1`, `0x10 → 30c0 = 2` (each replaces the earlier value),
and bits `1/2/4/8` OR in `0x04/0x08/0x10/0x20` (top-left, top-right, bottom-left, bottom-right).
`flagsB & 0x200 → 30c2 = 0`. At the bake (`FUN_1010_0136`): `30c2` still `-1` becomes a coin flip
(`rand & 1`; `30c2 == 1` draws the low-tide sand/rock frames 1/2, the low-tide waves and raft spot),
then `FUN_1010_1b00`: `30c0 & 2 → (0x121, 299)`, `30c0 & 1 → (0x11, 0x135)`, else
`FUN_1010_14bf(&30c6, &30c4, -1, xmin, ymin, xrange, yrange)` = `min + rand % range` with
`30c2 == 1 ? (0xa8, 0xff, 0x6f, 0x3b) : (0x43, 0xff, 0xe2, 0x81)`; when any quadrant bit is set,
`ymin += yrange/2` for `30c0 ∈ {0x10, 0x20, 0x30}`, `yrange /= 2` unless a whole column is allowed
(`0x04&0x10` or `0x08&0x20`), `xmin += xrange/2` for `30c0 ∈ {0x08, 0x20, 0x28}`, `xrange /= 2`
unless a whole row is allowed (`0x04&0x08` or `0x10&0x20`). The bake then rebases `30c6 -= 0x121`,
`30c4 -= 0x117` and draws island layer 0 at `30c6 + 0x121, 30c4 + 0x117`. Records with a `+0xd`
word: BUILDING #2/#4/#6 and MARY #1–#4 `0x08`; MARY #5 `0x03`; VISITOR #5 `0x01`; FISHING #5
`0x05`; ACTIVITY #11 `0x0a`; FISHING #3/#6, ACTIVITY #9, VISITOR #1, VISITOR #3, WALKSTUF #1
`0x10`; FISHING #4 `0x20`. Normal-play captures show layer 0 at exactly 289/299 and 17/309 for the
two fixed layouts. Note for B.6.1: `30ba ≥ 12` selects `NIGHT.SCR` (`FUN_1010_0136`); the low-tide
*render* is `30c2`, not the phase. The coin is flipped at every bake whose `30c2` is still `-1`,
including off-island (`30b4 == 2`) batches, and nothing else constrains it: neither the phase
nor the records' tide windows, so a `[12,16)` record can play at high tide and a `[0,12)` one
at low tide. The bake order is sky (`rand % 3` only for a day island), tide coin, then
`FUN_1010_1b00`'s origin draws. `30c2` also picks the raft spot (`FUN_1010_1d69`: high
`30c6+0x201, 30c4+0x10a`, low `30c6+0x212, 30c4+0x119`) and the wave set (`FUN_1010_0e74`).

**B.6.3b Still waves (flagsB `0x1000` → `30b2`)** — `FUN_1010_1c41` sets `30b2 = 1` when any
planned record carries `0x1000` (BUILDING #2/#4/#6, MARY #1, VISITOR #3). The bake then clears
the wave timer (`2f40 = 0`, the same path as INI `Waves=0`) and `FUN_1010_040e(0)` returns
before the wave pass while `30b2` is set, so the waves never advance for the batch. The bake's
own wave pass (`FUN_1010_0e74(0)` after presetting counters `0282/0284/0286 = 2`, which the
first pass turns into `0, 2, 2`) also blits those frames into `eb0` when `30b2 == 1`, so the
plate carries them. `0x1000` has nothing to do with island position (the old `VARPOS` name).
With waves animating, each per-present `FUN_1010_040e(0)` runs the same pass, which does nothing
while the countdown `0288` is non-zero. `FUN_1008_16ce` decrements it on every 16 ms game tick. When
`0288` reaches 0, the pass re-arms it to 4 and steps exactly one counter: A if A == C, else C if
B == A, else B, wrapping past 2 to 0. From the bake's 0, 2, 2 that gives 0,0,2 → 0,0,0 → 1,0,0 → 1,1,0 →
1,1,1 → …, and every bake starts it again. High-tide regions read A, B, C and low-tide regions
A, B, C, A. (`2f40` is the 30-slot count looped over by `FUN_1010_04a2`, not the wave countdown.)
So a step lands 1 or 2 presents after the last. Forced-gag framebuffer captures agree: one region
changes per step, in A, B, C order, with 1- and 2-present gaps (about 1:2), and the wave frames
follow the counter rule exactly. That is ~1.65 presents per step, ~90 ms at 55 ms per present.

**B.6.4 Walk path-finding — precomputed route table (`FUN_1018_0094`, `FUN_1018_03ac/03ea`)**
(supersedes the earlier "3-D matrix" guess). Route matrix at file `0x18894`, row stride `0x0c`
(6 words), 1-based `route[from][to]` = a near pointer (0 = no route) to a **route-descriptor list**:
segments marked by `-spot`, then `(segId, weight%)` pairs summing 100, terminated by `-7`. At the
current spot, roulette-pick a `(segId,weight)`; segment attributes come from the 34-entry table at
file `0x180de` (`+0` startHeading, `+1` endHeading, `+2` endSpot), and its animation frames from the
walk table row `(FUN_1018_03ea(segId) − 0xaea)/6`. Chain segments until `endSpot == dest`, rotating
heading one step/frame (opposite = random shortest). Parsed data (30 routes + 34 segments) is
hardcoded static in `walking.mjs` (`WALK_ROUTES`/`WALK_SEGMENTS`).

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

## Part C — Buffer contract (issue #53, Phase 0)

Which buffer each TTM op draws into, what it queues on the display list, and what
gates erasure. Recovered from the seg-1058 handlers (disassembled from the jump tables
at `1058:03bc`, `1058:1275`, `1058:12bd`, `1058:1379`, `1058:138d`, `1058:1900`), the
registrar `FUN_1050_0a85`, the display list `FUN_1060_007e` / `FUN_1060_03d3`, and the
data-segment initial values. Each statement carries a confidence tag:
**[asm]** read in the disassembly, **[dc]** read in the decompile, **[inf]** inferred,
**[unk]** not settled.

### C.1 Mechanics

**Draw target.** The interpreter `FUN_1058_040c` sets `DAT_1068_1eb6 = DAT_1068_1eb8 =
eb2` before every op, so every TTM primitive draws into `eb2` unless its handler
retargets. [dc] The only retargeting handlers are the wipes (`0xa014`–`0xa0b5`,
`FUN_1058_1510` sets the destination to `eb4`, i.e. the screen) and the GET/PUT pair
(`0xa054` reads `eb2`, `0xa064` writes `eb2`). [asm]

**Display list.** `FUN_1060_007e(x, y, w, h, kind, src, dst, age)` adds a node to one of
20 buckets keyed `(src, dst, age)` (`FUN_1060_05a7`). Kind 1 is a blit. `x` is stored
rounded down to a multiple of 8 and `w` rounded up (byte-aligned planes), the rect is
clipped to the screen or, when `DAT_1068_1ea3` is set, to the `SET_CLIP_REGION` rect,
and nodes in the same bucket that overlap or nearly touch are merged. Kind 4 is a RAM
PUT (`FUN_1030_0250`); no recovered code ever registers one. [dc]

**Flush.** `FUN_1060_03d3(0)` is called once per director tick (`FUN_1018_06bf`, after
every TTM thread and the host wave/cloud animators have drawn). It walks the pair list
at `1068:287e` in this order and flushes only the age-0 bucket of each pair: [asm, data]

1. `(-1 → eb4)` RAM PUT to screen — unused
2. `(eb2 → eb4)` **present**: blit each rect from `eb2` to the screen
3. `(-1 → eb2)` RAM PUT to world — unused
4. `(eb0 → eb2)` **restore**: blit each rect from the background plate into `eb2`

then decrements the age of every remaining node. So within a tick the order is
draw → present → restore, and a node registered with age 1 fires in the next tick's
flush.

**Registrar.** `FUN_1050_0a85(x, y, w, h)` is what every draw op calls after drawing: [dc]

| `DAT_1068_287a` | `DAT_1068_27c0 == 0 && DAT_1068_2641 >= 3` | nodes registered |
| --- | --- | --- |
| 0 (normal) | true (normal) | present@0, present@1, restore@0 |
| 0 | false | present@0, present@1 |
| 1 (startup only) | true | restore@1 |
| 1 | false | nothing |

Net effect in the normal case: a rect drawn at tick T is on screen at T, its `eb2`
pixels are replaced by the plate `eb0` at the end of T, and the plate is shown on
screen at T+1. **Nothing survives in `eb2` for more than one tick unless it is redrawn
or it was baked into `eb0`.** This is the "age-0/age-1 triple" of the tracker.

### C.2 Gating globals

| Global | Size, initial value (data segment) | Writers | Readers | Effective value while scripts run |
| --- | --- | --- | --- | --- |
| `DAT_1068_2641` | word, **4** [data] | `FUN_1050_0152` (display-list init, called from `FUN_1048_0000`, the ADS subsystem init) writes **2** only if `DAT_1068_1ebd == 12`; `1ebd` is the device class set to 2 in `FUN_1038_1744` on the shipped path [dc] | registrar (`>= 3` enables the restore node); `FUN_1050_0b31` / `FUN_1050_0b74` (`>= 3` enables the `eb2 → eb0` bakes); `0x4204` handler; `0x4114` handler; end-of-op-list full present | **4**: restores and bakes on. 2 would turn the engine into "persist until overwritten" (no restores, no bakes); not reachable on the shipped path [inf] |
| `DAT_1068_27c0` | word, **0** [data] | `FUN_1048_0079` (ADS load) → 0; TTM op `0x0500` → 1; TTM op `0x0510` → 0 [asm] | registrar only (non-zero suppresses the restore node) | **0**: no shipped TTM contains `0x0500`/`0x0510` (dump survey of all 41 TTMs) |
| `DAT_1068_287a` | word, **1** [data] | `FUN_1008_1448` (app init) → 0, after the first `FUN_1010_0136`; **no code sets it back to 1** [scan of every direct reference] | registrar (1 → no presents, restore deferred to age 1); `FUN_1050_0b31` (which restore bucket to discard); `0x4204` and the end-of-op-list present (`eb0` instead of `eb2` as present source) | **0** while any script runs. The value 1 is a startup-only "draw into the plate" mode |
| `DAT_1068_27c2` | word, 0 | `0x3003` handler increments around the nested call, decrements after | interpreter: when non-zero, the four ops in the `1058:138d` table get `DAT_1068_46e0/46e2` added to their coordinates | nested-script coordinate offset; not erasure related |
| `DAT_1068_46da` | per-thread, `env[263e]+0x0e` | interpreter copies it per thread | nearly every draw handler skips drawing when non-zero | "don't draw" flag for a thread (used for pre-roll) [inf] |
| `DAT_1068_4642` | word, 0 | `FUN_1050_0b31` → 1; interpreter → 0 | end of op list: if set and `2641 >= 3`, register a full-screen present (clip disabled) | "a full bake happened, present everything" |
| `DAT_1068_46e4/46e6` | words, 0 | `FUN_1010_00fc`: island offset from the layout; **0 when `DAT_1068_30b4 == 2`** (catalogue flag `0x2000`) | interpreter adds them to every `0xAxxx` op's x/y and, via the `1058:1379` table, to the second coordinate pair of `0x4004`, `0xa0a4`, `0xa601`, `0xaf1f`, `0xaf2f` | island-relative placement; zero for off-island scenes |

### C.3 Op table

Columns: where the op draws; what rect it hands the registrar (so present@0, present@1
and restore@0 are all registered for that rect unless stated); whether it writes `eb0`.
Port names are from `src/dgds/data/scripting.mjs`. "generic" means the op is not in the
`1058:1275` post-table, so the interpreter calls the registrar with `(x, y, w+8, h+2)`.

| Op | Port name | Draws into | Registered rect | Writes `eb0` | Notes | Conf. |
| --- | --- | --- | --- | --- | --- | --- |
| `0xa002` | UNKNOWN_4 (pixel) | `eb2` (`FUN_1040_0d54`) | `(x, y, 8, 1)` | no | | asm |
| `0xa0a4` | DRAW_LINE | `eb2` (`FUN_1030_02ef`) | `(min x, min y, abs(dx)+8, abs(dy)+2)` | no | | asm |
| `0xa104` | DRAW_RECT | `eb2`, filled (`FUN_1038_1bd8`, fill flag `1eac=1`) | generic `(x, y, w+8, h+2)` | no | Registers present+restore like any sprite. The tracker's correction is right | asm |
| `0xa114` | (outline rect) | `eb2`, outline | generic | no | unused by scripts | asm |
| `0xa404` / `0xa424` | DRAW_BUBBLE | `eb2`, filled / outline ellipse (`FUN_1040_0688`) | `(x-20, y, w+48, h+1)` | no | | asm |
| `0xa504`…`0xa536` | DRAW_SPRITE(_FLIP) | `eb2`, masked blit (`FUN_1028_17d8`) | `(x, y, abs(frame.w), frame.h+2)`; 6-arg forms `(x, y, x2-x, y2-y)` | no | No registrar call if the image slot or frame is missing or the frame width is 0. **The sprite handler registers its own restore; it does not rely on script GETPUT** | asm |
| `0xa5a7` | (7-arg sprite) | not drawn by `FUN_1058_0144` (arg count 7 is skipped) | `(x, y, x2-x, y2-y)` | no | unused by scripts | asm |
| `0xa601` | DRAW_GETPUT n | **nothing** (pre-handler `1058:02d8` only tests `46da`) | slot n's saved rect `env+0x6c/0x84/0x9c/0xb4`, **only if** slot n's RAM buffer `env+0x3c+4n` is non-null; otherwise no registrar call | no | Only `0xa054` fills a slot (slot 0). So in 40 of 41 TTMs `DRAW_GETPUT` is a no-op; the 6,814 uses do nothing. Erasure comes from each draw's own restore | asm |
| `0xa054` | UNKNOWN_5 (GET) | reads `eb2` rect into RAM (`FUN_1030_01c4`), stores rect+pointer in slot 0 | generic | no | Only GJGULIVR uses it | asm |
| `0xa064` | WIPE_RIGHT_TO_LEFT (PUT) | writes slot 0's RAM back into `eb2` (`FUN_1030_0250`) | generic | no | Only GJGULIVR uses it | asm |
| `0xa014`…`0xa094` (not 54/64), `0xa0b5` | wipes | **screen** directly (`FUN_1058_1510` retargets to `eb4`) | generic | no | unused by scripts | asm |
| `0xa2x4` | (full image) | `eb2` (`FUN_1030_04ce`, `1ea2=1`) | generic | no | unused by scripts | asm |
| `0xa704` | | `FUN_1040_1113` if byte `2640` set | `(x, y, w, h)` | no | unused | asm |
| `0xaf02` | | `FUN_1028_195e` | none | no | unused | asm |
| `0xaf1f` / `0xaf2f` | (polygon) | `eb2` (`FUN_1028_187e`) | `(0, 0, W, H)` | no | unused | asm |
| `0x4204` | STORE_AREA x y w h | blit `eb2` rect → `eb0` (`FUN_1050_0b74`), gated `2641 >= 3` | present@0 only, no restore | **yes** | The plate mechanism. Captures whatever is in `eb2` at that moment, including other threads' sprites drawn earlier in the tick | asm |
| `0x4214` | SAVE_GETPUT_REGION | **no-op** (`1058:0860` tests `46da` and returns) | none | no | The port treats it as the GET; the binary ignores it | asm |
| `0x0020` | SAVE_BACKGROUND | `FUN_1050_0b31`: full `eb2 → eb0` bake, drop the pending restore bucket, flag a full present | — | **yes** | unused by scripts | asm |
| `0xf01f` | LOAD_SCREEN | decodes the screen into `eb2` at the resource's own size (`FUN_1030_16d8`; e.g. SUZBEACH is 384×268 at 128,77), then `FUN_1050_0b31` | full present (via `4642`) | **yes**, the whole of `eb2`, leftovers included | | asm+dc |
| `0x4114` | FADE_OUT | palette fade; full present; then (`2641 >= 3`) full `eb2 → eb0` bake | — | **yes** | unused by scripts | asm |
| `0x4124` | FADE_IN | full present; palette fade | — | no | unused | asm |
| `0x3103` | | registrar `(0, 0, W, H)` | full present+restore | no | unused | asm |
| `0x4004` | SET_CLIP_REGION | sets `1ea3..1eaa`; clips all later presents and restores | — | no | | asm |
| `0x1121` | SET_BACKGROUND n | `env+0x16 = n` (selects the GET slot that `0x00c0` frees) | — | no | **no pixel effect** | asm |
| `0x00c0` | | frees GET slot `env+0x16` | — | no | | asm |
| `0x2002` | SET_COLORS | `1eae` pen, `1ead` brush colour | — | no | DRAW_RECT uses `PatBlt` with brush `1ead` when both are equal, else `Rectangle` with pen `1eae` and brush `1ead` (`FUN_1038_1bd8`) | dc |
| `0x0500` / `0x0510` | | `27c0 = 1 / 0` | — | no | unused; would suppress restores | asm |
| `0x0ff0` | UPDATE | ends the op list; if `4642`, registers a full-screen present with clipping off | — | no | | dc |
| `0x0110` | PURGE | `4644 = 1` | — | no | | asm |

Host-side draws follow the same contract: the walk renderer `FUN_1018_0094` registers
the triple for Johnny's sprite (the island code has the same triple as a helper,
`FUN_1010_1a0d`); the island wave
and cloud animators register present-only nodes for their rects and, when `DAT_1068_30b2`
(catalogue bit `0x1000`) is set, also bake them into `eb0`. [dc]

### C.4 What is in `eb0`

`eb0` holds whatever the last bake left there. There is no per-tick rebuild. Writers:

1. **Host background bake** `FUN_1010_0136`. Its first call (app init) only loads the
   island resources and returns. Every later call draws the plate: fill the whole
   plate with colour 5 if INI `Background=0` **or `DAT_1068_30b4 == 2`**; else load a
   day sky (random of three) or `NIGHT.SCR`; then, unless `30b4 == 2`, the island
   layers; then copy `eb0 → eb2` and register a full present. It is called once per
   planned batch from the planner `FUN_1018_0540`, after `FUN_1010_1c41` has folded
   every planned record's flags. `30b4 = 2` comes from catalogue bit `0x2000` in the
   word at record `+0x0b`. [dc]
2. `LOAD_SCREEN`, `SAVE_BACKGROUND`, `FADE_OUT`: full `eb2 → eb0`. [asm]
3. `STORE_AREA`: one rect `eb2 → eb0`. [asm]
4. Wave/cloud animators when bit `0x1000` is set. [dc]

Records with bit `0x2000` (plate = solid colour 5, no island, island offset 0):
SUZY:1, SUZY:2, JOHNNY:1, JOHNNY:6 (catalogue at `1068:1756`, 17-byte records). [data]

The buffers are `CreateCompatibleBitmap`s that are never cleared at allocation
(`FUN_1038_1744`); before the first bake their content is whatever GDI gives, which in
the DOSBox captures is index 0 (black). [dc, inf]

### C.5 MEANWHIL walk-through

Script (`MEANWHIL.TTM`, one scene "quarky watch"): `SET_BACKGROUND 0;
SAVE_GETPUT_REGION 224 91 160 131; … DRAW_GETPUT 0; DRAW_RECT 0 0 640 350;
DRAW_SPRITE 254 100 0 0; STORE_AREA 232 90 144 134; DRAW_SPRITE (hands) …; UPDATE`,
then per frame `DRAW_GETPUT 0; DRAW_SPRITE face; DRAW_SPRITE hand; DRAW_SPRITE hand;
UPDATE`.

MEANWHIL is only scheduled by SUZY:1, SUZY:2 and JOHNNY:1 ("THE END"), all bit-`0x2000`
records, so the plate is solid colour 5 (black) with no island and island offset 0.
In the forced capture (`cap-suzy1`) the planner never ran, so the plate was the
never-baked bitmap; also black, same result.

Tick 1:

- `SET_BACKGROUND 0`, `SAVE_GETPUT_REGION`: no pixel effect; slot 0 stays empty.
- `DRAW_GETPUT 0`: slot 0 has no buffer → no draw, no nodes. Inert for the whole card.
- `DRAW_RECT 0 0 640 350` (colours 5/5 → solid fill): rows 0–349 of `eb2` black;
  nodes present@0, present@1, restore@0 for `(0, 0, 648, 352)` (clipped to the screen).
- `DRAW_SPRITE 254 100` (clock face): drawn into `eb2`; triple for the face rect.
- `STORE_AREA 232 90 144 134`: copies the face on black from `eb2` into `eb0`;
  present@0 for that rect. From now on the plate has the face.
- hands: drawn into `eb2`; triples.
- `UPDATE` → flush: presents (merged) put black top + face + hands on screen; restores
  then copy `eb0` back over every registered rect: black over the rectangle (the plate
  is black there), face over the face, face over the hands.

Tick 2 and later: the age-1 presents show the restored `eb2`, which is black with the
face, so the screen keeps the black top and the face; the hands are redrawn each frame
and erased by their own restore@0 at the end of the frame. The 640×350 black area is
**not** an unerased leftover — it is erased every tick, to a black plate.

Below row 350 no node is ever registered, so the screen there is never repainted by
this card. The capture shows the splash and the host wave strip there because the
screen is dirty-rect updated, not because any buffer holds them; after the first loop
they are gone. The tracker lists this as an accepted deviation.

### C.6 §A.2 versus the immediate-mode compositor

Both were half right. The binary is immediate-mode with respect to `eb2`: every
registered rect is restored from `eb0` in the same tick, so an actor that is not
redrawn vanishes one tick later (what `composeTtmFrame` reproduces by clearing and
replaying `frameOps`). It is persistent with respect to `eb0`: `LOAD_SCREEN`,
`STORE_AREA`, `SAVE_BACKGROUND`, `FADE_OUT` and the host bake write a plate that every
restore copies from, and nothing rebuilds that plate per tick (what §A.2 observed, but
attributed to `eb2`).

The current compositor's "clear to transparent, host canvas shows through" equals
"restore from `eb0`" only while `eb0` equals the host canvas. It diverges when:

- the plate is black (bit `0x2000` scenes) while the host canvas is not, or vice versa;
- `LOAD_SCREEN` bakes a screen smaller than 640×480 (SUZBEACH, JOFFICE, …): the plate
  outside the image keeps whatever `eb2` held, including earlier bakes and any sprite
  drawn earlier in that tick;
- `STORE_AREA` snapshots `eb2` mid-tick: it captures every sprite any thread drew
  earlier in the same tick (restores run at the end of the tick), and the plate keeps
  them until the next full bake;
- a scene draws directly to the screen (wipes) or relies on dirty-rect staleness.

`DRAW_GETPUT` and `SAVE_GETPUT_REGION` play no part in any of this; the port's
per-environment GETPUT slots and `SAVE_IMAGE_REGION` bookkeeping model an op that the
binary ignores.

### C.7 Tracker questions

| Question | Answer | Conf. |
| --- | --- | --- |
| Does the sprite handler register a restore, or rely on script GETPUT? | It registers its own triple (`1058:10b7` → `FUN_1050_0a85` with the frame's rect). Script GETPUT is inert unless `0xa054` filled the slot | asm |
| What does `DRAW_GETPUT` present? | Nothing on its own. With a filled slot: present@0/@1 and restore@0 of the saved rect. No PUT of the saved pixels (that is `0xa064`) | asm |
| Initial value of `2641` | 4 (word in the data segment). Only writer sets 2 on an unreachable device class | data, dc |
| Who sets `27c0` / `287a` | `27c0`: ADS load → 0, TTM ops `0x0500`/`0x0510` (unused). `287a`: data = 1, app init → 0, never set again | asm, scan |
| What is in `eb0` when MEANWHIL starts | Solid colour 5 (black), no island: all three callers carry catalogue bit `0x2000`. Forced capture: never-baked bitmap, also black | dc, data, capture |
| Can a GETPUT save capture another scene's sprite | `0xa054` (GET), `STORE_AREA` and `LOAD_SCREEN` all snapshot `eb2` at op time; anything drawn earlier in the tick by any thread is in the snapshot. For `STORE_AREA`/`LOAD_SCREEN` that content then lives in `eb0` until the next full bake. `0xa054` matters only for GJGULIVR | asm, inf |
| Does `DRAW_RECT` register present+restore | Yes, via the generic path `(x, y, w+8, h+2)` | asm |

### C.8 Not settled

- Colour index 5 in `JOHNCAST.PAL` is assumed black from the capture; not read from
  the palette resource. Cheap to check with the port's palette loader.
- Whether `DAT_1068_46da` is ever non-zero during normal play (it would suppress all
  drawing for a thread). A DBX hook on the thread record would settle it.
- `0xa704`, `0xaf02`, `0xa2x4`: unused by the shipped scripts; their draw helpers were
  not read.
- The exact merge heuristic in `FUN_1060_007e` (area ≤ sum + 0x14) only affects how
  many blits happen, not what ends up on screen, as long as the plate is restored
  before the next present.

---

## Implications for the refactor

*Note (Part C): Track A below was written against §A.2 and is superseded. The faithful
model is a background plate (`eb0`) plus a world raster (`eb2`) that is restored from the
plate every tick; see C.6 for the cases where "clear + replay" differs from it.*

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

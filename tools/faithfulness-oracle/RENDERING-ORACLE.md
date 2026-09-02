# Rendering (framebuffer) oracle — methodology

Extends the [faithfulness oracle](./METHODOLOGY.md) from **sequencing** to **rendering**.
The sequencing oracle diffs the order in which the engine fires ADS/TTM opcodes; it is
blind to *compositing* — transparency, z-order, scene-clearing, scale/position. Those bugs
only show up in pixels. This oracle captures the ORIGINAL binary's rendered framebuffer and
diffs it, pixel-for-pixel, against our JS engine's render of the same scene.

It was built incrementally and **proven on the SUZY scene-1 "city dweller" divergence**
(see "The SUZY proof" below): the diff flags a 30% divergence the sequencing oracle cannot see.

## Pipeline
```
ORIGINAL:  SCRANTIC.SCR under framebuffer-patched DOSBox-X  ──►  scene-labeled PPMs (640x480)
OURS:      driveGag(SUZY.ADS,1) ► composeTtmFrame ► surface  ──►  PPMs (RGBA over black)
DIFF:      diff-frames.mjs  ──►  differing-pixel count / bbox / heat image
```
All three run headless. Frames are aligned **per-scene** (by ADS id + content), not per
story-tick — see "Alignment" for why.

## 1. Capturing the original's framebuffer (the patch)

`dosbox-x-framebuffer.patch` (on top of the sequencing oracle's `dosbox-x-trace.patch`).

**Key fact:** Johnny Castaway is a **Windows 3.1 GDI screensaver**, not a DOS mode-13h
game. Under our `dbx.conf` (`machine=svga_s3`) with Win3.1's `SVGA256.DRV`, the emulated
video mode is **640×480×8bpp paletted (S3 SVGA, DOSBox mode `M_LIN8`)** — same resolution
as our JS surface, which makes the diff a direct comparison.

**Do NOT rely on the SDL window** — `SDL_VIDEODRIVER=dummy` produces no output pixels, and
the scaler/`scalerSourceCacheBuffer` path is entangled with `GFX_StartUpdate()`. Instead the
patch **reuses DOSBox-X's built-in raw-screenshot capture** (`rawshot` / `VGA_DrawRawLine`),
which reads the emulated VGA memory (`vga.draw.linear_base`) directly and translates it
through the DAC (`SetRawImagePalette` → `rawshot.image_palette`, 256×RGB). That path is
completely independent of the GFX/SDL output, so it works headless.

The patch adds, in `src/hardware/vga_draw.cpp`:
- `dbx_write_ppm()` — converts the captured 8bpp indices + DAC palette to a `P6` PPM. (PPM,
  not the built-in PNG, so it needs no libpng and no capture-dir config, and Node parses it
  trivially.) `M_LIN8` allocates the raw image as 8bpp indices; for other bpp the writer bails.
- In `VGA_VerticalTimer`: auto-arm a raw capture (`CaptureState |= CAPTURE_RAWIMAGE`) either
  on a **cadence** (`DBX_FB_EVERY` frames) or on **request** (`dbx_fb_want` countdown, set by
  the ADS hook — see scene tagging). `WriteRawImage` emits the PPM instead of the PNG when
  `DBX_FB_DIR` is set.

Env knobs: `DBX_FB_DIR` (enables + output dir), `DBX_FB_EVERY`, `DBX_FB_START`, `DBX_FB_MAX`,
plus `DBX_FB_ADS` / `DBX_FB_BURST` (scene tagging, below).

### Scene tagging (which dump is which scene)
`dosbox-x-trace.patch` (`src/cpu/core_normal.cpp`) adds a **5th entry-signature**, for the
ADS-file loader `FUN_1018_0c88` (NE seg 4, off 0x0c88; reloc-safe 26 bytes / file-unique at
16, verified with `ne_entry.py`). Its `arg0` is the ADS id (name table `1068:166e`:
0x65 ACTIVITY … 0x6d SUZY … 0x6f WALKSTUF). When the loader is entered with the target id
(`DBX_FB_ADS`, e.g. `0x6d`), the hook writes `dbx_fb_label` (e.g. `SUZY_id6D`) and arms a
`DBX_FB_BURST`-frame capture. Result: dumps named `fb_<seq>_SUZY_id6D.ppm`, tagged with the
active ADS scene. Every ADS load is also logged to the trace (`ads-loader id=…`).

## 2. Rendering the same scene in our engine
`rendering-oracle/render-ours.mjs` drives one ADS gag on the **real single-gag completion
path** (`driveGag` → `singleAdsScene`/`adsSceneTag`, the same path the golden harness uses),
composes each frame with `composeTtmFrame`, and dumps `state.surface.pixels` (RGBA) as a PPM.
Transparent pixels are composited over a chosen opaque background (black for SUZY's dream)
so the output is directly comparable to the original, whose backdrop is a real black fill.
Compositing over black is also what exposes the transparency class: where the original shows
background through a sprite hole, a wrongly-opaque sprite in our render differs.

## 3. Diffing
`rendering-oracle/diff-frames.mjs A.ppm B.ppm out.ppm [tol]` — per-pixel max-channel diff
with a small tolerance (palette/rounding slack, default 16). Emits differing-pixel count +
fraction + bounding box + max delta (JSON), and a heat image (matches dimmed grey, divergence
in red). `ppm-bbox.mjs` reports a frame's non-black bounding box — used to align frames by
content (find the frame in each set where the scene element is at the same place).

## Alignment — per-scene, not per-tick
The original's story is driven by a baked lagged-Fibonacci RNG whose **boot phase consumes a
non-deterministic number of pre-window draws** under `cycles=max` (see `rng-port.md`), so the
two engines' full story timelines cannot be tick-aligned. We therefore compare **the same
scene's rendering in both**: capture the original whenever the target ADS loads, render the
same ADS+tag in our engine, then align by **content** — pick the frame in each set whose
scene element occupies the same bounding box (the diff tool + `ppm-bbox.mjs` make this
mechanical). Validation that alignment + palette + resolution are sound: a *faithful* element
diffs to ~0% (see the watch below).

## Running it
Prereqs (from the sequencing oracle): the framebuffer+trace-patched DOSBox-X built in the
scratchpad, and `dosbox/` drives/config (drive C = our `public/data` as SCRANTIC.EXE +
RESOURCE.*, drive D = Win3.1). Apply BOTH patches then `./build-debug-macos-sdl2`.

```bash
# (optional) force a rare day-locked keyframe so a bounded run reaches it:
python3 rendering-oracle/force-scene-patches.py <dosbox>/driveC --day 3   # 3 = SUZY 1

# ORIGINAL: capture SUZY (0x6d) frames
DBX=<...>/dosbox-x-src/src/dosbox-x DBXCONF=<...>/dosbox/dbx.conf \
  OUT=/tmp/fb-suzy ADS=0x6d BURST=250 SECS=240 \
  rendering-oracle/capture-original.sh

# OURS: render SUZY scene 1 over a black backdrop
node rendering-oracle/render-ours.mjs SUZY.ADS 1 /tmp/ours-suzy 0,0,0

# align by content, then DIFF
node rendering-oracle/ppm-bbox.mjs /tmp/fb-suzy/*.ppm | sort -u -k2   # find matching bboxes
node rendering-oracle/diff-frames.mjs /tmp/fb-suzy/<orig>.ppm /tmp/ours-suzy/<ours>.ppm /tmp/diff.ppm
```

## The SUZY proof (gate)
SUZY scene 1 (ADS 0x6d, tag 1) is a day-3 daydream: a **pocket-watch** (time passing) → the
**"city dweller" scene** — a full-frame beach with a **city skyline** across the water and
Suzy sunbathing. It is a rare day-locked keyframe (day 3, 10% of endings), so it was forced
with `force-scene-patches.py --day 3` (SELECTION-only; the TTM renders identically). Two
frames were compared:

| Phase | Original bbox | Ours bbox | Diff | Meaning |
|---|---|---|---|---|
| Watch (animated element) | 255,101 93×107 | 255,101 93×107 | **0.29%** (901 px) | faithful — validates palette/res/alignment; residual = the spinning inner character |
| "City dweller" daydream | 133,68 372×267 | 164,85 305×236 | **30.4%** (93 507 px) | **DIVERGENCE FLAGGED** |

The original draws the daydream as a **full-frame inset** (beach + city skyline + sunbathing
Suzy); our engine draws it as a **small thought-bubble** at a different position/scale and
never produces the full-frame scene in any frame — a compositing-class divergence (transparency
/ scale / z-order) invisible to the sequencing oracle. The oracle catches it: the diff heat
image lights up the entire 372×267 region. The watch phase matching to 0.29% proves the same
oracle does **not** false-positive on a faithful render.

## Limits & caveats
- **Per-scene, not per-story alignment** (RNG boot-phase draw variance). You compare a scene's
  render, not a full run.
- **Force patches are selection-only.** They change which gag the director picks, never how a
  gag renders; SUZY's TTM output is identical with or without them. Keep the walk `--budget`
  ≥ keyframe width + ~40 or the queue builder NULL-derefs (corrupts selection — shows as a
  garbage ADS id in the trace).
- **Background under transparency.** Our surface is RGBA over a *separate* island canvas in
  the browser; the oracle composites over a chosen flat colour. For SUZY's dream that colour is
  black (the original's real backdrop). For a scene rendered over the island you must composite
  over the same island plate for a fair diff — otherwise transparent regions read as spurious
  divergence. (This is itself diagnostic: it reveals whether our engine fills a backdrop the
  original fills vs. relies on the host canvas.)
- **Temporal alignment of animated elements** leaves a small residual (the watch's 0.29%): pick
  the closest-matching frame, or diff a static element, to separate animation phase from a real
  rendering bug.
- **8bpp only.** The PPM writer handles `M_LIN8` (Johnny's mode). Other bpp modes bail out;
  extend `dbx_write_ppm` if needed.
- **Not committed:** the DOSBox-X build tree, captured PPMs, and the force-patched EXE. Only the
  patches, scripts, and this doc are banked. Kill stray emulators with `pkill -9 dosbox-x`.

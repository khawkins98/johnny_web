# Scaling and CRT presentation prototypes

Research for [Johnny Castaway issue 81](https://github.com/khawkins98/johnny_web/issues/81). The lab compares device-aware sizing and an optional CRT effect using the same native 640×480 input. It is a development tool served by Vite; it does not change the production settings or Enhanced default.

## Run the lab

Use Node 24+, pnpm 10, then:

```sh
pnpm install
pnpm dev --host 127.0.0.1
```

Open `/tools/presentation-lab/` on the printed Vite origin. For a repeatable frozen pattern, use `/tools/presentation-lab/?mode=auto&effect=crt&width=1000&height=750&frozen=1`.

The synthetic fixture is original project code and requires no proprietary files. For real gameplay, follow [the existing local extraction instructions](../../CONTRIBUTING.md#local-game-data), or import your own files in the embedded game. Open **Live Johnny integration**, start Classic or Enhanced, then **Connect game canvases**. **Freeze source** retains one exact composite for switching modes; the original game continues running. **Test pattern** returns to synthetic input. Reload to reset the experiment. The game iframe loads only when opened, so default synthetic captures do not run the engine.

**Width/Height** set a simulated available CSS viewport inside the lab. They are independent of the outer browser viewport and preserve controlled comparisons through browser resizing. Change these numbers to examine thresholds. Browser resize updates DPR/layout; it does not change the requested experiment dimensions. These experiments do not yet implement production fullscreen or persisted sizing.

| Before | After in the lab |
| --- | --- |
| Continuous sizing and history-dependent canvas filtering | Direct, stateless choices for smooth Fit, leaked-filter reproduction, Auto, Native and explicit sizes |
| No shared presentation experiment | Separate CSS baseline, Canvas2D device raster and WebGL output from the same frozen or moving input |
| No reproducible visual fixture or capture setup | One-pixel patterns, source hash, dimensions/DPR/origin, screenshot script and JSON measurements |
| GPU failure could obscure an experiment | Force-no-WebGL control and context-loss button retain the normal output |
| No research controls | Labeled controls with keyboard focus, 40px minimum targets and tabular numeric feedback |

## Sizing methods

`scaling.mjs` computes `floor(fit * DPR) / DPR`, where fit uses floored available device dimensions. Below one device pixel per source pixel, it falls back to smooth continuous fit. Both axes of the final stage origin are aligned to device pixels. Auto changes when both `640*n/DPR` width and `480*n/DPR` height fit the next integer device multiplier `n`.

Fit is smooth, matching direct entry to the current production Freeform mode. **Leaked pixelated filter** reproduces the scaling/filter combination reached by the existing Integer → Freeform bug; it is a visual reference rather than a production patch. Native and explicit 1.2×/1.5×/2× requests are capped to fit. Explicit stops use smooth filtering unless their effective device multiplier is integer. These compare combined sizing/filter policies, not size alone. The lab has no persistent preference and no migration of production storage.

At 1000×750 available CSS pixels, Auto gives 640×480 at DPR 1 and 960×720 at DPR 2. At DPR 1.25 it gives 512×384: the large unused area is a real cost of prioritizing equal device-pixel blocks. At 375×667/DPR 2 it gives 320×240, about 15% narrower than continuous fit. Keep Fit accessible and choose the eventual Enhanced default after usability review.

## Canvas2D device raster comparison

**Device raster · Canvas2D** draws into a separate canvas whose backing buffer matches the final device dimensions. It disables 2D image smoothing for sharp geometry, then uses ordinary CSS filtering for display. This tests explicit resampling as an alternative to CSS `pixelated` without changing the engine's buffers.

The small-screen comparison did **not** demonstrate a detail improvement: both variants preserve the fixture pixels, but the screenshot content starts one device pixel right/down from its DOM-projected origin. An initial crop at the expected origin looked like detail loss; a ±2-pixel neighborhood search recovered an exact match. This is a placement discrepancy in this Chromium capture, not evidence that CSS downsampling discarded pixels. The capture does not establish its internal cause. Keep this result when evaluating physical alignment on other browsers.

## CRT method and integration boundaries

`crt.mjs` is an original WebGL 1 fullscreen-quad pass, without Three.js or vendored shader code. A linear-filtered texture plus horizontal center/neighbor weights of 0.76/0.12/0.12 supplies modest beam softness. A source-row-locked cosine darkens by up to 12%, attenuating to zero as output density drops from two device pixels per source row to one. Curvature, flicker, bloom, phosphor masks, temporal trails and color shifts are deliberately absent. This is a restrained style experiment, not a calibrated CRT simulation.

The live adapter copies `mainCanvas` and `canvas` in order to a separate 640×480 staging canvas. This observes title, background, foreground, walking and wipe writers without calling them again. The shader uploads that finished image with `texSubImage2D`; it does not modify native canvases, renderer buffers, simulation state or timing settings. Controls remain ordinary DOM outside the pass. Frozen source hashes verify retained input identity; they do **not** establish canonical runtime-trace or scheduling equivalence.

The WebGL backing buffer matches the effective device resolution: Auto at DPR 2 in the 1000×750 experiment uses 1920×1440 output pixels for a 960×720 CSS stage. Only the original source remains 640×480. `preserveDrawingBuffer:true` makes captures reliable and can affect cost. A production adapter should revisit this and use shared dirty notifications rather than the prototype's repeated rAF uploads of frozen content. Additional work can affect wall-clock responsiveness even though the lab never advances the game clock.

Compilation/creation failure or context loss reveals the baseline. **Lose GL context** exercises the actual `WEBGL_lose_context` extension where available. Reload the lab after a lost context to rebuild GPU resources; automatic recovery is not implemented. **Force no-WebGL fallback** is a deterministic simulation of unavailable WebGL. GPU resources are reusable across ordinary sizing changes; this lab is intended for short research sessions.

## Reproduce public screenshots

Install `agent-browser` and its Chromium if needed, then keep Vite running:

```sh
node --test tools/presentation-lab/scaling.test.mjs
LAB_URL=http://127.0.0.1:5173 node tools/presentation-lab/capture.mjs
```

Use the actual port printed by Vite. The script uses an isolated browser session, a 1120×1150 CSS outer viewport, a frozen frame at tick 0 and ten sizing/effect cases. It waits for 180 presentation samples per case and closes its own session. It writes only synthetic PNGs and [metrics.json](../../docs/images/presentation-lab/metrics.json). Hashes refer to native source pixels before presentation. Browser font rasterization can change fixture hashes across machines; all captures within the recorded run must match.

For an exact source-to-screenshot pixel comparison, install Pillow in your Python environment and run:

```sh
python3 tools/presentation-lab/verify-pixels.py
```

This compares the committed native fixture to each unfiltered Auto crop expanded by nearest-neighbor replication. It first tries the DOM-projected origin, then searches ±2 device pixels, recording any displacement in [pixel-checks.json](../../docs/images/presentation-lab/pixel-checks.json). It does not silently treat displacement as correct alignment. DPR 1, 2 and 1.25 desktop Auto cases match at zero offset; both small-screen variants match at offset `[1,1]` in this run.

DPR 1/2/1.25 are **emulated**, not measured browser-zoom settings. A desktop browser at 100% with a given DPR and a zoomed browser reporting that DPR may use different compositor behavior. Actual zoom, fullscreen, cross-monitor movement, Firefox and Safari remain follow-up work. Open PNG originals at 100%: GitHub thumbnail rescaling can itself introduce moiré.

## Screenshot outcomes

Recorded 2026-10-23 in agent-browser 0.37.1, Chromium 153.0.8010.47 on macOS. The [machine-readable metadata](../../docs/images/presentation-lab/metrics.json) records reported UA, effective DPR, available area, geometry, aligned origin and source hash per capture. Every public image is synthetic; no game files or game-derived images are committed.

| Capture | Observed outcome |
| --- | --- |
| [Smooth Fit, DPR 1](../../docs/images/presentation-lab/fit-dpr1.png) | Fills 1000×750 at 1.5625×; fine stripes/checkerboard blend, with changing texture contrast. |
| [Leaked pixelated filter, DPR 1](../../docs/images/presentation-lab/leaked-filter-dpr1.png) | Same size and input, but harder and uneven patterned detail. Demonstrates why mode-order filtering matters. |
| [Auto, DPR 1](../../docs/images/presentation-lab/auto-dpr1.png) | Native 640×480 centered; sacrifices coverage for equal device-pixel blocks. |
| [Explicit 1.2×, DPR 2](../../docs/images/presentation-lab/explicit-1.2-dpr2.png) | 768×576, smooth at 2.4 device pixels/source pixel; a fractional stop alone does not ensure crisp replication. |
| [Auto, DPR 2](../../docs/images/presentation-lab/auto-dpr2.png) | 960×720 at three device pixels/source pixel; regular unfiltered pattern reproduction. Also the explicit 1.5× result at this DPR/available area. |
| [CRT, DPR 2](../../docs/images/presentation-lab/crt-dpr2.png) | Same 960×720 geometry/input; softer fine texture and faint source-row modulation. It trades some edge/texture contrast for blending. |
| [No-WebGL fallback](../../docs/images/presentation-lab/fallback-dpr2.png) | Unfiltered Auto remains readable and shows why fallback occurred. |
| [Auto, DPR 1.25](../../docs/images/presentation-lab/auto-dpr1.25.png) | Integer-device policy chooses a smaller stage; this is evidence against promising that sharp Auto always fills a desktop well. |
| [Small CSS baseline, DPR 2](../../docs/images/presentation-lab/small-dpr2.png) | Full 320×240 stage contained in 375×667; exact native pixel blocks, one device pixel right/down from DOM projection. |
| [Small Canvas2D raster, DPR 2](../../docs/images/presentation-lab/small-raster-dpr2.png) | Same containment and exact blocks; retains the same placement discrepancy. It did not improve this result. |

The capture-run CPU values include baseline-canvas copy plus GL upload/draw **submission**, excluding source acquisition and GPU completion. Timings were collected during other validation workloads and are recorded for setup transparency, not a performance comparison. Frozen content is re-uploaded every rAF. Moving synthetic generation redraws dense patterns and is outside submission timing, so its cadence must not be treated as game performance. Frame intervals include all browser work; they are not game tick timings. Use longer isolated runs with warm-up and GPU timers on target hardware before making a shipping decision.

Real-game integration was also checked locally using user-supplied data. One frozen gameplay composite (`85e2287f`, FNV-1a of RGBA bytes) remained unchanged across smooth Fit, Auto and CRT comparisons. Those PNGs are in ignored `scratchpad/issue81/`; they are intentionally absent from Git. The [actual Johnny comparison screenshots are attached to issue 81](https://github.com/khawkins98/johnny_web/issues/81#issuecomment-6364428873), with capture revision, geometry and original-art credits. Switching effects does not prove animation fidelity. A moving live-source check produced distinct hashes (`f36b37f4` then `7773e43b`) 1.2 seconds apart. Actual WebGL creation failure and context loss both revealed the baseline in Chromium. A broad matched-tick motion/zoom matrix remains pending.

## Credits and reference provenance

- Dynamix/Sierra's original Johnny Castaway art and software, and the project's port/reverse-engineering contributors: see [NOTICE](../../NOTICE). The public test pattern and lab implementation are original project code; the lab does not redistribute game data.
- [MDN crisp pixel-art guidance](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look) informed the CSS/device alignment investigation. [MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio) documents page zoom, monitor changes and re-armed resolution queries. The Auto policy is our experimental application of these principles.
- [Libretro's CRT shader overview](https://docs.libretro.com/shader/crt/) supplied visual vocabulary and its warning about scanline aliasing. No Libretro shader code was copied; shader-specific licenses would need checking before any adoption.
- Matt Sephton / [gingerbeardman, Serenity WebGL CRT shader](https://github.com/gingerbeardman/webgl-crt-shader/tree/3b4b3447a19b8819716dfca7e0286b396fbe587f) inspired the lightweight browser-pass comparison and configurable subtle presentation. Reviewed `CRTShader.js`, `crt-webgl.js`, README and [MIT license](https://github.com/gingerbeardman/webgl-crt-shader/blob/3b4b3447a19b8819716dfca7e0286b396fbe587f/LICENSE). Our GLSL is independently written, with no imported package or shader code. Upstream code reuse would require preserving its copyright/license notice.
- [MDN imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled) and [canvas optimization guidance](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) informed the separate device-raster canvas and explicit resampling comparison.
- [MDN WEBGL_lose_context](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context) informed the explicit failure exercise.
- GPT-6 Astra provided an independent retro-game rendering review, including the direct-writer audit, alignment correction and measurement caveats. Advice was checked against the implementation and browser observations; it is not a technical authority citation.

## Decision and remaining work

Keep production behavior unchanged while addressing the existing filtering/cropping bugs in a focused follow-up. Auto sharp fit is a promising option but its DPR-dependent size tradeoff merits user testing before becoming the Enhanced default. Keep CRT experimental and optional; its blending can help patterned art, but the current pass needs mobile/GPU measurement, full motion/zoom coverage and automatic context restoration before adoption.

## Validation record

- `node --test tools/presentation-lab/scaling.test.mjs`: 4 tests pass, covering thresholds, fractional stops, small-screen containment, aspect ratio and origin alignment across DPRs.
- Pixel comparison: five unfiltered Auto captures reproduce exact native blocks; the two small-screen variants retain a `[1,1]` device-pixel offset from DOM projection.
- Ten captured cases: matching native input hash `2ada5a4e`, integer DOM-projected device origins, expected geometry and simulated fallback status verified against recorded metadata.
- Browser fallback checks: actual `getContext('webgl') === null` and `WEBGL_lose_context` reveal the baseline. Automatic context restoration remains deferred.
- `pnpm build`: passes; the lab remains a dev-only page and is not part of the production entry.
- `pnpm test:golden`: passes with local game data, including dive/walk-out, gull landing, bathing and concurrent layers.
- Full `pnpm test` with game data: 803 pass, 2 skip, one existing faithfulness case (`BUILDING:7`) exceeds its 30-second timeout during concurrent workloads. Running that case alone passes in 5.65 seconds. No engine code was changed to alter the result.

After merging `main` with PR #83 (`538d281`), all 103 tests across the six affected suites, all four prototype geometry tests, and the production build pass. The game screenshots above retain their original pre-merge capture revision for reproducibility.

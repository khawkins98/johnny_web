# Optional CRT picture

Implementation follow-up to [issue #81](https://github.com/khawkins98/johnny_web/issues/81) and the [presentation lab](../tools/presentation-lab/README.md). The implementation PR is stacked on research PR #84; review its diff against that branch until the research lands.

## Try it

```sh
pnpm install
pnpm dev --host 127.0.0.1
```

Open the Vite URL, then **Settings → CRT picture · optional → Enable CRT picture**. Original game files are required for Johnny; follow the repository README to supply them locally. The [lab](http://127.0.0.1:5173/tools/presentation-lab/?view=compare&effect=crt) provides a synthetic fixture without game files, or can connect to locally running Johnny. The lab is a development page, not included in the production entry.

CRT is off for a fresh browser profile. Classic/Enhanced do not enable it; it is a separate picture preference. Its checkbox, effect settings and bypass are retained across reloads in `jc-crt-v1`. Turn it off to release the GPU canvas entirely. Bypass temporarily reveals the native canvases while retaining the GPU resources and controls.

## Picture models

Settings now offers **Creative CRT**, **VGA beam · experimental**, and **CRT-Lottes · Libretro**. Model selection does not enable CRT automatically. Each model remembers its own tuning, and changing models releases the old GPU context before creating the new renderer. Existing `jc-crt-v1` records without a model retain Creative and their old settings. VGA/Lottes use the same native-source boundary, fallback, visibility, fullscreen/resize handling and context restoration.

VGA controls describe horizontal/vertical beam width, intensity widening, assumed CRT response, raster phase, exposure and a density-filtered stripe-mask approximation. They are assumptions rather than measured monitor calibration; see [methods and limits](../tools/presentation-lab/VGA.md). A too-small output temporarily uses the normal picture and recovers after resizing. CRT-Lottes is actual pinned public-domain upstream code, with adjustable mask/bloom and a reset to its arcade-style defaults. Its [source/provenance](../src/games/johnny/ui/crt/vendor/README.md) is retained.

The advanced Guest HD pipeline is a separately licensed **lab-only** WebGL2 reference; it is not a game model. [Guest setup, GPL source and limits](../tools/presentation-lab/vendor/guest-hd/README.md).

## Presets and customization

The **Balanced CRT** built-in reproduces the user's 2026-10-23 screenshot:

| Effect | Amount |
| --- | --- |
| Beam blur | 1.00 source px |
| Colour bleed | 0.70 source px |
| Bloom | 8% |
| Scanlines | 10% |
| Curvature | 1% |
| Vignette | 5% |

All six are enabled. Subtle, Soft and All effects off remain available. Choosing a built-in clears bypass, but never checks the game-wide Enable CRT checkbox.

Adjust any slider or checkbox, enter a name and choose **Save preset**. Saving the same exact name updates that entry. Choose a saved entry to load it, or **Delete preset** to remove it. Names are limited to 40 characters and the library to 20 entries. The shared `jc-crt-presets-v1` library is available to both the lab and the game on the same origin/browser profile. Creative named presets store effective effect amounts and bypass; disabled effects are stored as zero. There is no account sync or export/import in this implementation. Failed storage writes are reported and current controls still work. Storage input is validated and bounded; preset names are rendered as text.

## Presentation boundary

Shared code lives in `src/games/johnny/ui/crt/`; the lab imports it through small compatibility exports. Creative and VGA GLSL are original. CRT-Lottes is the explicitly credited public-domain upstream shader. No new package dependency is introduced.

The browser compositor reads `mainCanvas` and `canvas` once per presentation rAF into a separate 640×480 source. This covers the intro, island presenter, walk/pose, fades and direct transition writers without invoking their renderers again. It changes no engine clock, game source pixels, faithful rasterizer or random state. Settings, timeline and HUD remain outside CRT. The original canvases are hidden only after a successful GPU draw and immediately revealed for bypass, off, failure, hidden document, zero-size stage or visible file-import panel.

The output follows the source canvas's actual CSS rectangle and current DPR each frame, including existing scaling modes, resize, scroll and fullscreen changes. GPU dimensions are capped at 4096 per side and the driver's viewport/renderbuffer limit; very large displays can therefore receive a lower-density output. Integer mode keeps a nearest-sampled base; other modes use linear sampling. This PR also resets per-canvas `imageRendering` when leaving Integer, fixing the previously documented filter leakage. It does not change the game's scale choices or introduce the lab's Auto policy.

Blur and bleed radii are measured in source pixels. Bleed spreads chroma while preserving local luminance; bloom uses a thresholded nine-tap source neighborhood. Curvature insets the entire picture into a black surround. Scanline strength fades at low output density and is conservatively reduced with curvature to limit aliasing. Curvature and CRT cannot make arbitrary fractional scaling reproduce equal pixel blocks; 0.585× remains a useful stress case, not a recommended size.

Off allocates no GPU canvas and schedules no presentation frames. Hidden documents stop the compositor. `pagehide` releases GPU resources; `pageshow` recreates them for back/forward-cache returns. Context loss reveals the baseline; a restored context rebuilds shaders and textures automatically. If recovery does not arrive, off/on provides an explicit retry. WebGL creation, compile/link or draw exceptions reveal the normal picture. Partial initialization and normal shutdown clean up GPU resources.

## Verification and recorded limits

```sh
pnpm exec vitest run src/games/johnny/ui/crt src/games/johnny/ui/__tests__/settings.test.mjs
node --test tools/presentation-lab/scaling.test.mjs
node tools/presentation-lab/check-crt.mjs
node tools/presentation-lab/check-integration.mjs
CRT_DPR=2 node tools/presentation-lab/check-integration.mjs
pnpm build
pnpm test:golden
```

Set `LAB_URL` to your actual Vite origin for browser scripts. They use isolated agent-browser sessions and close their own browser. The integration fixture needs no proprietary assets. Checks exercise default off, resize, zero-size recovery, file-import layering, bypass, real context loss/restoration, unchanged native pixels, page lifecycle, no-WebGL fallback/retry, shader-compilation failure cleanup/retry and disposal. Bypassed back/forward-cache returns also leave GPU output unallocated. Unit tests cover named preset save/update/reload/delete, text-safe names, corrupt storage, limits and storage failure. The original GPU checks cover each effect, neutral identity, scanline contrast and shared comparison controls.

Screenshots of actual Johnny and selected settings are attached to issue #81 rather than committed, respecting the repository's game-asset policy. Initial implementation validation uses Chromium 153 via agent-browser 0.37.1 on macOS, with emulated DPR 1 and 2. Firefox, Safari, physical cross-monitor/zoom testing, mobile GPU cost and long motion/performance runs remain review work. Frame submission here is not a GPU timing benchmark. The implementation reads completed layers from a separate rAF rather than receiving an engine-present event; this can add presentation latency. No performance claim is made.

## Validation record · 2026-10-23

- Focused settings/preset suite: **20 passed**. Geometry: **4 passed**.
- Both actual WebGL scripts pass; lifecycle checks pass at emulated DPR 1 and 2, including forced compile failure cleanup and retry.
- Production build and all four game-data rendering goldens pass.
- Actual Johnny: Balanced values, native canvas dimensions, enabled/current-setting persistence and named-preset reload checked. At 375×812 CSS/DPR 2, controls use one column with no modal horizontal overflow. Chromium fullscreen preserves matching source/output rectangles.
- `pnpm exec vitest run --maxWorkers=1` with local game data: **856 passed, 2 skipped, 1 failed** in 554.92s. The failure is the existing `timed-handoff-cadence.test.mjs` BUILDING:7 case exceeding its 5000ms timeout. The same case passes alone in 310ms of test execution using `--testNamePattern 'keeps BUILDING:7'`. All 29 tests in the five suites that failed during an earlier parallel run also pass together with one worker. The parallel run was interrupted after those timing failures during concurrent capture work. Engine code and test timeout limits are unchanged; the full-suite run is not reported as green.

## Credit and references

- The Balanced tuning comes from the user's screenshot; the earlier lab and GPT-6 Astra's independent rendering review informed the presentation boundary and lifecycle checks.
- Matt Sephton / gingerbeardman's [Serenity WebGL CRT shader](https://github.com/gingerbeardman/webgl-crt-shader/tree/3b4b3447a19b8819716dfca7e0286b396fbe587f) inspired a small configurable browser pass. [Upstream MIT license](https://github.com/gingerbeardman/webgl-crt-shader/blob/3b4b3447a19b8819716dfca7e0286b396fbe587f/LICENSE). No upstream code is included.
- [Libretro CRT overview](https://docs.libretro.com/shader/crt/) informed effect vocabulary and scanline aliasing considerations; no Libretro shader is included.
- MDN's [devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio), [imageSmoothingEnabled](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled), [canvas optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), and [WEBGL_lose_context](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context) informed sizing, sampling, resource management and failure exercises.
- Johnny Castaway art remains credited to its original Dynamix/Sierra creators and the port's existing [NOTICE](../NOTICE).

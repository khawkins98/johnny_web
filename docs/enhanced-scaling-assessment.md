# Enhanced scaling and CRT assessment

Investigation for [issue #81](https://github.com/khawkins98/johnny_web/issues/81), 2026-10-23. Includes an independent GPT-6 Astra retro game design/rendering review. This initial assessment preceded the prototype work. See [the presentation lab research](../tools/presentation-lab/README.md) for runnable integrations, public screenshots, follow-up observations and credits. This is a historical assessment, not current setup guidance. The later implementation shipped in v1.4.0 with one Play flow, Balanced CRT and Stretch defaults; use [the current CRT guide](optional-crt.md) and [Island UI guide](island-ui-art.md) for released behavior.

## Findings verified at the time of assessment

`src/games/johnny/ui/settings.mjs` owns sizing, persistence (`jc-scale-mode`), and the Enhanced profile. Enhanced selects Freeform; the default without saved settings is Native. The existing settings tests assert the profile choice but do not exercise filtering or viewport geometry.

Browser checks used the local Vite app and its actual `setupSettingsUI`, initialized manually on the import screen because proprietary game data is absent. The two original canvases remained in the DOM. Chromium viewport/DPR emulation establishes geometry and computed filtering only; it is not a game-image quality comparison or real browser zoom test.

| Check | Observed result |
| --- | --- |
| Direct Freeform, 1000×800 CSS px, DPR 1 | Stage rectangle `(0,25,1000,750)`; both canvases use `auto` filtering. |
| Integer → Freeform, same viewport | Same rectangle; root resets to `auto`, but both canvases remain `pixelated`. |
| Integer → Native, same viewport | Both canvases still `pixelated`. Filtering depends on mode history. |
| Native or Integer, 375×667 CSS px, DPR 2 | Rectangle `(-132.5,93.5,640,480)`; 132.5 CSS px lies outside each side of the viewport. |
| Freeform, same small viewport | Rectangle `(0,192.875,375,281.25)`, fitting at 4:3, but retains the filtering leak after Integer. |

Additional code findings:

- Integer rounds the CSS scale, ignoring DPR, and clamps it to at least 1. This explains the small-screen crop and cannot guarantee whole device-pixel blocks under page zoom.
- Freeform uses the exact viewport fit. Patterned backgrounds can change appearance as resampling ratios change on resize.
- Centering is mathematical CSS centering, without device-pixel origin alignment. Even an integer device scale needs an aligned origin.
- Resize reapplies only Integer and Freeform. A Native small-screen fallback would also need resize handling. Fullscreen currently relies on resulting resize events; its explicit listener only updates button text.
- Stretch intentionally distorts 4:3. Keep it outside the no-distortion contract only if clearly labeled as an intentional option; otherwise retire it with a deliberate saved-value migration.

The current settings suite passes: **13/13**. That establishes a baseline, not coverage of these bugs.

## Recommended sizing policy

Make **Auto (sharp)** the candidate Enhanced default, pending visual comparison. Keep **Native**, **Fit window** (current Freeform), and explicit scale choices. Describe the result with a small readout such as `1.5× · 3 device pixels per source pixel`. Avoid implying that every fractional CSS stop is either clean or unclean.

Separate policy from DOM writes in a pure geometry function. For available CSS width `W`, height `H`, and effective browser DPR `d`:

```text
fit = min(W / 640, H / 480)
n = floor(fit * d)
Auto sharp scale = n / d                  when n >= 1
Auto fallback scale = fit, smooth filter  when n < 1
```

Calculate fit against integer available device dimensions where possible to avoid floating-point threshold overshoot. Treat these as browser-reported device pixels, not a guarantee about the panel's final compositor path.

The documented upward threshold for device multiplier `n` is **both** `W >= 640*n/d` and `H >= 480*n/d`. With stable DPR, the scale stays constant between thresholds. Use no hysteresis initially, so the policy is easy to explain and test.

| CSS viewport | DPR | Proposed Auto scale | Stage CSS size |
| --- | --- | --- | --- |
| 1000×800 | 1 | 1× | 640×480 |
| 1000×800 | 2 | 1.5× | 960×720 |
| 1280×960 | 1 | 2× | 1280×960 |
| 800×600 | 1.25 | 0.8× | 512×384 |
| 375×667 | 2 | 0.5× | 320×240 |
| 375×667 | 1 | smooth fit, ~0.586× | 375×281.25 |

The tradeoff is deliberate letterboxing and sometimes a much smaller image. At DPR 1.25, sharp Auto can even be smaller than Native. Review this with real scenes before changing Enhanced's default; keep Fit window readily available if filling space is preferred.

Explicit 1×, 1.2×, 1.5×, 2× choices should be requested **CSS** sizes, with their meaning stated. A stop is an exact device-pixel replication candidate only when `scale*d` is integer: 1.5× at DPR 2 gives 3; 1.2× at DPR 2 gives 2.4. Candidate stops should not silently define Auto's sharp ladder. Clamp any oversized request to a documented fit fallback without overwriting the saved request; show the effective size. Native means 1× when it fits, with the same no-crop fallback below native.

Set the stage's final rectangle directly, or use top-left-origin transforms; round the centering origin in device pixels, accepting at most a one-device-pixel difference between opposite margins. Avoid fractional intermediate transforms on an ancestor. Preserve canvas backing sizes at 640×480. Explicitly set/reset filtering on **each source canvas** in every mode; do not rely on root inheritance. Specify downsampling separately from sharp enlargement.

Persist requested policy and explicit scale, not the transient computed scale. Validate stored values; preserve existing user choices rather than silently resetting every saved Enhanced user. Recompute on resize, fullscreen changes, and DPR changes (including display moves and page zoom); re-arm a resolution media query after each DPR change. Decide mobile pinch-zoom behavior separately: page zoom and pinch zoom are different, and pinch zoom should not continuously fight user magnification.

## CRT proposal and decision

**Prototype separately; do not ship or enable by default on present evidence.** Use a small Canvas/WebGL presentation adapter, without adding Three.js for a fullscreen quad. Compare an unfiltered baseline, a simple smoothing reference, and a subtle CRT pass. Start with neutral colors, modest horizontal beam softness, and faint scanlines. Leave curvature, flicker, RGB splitting, bloom and phosphor masks disabled initially. A Windows-era desktop monitor is a better aesthetic target than exaggerated television interference.

Composite the existing background and foreground into a separate 640×480 staging canvas, in their existing order, then upload to a separate WebGL output canvas. Keep original contexts and canonical surfaces intact; no readback or alterations to engine frame output. Keep settings, HUD, controls, and previews outside the effect. Allocate the output buffer for its final device-pixel dimensions, not a low-resolution WebGL canvas that CSS scales again.

Integration must cover more than `src/dgds/hosts/browser-frame-presenter.mjs`: `src/games/johnny/walking.mjs` draws directly to the foreground canvas, and `src/games/johnny/ui/transitions.mjs` performs direct wipes. Audit island, title and selection paths too. A presentation-only animation-frame sampler can cover these writers during a prototype; later, a shared dirty notification can avoid redundant uploads. Never introduce a second simulation clock or advance game state from the CRT loop. Do not call the existing presenter again to obtain pixels: it mutates fade state. Verify callback ordering to avoid stale intermediate frames.

Tie scanline frequency to the actual 480 source rows and output sampling footprint; attenuate or disable modulation when resolution cannot resolve it. An arbitrary CSS striped overlay risks adding the very moiré being investigated. Judge motion as well as stills. Curvature would require an inset/overscan policy that retains every source edge and, where applicable, inverse pointer mapping; defer it.

If WebGL creation, shader compilation, allocation, or context restoration fails, show the normal canvases immediately. Only hide the sources visually after successful filtered output; keep them drawable. Handle context loss, mode toggles, resize, cleanup, visibility suspension, and restored contexts without restarting the game. Retain the user's CRT preference while reporting temporary fallback accurately.

### External shader assessment

- [MDN's pixel-art guide](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look) documents uneven pixels when CSS/device pixels do not align and notes that browser zoom changes DPR. Device-scale arithmetic is a candidate solution to validate, not proof that all browser compositor paths will be perfect.
- [Libretro CRT documentation](https://docs.libretro.com/shader/crt/) describes scanlines, blending and curvature, and warns that repeating effects generally look better at integer scale. Use it as a visual reference; select and check a specific shader's license before any reuse.
- [Serenity/WebGL CRT shader](https://github.com/gingerbeardman/webgl-crt-shader) is a viable comparison candidate. Its [LICENSE](https://github.com/gingerbeardman/webgl-crt-shader/blob/main/LICENSE) is MIT, copyright Matt Sephton; retain the notice when copying substantial code. Pin a reviewed commit before adoption. Its demo uses WebGL2 and throws if unavailable; our fallback must be added. Its bloom, RGB offsets, flicker and curvature defaults are broader than this proposal. Upstream performance statements are not measurements on Johnny. Inspect provenance of any adapted material before vendoring; do not copy demo UI/dependencies wholesale.

No shader was adopted or benchmarked in this investigation. License suitability alone does not establish quality or performance.

## Proposed implementation and validation sequence

1. Extract geometry/filter policy; fix stale filtering and small-screen fallback. Add focused tests for direct entry versus mode sequences, persisted invalid/legacy values, fit boundaries, 4:3, and pixel-aligned origins. Test both sides of each threshold, DPR changes, Native resize, and fullscreen.
2. Add Auto and explicit choices with effective-scale feedback. Compare candidate defaults before changing Enhanced; update profile tests and help text together. Preserve saved preferences.
3. Build the isolated CRT comparison prototype, then record an adopt/defer decision with timings, license/provenance, context-loss fallback and visual evidence. Shipping it is a separate decision from the sizing fix.

Visual matrix: identical static patterned backgrounds, fine text/edges and moving sprites/waves; DPR 1 and 2 at actual browser zoom 80%, 100%, 110%, 125%, 150%; small portrait/landscape, 640×480, fractional fit, and fullscreen. Include viewport values just below/at/above Auto thresholds and odd device dimensions. Record browser/OS, zoom, reported DPR, viewport, selected/effective scale, filtering and rectangle. Emulating effective DPR helps isolate arithmetic but does not replace actual zoom checks. Compare Chromium, Firefox and Safari where available.

Capture the same source frame/seed and motion interval for baseline, Auto, 1.2×, 1.5×, smooth fit and CRT. Keep game-derived captures in ignored `scratchpad/` or approved issue attachments, as CONTRIBUTING.md requires; do not commit proprietary imagery. Use synthetic one-pixel checks/dither/diagonal patterns for reusable public fixtures.

For CRT, record CPU presentation cost and frame interval p50/p95/p99 over identical runs after warm-up, with upload/draw counts and output resolution. Distinguish CPU submission time from GPU time; use disjoint timer queries where supported. Measure representative mobile/low-power hardware, and inspect hidden-tab behavior. Compare canonical frame hashes and game-tick traces with effect off/on, then run existing tests/build and rendering goldens with game data available.

At the end of the initial assessment, before/after game captures, moving-scene comparisons, the real zoom/fullscreen matrix, CRT prototype, target-device timings and fallback tests were outstanding. The linked presentation lab records subsequent prototype work; real zoom/fullscreen coverage and target-device benchmarking remain outstanding. Those were the initial findings; the [v1.4.0 release record](releases/v1.4.0-plan.md) distinguishes completed implementation checks from the remaining cross-browser and physical-device validation.

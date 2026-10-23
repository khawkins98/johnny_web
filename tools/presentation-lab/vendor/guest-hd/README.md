# Guest Advanced HD · experimental WebGL2 port

Author: **guest(r)**, with Dr. Venom and contributors credited in the preserved source headers.

Pinned source:
https://github.com/libretro/slang-shaders/tree/77c52ce6b557bcb81ca298ae01ea955dd2792ba7/crt/shaders/guest/hd

Preset: `crt/crt-guest-advanced-hd.slangp`, twelve passes. All eleven distinct `.slang` files and the preset are unmodified. The GPL-2.0-or-later notices remain intact. **COPYING** contains the full GPLv2 text, obtained from the SPDX license-list text for GPL-2.0-or-later. Apply the upstream “or later” option as stated in the headers.

The Guest browser adapter (`../../guest.mjs`, `../../guest-translate.mjs`, `../../guest-controls.mjs`, `../../guest-clock.mjs`) and the combined Guest research demo are distributed under **GPL-2.0-or-later**. The surrounding original MIT components remain available under their own MIT terms, compatible with this combined demo. Full corresponding adapter/source, preset, tests, build scripts and dependency lockfile are in this repository. Run `pnpm install`, `pnpm dev` and the browser tests described below. This is a development lab entry, independent of the production game bundle; the game's model selector imports only our Creative/VGA code and public-domain Lottes.

## Actual scope and adaptation

The port retains the full pass graph: stock twice, afterglow, pre-processing, linearization, horizontal reconstruction, two glow passes, two bloom passes, vertical/beam processing and final deconvergence. It retains custom vertex-stage varyings, named texture aliases, previous original-source history, ping-pong afterglow feedback, intermediate alpha, seven RGBA16F targets, the requested input mipmaps, and mixed source/viewport/absolute dimensions.

The adapter translates Vulkan uniform blocks to typed WebGL uniforms, removes Vulkan interface layout qualifiers, expands scalar swizzles to ES constructors, moves uniform-dependent global initializers into each stage's main, and renames the upstream `gl_FragCoord` macro. The GLSL math remains in the vendored sources; translation changes are reviewable in `guest-translate.mjs` and covered by tests. A final orientation pass displays the pipeline's logical top-down textures correctly on the browser canvas.

Black-border sampling is emulated for base-level nearest/linear samples; exact mip-level boundary footprints and sampler parity still need comparison with RetroArch. RGBA16F is the explicit float format used here. Float rendering support and framebuffer completeness are required; there is no silent RGBA8 substitute. Missing WebGL2/float support or context failure reveals the normal source. Output is capped at 2048 per side/driver limits, with a 128 MiB render-target budget. Memory metadata estimates base target storage and excludes mip chains, driver padding and program overhead.

## Optional LUT images excluded

The four optional image-LUT profiles are **unavailable**. The source [README_old](https://github.com/libretro/slang-shaders/blob/77c52ce6b557bcb81ca298ae01ea955dd2792ba7/crt/shaders/guest/advanced/README_old) says the LUTs come from varying sources; original creators and grants for these images were not established in this review. Those PNGs are not redistributed here.

`TNTC` is locked to 0, the pinned upstream default that bypasses those image lookups. Complete black 1×1 placeholders bind the inactive sampler uniforms; they are not claimed to be replacement LUT profiles. Built-in source-code color matrices remain available. The preset retains its original LUT path declarations for provenance, but the browser adapter deliberately does not load those paths.

## Profiles and time

- **Pinned upstream defaults:** parameter defaults are parsed from the pinned source, including its interlace and afterglow behavior. Image LUT selection remains off as above.
- **Progressive RGB:** overrides `interm=0`, `inter=800`, `AS=0`, `PR=PG=PB=0`. `AS=0` is what disables afterglow contribution: zeroing the channel persistence values alone leaves the recurrence's baseline coefficient active. Controls can deliberately change the exposed values after profile reset. This profile is not a hardware calibration.

Moving mode targets 60 shader frames/s using accumulated deadlines, preserving the timing remainder on 75/144/165 Hz displays. Measured cadence is reported in exported metrics. Missed display callbacks are not synthesized as extra source frames; long suspension resets history.

The lab's **Freeze source** action deliberately resets Guest history and renders shader frame 0 from the frozen shared source. It is a deterministic comparison capture, not a hold of the preceding moving Guest output. Parameter changes and new source epochs also reset history. Geometry changes reset the pipeline. Source animation/game tick rate remains separate from the shader cadence.

## Reproduce

```sh
pnpm install
pnpm dev --host 127.0.0.1
node --test tools/presentation-lab/guest-translate.test.mjs
node tools/presentation-lab/check-guest.mjs
```

Use the actual Vite origin via `LAB_URL` if needed. Open:
http://127.0.0.1:5173/tools/presentation-lab/?view=guest&effect=guest&mode=native&width=640&height=480&frozen=1

The browser test checks all twelve stages/seven float targets, pass sizes, frozen-capture stability, image-LUT lockout, asymmetric corner orientation, intermediate readbacks/GL errors, deterministic resets, previous-source history, decaying feedback with meaningful alpha, history clear, context loss, missing-WebGL2 fallback, WebGL1/2 switching and unchanged input. Scheduler tests cover 60/75/120/144/165/240 Hz callback sequences.

This establishes structural/browser behavior, **not pixel-for-pixel parity with RetroArch**. The next reference check should use the same pinned preset, source, frame count, history sequence and parameters in RetroArch, preferably comparing intermediate passes. Firefox/Safari/mobile, sustained GPU timing and physical CRT calibration remain open. No Guest code or assets are imported by the production game entry.

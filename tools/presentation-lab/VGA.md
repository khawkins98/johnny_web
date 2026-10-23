# VGA beam and Libretro comparison lab

Follow-up to [Astra's advisory on issue #81](https://github.com/khawkins98/johnny_web/issues/81#issuecomment-6368179099). VGA beam and CRT-Lottes now share their renderer/controls with optional game Settings in draft #85. This lab provides matched diagnostics; Guest HD is a separate lab-only pipeline.

```sh
pnpm dev --host 127.0.0.1
```

Open [the four-renderer comparison](http://127.0.0.1:5173/tools/presentation-lab/?view=models&effect=vga&mode=native&width=640&height=480&frozen=1). Use the Vite port actually printed if 5173 is occupied. Each panel gets the same source frame and requested area at actual CSS size:

- **Unfiltered:** canonical 640×480 source, existing sizing/filter policy.
- **Balanced:** the user's unchanged fixed six-effect preset.
- **VGA beam:** original RGB-drive/light model with adjustable beam and sampling parameters.
- **Libretro CRT-Lottes:** actual pinned public-domain Timothy Lottes source, using its upstream defaults. Its arcade-style warp/mask/bloom are a reference, not a VGA calibration.

Choose **Compare sizes** and **VGA beam** or **CRT-Lottes** to use the existing half-step/fractional ladders. Choose **Beam / grayscale / lines** under Test fixture for ramps, flat drive patches, isolated one-row lines at several intensities, RGB edges and a checkerboard. Resume source animates a marker; this synthetic cadence is not game performance. Freeze retains exact input while adjusting controls.

For actual Johnny, expand **Live Johnny integration**, start playback, choose **Connect game canvases**, then Freeze for matched frames. Resume continues acquiring moving game frames. Original assets must be supplied locally as documented in the root README. Captures remain ignored locally and are attached on the GitHub issue.

## Original VGA approximation

A 640×480 progressive RGB monitor is an explicit target hypothesis; the original user's Windows mode/tube are unverified. The renderer has no geometric warp, chroma bleed, convergence error or optical bloom. It does not yet simulate temporal phosphor response.

`vga.mjs` reconstructs nominal RGB drive with a normalized horizontal Gaussian. It evaluates subpixel drive, applies a configurable CRT response, then averages emitted light across the output footprint. Applying the response only after averaging drive would incorrectly darken high-frequency content when downsampling. A separate sRGB reference mode decodes samples before filtering. Both paths encode emitted light once for browser output. Neither is an authenticated calibration of the 1992 palette or hardware.

Neighboring lines use a unit-area vertical Gaussian with intensity-dependent widening. An erf approximation integrates each line over the destination pixel's vertical footprint. Horizontal integration uses 2–32 midpoint quadrature samples based on output density; finite support and quadrature are approximations. The supported minimum is 160×120 device pixels; smaller outputs reveal the baseline with an explanation. GPU output is also limited by driver limits/4096px per side.

Controls:

| Control | Meaning |
| --- | --- |
| Horizontal spot | Source-pixel Gaussian σ for reconstructed drive |
| Vertical beam | Base vertical Gaussian σ |
| Bright-beam widening | Additional σ at unit luminance, scaled by square-root luminance |
| CRT response | Drive-to-light exponent, disabled in sRGB-reference mode |
| Raster phase | Vertical beam/output-grid offset in source px; default 0.25 is a sampling hypothesis, not a historical calibration |
| Light exposure | Output headroom/brightness; default 0.9 |
| Stripe mask strength | Optional filtered mean-one sinusoidal RGB stripe/grille approximation with brightness compensation |
| Triads across picture | Tube-space frequency independent of source-pixel count |

At fewer than 3 output pixels per triad, visible mask strength becomes zero. It ramps to full selected strength at 6, with additional pixel-aperture attenuation. The mask is not an absorptive physical grille; multiplying separately averaged mask and light is also approximate. At 0 strength it is disabled. Default pitch 640 is only a hypothesis and should not be read as a 1:1 source/phosphor relationship.

Unit-area beams can have peaks above 1. Exposure provides deliberate headroom, but narrow beams, higher exposure or stronger masks can still clip highlights at the normalized framebuffer. Kernel normalization does **not** guarantee final-image brightness preservation after clipping. Default white-field headroom is checked at the tested density/phase; all possible settings are not guaranteed clipping-free. A known physical CRT, controlled photographs and further response measurements are needed for stronger fidelity claims.

Tuning is stored in `jc-lab-vga-v1`, separately from creative CRT presets, and is range-validated. Named production/creative presets retain their original meaning. Shader context loss reveals native input; reload the lab to rebuild the research contexts.

## Actual upstream shader

The [shared CRT-Lottes file](../../src/games/johnny/ui/crt/vendor/crt-lottes.glsl) is unmodified. Git blob SHA1: `dc0647d62124721671df08d30300e9be34491982`, verified against the pinned upstream file. The shared `src/games/johnny/ui/crt/lottes.mjs` supplies the fragment/parameter defines and upstream uniform defaults; its `shader-renderer.mjs` supplies browser vertex/texture/output plumbing. See [source provenance and public-domain declaration](vendor/README.md).

The upstream mask and bloom can be changed in the reference controls or reset. The source retains its own gamma, beam, warp and mask algorithms. It does not receive our VGA footprint integration or unresolved-mask suppression. Thus low-density aliasing/brightness differences are part of the comparison, not proof that either is a measured monitor reproduction.

## Reproducible diagnostics

```sh
node --test tools/presentation-lab/scaling.test.mjs tools/presentation-lab/vga-model.test.mjs
node tools/presentation-lab/check-vga.mjs
node tools/presentation-lab/check-crt.mjs
pnpm build
```

Set `LAB_URL` for a different Vite origin. Browser checks use isolated agent-browser sessions and close them. `vga-reference.mjs` is a slow 512-sample scalar reference used only for diagnostics, never for animation. Eight Node tests cover geometry, bounds, unresolved masks, gamma/integration order and finite quadrature against that reference (absolute radiance tolerance 0.015 over tested cases; observed maximum 0.00967).

The real-GPU check exercises all four models, gray-field light means, sRGB interpretation, default white headroom, phase 0 versus 0.25 at two output pixels per source row, intensity widening, unresolved/resolved mask, 160×120 checkerboard radiance versus CPU reference, parameter extremes, unchanged source and all three context-loss fallbacks. Measured gray/checker light means must be within 0.004 absolute linear-light units of the stated reference. Pixel quantization is included in that tolerance.

On macOS Chromium 153 via agent-browser 0.37.1, initial checks pass. Example results: phase 0/0.25 mean radiances 0.19807/0.19709 with contrast 0/0.11386; bright-beam widening reduces contrast from 0.16675 to 0.02681. Quarter-size alternating columns produce radiance 0.22697 versus the CPU reference 0.22757 at exposure 0.5. These are numerical fixture checks, not CRT hardware validation or a GPU performance benchmark. Shared source hash in that synthetic run is `2ada5a4e`.

CPU submission timings in the UI exclude GPU completion; source generation/acquisition is outside that span. Four high-DPI models can be expensive. Measure GPU timing, dropped frames and sustained behavior on actual target devices before adopting a model in the game. Firefox/Safari, physical zoom/monitor movement and mobile GPU validation remain follow-up work.

## Guest HD comparison

Select **Compare with Guest HD** or **Guest Advanced HD** under Presentation. The [12-pass WebGL2 port](vendor/guest-hd/README.md) retains its GPL source and shows formats, dimensions, history and cadence in metrics. Optional image LUTs are locked off pending provenance. Frozen comparison resets Guest history and renders frame 0, rather than holding the preceding moving effect.

## Further candidates

See [the current shader shortlist](SHADER-REFERENCES.md) for Guest Advanced/HD, Sony Megatron v2, Beam Simulator, Royale and Mega Bezel, with verified activity dates, primary links, preset distinctions and reuse considerations.

## Credits

GPT-6 Astra advised on the model and caught the drive/light integration ordering and clipping/finite-support caveats. The original implementation uses independently written Gaussian reconstruction and the standard Abramowitz–Stegun erf approximation. Conceptual references include [Timothy Lottes' pinned shader](https://github.com/libretro/glsl-shaders/blob/e808ca09c699db7a843154cf7dc4dfd766d18a8a/crt/shaders/crt-lottes.glsl), the [historical HP/Microsoft sRGB proposal](https://www.w3.org/Graphics/Color/sRGB), and [CRT-Royale documentation](https://docs.libretro.com/shader/crt_royale/). No Royale code is copied. The separate vendored Lottes source and adapter are explicitly identified above and in NOTICE. Existing [Serenity inspiration and other references](README.md#credits-and-reference-provenance) retain their earlier credit.

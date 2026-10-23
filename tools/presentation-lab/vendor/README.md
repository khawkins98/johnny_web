# CRT-Lottes reference

`crt-lottes.glsl` is the unmodified file from:
https://github.com/libretro/glsl-shaders/blob/e808ca09c699db7a843154cf7dc4dfd766d18a8a/crt/shaders/crt-lottes.glsl

Author: **Timothy Lottes**. The source header declares **public domain** and is preserved verbatim. Its stated aesthetic is an RGB CGA arcade monitor; its default mask/warp/bloom are a comparison reference, not evidence of a calibrated VGA monitor.

Our `../lottes.mjs` adapter defines FRAGMENT/PARAMETER_UNIFORM, supplies the upstream default float parameters and uses `../shader-renderer.mjs` for the browser quad/texture/output uniforms. No shader source is rewritten at load time. The UI can disable mask/bloom explicitly; metrics record both. Upstream defaults have no destination-footprint integration or low-density mask attenuation, so compare their aliasing to the experimental VGA model at small/fractional sizes.

The original VGA shader is separate code; it does not incorporate this source. Conceptual references and validation limits are documented in the lab README and issue #81.

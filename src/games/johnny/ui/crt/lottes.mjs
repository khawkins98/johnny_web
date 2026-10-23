import source from './vendor/crt-lottes.glsl?raw';
import { createShaderRenderer } from './shader-renderer.mjs';
// Exact pinned upstream source; only host defines/uniforms supplied here.
// Timothy Lottes, public domain. Provenance: vendor/README.md.
export function createLottes(canvas, onFailure) {
    return createShaderRenderer(canvas, onFailure, `#define FRAGMENT\n#define PARAMETER_UNIFORM\n${source}`, s => ({
        hardScan: -8, hardPix: -3, warpX: 0.031, warpY: 0.041, maskDark: 0.5, maskLight: 1.5,
        scaleInLinearGamma: 1, shadowMask: s.maskType ?? 3, brightBoost: 1,
        hardBloomPix: -1.5, hardBloomScan: -2, bloomAmount: s.bloom ?? 0.15, shape: 2,
    }));
}

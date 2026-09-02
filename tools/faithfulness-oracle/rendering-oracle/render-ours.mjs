#!/usr/bin/env node
// Rendering oracle -- OUR side. Render one ADS gag in our JS engine, headless,
// and dump each composed frame as a PPM (RGBA composited over an opaque
// background colour so it is directly comparable to the original's captured
// framebuffer). Mirrors test/render-goldens.mjs composition and drives the REAL
// single-gag completion path via the sanctioned driveGag helper.
//
//   node render-ours.mjs <ADS.ADS> <tag> <outDir> [bgR,bgG,bgB] [seed]
//
// e.g. SUZY scene 1 on a black dream backdrop:
//   node render-ours.mjs SUZY.ADS 1 /tmp/ours-suzy 0,0,0
//
// Requires extracted game data in public/data (proprietary, gitignored).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// repo root = three levels up from tools/faithfulness-oracle/rendering-oracle/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { driveGag, hasData } = await import(
    path.join(root, 'src/dgds/scripting/__tests__/support/drive-gag.mjs')
);
const { composeTtmFrame } = await import(path.join(root, 'src/dgds/scripting/composition.mjs'));
const { getCompositionRevision } = await import(
    path.join(root, 'src/dgds/hosts/composition-signature.mjs')
);

const adsName = process.argv[2] || 'SUZY.ADS';
const tag = Number(process.argv[3] || 1);
const outDir = process.argv[4] || path.join(root, 'ours-frames');
const bg = (process.argv[5] || '0,0,0').split(',').map(Number);
const seed = Number(process.argv[6] || process.env.SEED || 1);

if (!hasData) {
    console.error('rendering-oracle: extracted game data required in public/data');
    process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const W = 640, H = 480;
const writePPM = (pixels, file, base = null) => {
    const header = Buffer.from(`P6\n${W} ${H}\n255\n`, 'ascii');
    const body = Buffer.allocUnsafe(W * H * 3);
    // base = optional full-frame RGBA underlayer (the loaded bkgScreen, as the browser's
    // frame-renderer draws it beneath the actor raster). Where absent, fall back to flat bg.
    for (let i = 0, o = 0; i < W * H; i++) {
        const a = pixels[i * 4 + 3];
        const ur = base ? base[i * 4] : bg[0];
        const ug = base ? base[i * 4 + 1] : bg[1];
        const ub = base ? base[i * 4 + 2] : bg[2];
        if (a === 255) {
            body[o++] = pixels[i * 4]; body[o++] = pixels[i * 4 + 1]; body[o++] = pixels[i * 4 + 2];
        } else if (a === 0) {
            body[o++] = ur; body[o++] = ug; body[o++] = ub;
        } else {
            const ia = 255 - a;
            body[o++] = Math.round((pixels[i * 4] * a + ur * ia) / 255);
            body[o++] = Math.round((pixels[i * 4 + 1] * a + ug * ia) / 255);
            body[o++] = Math.round((pixels[i * 4 + 2] * a + ub * ia) / 255);
        }
    }
    writeFileSync(file, Buffer.concat([header, body]));
};

// Rasterize the loaded background screen (bkgScreen.images[0], an array of {r,g,b,a})
// into a full 640x480 RGBA base at 0,0 -- exactly what frame-renderer.drawBackground
// blits beneath the actors. Returns null when no screen is loaded (flat-bg fallback).
const backgroundBase = (state) => {
    const scr = state.bkgScreen ?? state.root?.bkgScreen;
    const img = scr?.images?.[0];
    if (!img?.pixels?.length) return null;
    const iw = img.width ?? W, ih = img.height ?? H;
    const base = new Uint8Array(W * H * 4);
    for (let y = 0; y < Math.min(ih, H); y++) {
        for (let x = 0; x < Math.min(iw, W); x++) {
            const s = img.pixels[y * iw + x];
            if (!s) continue;
            const d = (y * W + x) * 4;
            base[d] = s.r; base[d + 1] = s.g; base[d + 2] = s.b; base[d + 3] = 255;
        }
    }
    return base;
};

let n = 0, prevRev = null;
const { completed, ticks } = driveGag({
    adsName, tag, seed, maxTicks: 6000,
    onTick: (runtime, result) => {
        if (!result.presentation?.compose) return;
        const rev = getCompositionRevision(runtime.state);
        if (rev === prevRev) return;
        prevRev = rev;
        composeTtmFrame(runtime.state);
        const fp = runtime.state.surface.fingerprint();
        const base = backgroundBase(runtime.state);
        writePPM(runtime.state.surface.pixels, path.join(outDir, `ours_${String(n).padStart(4, '0')}.ppm`), base);
        if (n % 20 === 0) console.log(`frame ${n}: px=${fp.pixels} bg=${base ? 'screen' : 'flat'} bounds=${JSON.stringify(fp.bounds)}`);
        n++;
    },
});
console.log(`done adsName=${adsName} tag=${tag} completed=${completed} ticks=${ticks} frames=${n} -> ${outDir}`);

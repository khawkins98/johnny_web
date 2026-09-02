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
import { installDomShim, createCanvas, readCanvasRGBA, makePolicy } from './soft-canvas.mjs';

// repo root = three levels up from tools/faithfulness-oracle/rendering-oracle/
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { driveGag, hasData } = await import(
    path.join(root, 'src/dgds/scripting/__tests__/support/drive-gag.mjs')
);
const { composeTtmFrame } = await import(path.join(root, 'src/dgds/scripting/composition.mjs'));
const { getCompositionRevision } = await import(
    path.join(root, 'src/dgds/hosts/composition-signature.mjs')
);
// REUSE the production background renderer unchanged, under a software-canvas
// shim (see soft-canvas.mjs), so the oracle draws the same island layout
// sprites / ocean plates / tides the browser does -- rather than reimplementing
// them here and risking drift.
const { drawBackground } = await import(path.join(root, 'src/dgds/scripting/frame-renderer.mjs'));
installDomShim();
const policy = makePolicy(1);

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

// Render the FULL background -- island layout sprites, palm/raft/tide layers,
// and the ocean plate -- exactly as the browser does, by calling the real
// drawBackground(state, context, policy) into a shim canvas. Returns a
// 640x480 RGBA Uint8Array, or null when drawBackground drew nothing at all
// (no bkgScreen and no island layout loaded -- flat-bg fallback).
//
// `oceanOverride`, when given, temporarily swaps state.bkgScreen so we can
// render the NIGHT ocean plate even though driveGag's single-gag setup only
// ever loads whichever ocean the scene's own day/night selection picked
// (island scenes' day/night is normally decided by a Johnny host wrapper
// outside this single-ADS-gag harness, so it is never exercised here).
const renderBackground = (state, oceanOverride) => {
    const prevBkgScreen = state.bkgScreen;
    if (oceanOverride) state.bkgScreen = oceanOverride;
    let presentation;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    try {
        presentation = drawBackground(state, ctx, policy);
    } finally {
        state.bkgScreen = prevBkgScreen;
    }
    const rgba = readCanvasRGBA(canvas);
    let drewSomething = false;
    for (let i = 3; i < rgba.length; i += 4) {
        if (rgba[i] !== 0) { drewSomething = true; break; }
    }
    return drewSomething ? { rgba, presentation } : null;
};

// Every candidate ocean plate the scene has loaded: 3 day variants (chosen
// randomly at capture time -- selectOceanIndex in background-resources.mjs --
// so we can't know which one the original binary's random state picked) plus
// the night plate (always the LAST entry, per selectOceanIndex). Only
// non-empty for island scenes that have actually loaded ocean assets. We
// render every candidate and let the diff pick the match, exactly as for
// night vs day -- this generalises that same idea to all 4 plates instead of
// just 2, since a wrong DAY variant turned out to dominate the divergence on
// several island keyframes just as much as day-vs-night does.
const oceanVariants = (state) => {
    const oceans = state.bkgOcean;
    if (!oceans || oceans.length === 0) return [];
    const lastIdx = oceans.length - 1;
    return oceans.map((ocean, i) => ({ label: i === lastIdx ? 'night' : `day${i}`, ocean }));
};

// Background state -- including bkgScreen/bkgOcean/backgroundId/titleState --
// is loaded onto the SCENE's own state, not necessarily the top-level runtime
// state (a single-gag ADS run can nest scenes). Mirrors
// browser-frame-presenter.mjs's `backgroundState` exactly, so the oracle
// resolves the same source object the browser's background renderer does.
const backgroundState = (state) => state.scenes.find((scene) => scene?.state?.bkgScreen)?.state ?? state;

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
        const idx = String(n).padStart(4, '0');
        const bgState = backgroundState(runtime.state);
        const variants = oceanVariants(bgState);
        let drewAny = false;

        if (variants.length === 0) {
            // Non-island scene (e.g. SUZBEACH, JOFFICE): no ocean candidates,
            // just whatever bkgScreen the scene's own setup loaded.
            const day = renderBackground(bgState, null);
            writePPM(runtime.state.surface.pixels, path.join(outDir, `ours_${idx}_day.ppm`), day?.rgba ?? null);
            drewAny = Boolean(day);
        } else {
            for (const { label, ocean } of variants) {
                const r = renderBackground(bgState, ocean);
                writePPM(runtime.state.surface.pixels, path.join(outDir, `ours_${idx}_${label}.ppm`), r?.rgba ?? null);
                drewAny = drewAny || Boolean(r);
            }
        }

        if (n % 20 === 0) {
            console.log(
                `frame ${n}: px=${fp.pixels} bg=${drewAny ? 'full' : 'flat'} oceans=${variants.length || 'n/a'} bounds=${JSON.stringify(fp.bounds)}`,
            );
        }
        n++;
    },
});
console.log(`done adsName=${adsName} tag=${tag} completed=${completed} ticks=${ticks} frames=${n} -> ${outDir}`);

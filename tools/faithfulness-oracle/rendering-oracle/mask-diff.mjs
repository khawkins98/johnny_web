#!/usr/bin/env node
// Content-masked framebuffer diff (fixes rendering-oracle flaw #2: raw
// full-frame diffs are dominated by the fact that render-ours.mjs composites
// only the ADS gag over a flat fill, while the original's captured
// framebuffer is the full painted room). Instead of diffing every pixel, this
// diffs only the UNION of "pixels where orig drew real content" and "pixels
// where ours drew real content" -- each side's own static background,
// estimated straight from the many frames already captured for that scene
// (see ppm-lib.mjs#majorityBackground), is excluded. That measures real
// content divergence and localizes it, without ever needing ours to paint a
// room background it doesn't have.
//
// Usage:
//   node mask-diff.mjs <origFrame.ppm> <oursFrame.ppm> <origDir> <oursDir> [outHeat.ppm] [tol]
//
// origDir/oursDir are the capture directories used to estimate each side's
// background (majority vote over their own non-blank frames); origFrame /
// oursFrame are the two frames actually being compared (need not be members
// of a background sample size cap -- the whole directory is sampled for bg).
import { loadNonBlank, listFrames, readPPM, majorityBackground, contentMask, bboxOfIndices, writePPM, ORIG_NZMIN, OURS_NZMIN } from './ppm-lib.mjs';

export const maskDiff = ({ A, B, origBg, oursBg, tol = 16 }) => {
    if (A.w !== B.w || A.h !== B.h) throw new Error(`size mismatch ${A.w}x${A.h} vs ${B.w}x${B.h}`);
    const { w, h } = A;
    const maskA = contentMask(A, origBg, tol);
    const maskB = contentMask(B, oursBg, tol);
    const inMask = (i) => maskA[i] === 1 || maskB[i] === 1;
    const { n: maskPixels, bbox: contentMaskBBox } = bboxOfIndices(w, h, inMask);
    const { n: maskPixelsA, bbox: bboxA } = bboxOfIndices(w, h, (i) => maskA[i] === 1);
    const { n: maskPixelsB, bbox: bboxB } = bboxOfIndices(w, h, (i) => maskB[i] === 1);

    let diffPixels = 0, maxDelta = 0;
    const differs = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        if (!inMask(i)) continue;
        const dr = Math.abs(A.data[i * 3] - B.data[i * 3]);
        const dg = Math.abs(A.data[i * 3 + 1] - B.data[i * 3 + 1]);
        const db = Math.abs(A.data[i * 3 + 2] - B.data[i * 3 + 2]);
        const d = Math.max(dr, dg, db);
        if (d > tol) {
            diffPixels++;
            if (d > maxDelta) maxDelta = d;
            differs[i] = 1;
        }
    }
    const { bbox: divergenceBBox } = bboxOfIndices(w, h, (i) => differs[i] === 1);
    const fraction = maskPixels > 0 ? +(diffPixels / maskPixels).toFixed(4) : 0;
    return {
        w, h, maskPixels, contentMaskBBox, diffPixels, fraction, maxDelta, divergenceBBox, maskA, maskB, differs,
        maskPixelsA, bboxA, maskPixelsB, bboxB,
    };
};

export const writeHeat = (file, w, h, A, { maskA, maskB, differs }) => {
    const out = Buffer.allocUnsafe(w * h * 3);
    for (let i = 0; i < w * h; i++) {
        if (differs[i]) {
            out[i * 3] = 255; out[i * 3 + 1] = 0; out[i * 3 + 2] = 0; // red = real divergence
        } else if (maskA[i] || maskB[i]) {
            // in-mask and matching: mid grey underlay of A for context
            const g = (A.data[i * 3] * 0.3 + A.data[i * 3 + 1] * 0.59 + A.data[i * 3 + 2] * 0.11) * 0.6 | 0;
            out[i * 3] = g; out[i * 3 + 1] = g; out[i * 3 + 2] = g;
        } else {
            // out-of-mask (background on both sides): very dim, so the
            // excluded region is visibly distinguished from a real match
            const g = (A.data[i * 3] * 0.3 + A.data[i * 3 + 1] * 0.59 + A.data[i * 3 + 2] * 0.11) * 0.12 | 0;
            out[i * 3] = g; out[i * 3 + 1] = g; out[i * 3 + 2] = g;
        }
    }
    writePPM(file, w, h, out);
};

// Only run the CLI body when invoked directly (rank.mjs imports the two
// functions above and precomputes backgrounds once per scene instead).
if (process.argv[1] && process.argv[1].endsWith('mask-diff.mjs')) {
    const [origFrame, oursFrame, origDir, oursDir, outHeat, tolArg] = process.argv.slice(2);
    if (!origFrame || !oursFrame || !origDir || !oursDir) {
        console.error('usage: mask-diff.mjs <origFrame.ppm> <oursFrame.ppm> <origDir> <oursDir> [outHeat.ppm] [tol]');
        process.exit(2);
    }
    const tol = Number(tolArg ?? 16);
    const origBgFrames = loadNonBlank(listFrames(origDir), 30, ORIG_NZMIN).map((f) => f.frame);
    const oursBgFrames = loadNonBlank(listFrames(oursDir), 30, OURS_NZMIN).map((f) => f.frame);
    const origBg = majorityBackground(origBgFrames);
    const oursBg = majorityBackground(oursBgFrames);
    const A = readPPM(origFrame), B = readPPM(oursFrame);
    const r = maskDiff({ A, B, origBg, oursBg, tol });
    if (outHeat) writeHeat(outHeat, r.w, r.h, A, r);
    console.log(JSON.stringify({
        orig: origFrame.split('/').pop(), ours: oursFrame.split('/').pop(), tol,
        maskPixels: r.maskPixels, contentMaskBBox: r.contentMaskBBox,
        differingPixels: r.diffPixels, fraction: r.fraction,
        maxChannelDelta: r.maxDelta, divergenceBBox: r.divergenceBBox,
    }, null, 0));
}

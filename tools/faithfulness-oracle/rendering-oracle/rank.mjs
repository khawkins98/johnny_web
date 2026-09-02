#!/usr/bin/env node
// Trustworthy re-rank of the rendering oracle's captured scenes. Fixes all
// three flaws found in the blind sweep (see RENDERING-ORACLE.md):
//   1. blank capture frames        -> ppm-lib's isBlankFrame/loadNonBlank
//      filter (nz < 15000) everywhere a candidate frame is picked.
//   2. ours lacks the room bg      -> mask-diff.mjs's content-masked diff
//      (each side's own background is estimated by majority vote over its
//      own non-blank frames, then excluded from the comparison).
//   3. alignment fooled by blanks  -> only non-blank frames are ever paired,
//      and among candidate pairs we require a minimum in-mask pixel count
//      before trusting a low fraction (a near-empty mask trivially "matches").
//
// Usage: node rank.mjs [capturesRoot] [outDir]
//   capturesRoot: directory containing the orig-dayN / ours-<name> dirs
//                 (default: the banked blind-sweep captures).
//   outDir:       where to write heat-<SCENE>.ppm for every ranked scene
//                 (default: <capturesRoot's sibling>/track1-out).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { readPPM, listFrames, loadNonBlank, majorityBackground, bboxIoU, ORIG_NZMIN, OURS_NZMIN } from './ppm-lib.mjs';
import { maskDiff, writeHeat } from './mask-diff.mjs';

const CAPS = process.argv[2] ||
    '/private/tmp/claude-501/-Users-khawkins-Documents-git-johnny-web/636b3fbc-2323-4456-ae0c-481b8c5b84c4/scratchpad/blind-sweep';
const OUT = process.argv[3] ||
    '/private/tmp/claude-501/-Users-khawkins-Documents-git-johnny-web/636b3fbc-2323-4456-ae0c-481b8c5b84c4/scratchpad/track1-out';
mkdirSync(OUT, { recursive: true });

const TOL = 16;
// A candidate alignment pair is only trusted if its content mask covers at
// least this many pixels; otherwise a pair where both sides happen to be
// near-blank-but-not-quite could still slip through the >=15000 nz filter's
// stride sampling and falsely read as "faithful". 500px ~= a small icon; real
// gag content in these captures runs from ~900px to >90000px, so this only
// rejects degenerate pairs, never real content.
const MIN_MASK_PIXELS = 500;
// Alignment search budget: sample the non-blank frame set on each side (a
// static-hold keyframe repeats the same content across many consecutive
// captures, so a modest stride finds the same alignment a full search would).
const ORIG_SAMPLE_CAP = 14;
const OURS_SAMPLE_CAP = 40;
// bg estimate: majority-vote sample size (more frames = more robust to a
// large/moving foreground element accidentally forming a false majority).
const BG_SAMPLE_CAP = 30;

// `knownBg`: for SUZY, the dream backdrop is DOCUMENTED ground truth (see
// RENDERING-ORACLE.md's own render recipe and "SUZY proof": the daydream is
// rendered "over a black dream backdrop", and that black backdrop is what
// the original's captured framebuffer shows outside the daydream art too).
// Use that known constant directly instead of estimating it -- see the note
// above the background-estimation pass for why per-scene majority vote is
// UNSAFE for SUZY specifically (its own keyframe is such a long static hold
// within its own capture burst that majority vote mistakes the keyframe art
// itself for "background"). JOHNNY/MARY have no such documented constant (a
// real painted room, not a flat colour) and their room decor is not provably
// identical day-to-day, so they keep the general per-scene estimate.
const scenes = [
    { name: 'SUZY 1', orig: 'orig-day3', ours: ['ours-suzy1'], knownBg: [0, 0, 0] },
    { name: 'SUZY 2', orig: 'orig-day9', ours: ['ours-suzy2'], knownBg: [0, 0, 0] },
    { name: 'JOHNNY 1', orig: 'orig-day11', ours: ['ours-johnny1'] },
    { name: 'JOHNNY 2', orig: 'orig-day2', ours: ['ours-johnny2'] },
    { name: 'JOHNNY 3', orig: 'orig-day6', ours: ['ours-johnny3'] },
    { name: 'JOHNNY 6', orig: 'orig-day10', ours: ['ours-johnny6'], skip: 'capture is bad (see RENDERING-ORACLE.md / report.md notes)' },
    { name: 'MARY 1', orig: 'orig-day5', ours: ['ours-mary1'] },
    { name: 'MARY 2', orig: 'orig-day1', ours: ['ours-mary2'] },
];

const solidBg = (w, h, [r, g, b]) => {
    const data = Buffer.allocUnsafe(w * h * 3);
    for (let i = 0; i < w * h; i++) { data[i * 3] = r; data[i * 3 + 1] = g; data[i * 3 + 2] = b; }
    return { w, h, data };
};

const heatSlug = (name) => name.replace(/\s+/g, '');

// --- Pass 1: load each scene's non-blank frames. -----------------------
const loaded = new Map(); // name -> { origAll, oursAll } | { err }
for (const scene of scenes) {
    if (scene.skip) continue;
    try {
        const origPaths = listFrames(path.join(CAPS, scene.orig));
        const oursPaths = scene.ours.flatMap((d) => listFrames(path.join(CAPS, d)));
        // Flaw #1/#3: drop blanks before EVERYTHING -- background estimation,
        // alignment search, and the comparison itself. Orig and ours use
        // different blank bars: orig's real content is a full painted room
        // (nz ~90% of frame) so a high bar (ORIG_NZMIN) cleanly separates
        // real paint from pre-paint dumps; ours's real content is just the
        // ADS gag sprite, sometimes only a few hundred pixels, so it needs a
        // much lower bar (OURS_NZMIN) that only drops genuinely pre-draw
        // empty frames.
        const origAll = loadNonBlank(origPaths, Infinity, ORIG_NZMIN);
        const oursAll = loadNonBlank(oursPaths, Infinity, OURS_NZMIN);
        if (!origAll.length || !oursAll.length) {
            loaded.set(scene.name, { err: `no non-blank frames (orig ${origAll.length}, ours ${oursAll.length})` });
        } else {
            loaded.set(scene.name, { origAll, oursAll });
        }
    } catch (e) {
        loaded.set(scene.name, { err: `missing dir: ${e.message}` });
    }
}

// --- Pass 2: per-scene alignment + content-masked diff. -------------------
// NOTE on the majority-vote background estimate's own limit (be aware of
// this reading the results): a single scene's own capture burst can itself
// BE a long static hold of the very "keyframe" content we want to measure
// (that's the definition of a keyframe). If the keyframe art is held static
// for MORE frames than any other single state in that scene's burst, a
// per-scene majority vote will misidentify the keyframe art itself as
// "background". SUZY is a proven case of this (see `knownBg` above) and is
// worked around with the documented true backdrop; JOHNNY/MARY have no such
// external ground truth (a real, per-day-varying painted room) and use the
// general per-scene estimate, so a similar (partial) under-count is possible
// there too -- flagged explicitly in report.md, not hidden.
const results = [];
for (const scene of scenes) {
    if (scene.skip) {
        results.push({ name: scene.name, err: scene.skip });
        continue;
    }
    const entry = loaded.get(scene.name);
    if (entry.err) {
        results.push({ name: scene.name, err: entry.err });
        continue;
    }
    const { origAll, oursAll } = entry;
    const origBg = scene.knownBg
        ? solidBg(origAll[0].frame.w, origAll[0].frame.h, scene.knownBg)
        : majorityBackground(origAll.slice(0, BG_SAMPLE_CAP).map((f) => f.frame));
    // Flaw #2 (ours side): ours's background is always its own known flat
    // fill colour, so a per-scene estimate is safe (no long-static-hold
    // confound -- the fill is constant literally everywhere outside the gag,
    // every frame).
    const oursBg = majorityBackground(oursAll.slice(0, BG_SAMPLE_CAP).map((f) => f.frame));

    // Alignment search over a bounded, evenly-strided sample of non-blank
    // frames on both sides -- best-aligns on masked fraction, not raw min.
    const strideSample = (arr, cap) => {
        const stride = Math.max(1, Math.floor(arr.length / cap));
        const out = [];
        for (let i = 0; i < arr.length && out.length < cap; i += stride) out.push(arr[i]);
        return out;
    };
    const origCand = strideSample(origAll, ORIG_SAMPLE_CAP);
    const oursCand = strideSample(oursAll, OURS_SAMPLE_CAP);

    // Two-pass alignment: (1) score every candidate pair by content-bbox
    // overlap (IoU of orig's own content bbox vs ours' own content bbox) --
    // this is "does the gag occupy the same screen region in both", the
    // actual alignment signal -- and by mask size (reject degenerate,
    // near-empty pairs). (2) among the best-aligned pairs, pick the one with
    // the lowest masked divergence fraction. This replaces flaw #3's raw
    // global-min-fraction search, which could be fooled by a coincidentally
    // low fraction between two frames that aren't really showing the same
    // content in the same place.
    const candidates = [];
    let maxIoU = 0;
    for (const oc of origCand) {
        for (const uc of oursCand) {
            const r = maskDiff({ A: oc.frame, B: uc.frame, origBg, oursBg, tol: TOL });
            if (r.maskPixels < MIN_MASK_PIXELS) continue; // degenerate: reject, don't let it win on a trivial 0 fraction
            const iou = bboxIoU(r.bboxA, r.bboxB);
            if (iou > maxIoU) maxIoU = iou;
            candidates.push({ r, iou, origPath: oc.path, oursPath: uc.path });
        }
    }
    if (!candidates.length) {
        results.push({ name: scene.name, err: 'no candidate pair met the minimum content-mask size (all degenerate)' });
        continue;
    }
    // Restrict to well-aligned pairs (within 50% of the best overlap found)
    // when any real overlap exists at all; otherwise every candidate is
    // equally (mis)aligned, which is itself worth surfacing, not silently
    // hidden by falling back to an arbitrary "aligned" subset.
    const pool = maxIoU > 0 ? candidates.filter((c) => c.iou >= 0.5 * maxIoU) : candidates;
    let best = pool[0];
    for (const c of pool) if (c.r.fraction < best.r.fraction) best = c;
    best.noOverlap = maxIoU === 0;

    const A = readPPM(best.origPath);
    const heatPath = path.join(OUT, `heat-${heatSlug(scene.name)}.ppm`);
    writeHeat(heatPath, best.r.w, best.r.h, A, best.r);

    results.push({
        name: scene.name,
        origPath: best.origPath, oursPath: best.oursPath, heatPath,
        maskPixels: best.r.maskPixels, contentMaskBBox: best.r.contentMaskBBox,
        bboxA: best.r.bboxA, bboxB: best.r.bboxB, bboxIoU: +best.iou.toFixed(3), noOverlap: best.noOverlap,
        differingPixels: best.r.diffPixels, fraction: best.r.fraction,
        maxDelta: best.r.maxDelta, divergenceBBox: best.r.divergenceBBox,
    });
}

results.sort((a, b) => (b.fraction ?? -1) - (a.fraction ?? -1));

const bboxStr = (b) => (b ? `${b.x},${b.y} ${b.w}x${b.h}` : 'none');
console.log('scene    | fraction | diffPx  | maskPx  | IoU   | maxΔ | divergenceBBox              | orig / ours');
console.log('---------|----------|---------|---------|-------|------|-----------------------------|------------------');
for (const r of results) {
    if (r.err) { console.log(`${r.name.padEnd(8)} | SKIPPED: ${r.err}`); continue; }
    console.log(
        `${r.name.padEnd(8)} | ${String(r.fraction).padEnd(8)} | ${String(r.differingPixels).padEnd(7)} | ` +
        `${String(r.maskPixels).padEnd(7)} | ${String(r.bboxIoU).padEnd(5)} | ${String(r.maxDelta).padEnd(4)} | ${bboxStr(r.divergenceBBox).padEnd(27)} | ` +
        `${path.basename(r.origPath)} / ${path.basename(r.oursPath)}${r.noOverlap ? '  [no bbox overlap at all]' : ''}`,
    );
}

console.log(JSON.stringify(results, null, 2));

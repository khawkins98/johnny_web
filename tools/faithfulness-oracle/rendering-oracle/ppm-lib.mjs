// Shared PPM (P6) helpers for the rendering oracle's blank-filtering,
// content-masking and background-estimation logic. Pure JS, no deps.
//
// Background problem this solves (see RENDERING-ORACLE.md flaw #2):
// render-ours.mjs composites the ADS gag over a FLAT flood-fill colour; the
// original's captured framebuffer is the full painted room (background art +
// gag). A raw full-frame diff therefore counts "ours never draws the room" as
// divergence, which swamps any real compositing bug. `majorityBackground`
// estimates each side's true static background straight from the many frames
// already captured for a scene (no re-render, no emulator): for "ours" the
// background is always the same exact flat colour, so majority-vote recovers
// it trivially; for "orig" the room art is redrawn pixel-identically while
// only the gag element (small, and/or moving/appearing) varies over the
// capture burst, so the per-pixel majority value across many frames is the
// static backdrop. `contentMask` then flags, per pixel, "this differs from
// this side's own background" -- i.e. "this side actually drew content
// here" -- and the union of both sides' masks is the fair comparison region.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WS = new Set([0x20, 0x0a, 0x09, 0x0d]);

export const readPPM = (p) => {
    const buf = readFileSync(p);
    let o = 0;
    const token = () => {
        while (WS.has(buf[o])) o++;
        const s = o;
        while (!WS.has(buf[o])) o++;
        return buf.toString('ascii', s, o);
    };
    if (token() !== 'P6') throw new Error(`${p}: not a P6 PPM`);
    const w = Number(token());
    const h = Number(token());
    Number(token()); // maxval, assumed 255
    o++; // single whitespace separator
    return { w, h, data: buf.subarray(o, o + w * h * 3) };
};

export const writePPM = (file, w, h, data) => {
    writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`, 'ascii'), data]));
};

/** Count of "non-black" pixels (any channel > threshold). Used for both the
 * blank-frame filter (flaw #1/#3) and quick content sanity checks. */
export const nzCount = (frame, threshold = 8) => {
    const { w, h, data } = frame;
    let n = 0;
    for (let i = 0; i < w * h; i++) {
        if (data[i * 3] > threshold || data[i * 3 + 1] > threshold || data[i * 3 + 2] > threshold) n++;
    }
    return n;
};

// A captured ORIGINAL frame with fewer than this many non-black pixels is a
// blank capture (dump cadence landed before the scene painted, or between
// draws) and must never be used as an alignment/comparison candidate or fed
// into background estimation. Calibrated against full 640x480 painted-room
// keyframes (~90% coverage) vs. genuinely empty pre-paint dumps (nz=0).
export const ORIG_NZMIN = 15000;

// An OURS frame's *legitimate* content is often much smaller than a full
// scene (render-ours.mjs draws only the ADS gag sprite, e.g. as small as
// ~900px for a watch icon) -- 15000 would wrongly call every real ours frame
// "blank". Ours only needs a much lower bar to drop the handful of truly
// empty frames written before the gag has drawn anything at all (nz==0 or
// near it).
export const OURS_NZMIN = 50;

export const isBlankFrame = (frame, nzmin = ORIG_NZMIN) => nzCount(frame) < nzmin;

/** Sorted absolute paths of every *.ppm in a directory. */
export const listFrames = (dir) =>
    readdirSync(dir)
        .filter((f) => f.endsWith('.ppm'))
        .sort()
        .map((f) => path.join(dir, f));

/**
 * Load frames from `paths`, dropping blanks, up to `cap` frames (evenly
 * strided across the input so we sample the whole burst, not just its head).
 */
export const loadNonBlank = (paths, cap = Infinity, nzmin = ORIG_NZMIN) => {
    const out = [];
    const stride = Math.max(1, Math.floor(paths.length / Math.max(cap * 3, 1)));
    for (let i = 0; i < paths.length && out.length < cap; i += stride) {
        let fr;
        try {
            fr = readPPM(paths[i]);
        } catch {
            continue;
        }
        if (!isBlankFrame(fr, nzmin)) out.push({ path: paths[i], frame: fr });
    }
    return out;
};

/**
 * Per-pixel-channel majority vote (Boyer-Moore) across a set of already-loaded
 * non-blank frames of the same scene. O(1) extra memory per pixel, one pass.
 * Robust to a static background redrawn identically frame-to-frame with a
 * minority of pixels overwritten by a (smaller, and/or moving) foreground
 * element -- exactly the shape of these captures.
 */
export const majorityBackground = (frames) => {
    if (!frames.length) throw new Error('majorityBackground: no frames');
    const { w, h } = frames[0];
    const n = w * h * 3;
    const candidate = new Uint8Array(n);
    const count = new Int16Array(n);
    for (const { data } of frames) {
        for (let i = 0; i < n; i++) {
            const v = data[i];
            if (count[i] === 0) {
                candidate[i] = v;
                count[i] = 1;
            } else if (candidate[i] === v) {
                count[i]++;
            } else {
                count[i]--;
            }
        }
    }
    return { w, h, data: candidate };
};

/** Boolean mask (Uint8Array 0/1): pixel differs from this side's own
 * background by more than `tol` on any channel -- i.e. this side drew real
 * content here. */
export const contentMask = (frame, bg, tol = 16) => {
    const { w, h, data } = frame;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const dr = Math.abs(data[i * 3] - bg.data[i * 3]);
        const dg = Math.abs(data[i * 3 + 1] - bg.data[i * 3 + 1]);
        const db = Math.abs(data[i * 3 + 2] - bg.data[i * 3 + 2]);
        mask[i] = Math.max(dr, dg, db) > tol ? 1 : 0;
    }
    return mask;
};

/** Intersection-over-union of two bboxes ({x,y,w,h} or null). Used to score
 * whether a candidate orig/ours frame pair is plausibly aligned (their
 * content occupies roughly the same screen region) rather than just picking
 * whichever pair happens to minimize the diff fraction. */
export const bboxIoU = (a, b) => {
    if (!a || !b) return 0;
    const ix1 = Math.max(a.x, b.x), iy1 = Math.max(a.y, b.y);
    const ix2 = Math.min(a.x + a.w, b.x + b.w), iy2 = Math.min(a.y + a.h, b.y + b.h);
    const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
    const inter = iw * ih;
    const union = a.w * a.h + b.w * b.h - inter;
    return union > 0 ? inter / union : 0;
};

export const bboxOfIndices = (w, h, predicate) => {
    let minX = w, minY = h, maxX = -1, maxY = -1, n = 0;
    for (let i = 0; i < w * h; i++) {
        if (!predicate(i)) continue;
        n++;
        const x = i % w, y = (i / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return { n, bbox: maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null };
};

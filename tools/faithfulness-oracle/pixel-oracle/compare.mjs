#!/usr/bin/env node
// compare.mjs -- pixel-oracle comparator for one gag: our headless render vs a
// tick-aligned framebuffer capture of the original (capture-gags.mjs).
//
//   1. Read the capture: timeline.jsonl (live set per original tick), trace.log
//      (#FBLOAD ticks: the forced ADS loads; episode 1 = first load .. second load)
//      and fb/t<tick>.ppm.gz (dump taken at that tick), fb/L1_t*.ppm.gz (the
//      backdrop the gag starts on).
//   2. Pick our seed: drive seeds 1..N and keep the one whose live-set span
//      sequence covers the most original samples (align.mjs). Random branches
//      differ between runs, so the seed with the same branches is the fair one.
//   3. Keyframes at live-set transitions plus mid-span samples (align.mjs).
//   4. Render ours (render-ours.mjs, browser presenter on a soft canvas) and score
//      each keyframe (score.mjs) against original ticks k-1..k+1 and our ticks in
//      each candidate's window (align.mjs searchWindows: +-window, wider for mid-span
//      keyframes); the best-aligned pair is the keyframe's score.
//
// Usage:
//   node compare.mjs <NAME:tag> [--captures scratchpad/pixel-oracle/captures]
//        [--seeds 16] [--window 6] [--dump dir] [--json]
// Library: compareGag({ gag, captureDir, ... }).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { driveGag, resolveEntry } from '../../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { johnnyCastaway } from '../../../src/games/johnny/manifest.mjs';
import { alignSpans, pickKeyframes, searchWindows, toSpans } from './align.mjs';
import { readFrame, sideBySide, writePng } from './images.mjs';
import { compositeRgb, forcedTitleState, hasData, liveKeys, renderOurs } from './render-ours.mjs';
import { DEFAULT_TOLERANCE, foregroundShift, hostRemnantMask, mapToRgb, scoreFrame } from './score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../..');
export const DEFAULT_CAPTURES = path.join(repoRoot, 'scratchpad/pixel-oracle/captures');

export { hasData };

/** Parse a capture directory into the pieces the comparator needs. */
export const loadCapture = (dir) => {
    const timeline = readFileSync(path.join(dir, 'timeline.jsonl'), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const live = [];
    for (const row of timeline) live[row.t] = row.live;
    const trace = readFileSync(path.join(dir, 'trace.log'), 'utf8');
    const loads = [...trace.matchAll(/^#FBLOAD n=(\d+) tick=(\d+)/gm)].map((m) => Number(m[2]));
    const frames = new Map();
    const backdrops = new Map();
    const fbDir = path.join(dir, 'fb');
    for (const file of existsSync(fbDir) ? readdirSync(fbDir) : []) {
        let m = file.match(/^t(\d+)\.ppm(\.gz)?$/);
        if (m) frames.set(Number(m[1]), path.join(fbDir, file));
        m = file.match(/^L(\d+)_t(\d+)\.ppm(\.gz)?$/);
        if (m) backdrops.set(Number(m[1]), path.join(fbDir, file));
    }
    if (loads.length === 0) throw new Error(`${dir}: no #FBLOAD lines (not a --fb capture?)`);
    const start = loads[0];
    const end = loads[1] ?? live.length;
    return { live, loads, start, end, censored: loads.length < 2, frames, backdrop: backdrops.get(1) ?? null };
};

/** Our live-set stream for one seed (index = our tick; tick 0 is before the first). */
export const ourLiveStream = ({ adsName, tag, seed }) => {
    const live = [[]];
    const bakes = []; // { tick, what }: LOAD_SCREEN / STORE_AREA, which bake the plate
    let lastScreen = null;
    const { completed } = driveGag({
        adsName,
        tag,
        seed,
        titleState: forcedTitleState(adsName, tag),
        onTick: (runtime, result, tick) => {
            const state = runtime.state;
            live[tick] = liveKeys(state);
            const screen = (state.scenes.find((scene) => scene?.state?.bkgScreen)?.state ?? state).bkgScreen ?? null;
            if (screen && screen !== lastScreen) bakes.push({ tick, what: 'load-screen' });
            lastScreen = screen;
            if (result.frameOperations.some((op) => op.type === 'store-area')) bakes.push({ tick, what: 'store-area' });
        },
    });
    return { live, bakes, completed };
};

/**
 * Rectangles of the host's animated shoreline waves (both tides) for the island
 * origin a forced capture uses (layout 1, origin 0,0). The forced binary keeps
 * animating them over whatever the gag shows; they are host-owned like the island.
 * @returns {Uint8Array} 1 = host wave area
 */
export const hostWaveArea = () => {
    const profile = johnnyCastaway.background;
    const sheet = resolveEntry('BACKGRND.BMP');
    const area = new Uint8Array(640 * 480);
    const posX = profile.layouts[1].x;
    for (const tide of Object.values(profile.tides)) {
        for (const layer of [...(tide.waves ?? []), ...(tide.staticLayers ?? [])]) {
            for (const frame of layer.frames ?? [layer.frame]) {
                const image = sheet?.images?.[frame];
                if (!image) continue;
                const x0 = Math.max(0, posX + layer.x);
                const y0 = Math.max(0, layer.y);
                const x1 = Math.min(640, posX + layer.x + image.width);
                const y1 = Math.min(480, layer.y + image.height);
                for (let y = y0; y < y1; y++) area.fill(1, y * 640 + x0, y * 640 + Math.max(x0, x1));
            }
        }
    }
    return area;
};

/** Keyframes one tick after each of our plate bakes that falls inside a matched span. */
export const bakeKeyframes = ({ bakes, orig, ours, pairs, max = 12 }) => {
    const frames = [];
    const seen = new Set();
    for (const { tick, what } of bakes) {
        const after = tick + 1;
        const span = pairs.findIndex(([, b]) => ours[b].start <= after && after < ours[b].end);
        if (span < 0) continue;
        const [a, b] = pairs[span];
        const f = (after - ours[b].start) / Math.max(1, ours[b].end - ours[b].start - 1);
        const origTick = orig[a].start + Math.round(f * (orig[a].end - orig[a].start - 1));
        const key = `${what}:${origTick}`;
        if (seen.has(key)) continue;
        seen.add(key);
        frames.push({ origTick, ourTick: after, key: orig[a].key, kind: what, span });
    }
    if (frames.length <= max) return frames;
    return Array.from({ length: max }, (_, k) => frames[Math.floor((k * frames.length) / max)]);
};

/** Our RGBA foreground moved by (dx, dy), transparent where nothing moves in. */
const shiftRgba = (src, dx, dy) => {
    if (!dx && !dy) return src;
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < 480; y++) {
        const sy = y - dy;
        if (sy < 0 || sy >= 480) continue;
        for (let x = 0; x < 640; x++) {
            const sx = x - dx;
            if (sx < 0 || sx >= 640) continue;
            const s = (sy * 640 + sx) * 4;
            out.set(src.subarray(s, s + 4), (y * 640 + x) * 4);
        }
    }
    return out;
};

const median = (values) => {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const round = (x, digits = 2) => (x == null ? null : Number(x.toFixed(digits)));

/**
 * Compare one gag.
 * @param {object} o
 * @param {string} o.gag  'NAME:tag'
 * @param {string} [o.captureDir]
 * @param {number} [o.seeds=16]
 * @param {number} [o.window=6]   our-tick search radius around the mapped tick (base; mid-span keyframes widen it)
 * @param {number} [o.origJitter=1] original-tick search radius
 * @param {number} [o.tolerance]
 * @param {string|null} [o.dumpDir] write orig|ours|diff PNGs per keyframe (scratch only)
 */
export const compareGag = ({
    gag,
    captureDir = path.join(DEFAULT_CAPTURES, gag.replace(':', '_')),
    seeds = 16,
    window = 6,
    origJitter = 1,
    tolerance = DEFAULT_TOLERANCE,
    dumpDir = null,
}) => {
    const started = Date.now();
    const [name, tagRaw] = gag.split(':');
    const tag = Number(tagRaw);
    const adsName = `${name}.ADS`;
    const capture = loadCapture(captureDir);
    if (!capture.backdrop) throw new Error(`${gag}: capture has no L1 backdrop dump`);
    const origSpans = toSpans(capture.live, capture.start, capture.end);

    // -- seed choice by live-set alignment --
    let best = null;
    for (let seed = 1; seed <= seeds; seed++) {
        const stream = ourLiveStream({ adsName, tag, seed });
        const ourSpans = toSpans(stream.live);
        const alignment = alignSpans(origSpans, ourSpans);
        if (!best || alignment.matchedOrig > best.alignment.matchedOrig) {
            best = { seed, stream, ourSpans, alignment };
        }
        if (alignment.matchedOrig === alignment.totalOrig) break;
    }
    const { seed, ourSpans, alignment } = best;
    const keyframes = [
        ...pickKeyframes({ orig: origSpans, ours: ourSpans, pairs: alignment.pairs }),
        ...bakeKeyframes({ bakes: best.stream.bakes, orig: origSpans, ours: ourSpans, pairs: alignment.pairs }),
    ].filter((kf) =>
        [0, -1, 1, -2, 2].some((d) => capture.frames.has(kf.origTick + d)),
    );

    // -- original frames, loaded once --
    const backdrop = readFrame(capture.backdrop).rgb;
    const origCache = new Map();
    const origFrame = (tick) => {
        if (!capture.frames.has(tick)) return null;
        if (!origCache.has(tick)) origCache.set(tick, readFrame(capture.frames.get(tick)).rgb);
        return origCache.get(tick);
    };
    // the first original dump with the gag live, and our first tick, give the
    // host-remnant mask (score.mjs hostRemnantMask)
    let firstOrigTick = null;
    for (let t = capture.start; t < capture.end && firstOrigTick == null; t++) {
        if ((capture.live[t] ?? []).length && capture.frames.has(t + 1)) firstOrigTick = t + 1;
    }
    let ignore = null;
    const hostArea = hostWaveArea();
    const needed = new Map(); // our tick -> keyframe indices
    keyframes.forEach((kf, i) => {
        kf.best = null;
        const ourSpan = ourSpans[alignment.pairs[kf.span][1]];
        kf.candidates = searchWindows({
            kf,
            ourSpanLen: ourSpan.end - ourSpan.start,
            hasFrame: (t) => capture.frames.has(t),
            window,
            origJitter,
        });
        const ticks = new Set();
        for (const { from, to } of kf.candidates) for (let t = from; t <= to; t++) ticks.add(t);
        for (const t of ticks) {
            if (!needed.has(t)) needed.set(t, []);
            needed.get(t).push(i);
        }
    });

    // -- render ours and score at the needed ticks --
    const lastNeeded = Math.max(0, ...needed.keys());
    const bgKinds = new Set();
    let renderedLive = 0;
    let liveMismatch = 0;
    renderOurs({
        adsName,
        tag,
        seed,
        onFrame: ({ tick, live, fg, bg, bgKind }) => {
            if (!ignore && firstOrigTick != null && live.length) {
                ignore = hostRemnantMask({ first: origFrame(firstOrigTick), backdrop, fg, bg, bgKind, tolerance });
            }
            bgKinds.add(bgKind);
            renderedLive++;
            if ((best.stream.live[tick] ?? []).join(' ') !== live.join(' ')) liveMismatch++;
            for (const i of needed.get(tick) ?? []) {
                const kf = keyframes[i];
                for (const { origTick, from, to } of kf.candidates) {
                    if (tick < from || tick > to) continue;
                    const orig = origFrame(origTick);
                    const s = scoreFrame({ orig, backdrop, fg, bg, bgKind, tolerance, ignore, hostArea });
                    if (!kf.best || s.diffPct < kf.best.diffPct) {
                        kf.best = { ...s, ourTick: tick, origTick, bgKind };
                        kf.bestImage = { fg: fg.slice(), bg: bg.slice(), bgKind };
                    }
                }
            }
            return tick >= lastNeeded;
        },
    });
    if (liveMismatch) throw new Error(`${gag}: rendered live sets diverged from the seed run (${liveMismatch} ticks)`);

    // foreground placement check on each keyframe's best pair
    for (const kf of keyframes) {
        if (!kf.best) continue;
        kf.shift = foregroundShift({ orig: origFrame(kf.best.origTick), fg: kf.bestImage.fg, tolerance });
    }


    const scored = keyframes.filter((kf) => kf.best);
    // dominant foreground offset over keyframes with enough foreground to judge
    const shiftVotes = new Map();
    for (const kf of scored) {
        if (!kf.shift || kf.shift.pixels < 200 || kf.shift.rate < 0.5) continue;
        const k = `${kf.shift.dx},${kf.shift.dy}`;
        shiftVotes.set(k, (shiftVotes.get(k) ?? 0) + 1);
    }
    const judged = [...shiftVotes.values()].reduce((a, b) => a + b, 0);
    const [shiftKey, shiftCount] = [...shiftVotes].sort((a, b) => b[1] - a[1])[0] ?? ['0,0', 0];
    // Re-score each best pair with our foreground moved by the dominant offset, so a
    // systematic placement difference does not hide everything else. A keyframe that
    // already lines up unshifted (some do: see README "Foreground offset") keeps the
    // better of the two; `kf.alignedShifted` records which one was used.
    const [sdx, sdy] = shiftKey.split(',').map(Number);
    for (const kf of scored) {
        kf.aligned = kf.best;
        kf.alignedShifted = false;
        if (sdx === 0 && sdy === 0) continue;
        const { fg, bg, bgKind } = kf.bestImage;
        const shifted = scoreFrame({ orig: origFrame(kf.best.origTick), backdrop, fg: shiftRgba(fg, sdx, sdy), bg, bgKind, tolerance, ignore, hostArea });
        if (shifted.diffPct <= kf.best.diffPct) {
            kf.aligned = shifted;
            kf.alignedShifted = true;
        }
    }
    if (dumpDir) {
        mkdirSync(dumpDir, { recursive: true });
        keyframes.forEach((kf, i) => {
            if (!kf.best) return;
            const { bg, bgKind } = kf.bestImage;
            const fg = kf.alignedShifted ? shiftRgba(kf.bestImage.fg, sdx, sdy) : kf.bestImage.fg;
            const ours = compositeRgb(fg, bg, { bgFilter: () => bgKind === 'gag' });
            const orig = { width: 640, height: 480, rgb: origFrame(kf.best.origTick) };
            const map = new Uint8Array(640 * 480);
            scoreFrame({ orig: orig.rgb, backdrop, fg, bg, bgKind, tolerance, map, ignore, hostArea });
            const file = path.join(dumpDir, `${gag.replace(':', '_')}_k${String(i).padStart(2, '0')}_o${kf.best.origTick}_u${kf.best.ourTick}.png`);
            // original | ours (over black, foreground at the dominant offset) | category map | backdrop
            writePng(file, sideBySide([orig, ours, mapToRgb(map), { width: 640, height: 480, rgb: backdrop }]));
        });
    }
    for (const kf of keyframes) delete kf.bestImage;
    const remapCounts = new Map();
    for (const kf of scored) for (const [a, b] of kf.best.remap) remapCounts.set(`${a}>${b}`, (remapCounts.get(`${a}>${b}`) ?? 0) + 1);
    const diffs = scored.map((kf) => kf.best.diffPct);
    const worst = scored.reduce((w, kf) => (!w || kf.best.diffPct > w.best.diffPct ? kf : w), null);
    const eb0Worst = scored.reduce((w, kf) => (!w || kf.best.eb0TopPct > w.best.eb0TopPct ? kf : w), null);
    return {
        gag,
        seed,
        episode: { start: capture.start, end: capture.end, censored: capture.censored },
        coverage: round(alignment.totalOrig ? (100 * alignment.matchedOrig) / alignment.totalOrig : 0, 1),
        spans: { orig: origSpans.length, ours: ourSpans.length, matched: alignment.pairs.length },
        keyframes: scored.length,
        hostRemnant: ignore ? ignore.reduce((a, b) => a + b, 0) : 0,
        bgKinds: [...bgKinds].sort(),
        bakeKeyframes: scored.filter((kf) => kf.kind === 'load-screen' || kf.kind === 'store-area').length,
        stale: round(median(scored.map((kf) => kf.best.stale))),
        diffMedian: round(median(diffs)),
        diffMax: round(worst?.best.diffPct ?? null),
        alignedMedian: round(median(scored.map((kf) => kf.aligned.diffPct))),
        alignedMax: round(Math.max(...scored.map((kf) => kf.aligned.diffPct))),
        rawDiffMedian: round(median(scored.map((kf) => kf.best.rawDiffPct))),
        remapMedian: round(median(scored.map((kf) => kf.best.remapPct))),
        remaps: [...remapCounts].sort((a, b) => b[1] - a[1]).map(([k]) => k),
        fgShift: { offset: shiftKey, keyframes: shiftCount, judged, unshiftedBetter: scored.filter((kf) => !kf.alignedShifted && kf.aligned.diff > 0).length },
        backdropMedian: round(median(scored.map((kf) => kf.best.diffOnBackdropPct))),
        eb0TopMax: round(eb0Worst?.best.eb0TopPct ?? null),
        worst: worst && {
            key: worst.key,
            kind: worst.kind,
            origTick: worst.best.origTick,
            ourTick: worst.best.ourTick,
            diffPct: round(worst.best.diffPct),
            mask: worst.best.mask,
            oursOnly: worst.best.oursOnly,
            origOnly: worst.best.origOnly,
            mismatch: worst.best.mismatch,
        },
        eb0Worst: eb0Worst && {
            key: eb0Worst.key,
            origTick: eb0Worst.best.origTick,
            eb0TopPct: round(eb0Worst.best.eb0TopPct),
            diffOnBackdropPct: round(eb0Worst.best.diffOnBackdropPct),
        },
        frames: scored.map((kf) => ({
            key: kf.key,
            kind: kf.kind,
            o: kf.best.origTick,
            u: kf.best.ourTick,
            diff: round(kf.best.diffPct),
            aligned: round(kf.aligned.diffPct),
            shifted: kf.alignedShifted,
            onBackdrop: round(kf.best.diffOnBackdropPct),
            eb0Top: round(kf.best.eb0TopPct),
            mask: kf.best.mask,
            oursOnly: kf.best.oursOnly,
            origOnly: kf.best.origOnly,
            mismatch: kf.best.mismatch,
            remap: round(kf.best.remapPct),
            shift: kf.shift ? `${kf.shift.dx},${kf.shift.dy}@${Math.round(100 * kf.shift.rate)}/${Math.round(100 * kf.shift.rate0)}` : null,
        })),
        seconds: round((Date.now() - started) / 1000, 1),
    };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
    const argv = process.argv.slice(2);
    const flag = (f, d) => {
        const i = argv.indexOf(f);
        return i === -1 ? d : argv[i + 1];
    };
    const gag = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
    if (!gag) {
        console.error('usage: compare.mjs <NAME:tag> [--captures dir] [--seeds 16] [--window 6] [--dump dir] [--json]');
        process.exit(2);
    }
    if (!hasData) {
        console.log('# no game data (public/data) -- nothing to compare');
        process.exit(0);
    }
    const captures = path.resolve(flag('--captures', DEFAULT_CAPTURES));
    const result = compareGag({
        gag,
        captureDir: path.join(captures, gag.replace(':', '_')),
        seeds: Number(flag('--seeds', '16')),
        window: Number(flag('--window', '6')),
        dumpDir: flag('--dump', null),
    });
    if (argv.includes('--json')) console.log(JSON.stringify(result));
    else {
        const { frames, ...summary } = result;
        console.log(JSON.stringify(summary, null, 2));
        for (const f of frames) {
            console.log(
                `${f.kind.padEnd(11)} o=${String(f.o).padStart(5)} u=${String(f.u).padStart(5)} diff=${f.diff.toFixed(2).padStart(6)}% aligned=${f.aligned.toFixed(2).padStart(6)}% onBackdrop=${f.onBackdrop.toFixed(2).padStart(6)}% eb0Top=${f.eb0Top.toFixed(1).padStart(5)}% mask=${f.mask} ours=${f.oursOnly} orig=${f.origOnly} mis=${f.mismatch} remap=${f.remap}% shift=${f.shift} [${f.key}]`,
            );
        }
    }
    void writeFileSync;
}

#!/usr/bin/env node
// host-check.mjs -- host-canvas pixel check against NORMAL-PLAY captures of the
// original (capture-normal-play.mjs). The forced-gag oracle (compare.mjs) never sees
// the host canvas, because a forced capture skips the planner's island bake. Here
// each planned batch's bake-time host state comes from the capture's DBX_HOST log
// (island world origin 30c6/30c4, tide coin 30c2, phase/night, still waves), ours
// paints the same selection with the browser's drawBackground (render-ours.mjs
// renderHost), and the two host canvases are compared over several frames of the
// batch:
//
//   - A host pixel counts as MATCHED when it matches ours in at least one of the
//     batch's sampled frames (the original's actors and wipes move, so a
//     static host pixel is uncovered in some frame). Pixels that never match in any
//     frame are the host divergence. Pixels that differ in every frame are also
//     reported ("persistent"), a stricter view that includes standing actors.
//   - Island layers (sand, palm, raft, low-tide sand/rock) and the ocean/sky are
//     scored separately. The shoreline wave rectangles are scored by matching each
//     region against its three BACKGRND frames per sampled frame (the wave phase is
//     not in the log), not pixel-for-pixel against one phase.
//   - The original's clouds stand still for the batch (only the bake runs
//     FUN_1010_0b67). They are found in the first clean frame (cloud-detect.mjs)
//     and painted on ours before scoring; --no-clouds paints none.
//   - The day ocean (`rand % 3` at the bake, not logged) is the OCEAN screen whose
//     render matches the batch's first frame best; `oceanIndex` reports which.
//   - Windows' static-colour palette substitutions (score.mjs learnRemap) count as
//     matches, as in the forced oracle.
//
// Usage:
//   node host-check.mjs <runsDir|runDir> [--frames 12] [--dump dir] [--json out.json] [--no-clouds]
// Library: checkRun({ dir, frames }) -> per-batch results.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildSpriteCanvas } from '../../../src/dgds/graphics.mjs';
import { resolveEntry } from '../../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { johnnyCastaway } from '../../../src/games/johnny/manifest.mjs';
import { detectClouds } from './cloud-detect.mjs';
import { readFrame, sideBySide, writePng } from './images.mjs';
import { batchTitleState, batchesFromHost, parseHostLog } from './normal-play.mjs';
import { hasData, renderHost } from './render-ours.mjs';
import { DEFAULT_TOLERANCE, learnRemap } from './score.mjs';
import { SoftCanvas } from './soft-canvas.mjs';

export { hasData };

const W = 640;
const H = 480;
const N = W * H;
const BASE_X = 289; // island layer 0 base (manifest layouts[1].x)
const BASE_Y = 279; // manifest layer 0 y
/** First ocean row of the sky screens: the day OCEAN screens' horizon band starts at 150, NIGHT's sea at 205. */
export const horizonRow = (night) => (night ? 205 : 150);

const near = (a, ai, b, bi, tol) =>
    Math.abs(a[ai] - b[bi]) <= tol && Math.abs(a[ai + 1] - b[bi + 1]) <= tol && Math.abs(a[ai + 2] - b[bi + 2]) <= tol;
const rgbKey = (a, i) => (a[i] << 16) | (a[i + 1] << 8) | a[i + 2];

/** The plain ocean/night screen as RGB (what the host paints under the island). */
const oceanRgb = (index) => {
    const name = johnnyCastaway.background.oceans[index];
    const image = resolveEntry(name)?.images?.[0];
    const canvas = new SoftCanvas(W, H);
    const sprite = image && buildSpriteCanvas(image);
    if (sprite) canvas.getContext('2d').drawImage(sprite, 0, 0);
    return canvas.data;
};

/** Rectangles of the batch's tide wave regions: [{x0,y0,x1,y1,frames:[rgba...]}]. */
export const waveRegionsFor = (titleState) => {
    const profile = johnnyCastaway.background;
    const tide = profile.tides[titleState.lowTide ? 'low' : 'high'];
    const sheet = resolveEntry('BACKGRND.BMP');
    const posX = BASE_X + (titleState.x || 0);
    const posY = titleState.y || 0;
    return (tide.waves ?? []).map((layer) => {
        const images = layer.frames.map((f) => sheet?.images?.[f]).filter(Boolean);
        const w = Math.max(...images.map((i) => i.width));
        const h = Math.max(...images.map((i) => i.height));
        const frames = images.map((image) => {
            const c = new SoftCanvas(w, h);
            const sprite = buildSpriteCanvas(image);
            if (sprite) c.getContext('2d').drawImage(sprite, 0, 0);
            return c.data;
        });
        return { x0: posX + layer.x, y0: posY + layer.y, w, h, frames };
    });
};

/** Load a run directory: host batches and the tick -> dump file map. */
export const loadRun = (dir) => {
    const states = parseHostLog(readFileSync(path.join(dir, 'host.log'), 'utf8'));
    const threads = existsSync(path.join(dir, 'threads.log')) ? readFileSync(path.join(dir, 'threads.log'), 'utf8') : '';
    const ticks = (threads.match(/^THREADS /gm) || []).length;
    const batches = batchesFromHost(states, { endTick: ticks });
    const frames = new Map();
    const fbDir = path.join(dir, 'fb');
    for (const file of existsSync(fbDir) ? readdirSync(fbDir) : []) {
        const m = file.match(/^t(\d+)\.ppm(\.gz)?$/);
        if (m) frames.set(Number(m[1]), path.join(fbDir, file));
    }
    return { dir, name: path.basename(dir), states, batches, frames, ticks };
};

/** Up to `count` dump ticks of a batch: the first two (right after the bake) and the rest spread. */
export const sampleTicks = (frames, batch, count = 12) => {
    const inBatch = [...frames.keys()].filter((t) => t >= batch.startTick && (batch.endTick == null || t < batch.endTick)).sort((a, b) => a - b);
    if (inBatch.length <= count) return inBatch;
    const picked = new Set(inBatch.slice(0, 2));
    const rest = inBatch.slice(2);
    for (let k = 0; picked.size < count && k < count - 2; k++) picked.add(rest[Math.floor((k * rest.length) / (count - 2))]);
    return [...picked].sort((a, b) => a - b);
};

const pct = (n, d) => (d ? Math.round((10000 * n) / d) / 100 : 0);

/**
 * Check one batch: returns the scores and (optionally) a category map.
 * `origFrames` are the RGB dumps sampled from the batch.
 */
export const blackShare = (rgb, tol = DEFAULT_TOLERANCE) => {
    let black = 0;
    for (let p = 0; p < rgb.length; p += 3) if (rgb[p] <= tol && rgb[p + 1] <= tol && rgb[p + 2] <= tol) black++;
    return black / (rgb.length / 3);
};

export const checkBatch = ({ batch, origFrames: given, tolerance = DEFAULT_TOLERANCE, map = null, clouds: withClouds = true }) => {
    if (batch.offIsland) return null;
    // A dump taken during the wipe into the batch is (mostly) black: not host canvas.
    const origFrames = given.filter((f) => blackShare(f, tolerance) < 0.8);
    if (origFrames.length === 0) return null;
    // ocean index: the day ocean whose render differs least from the frames (summed)
    let oceanIndex = 0;
    let oceanScores = null;
    if (!batch.night) {
        oceanScores = [0, 1, 2].map((index) => {
            const ours = renderHost({ titleState: batchTitleState(batch, { oceanIndex: index }) });
            let diff = 0;
            for (const orig of origFrames) for (let p = 0; p < N; p += 4) if (!near(ours, p * 4, orig, p * 3, tolerance)) diff++;
            return diff;
        });
        oceanIndex = oceanScores.indexOf(Math.min(...oceanScores));
    }
    // The original's clouds stand still for the batch (FUN_1010_0b67 runs only at the
    // bake), so the ones found in the first clean frame are painted on our side too.
    const clouds = withClouds ? detectClouds(origFrames[0]).map(({ frame, x, y, flipX }) => ({ frame, x, y, flipX })) : [];
    const titleState = batchTitleState(batch, { oceanIndex, clouds });
    const ours = renderHost({ titleState });
    if (!ours) return null;
    const ocean = oceanRgb(batch.night ? 3 : oceanIndex);
    const regions = waveRegionsFor(titleState);
    const waveMask = new Uint8Array(N);
    for (const r of regions) {
        for (let y = Math.max(0, r.y0); y < Math.min(H, r.y0 + r.h); y++) {
            for (let x = Math.max(0, r.x0); x < Math.min(W, r.x0 + r.w); x++) waveMask[y * W + x] = 1;
        }
    }
    // island-layer mask: where our host render (without clouds) differs from the bare ocean screen
    const bare = clouds.length ? renderHost({ titleState: batchTitleState(batch, { oceanIndex }) }) : ours;
    const islandMask = new Uint8Array(N);
    for (let p = 0; p < N; p++) if (!waveMask[p] && !near(bare, p * 4, ocean, p * 4, 0)) islandMask[p] = 1;

    // palette substitutions, learnt on the first frame over the whole host canvas
    const pairs = new Map();
    for (let p = 0; p < N; p++) {
        if (waveMask[p]) continue;
        const ok = rgbKey(ours, p * 4);
        let counts = pairs.get(ok);
        if (!counts) pairs.set(ok, (counts = new Map()));
        const tk = rgbKey(origFrames[0], p * 3);
        counts.set(tk, (counts.get(tk) ?? 0) + 1);
    }
    const remap = learnRemap(pairs, { tolerance });
    const sub = new Uint8Array(3);
    const matchesAt = (orig, p) => {
        const o4 = p * 4;
        const o3 = p * 3;
        if (near(ours, o4, orig, o3, tolerance)) return true;
        const to = remap.get(rgbKey(ours, o4));
        if (to === undefined) return false;
        sub[0] = (to >> 16) & 255;
        sub[1] = (to >> 8) & 255;
        sub[2] = to & 255;
        return near(sub, 0, orig, o3, tolerance);
    };

    const skyEnd = horizonRow(batch.night) * W;
    const matchedAny = new Uint8Array(N);
    const matchedAll = new Uint8Array(N).fill(1);
    const perFrame = [];
    for (const orig of origFrames) {
        let islandDiff = 0;
        let oceanDiff = 0;
        let skyDiff = 0;
        for (let p = 0; p < N; p++) {
            if (waveMask[p]) continue;
            const ok = matchesAt(orig, p);
            if (ok) matchedAny[p] = 1;
            else {
                matchedAll[p] = 0;
                if (islandMask[p]) islandDiff++;
                else if (p < skyEnd) skyDiff++;
                else oceanDiff++;
            }
        }
        perFrame.push({ islandDiff, oceanDiff, skyDiff });
    }
    let islandPx = 0;
    let oceanPx = 0;
    let skyPx = 0;
    let neverIsland = 0;
    let neverOcean = 0;
    let neverSky = 0;
    let someSky = 0;
    let persistentIsland = 0;
    let persistentOcean = 0;
    for (let p = 0; p < N; p++) {
        if (waveMask[p]) {
            if (map) map[p] = 7;
            continue;
        }
        const cls = islandMask[p] ? 0 : p < skyEnd ? 1 : 2;
        if (cls === 0) islandPx++;
        else if (cls === 1) skyPx++;
        else oceanPx++;
        if (!matchedAny[p]) {
            if (cls === 0) neverIsland++;
            else if (cls === 1) neverSky++;
            else neverOcean++;
            if (map) map[p] = 4;
        } else if (!matchedAll[p]) {
            if (cls === 0) persistentIsland++;
            else if (cls === 1) someSky++;
            else persistentOcean++;
            if (map) map[p] = 2;
        } else if (map) map[p] = 1;
    }
    // waves: per region and frame, the best of the three BACKGRND frames
    const waves = { regions: regions.length, samples: 0, matched: 0, worstPct: 0, frameHist: regions.map(() => [0, 0, 0]) };
    for (const orig of origFrames) {
        regions.forEach((r, ri) => {
            let best = null;
            r.frames.forEach((frame, fi) => {
                let diff = 0;
                let total = 0;
                for (let y = 0; y < r.h; y++) {
                    const sy = r.y0 + y;
                    if (sy < 0 || sy >= H) continue;
                    for (let x = 0; x < r.w; x++) {
                        const sx = r.x0 + x;
                        if (sx < 0 || sx >= W) continue;
                        const f4 = (y * r.w + x) * 4;
                        if (frame[f4 + 3] === 0) continue; // transparent: whatever is under
                        total++;
                        const o3 = (sy * W + sx) * 3;
                        if (!near(frame, f4, orig, o3, tolerance)) {
                            const to = remap.get(rgbKey(frame, f4));
                            if (to === undefined) diff++;
                            else {
                                sub[0] = (to >> 16) & 255;
                                sub[1] = (to >> 8) & 255;
                                sub[2] = to & 255;
                                if (!near(sub, 0, orig, o3, tolerance)) diff++;
                            }
                        }
                    }
                }
                const p = pct(diff, total);
                if (!best || p < best.pct) best = { fi, pct: p };
            });
            waves.samples++;
            if (best.pct <= 10) waves.matched++;
            waves.frameHist[ri][best.fi]++;
            waves.worstPct = Math.max(waves.worstPct, best.pct);
        });
    }
    const worst = perFrame.reduce((w, f, i) => (!w || f.islandDiff > perFrame[w.i].islandDiff ? { i, ...f } : w), null);
    return {
        oceanIndex: batch.night ? null : oceanIndex,
        oceanScores,
        frames: origFrames.length,
        wipeFrames: given.length - origFrames.length,
        islandPx,
        oceanPx,
        neverIsland,
        neverIslandPct: pct(neverIsland, islandPx),
        neverOcean,
        neverOceanPct: pct(neverOcean, oceanPx),
        // the sky above the horizon, with the clouds found in the original painted on
        // ours (clouds: false paints none, the earlier view)
        clouds,
        skyPx,
        neverSkyPct: pct(neverSky, skyPx),
        someSkyPct: pct(someSky, skyPx),
        persistentIslandPct: pct(persistentIsland, islandPx),
        persistentOceanPct: pct(persistentOcean, oceanPx),
        // per-frame island difference (actors standing on the island, bakes the gags did)
        islandDiffMedianPct: pct(
            [...perFrame].map((f) => f.islandDiff).sort((a, b) => a - b)[perFrame.length >> 1],
            islandPx,
        ),
        skyDiffMaxPct: pct(Math.max(...perFrame.map((f) => f.skyDiff)), skyPx),
        waves: { ...waves, matchedPct: pct(waves.matched, waves.samples) },
        remaps: [...remap].map(([a, b]) => `#${a.toString(16).padStart(6, '0')}>#${b.toString(16).padStart(6, '0')}`),
        worstFrame: worst ? { index: worst.i, islandDiffPct: pct(worst.islandDiff, islandPx) } : null,
    };
};

const MAP_COLORS = [
    [0, 0, 0],
    [60, 60, 60], // matched in every frame
    [230, 200, 0], // matched in some frames (actors, clouds, bakes)
    [0, 0, 0],
    [255, 0, 0], // never matched: host divergence
    [0, 0, 0],
    [0, 0, 0],
    [0, 90, 160], // wave region (scored separately)
];
const mapToRgb = (map) => {
    const rgb = new Uint8Array(N * 3);
    for (let p = 0; p < N; p++) rgb.set(MAP_COLORS[map[p]] ?? [0, 0, 0], p * 3);
    return { width: W, height: H, rgb };
};

/** Check every island batch of a run. */
export const checkRun = ({ dir, frames = 12, dumpDir = null, tolerance = DEFAULT_TOLERANCE, clouds = true }) => {
    const run = loadRun(dir);
    const results = [];
    run.batches.forEach((batch, index) => {
        const ticks = sampleTicks(run.frames, batch, frames);
        const base = {
            run: run.name,
            batch: index,
            startTick: batch.startTick,
            endTick: batch.endTick,
            complete: batch.complete,
            day: batch.day,
            phase: batch.phase,
            night: batch.night,
            lowTide: batch.lowTide,
            wavesOff: batch.wavesOff,
            layout: batch.layout,
            layer0: { x: batch.origin.x + BASE_X, y: batch.origin.y + BASE_Y },
            ending: batch.ending,
            queue: batch.queue.length,
            ticks,
        };
        if (batch.offIsland) {
            results.push({ ...base, skipped: 'off-island batch (black plate, no host canvas)' });
            return;
        }
        if (ticks.length === 0) {
            results.push({ ...base, skipped: 'no framebuffer dump in the batch' });
            return;
        }
        const origFrames = ticks.map((t) => readFrame(run.frames.get(t)).rgb);
        const map = dumpDir ? new Uint8Array(N) : null;
        const r = checkBatch({ batch, origFrames, tolerance, map, clouds });
        const shown = origFrames.findIndex((f) => blackShare(f, tolerance) < 0.8);
        if (dumpDir && r) {
            mkdirSync(dumpDir, { recursive: true });
            const ours = renderHost({ titleState: batchTitleState(batch, { oceanIndex: r.oceanIndex ?? 0, clouds: r.clouds }) });
            const oursRgb = new Uint8Array(N * 3);
            for (let p = 0; p < N; p++) oursRgb.set(ours.subarray(p * 4, p * 4 + 3), p * 3);
            writePng(
                path.join(dumpDir, `${run.name}_b${String(index).padStart(2, '0')}_t${ticks[shown]}.png`),
                sideBySide([{ width: W, height: H, rgb: origFrames[shown] }, { width: W, height: H, rgb: oursRgb }, mapToRgb(map)]),
            );
        }
        results.push({ ...base, ...r });
    });
    return results;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
    const argv = process.argv.slice(2);
    const flag = (f, d) => {
        const i = argv.indexOf(f);
        return i === -1 ? d : argv[i + 1];
    };
    const target = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
    if (!target) {
        console.error('usage: host-check.mjs <runsDir|runDir> [--frames 12] [--dump dir] [--json out.json] [--no-clouds]');
        process.exit(2);
    }
    if (!hasData) {
        console.log('# no game data (public/data) -- nothing to check');
        process.exit(0);
    }
    const root = path.resolve(target);
    const runDirs = existsSync(path.join(root, 'host.log'))
        ? [root]
        : readdirSync(root)
              .map((d) => path.join(root, d))
              .filter((d) => existsSync(path.join(d, 'host.log')))
              .sort();
    const all = [];
    for (const dir of runDirs) {
        const started = Date.now();
        const results = checkRun({
            dir,
            frames: Number(flag('--frames', '12')),
            dumpDir: flag('--dump', null),
            clouds: !argv.includes('--no-clouds'),
        });
        all.push(...results);
        for (const r of results) {
            if (r.skipped) {
                console.log(`${r.run} b${r.batch} ${r.ending} ${r.layout} -- ${r.skipped}`);
                continue;
            }
            console.log(
                `${r.run} b${r.batch} ${String(r.ending).padEnd(12)} ${r.layout.padEnd(10)} layer0=${r.layer0.x}/${r.layer0.y} ${r.night ? 'night' : `ocean${r.oceanIndex}`} ${r.lowTide ? 'low ' : 'high'} frames=${r.frames} island never=${r.neverIslandPct}% persistent=${r.persistentIslandPct}% ocean never=${r.neverOceanPct}% sky never/some=${r.neverSkyPct}%/${r.someSkyPct}% clouds=${r.clouds.length} waves=${r.waves.matchedPct}% (worst ${r.waves.worstPct}%)`,
            );
        }
        console.error(`[host-check] ${path.basename(dir)}: ${results.length} batches in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    }
    const out = flag('--json', null);
    if (out) writeFileSync(out, JSON.stringify(all, null, 1));
}

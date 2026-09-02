#!/usr/bin/env node
// Blanket sequencing sweep across all ADS gag files/tags/seeds, on the sanctioned
// driveGag() single-gag completion path. Pure measurement -- does not modify
// engine/game code. Detectors:
//   A. non-completion (hang/teleport/drain-failure)
//   B. scene re-fire (rising-edge count > 1 per sceneIdx:tagId)
//   C. concurrent drawn actors (two DRAWING scenes sharing the same sceneIdx)
//
// Usage:
//   node tools/faithfulness-oracle/sequencing-sweep.mjs [outDir] [seedsCsv] [filesCsv]
//
// Writes:
//   <outDir>/results.jsonl   -- one JSON record per (file,tag,seed) run
//   <outDir>/ppm/*.ppm       -- one composed frame per (file,tag) that showed a
//                               confirmed two-body overlap (first flagged seed only)

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const { loadAds, driveGag } = await import(
    path.join(repoRoot, 'src/dgds/scripting/__tests__/support/drive-gag.mjs')
);
const { composeTtmFrame } = await import(path.join(repoRoot, 'src/dgds/scripting/composition.mjs'));
const { isTtmFinished, TtmRunMode } = await import(path.join(repoRoot, 'src/dgds/scripting/ttm-run-state.mjs'));

const ADS_FILES = [
    'ACTIVITY.ADS',
    'BUILDING.ADS',
    'FISHING.ADS',
    'JOHNNY.ADS',
    'MARY.ADS',
    'MISCGAG.ADS',
    'STAND.ADS',
    'SUZY.ADS',
    'VISITOR.ADS',
    'WALKSTUF.ADS',
];

const outDir = process.argv[2] ?? path.join(repoRoot, 'track4-out');
const seeds = (process.argv[3] ?? '1,2,3,4,5,6,7,8,9,10,11,12').split(',').map(Number);
const files = process.argv[4] ? process.argv[4].split(',') : ADS_FILES;
const MAX_TICKS = 8000;

mkdirSync(outDir, { recursive: true });
mkdirSync(path.join(outDir, 'ppm'), { recursive: true });
const resultsPath = path.join(outDir, 'results.jsonl');
writeFileSync(resultsPath, '');

// Brief's literal formula is `!isTtmFinished(s) || s.agedOut === false`, but that
// also counts a STARTING scene that has not executed a script tick yet (no
// frameOps), which composeTtmFrame's real skip-check does NOT draw (see
// composition.mjs: `if (!ops || ops.length === 0) continue;`). Calibrating
// against the real composited-frame condition (both the finished/aged check AND
// a non-empty frameOps list) removes a large class of false "overlap" hits from
// same-tick STARTING/RUNNING handoffs that never actually painted two bodies.
const isDrawing = (s) => (!isTtmFinished(s) || s.agedOut === false) && (s.state?.frameOps?.length ?? 0) > 0;
// A scene is still "live" (not merely lingering post-finish for one-frame
// cross-fade compositing) when it has not finished. Two DRAWING scenes that
// share a sceneIdx are a benign, by-design 1-frame transition when one of the
// pair is finished-and-lingering (agedOut===false) while the other is fresh --
// composeTtmFrame intentionally overlaps outgoing/incoming frames for a
// crossfade. A REAL "two bodies" divergence is when >=2 of the sharing scenes
// are BOTH still running (not finished) -- i.e. two live, non-finished
// instances of the same TTM resource drawing at once, persisting beyond a
// single-frame handoff.
const isLive = (s) => !isTtmFinished(s);

const dumpPpm = (state, file) => {
    const { width: W, height: H, pixels: px } = state.surface;
    const hdr = Buffer.from(`P6\n${W} ${H}\n255\n`);
    const b = Buffer.allocUnsafe(W * H * 3);
    for (let i = 0, o = 0; i < W * H; i++) {
        const a = px[i * 4 + 3];
        if (a === 0) {
            b[o++] = 30;
            b[o++] = 30;
            b[o++] = 60;
        } else {
            b[o++] = px[i * 4];
            b[o++] = px[i * 4 + 1];
            b[o++] = px[i * 4 + 2];
        }
    }
    writeFileSync(file, Buffer.concat([hdr, b]));
};

const tagsFor = (adsName) => {
    const data = loadAds(adsName);
    const tags = data.scenes.map((s) => s.tagId?.id).filter((id) => id != null);
    return [...new Set(tags)].sort((a, b) => a - b);
}

const capturedOverlapPpmForTag = new Set(); // `${file}:${tag}` -> already captured a PPM

let totalRuns = 0;
const flaggedByDetector = { A: 0, B: 0, C: 0 };
const perTagSummary = new Map(); // `${file}:${tag}` -> aggregate

const summaryKey = (file, tag) => `${file}:${tag}`;

for (const file of files) {
    const tags = tagsFor(file);
    console.log(`== ${file}: ${tags.length} gag tags ${JSON.stringify(tags)} ==`);
    for (const tag of tags) {
        const key = summaryKey(file, tag);
        if (!perTagSummary.has(key)) {
            perTagSummary.set(key, {
                file,
                tag,
                seedsA: [], // non-completion
                seedsB: [], // re-fire candidates (rising edge > 1)
                seedsC: [], // confirmed two-LIVE-body overlap (strong)
                seedsCTransition: [], // finish/start 1-frame crossfade overlap (weak/benign candidate)
                maxConcurrentDrawing: 0,
                reFireDetail: new Map(), // sceneKey -> {count, runMode, seeds:Set}
                overlapEvidence: null, // {seed, tick, sceneIdx, tagIds, ppmPath}
                endActiveTagsBySeed: new Map(),
                distinctOverlapSignatures: new Map(), // `${sceneIdx}:${sig}` -> {sceneIdx, tagIds, maxLen, seeds:Set}
            });
        }
        const agg = perTagSummary.get(key);

        for (const seed of seeds) {
            totalRuns++;
            // per-run tracking state
            const prevActiveKeys = new Set();
            const riseCounts = new Map(); // sceneKey -> count
            const riseRunMode = new Map(); // sceneKey -> last seen runMode
            let maxConcurrentDrawing = 0;
            let transitionOverlapEvent = null; // first tick where a finished-lingering + fresh scene share sceneIdx (weak/benign candidate)
            // Track *runs* of a live-overlap signature (sceneIdx + sorted live tagIds)
            // across consecutive ticks, and keep the LONGEST one as evidence -- a
            // single-tick overlap can be an incidental handoff blip, but a run that
            // persists for many ticks (as in the BUILDING tag 8 known exemplar, which
            // runs ~59-180 ticks) is the real "two bodies visibly coexisting" signal.
            const liveOverlapRuns = new Map(); // sceneIdx -> {sig, tagIds, startTick, endTick, len}
            let bestOverlap = null; // {sceneIdx, tagIds, startTick, endTick, len}
            // Every distinct sustained (>=3-tick) overlap signature seen anywhere in the
            // run -- a gag can have more than one persistent overlap "shape" (e.g. a
            // benign multi-layer fire-building effect AND a separate walk/sit double-body).
            const distinctSustainedOverlaps = new Map(); // `${sceneIdx}:${sig}` -> {sceneIdx, tagIds, maxLen}

            const onTick = (rt, result, tick) => {
                const scenes = rt.state.scenes;

                // Detector B: rising edges of "becoming active" (present + running-ish,
                // i.e. not yet finished) per sceneIdx:tagId key.
                const curActiveKeys = new Set();
                for (const s of scenes) {
                    if (!isTtmFinished(s)) {
                        const k = `${s.sceneIdx}:${s.tagId}`;
                        curActiveKeys.add(k);
                        if (!prevActiveKeys.has(k)) {
                            riseCounts.set(k, (riseCounts.get(k) ?? 0) + 1);
                            riseRunMode.set(k, s.runMode ?? null);
                        }
                    }
                }
                prevActiveKeys.clear();
                for (const k of curActiveKeys) prevActiveKeys.add(k);

                // Detector C: concurrent drawn actors, grouped by sceneIdx.
                const drawingBySceneIdx = new Map();
                for (const s of scenes) {
                    if (isDrawing(s)) {
                        const arr = drawingBySceneIdx.get(s.sceneIdx) ?? [];
                        arr.push({ tagId: s.tagId, live: isLive(s) });
                        drawingBySceneIdx.set(s.sceneIdx, arr);
                    }
                }
                let concurrentDrawing = 0;
                for (const arr of drawingBySceneIdx.values()) concurrentDrawing += arr.length;
                if (concurrentDrawing > maxConcurrentDrawing) maxConcurrentDrawing = concurrentDrawing;

                const seenSceneIdxThisTick = new Set();
                for (const [sceneIdx, arr] of drawingBySceneIdx.entries()) {
                    if (arr.length < 2) continue;
                    const liveTagIds = arr.filter((e) => e.live).map((e) => e.tagId).sort((a, b) => a - b);
                    if (liveTagIds.length >= 2) {
                        seenSceneIdxThisTick.add(sceneIdx);
                        const sig = liveTagIds.join(',');
                        const run = liveOverlapRuns.get(sceneIdx);
                        if (run && run.sig === sig) {
                            run.endTick = tick;
                            run.len++;
                        } else {
                            liveOverlapRuns.set(sceneIdx, { sig, tagIds: liveTagIds, startTick: tick, endTick: tick, len: 1 });
                        }
                        const cur = liveOverlapRuns.get(sceneIdx);
                        if (!bestOverlap || cur.len > bestOverlap.len) {
                            bestOverlap = { sceneIdx, tagIds: cur.tagIds, startTick: cur.startTick, endTick: cur.endTick, len: cur.len };
                        }
                        if (cur.len >= 3) {
                            const dsoKey = `${sceneIdx}:${sig}`;
                            const dso = distinctSustainedOverlaps.get(dsoKey) ?? { sceneIdx, tagIds: liveTagIds, maxLen: 0 };
                            dso.maxLen = Math.max(dso.maxLen, cur.len);
                            distinctSustainedOverlaps.set(dsoKey, dso);
                        }
                    } else if (!transitionOverlapEvent) {
                        transitionOverlapEvent = { tick, sceneIdx, tagIds: arr.map((e) => e.tagId), liveCount: liveTagIds.length };
                    }
                }
                // Drop tracked runs for sceneIdx groups that broke this tick (no longer >=2 live).
                for (const sceneIdx of liveOverlapRuns.keys()) {
                    if (!seenSceneIdxThisTick.has(sceneIdx)) liveOverlapRuns.delete(sceneIdx);
                }
            };

            const { completed, ticks, seen } = driveGag({
                adsName: file,
                tag,
                seed,
                maxTicks: MAX_TICKS,
                onTick,
            });

            // detector A
            if (!completed) {
                agg.seedsA.push(seed);
                flaggedByDetector.A++;
                agg.endActiveTagsBySeed.set(seed, [...prevActiveKeys]);
            }

            // detector B candidates
            const reFired = [...riseCounts.entries()].filter(([, c]) => c > 1);
            if (reFired.length > 0) {
                agg.seedsB.push(seed);
                flaggedByDetector.B++;
                for (const [k, c] of reFired) {
                    const d = agg.reFireDetail.get(k) ?? { maxCount: 0, runMode: riseRunMode.get(k), seeds: new Set() };
                    d.maxCount = Math.max(d.maxCount, c);
                    d.seeds.add(seed);
                    agg.reFireDetail.set(k, d);
                }
            }

            // detector C
            if (agg.maxConcurrentDrawing < maxConcurrentDrawing) agg.maxConcurrentDrawing = maxConcurrentDrawing;
            for (const [dsoKey, dso] of distinctSustainedOverlaps.entries()) {
                const acc = agg.distinctOverlapSignatures.get(dsoKey) ?? { sceneIdx: dso.sceneIdx, tagIds: dso.tagIds, maxLen: 0, seeds: new Set() };
                acc.maxLen = Math.max(acc.maxLen, dso.maxLen);
                acc.seeds.add(seed);
                agg.distinctOverlapSignatures.set(dsoKey, acc);
            }
            if (transitionOverlapEvent && !bestOverlap) {
                agg.seedsCTransition.push(seed);
            }
            if (bestOverlap) {
                agg.seedsC.push(seed);
                flaggedByDetector.C++;
                // Capture ONE representative PPM per (file,tag) -- at the midpoint of the
                // first qualifying seed's longest-persisted overlap run (a mid-run tick
                // is a better "both bodies visible" frame than the very first tick of
                // the run, which may still be mid-transition).
                if (!agg.overlapEvidence && !capturedOverlapPpmForTag.has(key)) {
                    capturedOverlapPpmForTag.add(key);
                    let ppmPath = null;
                    const targetTick = Math.floor((bestOverlap.startTick + bestOverlap.endTick) / 2);
                    let captured = false;
                    driveGag({
                        adsName: file,
                        tag,
                        seed,
                        maxTicks: targetTick,
                        onTick: (rt2, res2, t2) => {
                            if (t2 === targetTick && !captured) {
                                captured = true;
                                composeTtmFrame(rt2.state);
                                const fname = `overlap-${file.replace('.ADS', '')}-t${tag}-seed${seed}-tick${targetTick}.ppm`;
                                ppmPath = path.join(outDir, 'ppm', fname);
                                dumpPpm(rt2.state, ppmPath);
                            }
                        },
                    });
                    agg.overlapEvidence = { seed, ...bestOverlap, ppmPath };
                }
            }

            appendFileSync(
                resultsPath,
                JSON.stringify({
                    file,
                    tag,
                    seed,
                    completed,
                    ticks,
                    maxConcurrentDrawing,
                    reFiredKeys: reFired.map(([k, c]) => ({ key: k, count: c })),
                    bestOverlap,
                    transitionOverlapEvent,
                }) + '\n',
            );
        }
        console.log(
            `  tag ${tag}: A(non-completion)=${agg.seedsA.length} B(re-fire)=${agg.seedsB.length} C(overlap-strong)=${agg.seedsC.length} C(overlap-transition)=${agg.seedsCTransition.length} maxDraw=${agg.maxConcurrentDrawing}`,
        );
    }
}

// Write a machine-readable summary too, for the catalogue writer.
const summaryOut = [...perTagSummary.values()].map((agg) => ({
    file: agg.file,
    tag: agg.tag,
    seedsA: agg.seedsA,
    seedsB: agg.seedsB,
    seedsC: agg.seedsC,
    seedsCTransition: agg.seedsCTransition,
    maxConcurrentDrawing: agg.maxConcurrentDrawing,
    reFireDetail: [...agg.reFireDetail.entries()].map(([k, d]) => ({
        key: k,
        maxCount: d.maxCount,
        runMode: d.runMode,
        seeds: [...d.seeds],
    })),
    overlapEvidence: agg.overlapEvidence,
    endActiveTagsBySeed: [...agg.endActiveTagsBySeed.entries()],
    // Cap to top-5 by duration -- some gags (e.g. multi-layered character/prop
    // animations) can generate dozens of distinct sceneIdx-sharing tag combos
    // over a run; only the longest-persisting ones are useful triage evidence.
    distinctOverlapSignatures: [...agg.distinctOverlapSignatures.values()]
        .sort((a, b) => b.maxLen - a.maxLen)
        .slice(0, 5)
        .map((d) => ({
            sceneIdx: d.sceneIdx,
            tagIds: d.tagIds,
            maxLen: d.maxLen,
            seeds: [...d.seeds],
        })),
    distinctOverlapSignatureCount: agg.distinctOverlapSignatures.size,
}));
writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summaryOut, null, 2));

console.log('\n=== COVERAGE ===');
console.log(`total (file,tag,seed) runs: ${totalRuns}`);
console.log(`flagged by A (non-completion): ${flaggedByDetector.A}`);
console.log(`flagged by B (re-fire candidate ticks): ${flaggedByDetector.B}`);
console.log(`flagged by C (overlap ticks): ${flaggedByDetector.C}`);

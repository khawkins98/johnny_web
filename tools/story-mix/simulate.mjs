#!/usr/bin/env node
// Story-mix simulator: plans many batches with the story controller for every
// story day (1..11) and every story-clock phase (0..15, StartTime 0900), on the
// plain Math.random path (seeded) and the faithful-RNG path, and reports the
// resulting gag mix: ending and intermediate frequency, batch length and island
// layout. Use it to see what a planner change does to the story, not just whether
// its rules hold.
//
//   node tools/story-mix/simulate.mjs [--controller path/to/story-controller.mjs]
//       [--archive public/data/SCRANTIC.SCR] [--batches 300] [--json out.json]
//
// --controller points it at another checkout (e.g. a worktree of an older commit)
// to compare before/after; the faithful RNG is loaded from that same checkout. The
// faithful path needs SCRANTIC.SCR; without it only the Math.random path runs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : fallback;
};
const controllerPath = path.resolve(arg('controller', path.join(root, 'src/games/johnny/story-controller.mjs')));
const archivePath = path.resolve(arg('archive', path.join(root, 'public/data/SCRANTIC.SCR')));
const batchesPerCell = Number(arg('batches', 300));
const jsonOut = arg('json', null);

const { createJohnnyStoryController, JOHNNY_SCENES, accumulateIslandLayout } = await import(
    pathToFileURL(controllerPath).href
);
const { faithfulRandomFromArchive } = await import(
    pathToFileURL(path.resolve(path.dirname(controllerPath), '../../dgds/scripting/faithful-rng.mjs')).href
);

// Seeded PRNG (mulberry32) so Math.random-path runs are reproducible.
const mulberry32 = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const memoryStorage = (entries) => {
    const values = new Map(Object.entries(entries));
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
    };
};

const keyOf = (selection) => (selection.pose ? 'POSE' : `${selection.script.replace('.ADS', '')}#${selection.tagId}`);
const sceneOf = (selection) =>
    selection.pose ? null : JOHNNY_SCENES.find((s) => s.script === selection.script && s.tagId === selection.tagId);

// Island layout class: fixed layout 1/2, random (with its quadrant bits), or off-island.
// Controllers older than the layout word have no fixed layouts: always random.
const layoutOf = (batch, titleState) => {
    if (!titleState.island) return 'off-island';
    if (!accumulateIslandLayout) return 'random';
    const bits = accumulateIslandLayout(batch.map(sceneOf).filter(Boolean));
    if (bits & 2) return 'fixed1';
    if (bits & 1) return 'fixed2';
    const quadrant = bits & 0x3c;
    return quadrant ? `random/q${quadrant.toString(16)}` : 'random';
};

const archive = existsSync(archivePath) ? readFileSync(archivePath) : null;
const modes = ['math', ...(archive ? ['faithful'] : [])];

// Phase p at StartTime 0900 is the half hour starting at 09:00 + p * 30 min.
const dateForPhase = (phase) => new Date(2026, 0, 15, 9, phase * 30);

const run = (mode, day, phase) => {
    const date = dateForPhase(phase);
    const storage = memoryStorage({
        'jc-start-time': '900',
        'jc-story-day': String(day),
        'jc-story-target': String(day),
        'jc-story-date': `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    });
    const random = mulberry32(day * 100 + phase + 1);
    let storyRandom = null;
    if (mode === 'faithful') {
        storyRandom = faithfulRandomFromArchive(
            archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
        );
        // Advance by a cell-specific amount so the cells don't all replay one stream.
        for (let i = 0; i < day * 997 + phase * 61; i++) storyRandom.nextWord();
    }
    const controller = createJohnnyStoryController({ random, storyRandom, storage, now: () => date });
    const batches = [];
    for (let b = 0; b < batchesPerCell; b++) {
        // Pin the story day (a keyframe unlock would otherwise move it on).
        storage.setItem('jc-story-target', String(day));
        storage.setItem('jc-story-day', String(day));
        const batch = [];
        let selection;
        do {
            selection = controller.next();
            batch.push(selection);
        } while (!selection.sequenceEnd && batch.length < 400);
        const { titleState } = selection;
        batches.push({
            ending: keyOf(selection),
            gags: batch.slice(0, -1).map(keyOf),
            length: batch.length,
            layout: layoutOf(batch, titleState),
            lowTide: titleState.lowTide,
            night: titleState.night,
        });
    }
    return batches;
};

const result = {};
for (const mode of modes) {
    result[mode] = {};
    for (let day = 1; day <= 11; day++) {
        for (let phase = 0; phase < 16; phase++) result[mode][`${day}/${phase}`] = run(mode, day, phase);
    }
}

const count = (values) => values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map());
const show = (title, map, total) => {
    console.log(`  ${title}`);
    for (const [k, v] of [...map].sort((a, b) => b[1] - a[1]))
        console.log(`    ${k.padEnd(16)} ${String(v).padStart(7)} ${((100 * v) / total).toFixed(2).padStart(6)}%`);
};
for (const mode of modes) {
    const all = Object.values(result[mode]).flat();
    console.log(`== ${mode}: ${all.length} batches`);
    show('endings', count(all.map((b) => b.ending)), all.length);
    const gags = all.flatMap((b) => b.gags);
    show('intermediates (per placement)', count(gags), gags.length);
    show('layout', count(all.map((b) => b.layout)), all.length);
    const mean = all.reduce((s, b) => s + b.length, 0) / all.length;
    const low = all.filter((b) => b.lowTide).length / all.length;
    console.log(`  mean batch length ${mean.toFixed(2)}, low tide ${(100 * low).toFixed(1)}%`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result));

#!/usr/bin/env node
// align-planner.mjs -- replay our planner on the original's random stream at the
// point a normal-play capture planned its FIRST batch, and compare the queues.
//
// A headless DOSBox-X boot is deterministic: every wave of captures planned the
// same first batch for the same phase and day, and the RNG trace (DBX_TRACE) shows
// the same number of draws before the first director call. So the first batch can
// be replayed exactly: skip that many words of the faithful RNG
// (src/dgds/scripting/faithful-rng.mjs) and run the story controller with
// `storyRandom`. Where the queues agree, our planner consumed the same words for
// the same decisions; where they differ, the decision rule or the candidate pool
// differs (the ending's roulette, the first-slot class, the budget). Later batches
// cannot be replayed: walks, poses and TTM delays draw from the same stream at a
// pace that depends on timing.
//
// Usage: node align-planner.mjs <runDir> [--window 60]
//        node align-planner.mjs --all [runsDir]   (every timing-faithful run, exact offset)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { faithfulRandomFromArchive } from '../../../src/dgds/scripting/faithful-rng.mjs';
import { createJohnnyStoryController } from '../../../src/games/johnny/story-controller.mjs';
import { batchesFromHost, parseHostLog } from './normal-play.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCR = path.resolve(here, '../../../public/data/SCRANTIC.SCR');

/** Draw counts around the first planner call, from the RNG trace. */
export const firstPlannerDraws = (traceText) => {
    const lines = traceText.split('\n');
    let before = 0;
    let iDirector = -1;
    let iLoad = -1;
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (iDirector < 0) {
            if (l.startsWith('RNG ')) before++;
            if (/ director /.test(l)) iDirector = i;
        } else if (/ads-loader/.test(l)) {
            iLoad = i;
            break;
        }
    }
    const during = lines.slice(iDirector, iLoad < 0 ? lines.length : iLoad).filter((l) => l.startsWith('RNG '));
    const callers = new Map();
    for (const l of during) {
        const c = l.match(/caller=(\S+)/)?.[1] ?? '?';
        callers.set(c, (callers.get(c) ?? 0) + 1);
    }
    return { before, during: during.length, callers: [...callers].sort((a, b) => b[1] - a[1]) };
};

const memoryStorage = (entries) => {
    const m = new Map(Object.entries(entries));
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

/** Our planner's first batch with the faithful RNG advanced by `skip` words. */
export const replayFirstBatch = ({ archive, skip, day, phase, startTime = 900 }) => {
    // A plain view, not a sliced ArrayBuffer: under vitest the slice comes from
    // another realm and fails the RNG's `instanceof ArrayBuffer` check.
    const rng = faithfulRandomFromArchive(new Uint8Array(archive.buffer, archive.byteOffset, archive.byteLength));
    for (let i = 0; i < skip; i++) rng.nextWord();
    // phase p at StartTime 0900 is the half hour starting 09:00 + p * 30 min
    const date = new Date(2026, 0, 15, 9, phase * 30);
    const storage = memoryStorage({
        'jc-start-time': String(startTime),
        'jc-story-day': String(day),
        'jc-story-target': String(day),
        'jc-story-date': `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    });
    const controller = createJohnnyStoryController({ random: () => 0.5, storyRandom: rng, storage, now: () => date });
    const queue = [];
    let selection;
    do {
        selection = controller.next();
        queue.push(selection.pose ? 'POSE' : `${selection.script.replace('.ADS', '')}#${selection.tagId}`);
    } while (!selection.sequenceEnd && queue.length < 400);
    return { queue, titleState: selection.titleState };
};

/** Where the maintainer keeps normal-play runs (directories with host.log and trace.log). */
export const DEFAULT_RUNS_DIR =
    process.env.JOHNNY_NORMAL_PLAY_RUNS ?? path.resolve(here, '../../../scratchpad/maintainer/captures/normal-play/runs');

/** The timing-faithful runs under `root` (turbo runs are for the story mix only). */
export const faithfulRunDirs = (root = DEFAULT_RUNS_DIR) =>
    existsSync(root)
        ? readdirSync(root)
              .map((name) => path.join(root, name))
              .filter((dir) => existsSync(path.join(dir, 'host.log')) && existsSync(path.join(dir, 'trace.log')))
              .filter((dir) => {
                  const summary = path.join(dir, 'summary.json');
                  return !existsSync(summary) || !JSON.parse(readFileSync(summary, 'utf8')).turbo;
              })
              .sort()
        : [];

/**
 * Replay one run's first batch at the exact boot offset and compare it with the
 * capture: `exact` is true when the queues are identical, record for record.
 */
export const replayRun = (dir, { archive = readFileSync(SCR) } = {}) => {
    const draws = firstPlannerDraws(readFileSync(path.join(dir, 'trace.log'), 'utf8'));
    const [captured] = batchesFromHost(parseHostLog(readFileSync(path.join(dir, 'host.log'), 'utf8')));
    const { queue, titleState } = replayFirstBatch({ archive, skip: draws.before, day: captured.day, phase: captured.phase });
    const equal = queue.filter((name, i) => name === captured.queue[i]).length;
    return {
        name: path.basename(dir),
        day: captured.day,
        phase: captured.phase,
        skip: draws.before,
        captured: captured.queue,
        replayed: queue,
        equal,
        exact: queue.length === captured.queue.length && equal === queue.length,
        lowTide: titleState.lowTide,
        // titleState.x/y are the binary's 30c6/30c4 after the bake, as the host log records them.
        layoutMatches:
            Boolean(titleState.island) === !captured.offIsland &&
            (captured.offIsland || (titleState.x === captured.origin.x && titleState.y === captured.origin.y)),
    };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
    const argv = process.argv.slice(2);
    const dir = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
    const wi = argv.indexOf('--window');
    const window = wi === -1 ? 60 : Number(argv[wi + 1]);
    if (argv.includes('--all')) {
        // Every timing-faithful run at its exact boot offset: the first-batch oracle.
        const archive = readFileSync(SCR);
        const results = faithfulRunDirs(dir ?? DEFAULT_RUNS_DIR).map((runDir) => replayRun(runDir, { archive }));
        for (const r of results) {
            console.log(`${r.exact ? 'EXACT ' : 'DIFF  '} ${r.name} (day ${r.day}, phase ${r.phase}, skip ${r.skip}): ${r.equal}/${r.captured.length}`);
            if (!r.exact) {
                console.log(`  captured: ${r.captured.join(' ')}`);
                console.log(`  ours:     ${r.replayed.join(' ')}`);
            }
        }
        console.log(`${results.filter((r) => r.exact).length}/${results.length} first batches replay exactly`);
        process.exit(0);
    }
    if (!dir) {
        console.error('usage: align-planner.mjs <runDir> [--window 60] | align-planner.mjs --all [runsDir]');
        process.exit(2);
    }
    const draws = firstPlannerDraws(readFileSync(path.join(dir, 'trace.log'), 'utf8'));
    const [b0] = batchesFromHost(parseHostLog(readFileSync(path.join(dir, 'host.log'), 'utf8')));
    console.log(`draws before the first director call: ${draws.before}; during the planner and bake: ${draws.during}`);
    console.log(`callers: ${draws.callers.map(([k, v]) => `${k}:${v}`).join(' ')}`);
    console.log(`captured first batch (day ${b0.day}, phase ${b0.phase}, ${b0.lowTide ? 'low' : 'high'} tide, ${b0.layout}, origin ${b0.origin.x},${b0.origin.y}):`);
    console.log(`  ${b0.queue.join(' ')}`);
    const archive = readFileSync(SCR);
    const tried = [];
    for (let skip = Math.max(0, draws.before - window); skip <= draws.before + window; skip++) {
        const { queue, titleState } = replayFirstBatch({ archive, skip, day: b0.day, phase: b0.phase });
        let equal = 0;
        for (let i = 0; i < Math.min(queue.length, b0.queue.length); i++) if (queue[i] === b0.queue[i]) equal++;
        tried.push({ skip, equal, ending: queue.at(-1) === b0.ending, queue, titleState });
    }
    tried.sort((a, b) => b.equal + (b.ending ? 3 : 0) - (a.equal + (a.ending ? 3 : 0)));
    for (const t of tried.slice(0, 3)) {
        const off = t.skip - draws.before;
        console.log(
            `skip ${t.skip} (before${off >= 0 ? '+' : ''}${off}): ${t.equal}/${b0.queue.length} positions equal, ending ${t.ending ? 'matches' : 'differs'}, ` +
                `${t.titleState.lowTide ? 'low' : 'high'} tide, origin ${t.titleState.x},${t.titleState.y}`,
        );
        console.log(`  ${t.queue.join(' ')}`);
    }
}

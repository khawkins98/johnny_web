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
import { readFileSync } from 'node:fs';
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
    const rng = faithfulRandomFromArchive(archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength));
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

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
    const argv = process.argv.slice(2);
    const dir = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
    const wi = argv.indexOf('--window');
    const window = wi === -1 ? 60 : Number(argv[wi + 1]);
    if (!dir) {
        console.error('usage: align-planner.mjs <runDir> [--window 60]');
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

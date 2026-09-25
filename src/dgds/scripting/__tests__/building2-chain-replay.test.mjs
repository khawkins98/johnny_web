import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';
import { isTtmFinished } from '../ttm-run-state.mjs';

// Regression for the BUILDING:2 faithfulness-gate UNDER-shoot (ours maxConc 6 vs the
// original binary's 7, test/faithfulness-refs/BUILDING_2.json).
//
// BUILDING.ADS tag 2 ends in four authored two-scene cycles with no STOP, e.g.
//   IF_PLAYED 1:79 -> ADD 1:74 ; IF_PLAYED 1:74 -> ADD 1:77 ; IF_PLAYED 1:77 -> ADD 1:79
// (and 81->70->75->81, 82->72->76->82, 80->73->78->80). The reference lifespans
// for 1:74/1:77/1:70/1:75/1:72/1:76/1:73/1:78 are 185-306 drawn ticks, while one
// pass of each animation is 13-17 ticks: the original replays each cycle until
// the tag's terminal F010. Before the fix ADD_SCENE deduped against the
// finished-present previous instance, so every cycle played exactly once, the
// chain actors never overlapped the 1:46/1:50/1:51 body, and the peak stayed at 6.
//
// Faithful rule (ads-walker.mjs, from SCRANTIC.SCR 1048:13bd and FUN_1048_0db6):
// IF_PLAYED is the one-tick state-4 pulse a completion leaves for the next walk,
// and ADD never de-duplicates, so the ADD in that body restarts the finished target.
describe.skipIf(!hasData)('BUILDING.ADS #2 -- authored IF_PLAYED chains replay until the fade', () => {
    const CHAIN_TAGS = [74, 77, 70, 75, 72, 76, 73, 78];

    for (const seed of [1, 2, 3]) {
        it(`seed ${seed}: each chain actor is restarted many times, peak concurrency is 7, and the gag completes`, () => {
            const rises = new Map();
            const drawnTicks = new Map();
            let prev = new Set();
            let maxConc = 0;
            const { completed } = driveGag({
                adsName: 'BUILDING.ADS',
                tag: 2,
                seed,
                onTick: (runtime) => {
                    const s1 = runtime.state.scenes.filter((s) => s.sceneIdx === 1);
                    // Drawing = composeTtmFrame's predicate (same as the faithfulness gate).
                    const drawing = s1.filter((s) => !isTtmFinished(s) || s.agedOut === false);
                    maxConc = Math.max(maxConc, drawing.length);
                    for (const s of drawing) drawnTicks.set(s.tagId, (drawnTicks.get(s.tagId) ?? 0) + 1);
                    // Rising edge of a tag being RUNNING again == one replay.
                    const running = new Set(s1.filter((s) => !isTtmFinished(s)).map((s) => s.tagId));
                    for (const t of running) if (!prev.has(t)) rises.set(t, (rises.get(t) ?? 0) + 1);
                    prev = running;
                },
            });
            expect(completed, 'gag must still drain at its terminal fade').toBe(true);
            for (const tag of CHAIN_TAGS) {
                expect(rises.get(tag) ?? 0, `1:${tag} should replay (ref lifespan 185-306 ticks)`).toBeGreaterThan(5);
                // Reference band is 185-306; allow the same ~1.3x timing drift the
                // rest of this gag shows, but reject the pre-fix single play (13-17).
                expect(drawnTicks.get(tag) ?? 0, `1:${tag} drawn ticks`).toBeGreaterThan(150);
                expect(drawnTicks.get(tag) ?? 0, `1:${tag} drawn ticks`).toBeLessThan(450);
            }
            // The original binary's peak for this gag (BUILDING_2.json maxConc).
            expect(maxConc).toBe(7);
        });
    }
});

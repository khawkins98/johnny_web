import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';

// FISHING.ADS #2 is a random ambient-fishing loop that MUST wind down through its
// authored return-walk `1:39` ("TREE 2 D") so Johnny ends the gag standing at spot
// D -- otherwise the between-gag walk interlude (which starts from the catalogue
// endSpot D) snaps him ~160px from the water back to D ("teleport ~5s after start").
//
// The loop sustains via the OR-chain handoff dispatch: `IF_PLAYED 10 OR 21 OR 22 OR
// 23 OR 38 -> RANDOM{...,15}` and `IF_PLAYED 34 OR 35 OR 30 OR 36 OR 37 -> ADD 39`.
// The runtime's OR-chain handoff must map EVERY OR-clause to the shared body so a
// finish on ANY clause re-fires the RANDOM / adds 39 -- not just the last-in-file
// clause. Before that fix only ~4% of seeds reached 39 (Johnny stuck at the water);
// after, ~100%.
//
// Driven via `driveGag` (the real singleAdsScene browser path), NOT jumpToScene's
// divergent free-run. SCRANTIC data is proprietary + gitignored (absent in CI).
describe.skipIf(!hasData)('FISHING #2 winds down through its return-walk (no teleport)', () => {
    // 12 seeds keep the suite fast under parallel load; a local sweep of 300 seeds
    // reaches tag 39 ~100% (was ~4% before the OR-chain handoff-index fix). Explicit
    // timeout since each seed ticks a full gag to completion.
    it('reaches the break tag 15 and the return-walk tag 39 for every seed 1..12', { timeout: 30000 }, () => {
        for (let seed = 1; seed <= 12; seed++) {
            const { completed, seen } = driveGag({ adsName: 'FISHING.ADS', tag: 2, seed });
            expect(completed, `seed ${seed} did not complete`).toBe(true);
            expect(seen.has(15), `seed ${seed} never broke the ambient loop (tag 15)`).toBe(true);
            expect(seen.has(39), `seed ${seed} never played the return-walk (tag 39)`).toBe(true);
        }
    });
});

import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';

// Regression for crosscheck B1 / phase11 §2: ACTIVITY.ADS tag 7 ("MUNDANE JOHN READ").
// ADS 0x1070 (IF_LASTPLAYED_LOCAL) + 0x1520 form a ONE-SHOT local completion override
// -- the ONLY occurrence in the shipped game. The final bath 4:5 is armed so its finish
// routes to 4:22 -> 4:23 -> END instead of re-entering the global 4:5 -> 4:7 reading
// cycle. Faithful behaviour (jc_reborn + original binary): the reading loop 4:7 -> 4:8
// -> 4:9 -> 4:10 plays EXACTLY ONCE. Before the fix the port re-fired the global
// IF_PLAYED 4:5 handoff after the local override should have consumed it, replaying the
// whole reading loop a SECOND time (seed-invariant).
describe.skipIf(!hasData)('ACTIVITY #7 plays its reading loop exactly once (one-shot local override)', () => {
    // Rising-edge count of each TTM tag becoming active == number of loop passes.
    const passCounts = (seed) => {
        let prev = new Set();
        const rises = new Map();
        driveGag({
            adsName: 'ACTIVITY.ADS',
            tag: 7,
            seed,
            maxTicks: 20000,
            onTick: (runtime) => {
                const cur = new Set(runtime.state.scenes.map((s) => s.tagId));
                for (const t of cur) if (!prev.has(t)) rises.set(t, (rises.get(t) ?? 0) + 1);
                prev = cur;
            },
        });
        return rises;
    };

    // Heavy: 5 seeds x completion drive + 5 seeds x 20000-tick passCounts. Matches the
    // explicit timeouts the sibling gag/story sweeps carry (gag-terminal-sweep,
    // fishing-return-walk) so it does not flake past the 5s default under parallel load.
    it('runs 4:7/4:8/4:9/4:10 once and terminates at 4:23, for every seed 1..5', { timeout: 30000 }, () => {
        for (let seed = 1; seed <= 5; seed++) {
            const { completed } = driveGag({ adsName: 'ACTIVITY.ADS', tag: 7, seed });
            expect(completed, `seed ${seed} did not complete`).toBe(true);

            const rises = passCounts(seed);
            for (const readingTag of [7, 8, 9, 10]) {
                expect(
                    rises.get(readingTag) ?? 0,
                    `seed ${seed}: reading-loop tag 4:${readingTag} should play exactly once`,
                ).toBe(1);
            }
            // The authored terminal tag is reached (drains the gag).
            expect(rises.get(23) ?? 0, `seed ${seed}: terminal tag 4:23 should play`).toBe(1);
        }
    });
});

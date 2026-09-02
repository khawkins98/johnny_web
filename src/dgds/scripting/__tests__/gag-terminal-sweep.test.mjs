import { describe, expect, it } from 'vitest';
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';
import { driveGag, hasData, loadAds } from './support/drive-gag.mjs';

// Seed-sweep completion + terminal-drain reachability -- the general, binary-INDEPENDENT
// detector for the two bug classes we actually shipped fixes for this session:
//   * "teleport" / stall: a gag that never reaches its authored terminal tag (fishing
//     stuck at the water) ends mid-sequence in the wrong place.
//   * runaway: a gag that never completes (an ambient/rearm loop that won't drain).
// The binary's completion rule is a live-thread drain (phase11); a gag ends when its
// terminal tag finishes with no successor. So "completes AND played its terminal tag,
// across many seeds" is the invariant that would have caught the fishing teleport (only
// ~4% of seeds reached tag 39 before the OR-chain fix) without any per-tick oracle.
//
// This is deliberately NOT the full independent sequencing oracle (which would need a
// DOSBox-X binary reference to validate its transliteration against -- see the report;
// building it unvalidated risks FALSE divergences). It is the cheaper correct net Fable
// flagged as the "teleport-class detector in general form".
//
// SCRANTIC.SCR is proprietary + gitignored (absent in CI): runs locally, skips in CI.

// Terminal drain tags recovered by RE (phase10/phase11): the gag ends when this TTM tag
// finishes with no matching handoff chunk. Only the gags whose terminal tag is decoded
// are asserted for reachability; every gag is asserted for completion.
const TERMINAL_TAGS = {
    'ACTIVITY.ADS': { 7: 4023 /* env 4 : tag 23, the read/bath cycle drain */ },
    'FISHING.ADS': { 2: 1039 /* env 1 : tag 39 "TREE 2 D" return walk */ },
};

const activity = hasData ? loadAds(johnnyCastaway.resources.activity) : null;
const gagIds = activity ? [...new Set(activity.scenes.map((s) => s.tagId?.id).filter((id) => id != null))] : [];
const SEEDS = 25;

describe.skipIf(!hasData)('gag terminal-drain seed sweep', () => {
    it(`every ACTIVITY gag completes for seeds 1..${SEEDS}`, { timeout: 300000 }, () => {
        for (const gag of gagIds) {
            for (let seed = 1; seed <= SEEDS; seed++) {
                const { completed } = driveGag({ adsName: johnnyCastaway.resources.activity, tag: gag, seed });
                expect(completed, `ACTIVITY gag ${gag} did not complete (seed ${seed})`).toBe(true);
            }
        }
    });

    // The read/bath cycle (ACTIVITY tag 7) must wind down through its terminal 4:23 drain,
    // not spin its ambient loop forever -- the general form of the fishing-teleport check.
    it(`ACTIVITY #7 reaches its terminal drain 4:23 for seeds 1..${SEEDS}`, { timeout: 180000 }, () => {
        if (!(7 in (TERMINAL_TAGS['ACTIVITY.ADS'] ?? {}))) return;
        const want = TERMINAL_TAGS['ACTIVITY.ADS'][7];
        let reached = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
            const { seen } = driveGag({ adsName: johnnyCastaway.resources.activity, tag: 7, seed });
            // `seen` is a set of TTM tagIds (env-local); 4:23 => tag 23 in env 4.
            if (seen.has(want % 1000)) reached++;
        }
        expect(reached, `ACTIVITY #7 reached its terminal drain in only ${reached}/${SEEDS} seeds`).toBe(SEEDS);
    });
});

// (FISHING.ADS #2 -> 1:39 terminal drain is covered by fishing-return-walk.test.mjs.)

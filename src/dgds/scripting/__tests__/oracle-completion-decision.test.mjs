import { describe, expect, it } from 'vitest';
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';
import { driveGag, hasData, loadAds } from './support/drive-gag.mjs';

// DEFINITIVE completion diff (issue #11, Phase 1). Slice 1 could only diff the
// post-tick state, which production has already cleared on the completing tick.
// The inert 'ads-completion-decision' hook (runtime.mjs #runAdsController) now emits
// the completion DECISION at the decision point -- the live-thread set + whether the
// port's KEEP_GOING/unbounded-loop exclusion excluded a still-live thread.
//
// Binary rule (FUN_1048_0766, phase11): a gag completes iff its thread list holds no
// live thread -- NO KEEP_GOING exception. Production DOES exclude KEEP_GOING/LOOPED
// threads from its blockers check. The faithfulness question this answers: does that
// exclusion EVER cast the deciding completion vote -- i.e. does production ever
// complete a gag while a thread it excluded as "unbounded" is still live? If never,
// production is faithful on completion (the exclusion is inert in practice); if it
// does, that is a real early-completion divergence for Phase 2.
//
// Proprietary SCRANTIC data is gitignored (absent in CI); local-only, like goldens.

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

// A completion decision is exclusion-DECIDED iff production completed but a live
// thread was only non-blocking because of the KEEP_GOING/unbounded exclusion --
// i.e. the pure live-thread-drain oracle would NOT have completed here.
const exclusionDecidedCompletion = (decision) =>
    decision.willComplete &&
    decision.pendingAdds === 0 &&
    (decision.liveThreads || []).some((t) => t.excludedAsUnboundedLoop);

const collectDecisions = ({ adsName, tag, seed }) => {
    const decisions = [];
    driveGag({
        adsName,
        tag,
        seed,
        onEvent: (type, data) => {
            if (type === 'ads-completion-decision') decisions.push(data);
        },
    });
    return decisions;
};

describe.skipIf(!hasData)('oracle: completion decision matches binary live-thread drain', () => {
    const activity = loadAds(johnnyCastaway.resources.activity);
    const gagIds = [...new Set(activity.scenes.map((s) => s.tagId?.id).filter((id) => id != null))];
    const targets = [
        ...gagIds.map((tag) => ({ adsName: johnnyCastaway.resources.activity, tag })),
        { adsName: 'FISHING.ADS', tag: 2 },
    ];

    it('never completes a gag via the KEEP_GOING exclusion (seeds 1..30, all gags)', { timeout: 400000 }, () => {
        const divergences = [];
        for (const { adsName, tag } of targets) {
            for (const seed of SEEDS) {
                const decisions = collectDecisions({ adsName, tag, seed });
                // Sanity: the gag reached a completion decision at all.
                expect(
                    decisions.some((d) => d.willComplete),
                    `${adsName} #${tag} seed ${seed}: no completion decision emitted`,
                ).toBe(true);
                for (const d of decisions.filter(exclusionDecidedCompletion)) {
                    const excluded = d.liveThreads.filter((t) => t.excludedAsUnboundedLoop).map((t) => `${t.key}(${t.runMode})`);
                    divergences.push(`${adsName} #${tag} seed ${seed}: completed with excluded live thread(s) [${excluded.join(', ')}]`);
                }
            }
        }
        if (divergences.length) {
            console.log('\n=== EARLY-COMPLETION DIVERGENCES (KEEP_GOING exclusion was deciding) ===');
            for (const d of divergences) console.log('  - ' + d);
        }
        // Faithfulness assertion: the exclusion must never be the deciding vote. If
        // this ever fails, the listed gags complete early vs the binary -- a real
        // Phase-2 divergence (the exclusion is masking a still-live thread).
        expect(divergences, `${divergences.length} early-completion divergence(s):\n${divergences.join('\n')}`).toEqual([]);
    });
});

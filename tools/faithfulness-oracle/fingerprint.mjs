// fingerprint.mjs
//
// Shared "is this scene drawing / what did our engine draw" fingerprint logic,
// factored out of test/faithfulness-diff.mjs, our-thread-timeline.mjs, and
// coverage-report.mjs (all three drove near-identical copies of this). Consumers:
//   - test/faithfulness-diff.mjs      -- the CI faithfulness gate
//   - tools/faithfulness-oracle/our-thread-timeline.mjs -- per-tick timeline extractor
//   - tools/faithfulness-oracle/coverage-report.mjs     -- docs/oracle-coverage.md generator
//
// CRITICAL: `isDrawing` MUST stay byte-identical to composeTtmFrame's skip semantics:
// `!isTtmFinished(scene) || scene.agedOut === false`. Do NOT add the frameOps check --
// frameOps is a per-tick transient not reliably populated at sample time, and adding
// that check here previously regressed 12 STAND gags to "did not run" (see the fuller
// rationale kept in test/faithfulness-diff.mjs, where this predicate is exercised by
// the CI gate).

import { driveGag } from '../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { isTtmFinished } from '../../src/dgds/scripting/ttm-run-state.mjs';

// The "drawing" predicate: a scene draws unless it is finished-and-aged-out.
export const isDrawing = (scene) => !isTtmFinished(scene) || scene.agedOut === false;

/** Sorted "sceneIdx:tagId" keys for every currently-drawing scene this tick. */
export const liveKeysFor = (runtime) =>
    [...runtime.state.scenes]
        .filter(isDrawing)
        .map((scene) => `${scene.sceneIdx}:${scene.tagId}`)
        .sort();

/**
 * Drive one gag on our engine (via the sanctioned driveGag() single-gag path) and
 * compute its fingerprint: {vocab, maxConc, liveTicks, actorTicks}. `actorTicks`
 * maps "slot:tag" -> the number of ticks it was drawing this run (for the
 * lifespan/duration comparison).
 */
export const fingerprintOurs = (adsName, tag, seed = 1) => {
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    driveGag({
        adsName: `${adsName}.ADS`,
        tag,
        seed,
        onTick: (runtime) => {
            const live = liveKeysFor(runtime);
            if (live.length > 0) liveTicks++;
            maxConc = Math.max(maxConc, live.length);
            for (const key of live) {
                vocab.add(key);
                actorTicks[key] = (actorTicks[key] || 0) + 1;
            }
        },
    });
    return { vocab, maxConc, liveTicks, actorTicks };
};

/**
 * Union OUR engine's fingerprint over seeds 1..runs, SYMMETRIC with how the refs
 * themselves were built (an RNG-tolerant union over `ref.runs` original-binary
 * runs). `vocab` unions; `maxConc` takes the MAX across seeds (worst-case
 * concurrency peak); `liveTicks` sums for visibility only (not gated on);
 * `actorTicks` takes the worst-case (max) drawn-tick count per actor across seeds.
 */
export const fingerprintOursUnion = (adsName, tag, runs) => {
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    for (let seed = 1; seed <= runs; seed++) {
        const run = fingerprintOurs(adsName, tag, seed);
        for (const key of run.vocab) vocab.add(key);
        maxConc = Math.max(maxConc, run.maxConc);
        liveTicks += run.liveTicks;
        for (const [key, ticks] of Object.entries(run.actorTicks)) {
            actorTicks[key] = Math.max(actorTicks[key] || 0, ticks);
        }
    }
    return { vocab, maxConc, liveTicks, actorTicks };
};

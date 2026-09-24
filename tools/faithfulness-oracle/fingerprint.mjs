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
 *
 * @param {Set<string>} [establishingKeys] TEST-HARNESS-ONLY, FINGERPRINT-ONLY:
 *   "sceneIdx:tagId" keys to drop from the fingerprint (vocab/maxConc/actorTicks)
 *   during their OPENING appearance only (until first drop-out), WITHOUT changing what the engine actually runs. This compensates
 *   for a driveGag harness artifact, not an engine bug: many gags open with a
 *   one-time `IF_NOT_PLAYED[S,X] -> ADD(S,X) + ADD(S,Y)` "establishing shot" for
 *   a location, where X and the gag's real first actor Y are added together in
 *   the SAME guarded branch. driveGag always builds a fresh runtime with EMPTY
 *   `state.playedHistory`, so X always fires -- but the original-binary
 *   reference fingerprints were captured mid-session, after X had already played
 *   once elsewhere, so a real capture never shows it. Pre-seeding
 *   `state.playedHistory` with X directly (tried first) is UNSAFE: X's guard
 *   also gates Y's own ADD_SCENE in the same branch (confirmed by reading the
 *   expanded ADS bytecode for e.g. ACTIVITY tag 1), so marking X "already
 *   played" before tick 1 skips the whole branch and the gag never runs at all
 *   (zero live ticks). Excluding X only from the fingerprint is behaviorally
 *   equivalent to "counting started after X's brief natural overlap already
 *   ended" (verified directly: X and Y co-occur for a short initial window,
 *   then X drops out and Y continues alone for the rest of the run -- e.g.
 *   ACTIVITY:1's 1:12/1:13 overlap only ticks 1-5 of a 5000-tick cap) -- without
 *   touching engine state or requiring X to have actually "played" for real.
 *   No effect when omitted.
 */
export const fingerprintOurs = (adsName, tag, seed = 1, establishingKeys = null) => {
    const suppressed = new Set(establishingKeys ?? []);
    const openingSeen = new Set();
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    driveGag({
        adsName: `${adsName}.ADS`,
        tag,
        seed,
        onTick: (runtime) => {
            let live = liveKeysFor(runtime);
            if (suppressed.size > 0) {
                // Suppress each establishing key only for its OPENING appearance:
                // once it has been live and then drops out, stop suppressing, so
                // any later legitimate re-add is still counted.
                for (const key of [...suppressed]) {
                    if (live.includes(key)) openingSeen.add(key);
                    else if (openingSeen.has(key)) suppressed.delete(key);
                }
                live = live.filter((key) => !suppressed.has(key));
            }
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
 *
 * @param {Set<string>} [establishingKeys] TEST-HARNESS-ONLY, forwarded to
 *   `fingerprintOurs` for every seed in the union -- see its doc.
 */
export const fingerprintOursUnion = (adsName, tag, runs, establishingKeys = null) => {
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    for (let seed = 1; seed <= runs; seed++) {
        const run = fingerprintOurs(adsName, tag, seed, establishingKeys);
        for (const key of run.vocab) vocab.add(key);
        maxConc = Math.max(maxConc, run.maxConc);
        liveTicks += run.liveTicks;
        for (const [key, ticks] of Object.entries(run.actorTicks)) {
            actorTicks[key] = Math.max(actorTicks[key] || 0, ticks);
        }
    }
    return { vocab, maxConc, liveTicks, actorTicks };
};

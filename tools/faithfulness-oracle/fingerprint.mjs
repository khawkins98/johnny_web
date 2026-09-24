// fingerprint.mjs
//
// Shared "is this scene drawing / what did our engine draw" fingerprint logic,
// factored out of test/faithfulness-diff.mjs, our-thread-timeline.mjs, and
// coverage-report.mjs (all three drove near-identical copies of this). Consumers:
//   - test/faithfulness-diff.mjs      -- the CI faithfulness gate
//   - tools/faithfulness-oracle/our-thread-timeline.mjs -- per-tick timeline extractor
//   - tools/faithfulness-oracle/coverage-report.mjs     -- docs/oracle-coverage.md generator
//
// `isDrawing` mirrors composeTtmFrame's finished-and-aged-out skip and is the
// predicate the CI gate uses: a scene is a live actor while its TTM thread is alive.
// That is ALSO what the original-binary refs measure -- they record live threads,
// not pixels. The refs contain threads that never draw (e.g. SUZY 1:1, a 4-tick
// loader; BUILDING 3:81), so "live thread" is the like-for-like comparison.
//
// composeTtmFrame has a second skip (empty frameOps) that the gate deliberately does
// NOT mirror. Two ways of adding it have been tried:
//   - per tick in isDrawing: frameOps is a per-tick transient, so this also drops
//     live threads whose frame happens to be empty at sample time. Reverted.
//   - per scene, "ever drew" (a scene instance that never had non-empty frameOps
//     over its whole life is dropped; `drawnOnly` below). This removes 35 actors
//     that ARE in the refs, drops maxConc below ref in 20 gags (BUILDING:3/5-9,
//     VISITOR:4/6/7, MARY:3, ...), and leaves STAND:1-12 with zero live ticks,
//     because under driveGag those gags only ever run the 1:42 init loader and never
//     add a pose scene (a real, separate issue). Not adopted.
// So the JOHNNY:6 (3:9) / ACTIVITY:11 (5:20, 5:42) extras are NOT explained by
// "preload scenes don't count": the refs count preloads elsewhere. `drawnOnly` is
// kept as an opt-in diagnostic (our-thread-timeline.mjs --drawn-only). Pure
// observation either way: no engine state is written.

import { driveGag } from '../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { isTtmFinished } from '../../src/dgds/scripting/ttm-run-state.mjs';

// The per-tick "live actor" predicate: live unless finished-and-aged-out.
export const isDrawing = (scene) => !isTtmFinished(scene) || scene.agedOut === false;

/** True when the scene's currently recorded frame holds at least one draw op. */
export const hasFrameOps = (scene) => (scene.state?.frameOps?.length ?? 0) > 0;

const sceneKey = (scene) => `${scene.sceneIdx}:${scene.tagId}`;

/** Sorted "sceneIdx:tagId" keys for every isDrawing scene this tick. */
export const liveKeysFor = (runtime) => [...runtime.state.scenes].filter(isDrawing).map(sceneKey).sort();

/**
 * Per-run live-set recorder. Call `sample(runtime)` once per sampled tick;
 * `finish()` returns one sorted key array per sample. With `drawnOnly`, scene
 * instances that never had non-empty frameOps at any sample are removed from every
 * sample (diagnostic only -- see the header). Scenes are tracked by object
 * identity, so a re-added scene with the same key is judged on its own life.
 */
export const createLiveRecorder = ({ drawnOnly = false } = {}) => {
    const samples = [];
    const drew = new WeakSet();
    return {
        sample(runtime) {
            const live = [];
            for (const scene of runtime.state.scenes) {
                if (hasFrameOps(scene)) drew.add(scene);
                if (isDrawing(scene)) live.push(scene);
            }
            samples.push(live);
        },
        finish() {
            return samples.map((live) =>
                live
                    .filter((scene) => !drawnOnly || drew.has(scene))
                    .map(sceneKey)
                    .sort(),
            );
        },
    };
};

/**
 * Drive one gag on our engine (via the sanctioned driveGag() single-gag path) and
 * compute its fingerprint: {vocab, maxConc, liveTicks, actorTicks}. `actorTicks`
 * maps "slot:tag" -> the number of ticks it was drawing this run (for the
 * lifespan/duration comparison). `drawnOnly` is the opt-in diagnostic filter.
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
export const fingerprintOurs = (adsName, tag, seed = 1, { drawnOnly = false, establishingKeys = null } = {}) => {
    const recorder = createLiveRecorder({ drawnOnly });
    driveGag({
        adsName: `${adsName}.ADS`,
        tag,
        seed,
        onTick: (runtime) => recorder.sample(runtime),
    });
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    const suppressed = new Set(establishingKeys ?? []);
    const openingSeen = new Set();
    for (let live of recorder.finish()) {
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
    }
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
export const fingerprintOursUnion = (adsName, tag, runs, { drawnOnly = false, establishingKeys = null } = {}) => {
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    for (let seed = 1; seed <= runs; seed++) {
        const run = fingerprintOurs(adsName, tag, seed, { drawnOnly, establishingKeys });
        for (const key of run.vocab) vocab.add(key);
        maxConc = Math.max(maxConc, run.maxConc);
        liveTicks += run.liveTicks;
        for (const [key, ticks] of Object.entries(run.actorTicks)) {
            actorTicks[key] = Math.max(actorTicks[key] || 0, ticks);
        }
    }
    return { vocab, maxConc, liveTicks, actorTicks };
};

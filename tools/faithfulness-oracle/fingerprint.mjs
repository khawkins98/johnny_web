// fingerprint.mjs
//
// Shared "is this scene drawing / what did our engine draw" fingerprint logic,
// factored out of test/faithfulness-diff.mjs, our-thread-timeline.mjs, and
// coverage-report.mjs (all three drove near-identical copies of this). Consumers:
//   - test/faithfulness-diff.mjs      -- the CI faithfulness gate
//   - tools/faithfulness-oracle/our-thread-timeline.mjs -- per-tick timeline extractor
//   - tools/faithfulness-oracle/coverage-report.mjs     -- docs/oracle-coverage.md generator
//
// `isDrawing` is the predicate the CI gate uses: a scene is a live actor while its TTM
// thread has not finished. That is what the original-binary refs measure. They record
// live threads, not pixels (threads-to-timeline.mjs keeps runstates 1-3), and they
// contain threads that never draw (e.g. SUZY 1:1, a 4-sample loader; BUILDING 3:81).
// Finished threads are excluded like runstate 4 is. The capture samples at entry to
// the tick function FUN_1048_1acb, and a thread that finishes during a tick is already
// at runstate 4 when the next sample is taken. Ours samples after each tick, so a
// scene that FINISHED this tick is not live. It still counts on the tick it is added,
// even if it has not drawn yet. composeTtmFrame keeps drawing a just-finished scene's
// final frame for one tick (`agedOut === false`). That is a presentation detail, not
// a live thread, and it used to add one tick to every actor's lifespan here.
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
// The JOHNNY:6 (3:9) and ACTIVITY:11 (5:20, 5:42) extras were an engine bug, not a
// loader-counting question. Those loaders end on their PURGE frame with zero delay,
// so the original finishes them in the tick they are added (see ttm-opcodes PURGE).
// `drawnOnly` is kept as an opt-in diagnostic (our-thread-timeline.mjs --drawn-only).
// Pure observation either way: no engine state is written.

import { driveGag } from '../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { isTtmFinished } from '../../src/dgds/scripting/ttm-run-state.mjs';

// The per-tick "live actor" predicate: live until its thread finishes (runstate 4).
export const isDrawing = (scene) => !isTtmFinished(scene);

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
 *   during their OPENING appearance only (until first drop-out), WITHOUT changing
 *   what the engine actually runs. The keys come from
 *   test/faithfulness-refs/establishing-shot-seeds.mjs, which explains why each one is
 *   listed.
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

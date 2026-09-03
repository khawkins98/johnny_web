// Data-only faithfulness diff gate (Task 3 of the differential-faithfulness oracle
// plan). Runs OUR engine, isolated to each committed reference gag, and compares
// the resulting fingerprint (vocab + maxConc) against the committed reference
// fingerprints in test/faithfulness-refs/*.json.
//
// NO EMULATOR: this drives only our JS engine (via the sanctioned driveGag()
// helper, same path as building8-double-johnny.test.mjs) and diffs against
// already-committed JSON produced (in an earlier task) from the original binary.
// Safe for CI -- no dosbox, no game-data dependency beyond the same gitignored
// public/data assets the rest of the suite already guards with hasData.
//
// Refs are a COVERAGE LOWER-BOUND (RNG-tolerant union over 3 original-binary runs)
// for vocab, and a CONCURRENCY CEILING for maxConc. So the semantics here are
// asymmetric -- see PM ruling below:
//
//   - HARD FAIL (assertion): ourMaxConc >= ref.maxConc + 2. This is an "extra body"
//     regression -- the one reliable signal a vocab-union lower-bound can support
//     as a hard gate. (A +1 slack is allowed: a single extra concurrent actor is
//     within the noise of a 3-run union vs. our single deterministic run.)
//   - REVIEW ONLY (console.warn, not a failed assertion): vocab set-differences.
//     `missing` = ref.vocab \ ourVocab (behaviors the original shows we don't hit
//     with this seed) and `extra` = ourVocab \ ref.vocab (behaviors we show that
//     the reference union didn't cover). Since the ref union under-covers by
//     construction, vocab diffs are signal for humans (Task 5 triage), not a gate.
//   - HARD FAIL: our engine produced NO live ticks at all for the gag -- that's a
//     gag that silently does nothing, not a vocab-coverage nuance.
//
// Slot-alignment note: our-thread-timeline.mjs's "slot:tag" key is
// `${scene.sceneIdx}:${scene.tagId}`, i.e. the ADS scene-group index, and this is
// STABLE (not dynamically re-numbered) for a single-gag isolation drive -- verified
// directly against the refs: VISITOR tag 5 comes up on our engine as slot 5,
// matching the ref's slot "5"; BUILDING tag 7 comes up as slot 3, matching the
// ref's slot "3". So we compare "slot:tag" strings AS-IS, with no tag-only
// fallback normalization.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { driveGag, hasData } from '../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { isTtmFinished } from '../src/dgds/scripting/ttm-run-state.mjs';
import { compareLifespans } from '../tools/faithfulness-oracle/compare-lifespans.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const refsDir = path.join(here, 'faithfulness-refs');

/** @type {{name:string, tag:number, file:string}[]} */
const index = JSON.parse(readFileSync(path.join(refsDir, 'index.json'), 'utf8'));

const loadRef = (file) => JSON.parse(readFileSync(path.join(refsDir, file), 'utf8'));

// The "drawing" predicate: a scene draws unless it is finished-and-aged-out.
// NOTE: composeTtmFrame ALSO skips scenes with empty frameOps, which would let us
// drop asset-preload pseudo-scenes (load-only, no draw opcode) that inflate
// maxConc/vocab in a few gags (JOHNNY:6, ACTIVITY:11 -- see
// scratchpad/findings/johnny6-activity11-rootcause.md). But frameOps is a PER-TICK
// transient populated during composition, so testing it here (at onTick time)
// falsely excludes real scenes whose frameOps isn't built yet this tick -- it
// regressed 12 STAND gags to "did not run". The faithful fix needs an "ever drew"
// scene-level flag (a scene that NEVER populates frameOps across its whole life is
// the true preload) rather than a per-tick check -- deferred as a follow-up.
const isDrawing = (scene) => !isTtmFinished(scene) || scene.agedOut === false;

/**
 * Drive one gag on our engine and compute its fingerprint: {vocab, maxConc,
 * liveTicks, actorTicks}. `actorTicks` maps "slot:tag" -> the number of ticks it
 * was drawing this run (for the lifespan/duration comparison).
 */
const fingerprintOurs = (adsName, tag, seed = 1) => {
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    driveGag({
        adsName: `${adsName}.ADS`,
        tag,
        seed,
        onTick: (runtime) => {
            const live = runtime.state.scenes.filter(isDrawing).map((s) => `${s.sceneIdx}:${s.tagId}`);
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
 * runs). Each seed is a deterministic drive (fixed seeded RNG); unioning them
 * gives a robust worst-case measurement instead of relying on whichever single
 * seed happens to be default. `vocab` unions; `maxConc` takes the MAX across
 * seeds (worst-case concurrency peak, the thing the hard gate cares about);
 * `liveTicks` sums for visibility only (not gated on).
 */
const fingerprintOursUnion = (adsName, tag, runs) => {
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    for (let seed = 1; seed <= runs; seed++) {
        const run = fingerprintOurs(adsName, tag, seed);
        for (const key of run.vocab) vocab.add(key);
        maxConc = Math.max(maxConc, run.maxConc);
        liveTicks += run.liveTicks;
        // Worst-case (max) drawn-tick count per actor across seeds, consistent
        // with how maxConc takes the worst-case peak.
        for (const [key, ticks] of Object.entries(run.actorTicks)) {
            actorTicks[key] = Math.max(actorTicks[key] || 0, ticks);
        }
    }
    return { vocab, maxConc, liveTicks, actorTicks };
};

// Per-gag triage summary, collected across the describe block and printed once
// at the end so a human sees "what we catch" at a glance (categories + the
// OVER+1 / UNDER gag lists) without having to scroll every individual line.
const triage = { EXACT: [], 'OVER+1': [], UNDER: [], HARD: [] };

describe.skipIf(!hasData)('faithfulness oracle: our engine vs. original-binary reference fingerprints', () => {
    for (const entry of index) {
        const ref = loadRef(entry.file);
        // Driving N seeds per gag (vs. 1 previously) multiplies wall time per
        // test roughly Nx; the default 5000ms vitest test timeout is too tight
        // for that under load. 30s is generous headroom, not a correctness knob.
        it(
            `${entry.name}:${entry.tag}`,
            () => {
                const runs = ref.runs || 3;
                const ours = fingerprintOursUnion(ref.name, ref.tag, runs);

                // Hard fail: the gag produced nothing at all.
                expect(
                    ours.liveTicks,
                    `${ref.name}:${ref.tag} produced zero live/drawing ticks -- gag did not run`,
                ).toBeGreaterThan(0);

                const ourVocabSorted = [...ours.vocab].sort();
                const refVocabSet = new Set(ref.vocab);
                const missing = ref.vocab.filter((k) => !ours.vocab.has(k));
                const extra = ourVocabSorted.filter((k) => !refVocabSet.has(k));

                if (missing.length || extra.length) {
                    console.warn(
                        `[faithfulness-diff] ${ref.name}:${ref.tag} vocab coverage diff -- ` +
                            `missing (ref\\ours, ${missing.length}): [${missing.join(', ')}]; ` +
                            `extra (ours\\ref, ${extra.length}): [${extra.join(', ')}]`,
                    );
                }

                // Categorize this gag's maxConc relationship for the end-of-run triage
                // summary: EXACT (ours==ref), OVER+1 (ours==ref+1, inside the allowed
                // slack), UNDER (ours<ref, by how much), HARD (ours>=ref+2, gate-failing).
                const gagId = `${ref.name}:${ref.tag}`;
                const delta = ours.maxConc - ref.maxConc;
                let category;
                if (delta === 0) category = 'EXACT';
                else if (delta === 1) category = 'OVER+1';
                else if (delta < 0) category = 'UNDER';
                else category = 'HARD';
                triage[category].push({
                    gag: gagId,
                    ourMaxConc: ours.maxConc,
                    refMaxConc: ref.maxConc,
                    delta,
                    missing: missing.length,
                    extra: extra.length,
                });

                console.log(
                    `[faithfulness-diff] ${gagId} [${category}] maxConc ours=${ours.maxConc} ref=${ref.maxConc} ` +
                        `(runs=${runs}) vocab missing=${missing.length} extra=${extra.length}`,
                );

                // Duration/lifespan signal (complements maxConc, which only sees peak
                // concurrency): does each actor we draw stay live for a tick-count within
                // the binary's observed [min,max] range? Refs regenerated at N=8 carry a
                // `lifespans` field; older N=3 refs don't -- compareLifespans returns empty
                // for those (graceful). WARN-ONLY for now: this surfaces the new signal so
                // we can validate it against the enriched refs before promoting egregious
                // (>=3x) divergences to a hard gate (follow-up).
                if (ref.lifespans) {
                    const life = compareLifespans(ours.actorTicks, ref.lifespans);
                    if (life.hard.length || life.warnings.length) {
                        const fmt = (e) =>
                            `${e.actor}(ours=${e.ourTicks} ref=[${e.refMin},${e.refMax}])`;
                        console.warn(
                            `[faithfulness-diff] ${gagId} lifespan diff -- ` +
                                `hard(${life.hard.length}): [${life.hard.map(fmt).join(', ')}]; ` +
                                `warn(${life.warnings.length}): [${life.warnings.map(fmt).join(', ')}]`,
                        );
                    }
                }

                // Hard gate: extra-body regression. A single extra concurrent actor is
                // within the noise of a 3-run union vs. our N-seed union; two or more
                // extra is the reliable "double Johnny"-class signal.
                expect(
                    ours.maxConc,
                    `${ref.name}:${ref.tag} maxConc regressed: ours=${ours.maxConc} vs ref=${ref.maxConc} ` +
                        `(threshold ref+2=${ref.maxConc + 2})`,
                ).toBeLessThan(ref.maxConc + 2);
            },
            30000,
        );
    }

    it('prints the per-gag triage summary', () => {
        const total = Object.values(triage).reduce((n, arr) => n + arr.length, 0);
        // Only meaningful once every gag `it()` above has run; if some were
        // skipped (e.g. filtered run) this just summarizes whatever ran.
        console.log(
            `\n[faithfulness-diff] TRIAGE SUMMARY (${total} gags): ` +
                `EXACT=${triage.EXACT.length} OVER+1=${triage['OVER+1'].length} ` +
                `UNDER=${triage.UNDER.length} HARD=${triage.HARD.length}`,
        );
        if (triage['OVER+1'].length) {
            console.log(
                `[faithfulness-diff] OVER+1 gags: ${triage['OVER+1'].map((g) => g.gag).join(', ')}`,
            );
        }
        if (triage.UNDER.length) {
            console.log(
                `[faithfulness-diff] UNDER gags: ${triage.UNDER.map((g) => `${g.gag}(${g.delta})`).join(', ')}`,
            );
        }
        if (triage.HARD.length) {
            console.warn(
                `[faithfulness-diff] HARD gags (>=ref+2): ${triage.HARD.map((g) => `${g.gag} ours=${g.ourMaxConc} ref=${g.refMaxConc}`).join(', ')}`,
            );
        }
        // This test itself never fails -- HARD divergences already failed their
        // own `it()` above; this is a reporting-only summary.
        expect(total).toBeGreaterThan(0);
    });
});

// Sanity: every ref file listed in index.json actually exists and is used above.
describe('faithfulness-refs/index.json is in sync with the refs directory', () => {
    it('every *.json ref file (except index.json) is listed in the index', () => {
        const files = readdirSync(refsDir).filter((f) => f.endsWith('.json') && f !== 'index.json');
        const indexed = new Set(index.map((e) => e.file));
        for (const f of files) {
            expect(indexed.has(f), `${f} exists but is not listed in index.json`).toBe(true);
        }
    });
});

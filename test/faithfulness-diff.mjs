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

const here = path.dirname(fileURLToPath(import.meta.url));
const refsDir = path.join(here, 'faithfulness-refs');

/** @type {{name:string, tag:number, file:string}[]} */
const index = JSON.parse(readFileSync(path.join(refsDir, 'index.json'), 'utf8'));

const loadRef = (file) => JSON.parse(readFileSync(path.join(refsDir, file), 'utf8'));

// Exactly the "drawing" predicate our-thread-timeline.mjs and
// building8-double-johnny.test.mjs use: draw unless finished-and-aged-out.
const isDrawing = (scene) => !isTtmFinished(scene) || scene.agedOut === false;

/** Drive one gag on our engine and compute its {vocab, maxConc} fingerprint. */
const fingerprintOurs = (adsName, tag, seed = 1) => {
    const vocab = new Set();
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
            for (const key of live) vocab.add(key);
        },
    });
    return { vocab, maxConc, liveTicks };
};

describe.skipIf(!hasData)('faithfulness oracle: our engine vs. original-binary reference fingerprints', () => {
    for (const entry of index) {
        const ref = loadRef(entry.file);
        it(`${entry.name}:${entry.tag}`, () => {
            const ours = fingerprintOurs(ref.name, ref.tag);

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

            console.log(
                `[faithfulness-diff] ${ref.name}:${ref.tag} maxConc ours=${ours.maxConc} ref=${ref.maxConc}`,
            );

            // Hard gate: extra-body regression. A single extra concurrent actor is
            // within the noise of a 3-run union vs. our one deterministic run; two
            // or more extra is the reliable "double Johnny"-class signal.
            expect(
                ours.maxConc,
                `${ref.name}:${ref.tag} maxConc regressed: ours=${ours.maxConc} vs ref=${ref.maxConc} ` +
                    `(threshold ref+2=${ref.maxConc + 2})`,
            ).toBeLessThan(ref.maxConc + 2);
        });
    }
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

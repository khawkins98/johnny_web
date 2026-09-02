import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';
import { driveGag, hasData, loadAds } from './support/drive-gag.mjs';
import { faithfulRandomFromArchive } from '../faithful-rng.mjs';

// The faithful RNG is now the engine's DEFAULT story random source: ADS RANDOM is
// driven by the original binary's baked lagged-Fibonacci stream (faithful-rng.mjs
// pick(), the one validated LFG consumer -- jump-table 0x3010 -> FUN_1048_0cda).
// This suite proves the faithful STORY is sound: every gag still runs to completion
// and FISHING #2 still winds down through its return-walk, so switching the default
// does not break reachability / the content-addressed handoff drain. It complements
// the rendering goldens (which stay on their deterministic LCG rendering baseline).
//
// The binary enters the shared RANDOM stream at a wall-clock-nondeterministic offset
// (documented in tools/faithfulness-oracle/rng-port.md), so a robust reachability
// guard checks the invariants hold from MANY stream offsets, not just position 0.
//
// SCRANTIC.SCR is proprietary + gitignored (absent in CI), so this skips in CI.
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/data');
const scrBytes = hasData
    ? new Uint8Array(readFileSync(path.join(dataDir, johnnyCastaway.resources.archive)))
    : null;

// A faithful pick() advanced `offset` raw words into the baked stream, so each probe
// samples a different position of the one shared generator.
const pickFromOffset = (offset) => {
    const rng = faithfulRandomFromArchive(scrBytes);
    for (let k = 0; k < offset; k++) rng.nextWord();
    return rng.pick;
};

const activity = hasData ? loadAds(johnnyCastaway.resources.activity) : null;
const gagIds = activity
    ? [...new Set(activity.scenes.map((scene) => scene.tagId?.id).filter((id) => id != null))]
    : [];

describe.skipIf(!hasData)('faithful RNG default plays a sound story', () => {
    for (const gag of gagIds) {
        it(`gag ${gag} completes under the faithful pick`, { timeout: 20000 }, () => {
            const { completed } = driveGag({
                adsName: johnnyCastaway.resources.activity,
                tag: gag,
                faithfulPick: pickFromOffset(0),
            });
            expect(completed, `gag ${gag} did not complete under the faithful RNG`).toBe(true);
        });
    }

    it('FISHING #2 reaches the break tag 15 and return-walk tag 39 from every stream offset', { timeout: 30000 }, () => {
        for (let offset = 0; offset < 8; offset++) {
            const { completed, seen } = driveGag({
                adsName: 'FISHING.ADS',
                tag: 2,
                faithfulPick: pickFromOffset(offset),
            });
            expect(completed, `offset ${offset} did not complete`).toBe(true);
            expect(seen.has(15), `offset ${offset} never broke the ambient loop (tag 15)`).toBe(true);
            expect(seen.has(39), `offset ${offset} never played the return-walk (tag 39)`).toBe(true);
        }
    });
});

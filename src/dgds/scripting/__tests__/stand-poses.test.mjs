import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';
import { liveKeysFor } from '../../../../tools/faithfulness-oracle/fingerprint.mjs';

// STAND.ADS gags 1-12 each open with `RUN_SCRIPT 14` ("STAND INIT"). In the
// original (0xf200 handler 1048:16c2) that only sets tag 14's flag to 4; tag 14
// is walked in the same tick (it follows tags 1-12 in file order), ADDs the 1:42
// asset loader once, and its own top-level `FADE_OUT -1` ends ONLY tag 14 (F010
// handler 1048:1669 sets the flag of the tag being walked). Tags 1-12 keep being
// walked and re-wake tag 14 every tick, which is a no-op after the first ADD
// because IF_NOT_PLAYED reads the node's "ever ADDed" counter.
//
// The pose loop (`IF_NOT_RUNNING a AND b AND c AND d -> RANDOM{poses}`) is
// re-walked every tick, so a finished pose is followed by a new pick. The exit is
// the authored roll inside `IF_RUNNING 1:53 -> RANDOM{STOP 1:53 (w1); 3020 5}`
// which fires with probability 1/6 on EVERY tick 1:53 runs, then `ADD 1:53;
// F010`. A seed whose first pick is the stand-still pose (weight 5 of 14) can
// therefore end after a single pose, or after NO live pose at all when that pose
// is a single no-delay PURGE frame (MJAMBWLK 1:64 in STAND:12 ends in the tick
// it is added, purge-verification.md) and the exit roll wins on tick 1. The
// original-binary refs (test/faithfulness-refs/STAND_*.json) are 3-run unions and
// show 3-5 poses, never the 1:42 loader (also a zero-delay PURGE loader).
const refsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../test/faithfulness-refs');
const LOADER = '1:42';

describe.skipIf(!hasData)('STAND.ADS pose gags add poses from the original-binary reference vocab', () => {
    for (let tag = 1; tag <= 12; tag++) {
        it(`STAND:${tag} plays reference poses, never shows the 1:42 loader live, and completes`, () => {
            const ref = JSON.parse(readFileSync(path.join(refsDir, `STAND_${tag}.json`), 'utf8'));
            const refVocab = new Set(ref.vocab);
            expect(refVocab.has(LOADER)).toBe(false);
            const vocab = new Set();
            for (let seed = 1; seed <= 6; seed++) {
                const { completed } = driveGag({
                    adsName: 'STAND.ADS',
                    tag,
                    seed,
                    onTick: (runtime) => liveKeysFor(runtime).forEach((key) => vocab.add(key)),
                });
                expect(completed, `STAND:${tag} seed ${seed} completes`).toBe(true);
            }
            expect(vocab.has(LOADER), 'the zero-delay loader is never a live thread').toBe(false);
            // Across the seeds we draw several of the poses the original draws (the
            // refs are 3-run unions, so they may miss an authored pose we hit).
            const poses = [...vocab];
            expect(poses.filter((key) => refVocab.has(key)).length).toBeGreaterThanOrEqual(2);
        });
    }
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';
import { liveKeysFor } from '../../../../tools/faithfulness-oracle/fingerprint.mjs';

// STAND.ADS gags 1-12 each open with `RUN_SCRIPT 14` ("STAND INIT"), which inlines
// tag 14's `IF_NOT_PLAYED 1 42 -> ADD 1 42`, END_SCENE_BRANCH, then its trailing
// `FADE_OUT -1`. After expansion that F010 is the FIRST opcode of the pose chunk
// (`FADE_OUT; IF_NOT_RUNNING ... -> RANDOM ADD pose`).
//
// The Johnny browser host always runs gags with `hostManagedTransitions: true`
// (browser-presentation.mjs passes `Boolean(selectScene)`, and the Johnny app
// always supplies selectScene), under which F010 is a non-blocking end-of-segment
// marker, so the walk reaches the pose guard and a pose plays. driveGag used to
// omit that flag, so F010 took the non-Johnny alpha-fade path, which parks the
// pass on the F010 before the pose guard: every STAND pose gag ran only the
// never-drawing 1:42 loader and finished in 6 ticks, while the original-binary
// refs (test/faithfulness-refs/STAND_*.json) show poses drawn. This pins driveGag
// to the real app path and the poses to the ref vocab.

const refsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../test/faithfulness-refs');
const LOADER = '1:42'; // STAND INIT: loads MJAMBWLK assets, never draws

describe.skipIf(!hasData)('STAND.ADS pose gags add a pose scene (real-app transition path)', () => {
    for (let tag = 1; tag <= 12; tag++) {
        it(`STAND:${tag} draws a pose from the original-binary reference vocab`, () => {
            const ref = JSON.parse(readFileSync(path.join(refsDir, `STAND_${tag}.json`), 'utf8'));
            const refVocab = new Set(ref.vocab);
            const vocab = new Set();
            // The refs show several poses per run, so each seed must CYCLE through at
            // least two distinct poses, not stop after one. This depends on the pose
            // chunk re-polling while parked on its leading F010 after
            // adsSegmentEnded (ads-slots.mjs stepAdsSlots); guard that here.
            const refPoseCount = ref.vocab.filter((key) => key !== LOADER).length;
            for (let seed = 1; seed <= 3; seed++) {
                const seedPoses = new Set();
                const { completed } = driveGag({
                    adsName: 'STAND.ADS',
                    tag,
                    seed,
                    onTick: (runtime) =>
                        liveKeysFor(runtime).forEach((key) => {
                            vocab.add(key);
                            if (key !== LOADER) seedPoses.add(key);
                        }),
                });
                expect(completed, `STAND:${tag} seed ${seed} completes`).toBe(true);
                expect(seedPoses.size, `STAND:${tag} seed ${seed} cycles poses`).toBeGreaterThanOrEqual(
                    Math.min(2, refPoseCount),
                );
            }
            const poses = [...vocab].filter((key) => key !== LOADER);
            // At least one pose actually played, and it is one the original draws.
            expect(poses.filter((key) => refVocab.has(key)).length).toBeGreaterThan(0);
        });
    }
});

import { describe, expect, it } from 'vitest';
import { driveGag, hasData } from './support/drive-gag.mjs';
import { isTtmFinished } from '../ttm-run-state.mjs';

// PURGE (0x0110) ends a TTM sequence once its frame's hold elapses. A zero-delay PURGE
// frame therefore ends in the tick it runs. A separate TTM prologue is host setup,
// not a frame of the first-added thread.
//
// Ground truth: the original-binary refs (test/faithfulness-refs/*.json, sampled at entry
// to the tick function FUN_1048_1acb, counting runstates 1-3 only):
//   - JOHNNY:6 never shows the SJWORK loader 3:9 (SET_DELAY 0; PURGE; UPDATE), even
//     though it is added in the same ADS commit as 3:3 (ref maxConc 1).
//   - ACTIVITY:11 never shows the MJBATH loaders 5:42 (no delay) or 5:20 (SET_DELAY 0).
//   - SUZY:1 DOES show 1:1 (SET_DELAY 10; PURGE; UPDATE) for 4 samples, so loaders
//     with a nonzero hold stay live.
//   - ACTIVITY:11 5:24 "preen timer" (0x2020 random delay; PURGE; UPDATE; then 4 drawing
//     frames) lives 59-117 samples, which is a single random hold. The frames after
//     its PURGE are never played.
// Mechanism, from the decompile: FUN_1048_1acb runs a newly added thread's first frame in
// the same tick, after the ADS actions. When the end-of-sequence flag is set, it sets
// runstate 4 as soon as FUN_1048_196e reports the delay elapsed, and with delay 0 that is
// immediate. Thread nodes (FUN_1050_042a, built in FUN_1050_04d6) start at their own
// SET_SCENE frame, so a separate prologue frame 0 belongs to no thread.

const liveKeysPerTick = (adsName, tag, seed) => {
    const ticks = [];
    driveGag({
        adsName,
        tag,
        seed,
        onTick: (runtime) => {
            ticks.push(
                runtime.state.scenes.filter((s) => !isTtmFinished(s)).map((s) => `${s.sceneIdx}:${s.tagId}`),
            );
        },
    });
    return ticks;
};

describe.skipIf(!hasData)('PURGE ends the sequence; zero-delay loaders are never live', () => {
    for (const seed of [1, 2, 3]) {
        it(`JOHNNY:6 seed ${seed}: 3:9 is never live and slot 3 never runs two threads`, () => {
            const ticks = liveKeysPerTick('JOHNNY.ADS', 6, seed);
            expect(ticks.some((live) => live.includes('3:9'))).toBe(false);
            const slot3Peak = Math.max(...ticks.map((live) => live.filter((k) => k.startsWith('3:')).length));
            expect(slot3Peak).toBe(1);
        });

        it(`ACTIVITY:11 seed ${seed}: 5:42/5:20 are never live; opening peak is 4`, () => {
            const ticks = liveKeysPerTick('ACTIVITY.ADS', 11, seed);
            expect(ticks.some((live) => live.includes('5:42') || live.includes('5:20'))).toBe(false);
            expect(ticks[0].sort()).toEqual(['5:19', '5:21', '5:3', '5:30']);
        });
    }

    it('SUZY:1: the nonzero-delay loader 1:1 stays live for its hold', () => {
        const ticks = liveKeysPerTick('SUZY.ADS', 1, 1);
        expect(ticks.filter((live) => live.includes('1:1')).length).toBeGreaterThan(1);
    });

    it('ACTIVITY:11: 5:24 ends after its PURGE frame and never plays the frames after it', () => {
        let sawPreen = false;
        let preenDrew = false;
        driveGag({
            adsName: 'ACTIVITY.ADS',
            tag: 11,
            seed: 1,
            onTick: (runtime) => {
                for (const scene of runtime.state.scenes) {
                    if (scene.sceneIdx !== 5 || scene.tagId !== 24) continue;
                    sawPreen = true;
                    if ((scene.state.frameOps?.length ?? 0) > 0) preenDrew = true;
                }
            },
        });
        expect(sawPreen).toBe(true);
        expect(preenDrew).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';
import { getTtmThreadScript } from '../ttm-thread-script.mjs';
import { driveGag, hasData } from './support/drive-gag.mjs';

const op = (opcode, ...params) => ({ opcode, params });

describe('TTM frame continuation across SET_SCENE', () => {
    it('keeps the next named frame on the original thread through its PURGE frame', () => {
        const ttm = {
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 44, script: [op(0x1110, 44), op(0x1020, 0), op(0x0ff0)] },
                { tagId: 45, script: [op(0x1110, 45), op(0x1020, 7), op(0x0ff0), op(0x0110), op(0x0ff0)] },
                { tagId: 46, script: [op(0x1110, 46), op(0x0ff0)] },
            ],
        };

        expect(getTtmThreadScript(ttm, 44)).toEqual([
            ...ttm.scenes[1].script,
            ...ttm.scenes[2].script,
        ]);
        expect(getTtmThreadScript(ttm, 45)).toEqual(ttm.scenes[2].script);
    });
});

describe.skipIf(!hasData)('FISHING 4:44 continues into 4:45 instead of finishing after one UPDATE', () => {
    for (const tag of [7, 8]) {
        it(`FISHING:${tag} seed 1 has full stand-at-D spans on the original node`, () => {
            const spans = [];
            let start = null;
            driveGag({
                adsName: 'FISHING.ADS',
                tag,
                seed: 1,
                onTick: (runtime, _result, tick) => {
                    const scene = runtime.state.scenes.find(
                        (s) => s.sceneIdx === 4 && s.tagId === 44 && s.runState !== 'finished',
                    );
                    if (scene && start === null) {
                        start = tick;
                        // SET_SCENE 45 is an op inside node 44's execution. It
                        // does not rename the ADS-visible thread or add node 45.
                        expect(scene.script.filter((c) => c.opcode === 0x1110)).toHaveLength(2);
                    }
                    if (!scene && start !== null) {
                        spans.push(tick - start);
                        start = null;
                    }
                },
            });

            expect(spans.length).toBeGreaterThan(0);
            // Fresh original contiguous spans: 15–17 samples (tag 7) and
            // 16–18 (tag 8), roughly 43–51 browser ticks at 2.85x. The host's
            // present gate adds a little frame rounding. The old sliced script
            // lasted only two browser ticks.
            expect(spans.every((length) => length >= 40 && length <= 60)).toBe(true);
        });
    }
});

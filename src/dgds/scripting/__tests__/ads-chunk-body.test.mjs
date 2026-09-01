import { describe, expect, it } from 'vitest';
import { runAdsChunkBody } from '../script-runner.mjs';

describe('runAdsChunkBody', () => {
    it('runs a chunk body and stages its ADD without touching reentry', () => {
        const script = [
            { opcode: 0x1350, params: [3, 82] },
            { opcode: 0x2005, params: [3, 83, 1, 1] },
            { opcode: 0x1510, params: [] },
        ];
        const state = {
            type: 'ADS',
            reentry: 5,
            scenes: [],
            addScenes: [],
            removeScenes: [],
            scenesRandom: [],
            playedHistory: new Set(),
            randomize: false,
        };
        runAdsChunkBody(state, script, 1);
        expect(state.addScenes.some((s) => s.sceneIdx === 3 && s.tagId === 83)).toBe(true);
        expect(state.reentry).toBe(5); // untouched
    });

    it('stops at the chunk terminator without invoking the real commit (caller commits once)', () => {
        // The terminating 0x1510 is NOT the real END_SCENE_BRANCH callback --
        // it is a local loop bound. If it committed here, state.addScenes would
        // be cleared by applySceneChanges before the caller ever sees it.
        const script = [
            { opcode: 0x1350, params: [3, 82] },
            { opcode: 0x2005, params: [3, 83, 1, 1] },
            { opcode: 0x1510, params: [] },
            { opcode: 0x2005, params: [3, 999, 1, 1] }, // must NOT run -- past the terminator
        ];
        const state = {
            type: 'ADS',
            reentry: 0,
            scenes: [],
            addScenes: [],
            removeScenes: [],
            scenesRandom: [],
            playedHistory: new Set(),
            randomize: false,
        };
        runAdsChunkBody(state, script, 1);
        expect(state.addScenes).toEqual([{ sceneIdx: 3, tagId: 83, runCount: 1, proportion: 1 }]);
    });

    it('does not leak jumpTo or reentryNow to the caller', () => {
        const script = [
            { opcode: 0x1350, params: [3, 82] },
            { opcode: 0x2005, params: [3, 83, 1, 1] },
            { opcode: 0x1510, params: [] },
        ];
        const state = {
            type: 'ADS',
            reentry: 5,
            reentryNow: 42,
            jumpTo: undefined,
            scenes: [],
            addScenes: [],
            removeScenes: [],
            scenesRandom: [],
            playedHistory: new Set(),
            randomize: false,
        };
        runAdsChunkBody(state, script, 1);
        expect(state.reentryNow).toBe(42);
        expect(state.jumpTo).toBeUndefined();
    });
});

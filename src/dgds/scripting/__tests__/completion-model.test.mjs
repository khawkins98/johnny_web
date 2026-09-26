import { describe, expect, it } from 'vitest';
import { completionView, isGagComplete } from '../oracle/completion-model.mjs';
import { TtmRunState } from '../ttm-run-state.mjs';

describe('ADS completion oracle', () => {
    it('requires the tag to end even when all node slots are idle', () => {
        const state = { adsTagEnded: false, scenes: [], addScenes: [{ sceneIdx: 1, tagId: 2 }] };
        expect(isGagComplete(state)).toBe(false);
        expect(completionView(state)).toEqual({ oracleComplete: false, tagEnded: false, liveThreads: [] });
        state.adsTagEnded = true;
        expect(isGagComplete(state)).toBe(true);
    });

    it('waits for live nodes after the tag ends', () => {
        const state = { adsTagEnded: true, scenes: [{ sceneIdx: 1, tagId: 2, runState: TtmRunState.RUNNING }] };
        expect(completionView(state).liveThreads).toEqual(['1:2']);
        expect(isGagComplete(state)).toBe(false);
        state.scenes[0].runState = TtmRunState.FINISHED;
        expect(isGagComplete(state)).toBe(true);
    });
});

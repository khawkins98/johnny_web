import { describe, expect, it } from 'vitest';
import { formatDebugStageHash, parseDebugStageHash } from '../debug-stage-link.mjs';

describe('debug stage links', () => {
    it('round-trips a selected stage', () => {
        const stage = { script: 'ACTIVITY.ADS', tagId: 11, storyDay: 1, mode: 'preview' };
        expect(parseDebugStageHash(formatDebugStageHash(stage))).toEqual(stage);
    });

    it('rejects malformed or out-of-range stage state', () => {
        expect(parseDebugStageHash('#stage=ACTIVITY.ADS:nope')).toBeNull();
        expect(parseDebugStageHash('#stage=ACTIVITY.ADS:11&day=12')).toBeNull();
    });
});

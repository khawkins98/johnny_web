import { describe, expect, it } from 'vitest';
import { formatDebugStageHash, parseDebugStageHash } from '../debug-stage-link.mjs';

describe('debug stage links', () => {
    it('round-trips a selected stage', () => {
        const stage = { script: 'ACTIVITY.ADS', tagId: 11, storyDay: 1, mode: 'preview' };
        expect(parseDebugStageHash(formatDebugStageHash(stage))).toEqual(stage);
    });

    it('carries an optional time of day, and ignores a malformed one', () => {
        const stage = { script: 'ACTIVITY.ADS', tagId: 11, storyDay: 3, mode: 'preview', band: 'night' };
        expect(formatDebugStageHash(stage)).toBe('#stage=ACTIVITY.ADS:11&day=3&mode=preview&time=night');
        expect(parseDebugStageHash(formatDebugStageHash(stage))).toEqual(stage);
        expect(parseDebugStageHash('#stage=ACTIVITY.ADS:11&time=<b>')).toEqual({ script: 'ACTIVITY.ADS', tagId: 11, storyDay: 1, mode: 'preview' });
    });

    it('rejects malformed or out-of-range stage state', () => {
        expect(parseDebugStageHash('#stage=ACTIVITY.ADS:nope')).toBeNull();
        expect(parseDebugStageHash('#stage=ACTIVITY.ADS:11&day=12')).toBeNull();
    });
});

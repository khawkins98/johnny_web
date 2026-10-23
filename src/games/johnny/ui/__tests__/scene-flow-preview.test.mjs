import { describe, expect, it, vi } from 'vitest';
import { sceneFlowPreviewTitleState } from '../scene-flow-preview.mjs';

describe('embedded scene preview clock context', () => {
    const setup = () => {
        const live = { data: { name: 'MISCGAG.ADS', scenes: [{ tagId: { id: 1 } }] }, currentScene: 0,
            titleState: { storyDay: 2, tidePhase: 0, band: null, night: false } };
        const titleState = { storyDay: 2, tidePhase: 12, band: 'night', night: true };
        const sequenceTools = { preview: vi.fn(() => ({ titleState })) };
        return { live, sequenceTools, titleState, script: 'MISCGAG.ADS', gagTag: 1, storyDay: 2 };
    };

    it('does not reuse the daytime live sky when the same gag is browsed at Night', () => {
        const options = setup();
        expect(sceneFlowPreviewTitleState({ ...options, band: 'night' })).toBe(options.titleState);
        expect(options.sequenceTools.preview).toHaveBeenCalledWith('MISCGAG.ADS', 1, { storyDay: 2, band: 'night' });
        expect(options.live.titleState.night).toBe(false);
    });

    it('reuses the live island in the same day and phase band', () => {
        const options = setup();
        expect(sceneFlowPreviewTitleState({ ...options, band: 'early' })).toBe(options.live.titleState);
        expect(options.sequenceTools.preview).not.toHaveBeenCalled();
    });

    it('does not reuse the same gag on a different browsing day', () => {
        const options = setup();
        sceneFlowPreviewTitleState({ ...options, storyDay: 3, band: 'early' });
        expect(options.sequenceTools.preview).toHaveBeenCalledWith('MISCGAG.ADS', 1, { storyDay: 3, band: 'early' });
    });
});

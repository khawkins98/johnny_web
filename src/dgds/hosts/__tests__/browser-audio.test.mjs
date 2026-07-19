import { describe, expect, it, vi } from 'vitest';
import { consumeBrowserAudio } from '../browser-audio.mjs';

const operation = Object.freeze({
    type: 'play-sample',
    sample: 6,
    tick: 824,
    sceneIdx: 5,
    tagId: 19,
});

describe('browser audio host adapter', () => {
    it('plays emitted samples and records host playback separately', () => {
        const record = vi.fn();
        const play = vi.fn();
        const load = vi.fn((_sample, callback) => callback());
        const audioManager = {
            enabled: true,
            context: { state: 'running' },
            getSoundFxSource: () => ({ load, play }),
        };

        consumeBrowserAudio([operation], {
            audioManager,
            trace: { record },
        });

        expect(load).toHaveBeenCalledWith(6, expect.any(Function));
        expect(play).toHaveBeenCalledOnce();
        expect(record).toHaveBeenCalledWith('audio-sample', {
            tick: 824,
            sceneIdx: 5,
            tagId: 19,
            action: 'started',
            sample: 6,
            enabled: true,
            contextState: 'running',
        });
    });

    it('records an unavailable host without blocking the machine', () => {
        const record = vi.fn();

        expect(() =>
            consumeBrowserAudio([operation], {
                audioManager: null,
                trace: { record },
            }),
        ).not.toThrow();
        expect(record).toHaveBeenCalledWith(
            'audio-sample',
            expect.objectContaining({
                action: 'unavailable',
                sample: 6,
            }),
        );
    });

    it('resumes a suspended context as a host concern', () => {
        const resume = vi.fn();
        const audioManager = {
            context: { state: 'suspended', resume },
            getSoundFxSource: () => ({ load: vi.fn(), play: vi.fn() }),
        };

        consumeBrowserAudio([operation], { audioManager });

        expect(resume).toHaveBeenCalledOnce();
    });
});

import { describe, expect, it, vi } from 'vitest';
import { createAudioManager } from '../audio.mjs';

describe('audio manager', () => {
    it('controls all sound through a persistent master gain', () => {
        const masterGain = {
            gain: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
        };
        const sourceGain = {
            gain: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
        };
        const context = {
            currentTime: 12,
            destination: { name: 'speakers' },
            createGain: vi.fn()
                .mockReturnValueOnce(masterGain)
                .mockReturnValueOnce(sourceGain),
            createBiquadFilter: () => ({ connect: vi.fn(), type: '' }),
        };

        const manager = createAudioManager({
            context,
            soundFxVolume: 0.5,
            enabled: false,
            sampleCatalog: {
                archive: 'TEST.SCR',
                sampleOffsets: [-1],
            },
        });

        expect(masterGain.connect).toHaveBeenCalledWith(context.destination);
        expect(masterGain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 12);
        expect(manager.enabled).toBe(false);

        manager.setEnabled(true);
        expect(masterGain.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 12);
        expect(manager.enabled).toBe(true);

        expect(() => manager.getSoundFxSource().load(999, vi.fn())).not.toThrow();
    });

    it('requires title-specific sample metadata to be injected', () => {
        expect(() => createAudioManager({ context: {} })).toThrow('sampleCatalog');
    });
});

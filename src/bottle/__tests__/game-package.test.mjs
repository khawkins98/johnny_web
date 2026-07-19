import { describe, expect, it } from 'vitest';
import { defineGamePackage } from '../game-package.mjs';

const validPackage = () => ({
    id: 'test-title',
    title: 'Test Title',
    version: '1.0',
    resources: {
        map: 'RESOURCE.MAP',
        archive: 'RESOURCE.001',
        intro: 'INTRO.SCR',
        activity: 'ACTIVITY.ADS',
    },
    background: {},
    audio: {
        archive: 'SAMPLES.SCR',
        sampleOffsets: [-1],
    },
});

describe('Bottle game package', () => {
    it('validates and deeply freezes consumed title metadata', () => {
        const game = defineGamePackage(validPackage());

        expect(game.id).toBe('test-title');
        expect(Object.isFrozen(game)).toBe(true);
        expect(Object.isFrozen(game.resources)).toBe(true);
        expect(Object.isFrozen(game.audio.sampleOffsets)).toBe(true);
    });

    it('reports a missing required field by package path', () => {
        const game = validPackage();
        delete game.resources.activity;

        expect(() => defineGamePackage(game)).toThrow('resources.activity');
    });
});

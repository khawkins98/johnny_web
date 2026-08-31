import { describe, expect, it } from 'vitest';
import { getCompositionRevision } from '../composition-signature.mjs';

describe('host composition signature', () => {
    it('is a content signature that changes only when the composed frame changes', () => {
        const scene = { sceneIdx: 1, tagId: 2, runState: 'running', state: { layerRevision: 5 } };
        const state = { scenes: [scene], titleState: { sceneOffset: { x: 0, y: 0 } } };

        const initial = getCompositionRevision(state);
        // Stable across ticks when nothing changed (a held frame is not recomposed).
        expect(getCompositionRevision(state)).toBe(initial);

        // A new logical frame (layerRevision bump) changes the signature.
        scene.state.layerRevision = 6;
        const advanced = getCompositionRevision(state);
        expect(advanced).not.toBe(initial);

        // Shifting the island offset changes the signature.
        state.titleState.sceneOffset = { x: 4, y: 0 };
        expect(getCompositionRevision(state)).not.toBe(advanced);

        // A finished scene drops out of the signature (so it will vanish next compose).
        scene.runState = 'finished';
        expect(getCompositionRevision(state)).toBe('#@4,0'); // no active scenes, just the offset
    });

    it('is a stable signature even with no scenes or raster', () => {
        expect(getCompositionRevision({})).toBe('#@0,0');
    });
});

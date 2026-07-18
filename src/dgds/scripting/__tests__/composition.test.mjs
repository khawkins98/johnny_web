import { describe, expect, it } from 'vitest';
import { composeTtmFrame, getCompositionRevision } from '../composition.mjs';
import { createRecordingSurface } from '../surface.mjs';

describe('DGDS frame composition', () => {
    it('rebuilds the frame from stored areas and active scene layers in order', () => {
        const surface = createRecordingSurface();
        const storedSurface = createRecordingSurface();
        const firstLayer = createRecordingSurface();
        const secondLayer = createRecordingSurface();
        const environment = {
            assets: { saveBkg: [{ canDraw: true, surface: storedSurface }] },
        };
        const state = {
            surface,
            ttmEnvironments: new Map([[1, environment]]),
            scenes: [
                { state: { surface: firstLayer } },
                { state: { surface: secondLayer } },
            ],
        };

        composeTtmFrame(state);

        expect(surface.commands).toEqual([
            { operation: 'clear', rect: { x: 0, y: 0, width: 640, height: 480 } },
            { operation: 'drawSurface', source: storedSurface, rect: undefined },
            { operation: 'drawSurface', source: firstLayer, rect: undefined },
            { operation: 'drawSurface', source: secondLayer, rect: undefined },
        ]);
    });

    it('drops a stopped scene from the next composed frame', () => {
        const surface = createRecordingSurface();
        const stoppedLayer = createRecordingSurface();
        const state = {
            surface,
            ttmEnvironments: new Map(),
            scenes: [{ state: { surface: stoppedLayer } }],
        };

        composeTtmFrame(state);
        state.scenes = [];
        composeTtmFrame(state);

        expect(surface.commands.slice(-1)).toEqual([
            { operation: 'clear', rect: { x: 0, y: 0, width: 640, height: 480 } },
        ]);
    });

    it('paints TTM declaration order instead of ADS start order', () => {
        const surface = createRecordingSurface();
        const firstDeclaredLayer = createRecordingSurface();
        const secondDeclaredLayer = createRecordingSurface();
        const state = {
            surface,
            ttmEnvironments: new Map(),
            scenes: [
                {
                    paintOrder: { resource: 0, sequence: 21 },
                    state: { surface: secondDeclaredLayer },
                },
                {
                    paintOrder: { resource: 0, sequence: 3 },
                    state: { surface: firstDeclaredLayer },
                },
            ],
        };

        composeTtmFrame(state);

        expect(surface.commands).toEqual([
            { operation: 'clear', rect: { x: 0, y: 0, width: 640, height: 480 } },
            { operation: 'drawSurface', source: firstDeclaredLayer, rect: undefined },
            { operation: 'drawSurface', source: secondDeclaredLayer, rect: undefined },
        ]);
        expect(state.scenes[0].state.surface).toBe(secondDeclaredLayer);
    });

    it('changes retained-composition identity only when a layer changes', () => {
        const state = {
            ttmEnvironments: new Map(),
            scenes: [{
                sceneIdx: 5,
                tagId: 21,
                lifecycle: 'running',
                state: { layerRevision: 3 },
            }],
        };
        const initial = getCompositionRevision(state);

        expect(getCompositionRevision(state)).toBe(initial);
        state.scenes[0].state.layerRevision++;
        expect(getCompositionRevision(state)).not.toBe(initial);
    });
});

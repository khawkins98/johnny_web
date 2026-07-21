import { describe, expect, it } from 'vitest';
import { composeTtmFrame, getCompositionRevision } from '../composition.mjs';
import { createRecordingSurface, createSoftwareSurface } from '../surface.mjs';

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
            scenes: [{ state: { surface: firstLayer } }, { state: { surface: secondLayer } }],
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
            scenes: [
                {
                    sceneIdx: 5,
                    tagId: 21,
                    lifecycle: 'running',
                    state: { layerRevision: 3 },
                },
            ],
        };
        const initial = getCompositionRevision(state);

        expect(getCompositionRevision(state)).toBe(initial);
        state.scenes[0].state.layerRevision++;
        expect(getCompositionRevision(state)).not.toBe(initial);
    });

    it('retires a completed layer after a newer GET/PUT restore overwrites its pixels', () => {
        const completedSurface = createSoftwareSurface();
        completedSurface.fillRect(100, 100, 20, 20, { r: 255, g: 0, b: 0, a: 255 });
        const replacementSurface = createSoftwareSurface();
        replacementSurface.fillRect(130, 100, 10, 10, { r: 0, g: 255, b: 0, a: 255 });
        const state = {
            surface: createSoftwareSurface(),
            ttmEnvironments: new Map(),
            scenes: [
                {
                    lifecycle: 'completed',
                    state: { surface: completedSurface, lastFrameSerial: 7, lastRestoreRect: null },
                },
                {
                    lifecycle: 'running',
                    state: {
                        surface: replacementSurface,
                        lastFrameSerial: 8,
                        lastRestoreRect: { x: 90, y: 90, width: 80, height: 80 },
                    },
                },
            ],
        };

        composeTtmFrame(state);

        expect(state.surface.fingerprint()).toEqual({
            hash: replacementSurface.fingerprint().hash,
            pixels: 100,
            bounds: { x: 130, y: 100, width: 10, height: 10 },
        });
    });

    it('retains a completed layer when no newer restore has replaced it', () => {
        const completedSurface = createSoftwareSurface();
        completedSurface.fillRect(100, 100, 20, 20, { r: 255, g: 0, b: 0, a: 255 });
        const state = {
            surface: createSoftwareSurface(),
            ttmEnvironments: new Map(),
            scenes: [
                {
                    lifecycle: 'completed',
                    state: { surface: completedSurface, lastFrameSerial: 8, lastRestoreRect: null },
                },
                {
                    lifecycle: 'running',
                    state: {
                        surface: createSoftwareSurface(),
                        lastFrameSerial: 7,
                        lastRestoreRect: { x: 90, y: 90, width: 80, height: 80 },
                    },
                },
            ],
        };

        composeTtmFrame(state);

        expect(state.surface.fingerprint().pixels).toBe(400);
    });
});

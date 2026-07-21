import { describe, expect, it } from 'vitest';
import { beginSceneFrame } from '../scene-frame.mjs';
import { createRecordingSurface } from '../surface.mjs';
import { createTraceRecorder } from '../trace.mjs';
import { presentSurfaceFrameOperation } from '../surface-frame-presenter.mjs';

describe('logical scene frames', () => {
    it('clears the previous frame before restoring a saved region', () => {
        const surface = createRecordingSurface();
        const savedSurface = createRecordingSurface();
        const trace = createTraceRecorder();
        const save = {
            surface: savedSurface,
            canDraw: true,
            x: 10,
            y: 20,
            width: 30,
            height: 40,
        };
        const state = {
            surface,
            save: [save],
            trace,
            sceneIdx: 5,
            tagId: 21,
            frameOperations: [],
            presentFrameOperation: presentSurfaceFrameOperation,
        };

        beginSceneFrame(state, 0);

        expect(surface.commands).toEqual([
            { operation: 'clear', rect: { x: 0, y: 0, width: 640, height: 480 } },
            {
                operation: 'replaceRegionFrom',
                source: savedSurface,
                rect: { x: 10, y: 20, width: 30, height: 40 },
            },
        ]);
        expect(trace.snapshot()[0]).toMatchObject({
            type: 'scene-frame-begin',
            sceneIdx: 5,
            tagId: 21,
            restored: true,
            restoreSlot: 0,
        });
        expect(state.frameOperations).toMatchObject([
            {
                type: 'begin-scene-frame',
                restoreSlot: 0,
                sceneIdx: 5,
                tagId: 21,
            },
        ]);
        expect(state.lastFrameSerial).toBe(1);
        expect(state.lastRestoreRect).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    });

    it('starts with an empty layer when the save slot is unavailable', () => {
        const surface = createRecordingSurface();
        const state = {
            surface,
            save: [{ canDraw: false }],
            layerRevision: 4,
            frameOperations: [],
            presentFrameOperation: presentSurfaceFrameOperation,
        };

        beginSceneFrame(state, 0);

        expect(surface.commands).toEqual([{ operation: 'clear', rect: { x: 0, y: 0, width: 640, height: 480 } }]);
        expect(state.layerRevision).toBe(5);
        expect(state.lastFrameSerial).toBe(1);
        expect(state.lastRestoreRect).toBeNull();
    });
});

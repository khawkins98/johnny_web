import { describe, expect, it } from 'vitest';
import { beginSceneFrame } from '../scene-frame.mjs';
import { createRecordingSurface } from '../surface.mjs';
import { createTraceRecorder } from '../trace.mjs';
import { presentSurfaceFrameOperation } from '../surface-frame-presenter.mjs';

describe('logical scene frames', () => {
    it('restores the slot save-under region from the global registry (no full clear)', () => {
        const surface = createRecordingSurface();
        const savedSurface = createRecordingSurface();
        const trace = createTraceRecorder();
        const rect = { x: 10, y: 20, width: 30, height: 40 };
        const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
        const state = {
            surface,
            // per-scene index→rect pointer + global rect-keyed registry live on root
            savedRects: [rect],
            saveUnder: [{ key, ...rect, surface: savedSurface }],
            save: [{ canDraw: true, x: 10, y: 20, width: 30, height: 40, surface: savedSurface }],
            trace,
            sceneIdx: 5,
            tagId: 21,
            frameOperations: [],
            presentFrameOperation: presentSurfaceFrameOperation,
        };
        state.root = state;

        beginSceneFrame(state, 0);

        // Persistent shared raster: restore only the saved region, never clear all.
        expect(surface.commands).toEqual([
            {
                operation: 'replaceRegionFrom',
                source: savedSurface,
                rect: { x: 10, y: 20, width: 30, height: 40 },
            },
        ]);
        // The restore consumes the registry entry (LIFO save-under).
        expect(state.saveUnder).toEqual([]);
        expect(trace.snapshot()[0]).toMatchObject({
            type: 'scene-frame-begin',
            sceneIdx: 5,
            tagId: 21,
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
    });

    it('does nothing to the raster when the slot has no saved region', () => {
        const surface = createRecordingSurface();
        const state = {
            surface,
            save: [{ canDraw: false }],
            layerRevision: 4,
            frameOperations: [],
            presentFrameOperation: presentSurfaceFrameOperation,
        };
        state.root = state;

        beginSceneFrame(state, 0);

        expect(surface.commands).toEqual([]);
        expect(state.layerRevision).toBe(5);
    });
});

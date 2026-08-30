import { describe, expect, it } from 'vitest';
import { beginSceneFrame } from '../scene-frame.mjs';
import { createRecordingSurface } from '../surface.mjs';
import { createTraceRecorder } from '../trace.mjs';
import { presentSurfaceFrameOperation } from '../surface-frame-presenter.mjs';

describe('logical scene frames', () => {
    it('starts a fresh frame: resets the scene draw list + emits boundary/trace, never touches the raster', () => {
        const surface = createRecordingSurface();
        const trace = createTraceRecorder();
        const state = {
            surface,
            // A leftover recorded frame from the previous logical frame.
            frameOps: [{ type: 'fill-rect', x: 0, y: 0, width: 1, height: 1 }],
            trace,
            sceneIdx: 5,
            tagId: 21,
            frameOperations: [],
            presentFrameOperation: presentSurfaceFrameOperation,
        };
        state.root = state;

        beginSceneFrame(state, 0);

        // Immediate mode: a frame boundary no longer clears or restores the raster --
        // erasure is the per-tick clear+replay in composeTtmFrame.
        expect(surface.commands).toEqual([]);
        // It resets this scene's recorded frame so the new frame's draws replace the old.
        expect(state.frameOps).toEqual([]);
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

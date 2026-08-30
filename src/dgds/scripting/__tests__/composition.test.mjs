import { describe, expect, it } from 'vitest';
import {
    composeTtmFrame,
    getCompositionRevision,
    bakeEnvironmentBackground,
    pruneEnvironmentBackground,
} from '../composition.mjs';
import { createRecordingSurface } from '../surface.mjs';

describe('DGDS frame composition', () => {
    it('composeTtmFrame no longer clears or redraws layers (scenes draw into the shared raster)', () => {
        const surface = createRecordingSurface();
        const state = {
            surface,
            ttmEnvironments: new Map([[1, { assets: { saveBkg: [{ canDraw: true, surface: createRecordingSurface() }] } }]]),
            scenes: [{ state: { surface: createRecordingSurface() } }],
        };

        composeTtmFrame(state);

        // Trace-only seam: it must not touch the raster.
        expect(surface.commands).toEqual([]);
    });

    it('records a composition trace event only when tracing is active', () => {
        const events = [];
        const state = {
            surface: createRecordingSurface(),
            tick: 7,
            trace: { active: true, record: (type, payload) => events.push({ type, payload }) },
        };

        composeTtmFrame(state);

        expect(events).toEqual([{ type: 'composition', payload: { tick: 7 } }]);
    });

    it('getCompositionRevision tracks the shared raster revision', () => {
        const surface = createRecordingSurface();
        const state = { surface };
        const initial = getCompositionRevision(state);

        expect(getCompositionRevision(state)).toBe(initial);
        // Any mutator bumps the raster revision (Task 1 counter).
        surface.fillRect(0, 0, 10, 10, 'white');
        expect(getCompositionRevision(state)).not.toBe(initial);
        expect(getCompositionRevision(state)).toBe(surface.revision);
    });

    it('getCompositionRevision is 0 when there is no raster', () => {
        expect(getCompositionRevision({})).toBe(0);
    });

    it('bakes only the named environment background onto the shared raster', () => {
        const surface = createRecordingSurface();
        const stored = createRecordingSurface();
        const other = createRecordingSurface();
        const state = {
            surface,
            ttmEnvironments: new Map([
                [3, { assets: { saveBkg: [{ canDraw: true, surface: stored }] } }],
                [4, { assets: { saveBkg: [{ canDraw: true, surface: other }] } }],
            ]),
        };
        bakeEnvironmentBackground(state, 3);
        expect(surface.commands).toEqual([{ operation: 'drawSurface', source: stored, rect: undefined }]);
    });

    it('prune clears the environment background canDraw flag', () => {
        const stored = { canDraw: true, surface: createRecordingSurface() };
        const state = { ttmEnvironments: new Map([[3, { assets: { saveBkg: [stored] } }]]) };
        pruneEnvironmentBackground(state, 3);
        expect(stored.canDraw).toBe(false);
    });
});

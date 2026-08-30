import { describe, expect, it } from 'vitest';
import {
    composeTtmFrame,
    getCompositionRevision,
    bakeEnvironmentBackground,
    pruneEnvironmentBackground,
} from '../composition.mjs';
import { createRecordingSurface } from '../surface.mjs';

describe('DGDS frame composition', () => {
    it('clears the raster then replays each ACTIVE scene frame in z-order; finished scenes vanish', () => {
        const surface = createRecordingSurface();
        const fill = (x) => ({ type: 'fill-rect', x, y: 10, width: 5, height: 5, color: 'white' });
        const state = {
            surface,
            scenes: [
                // active scene draws at x=10; finished scene (skipped) would draw at x=50
                { sceneIdx: 1, tagId: 2, runState: 'running', state: { surface, frameOps: [fill(10)] } },
                { sceneIdx: 1, tagId: 3, runState: 'finished', state: { surface, frameOps: [fill(50)] } },
            ],
        };

        composeTtmFrame(state);

        // Immediate mode: whole-raster clear FIRST, then replay active scenes only.
        expect(surface.commands[0].operation).toBe('clear');
        expect(surface.commands.filter((command) => command.operation === 'fillRect')).toEqual([
            { operation: 'fillRect', x: 10, y: 10, width: 5, height: 5, color: 'white' },
        ]);
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

    it('getCompositionRevision is a content signature that changes only when the composed frame changes', () => {
        const surface = createRecordingSurface();
        const scene = { sceneIdx: 1, tagId: 2, runState: 'running', state: { layerRevision: 5 } };
        const state = { surface, scenes: [scene], titleState: { sceneOffset: { x: 0, y: 0 } } };

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
        expect(getCompositionRevision(state)).toBe('@4,0'); // no active scenes, just the offset
    });

    it('getCompositionRevision is a stable signature even with no scenes or raster', () => {
        expect(getCompositionRevision({})).toBe('@0,0');
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

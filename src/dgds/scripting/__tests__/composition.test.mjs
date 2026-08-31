import { describe, expect, it } from 'vitest';
import { composeTtmFrame, pruneEnvironmentBackground } from '../composition.mjs';
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

    it('composeTtmFrame draws live STORE_AREA plates under the actors, skips pruned ones', () => {
        const surface = createRecordingSurface();
        const stored = createRecordingSurface();
        const other = createRecordingSurface();
        const state = {
            surface,
            scenes: [],
            ttmEnvironments: new Map([
                [3, { assets: { saveBkg: [{ canDraw: true, surface: stored }] } }],
                [4, { assets: { saveBkg: [{ canDraw: false, surface: other }] } }],
            ]),
        };
        // composeTtmFrame draws every live (canDraw) STORE_AREA plate under the actors
        // so a stored region (e.g. a built sandcastle) persists after its scene ends;
        // a pruned (canDraw:false) plate is skipped.
        composeTtmFrame(state);
        expect(surface.commands.some((c) => c.operation === 'clear')).toBe(true);
        // Only the live (canDraw) plate is drawn; the pruned one is skipped.
        expect(surface.commands.filter((c) => c.operation === 'drawSurface')).toEqual([
            { operation: 'drawSurface', source: stored, rect: undefined },
        ]);
    });

    it('prune clears the environment background canDraw flag', () => {
        const stored = { canDraw: true, surface: createRecordingSurface() };
        const state = { ttmEnvironments: new Map([[3, { assets: { saveBkg: [stored] } }]]) };
        pruneEnvironmentBackground(state, 3);
        expect(stored.canDraw).toBe(false);
    });
});

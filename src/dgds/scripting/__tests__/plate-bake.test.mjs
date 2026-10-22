// Background-plate bakes (#53 Phase 2). The binary's plate (eb0) is written only by
// bakes, and a bake overwrites just its own rect: earlier bakes elsewhere on the
// plate stay until the plate is pruned.
import { describe, expect, it } from 'vitest';
import { pruneEnvironmentBackground } from '../composition.mjs';
import { FrameOperationType } from '../frame-operation.mjs';
import { createSoftwareSurface } from '../surface.mjs';
import { presentSurfaceFrameOperation } from '../surface-frame-presenter.mjs';
import { driveGag, hasData } from './support/drive-gag.mjs';

const alphaAt = (surface, x, y) => surface.pixels[(y * surface.width + x) * 4 + 3];

const saveSlot = () => ({
    surface: createSoftwareSurface(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    canDraw: false,
    revision: 0,
});

const storeArea = (state, x, y, width, height) =>
    presentSurfaceFrameOperation(state, {
        type: FrameOperationType.STORE_AREA,
        slot: 0,
        rect: { x, y, width, height },
    });

const opaqueIn = (surface, { x, y, width, height }) => {
    let count = 0;
    for (let row = y; row < y + height; row++) {
        for (let col = x; col < x + width; col++) if (alphaAt(surface, col, row)) count++;
    }
    return count;
};

// BUILDING:2 bakes the sandcastle (1:40, 296,254), then the anchored ship (1:36,
// 184,121) and the finished sandcastle (1:36, 240,303). The pixel oracle shows all
// three standing together in the original until the gag ends.
describe.skipIf(!hasData)('BUILDING.ADS #2 plate', () => {
    it('keeps every bake on the plate until the tag-end prune', () => {
        let plate = null;
        let afterLastBake = null;
        const { completed, runtime } = driveGag({
            adsName: 'BUILDING.ADS',
            tag: 2,
            seed: 1,
            onTick: (rt) => {
                plate ??= rt.state.ttmEnvironments.get(1)?.assets?.saveBkg?.[0];
                if (!afterLastBake && plate?.revision >= 3) {
                    afterLastBake = {
                        sandcastle: opaqueIn(plate.surface, { x: 296, y: 261, width: 72, height: 54 }),
                        ship: opaqueIn(plate.surface, { x: 184, y: 121, width: 176, height: 139 }),
                        castleBase: opaqueIn(plate.surface, { x: 240, y: 303, width: 88, height: 57 }),
                    };
                }
            },
        });
        expect(completed).toBe(true);
        expect(afterLastBake.sandcastle).toBeGreaterThan(0);
        expect(afterLastBake.ship).toBeGreaterThan(0);
        expect(afterLastBake.castleBase).toBeGreaterThan(0);
        const final = runtime.state.ttmEnvironments.get(1).assets.saveBkg[0];
        expect(final.canDraw).toBe(false);
        expect(final.surface.bounds).toBeNull();
    });
});

describe('STORE_AREA plate bakes', () => {
    it('accumulate: a second bake elsewhere keeps the first one', () => {
        const surface = createSoftwareSurface();
        const saved = saveSlot();
        const state = { surface, saveBkg: [saved] };

        surface.fillRect(10, 10, 4, 4, 'white');
        storeArea(state, 8, 8, 8, 8);
        surface.clear();
        surface.fillRect(100, 100, 4, 4, 'white');
        storeArea(state, 98, 98, 8, 8);

        expect(alphaAt(saved.surface, 11, 11)).toBe(255);
        expect(alphaAt(saved.surface, 101, 101)).toBe(255);
        expect(saved.canDraw).toBe(true);
    });

    it('a bake over the same rect replaces what was baked there', () => {
        const surface = createSoftwareSurface();
        const saved = saveSlot();
        const state = { surface, saveBkg: [saved] };

        surface.fillRect(10, 10, 4, 4, 'white');
        storeArea(state, 8, 8, 8, 8);
        surface.clear();
        storeArea(state, 8, 8, 8, 8);

        expect(alphaAt(saved.surface, 11, 11)).toBe(0);
    });

    it('prune clears the plate so old bakes do not come back with the next bake', () => {
        const surface = createSoftwareSurface();
        const saved = saveSlot();
        const state = { surface, saveBkg: [saved] };
        const root = { ttmEnvironments: new Map([[3, { assets: { saveBkg: [saved] } }]]) };

        surface.fillRect(10, 10, 4, 4, 'white');
        storeArea(state, 8, 8, 8, 8);
        pruneEnvironmentBackground(root, 3);
        expect(saved.canDraw).toBe(false);

        surface.clear();
        surface.fillRect(100, 100, 4, 4, 'white');
        storeArea(state, 98, 98, 8, 8);

        expect(alphaAt(saved.surface, 11, 11)).toBe(0);
        expect(alphaAt(saved.surface, 101, 101)).toBe(255);
    });
});

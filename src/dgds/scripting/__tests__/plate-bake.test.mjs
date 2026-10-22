// Background-plate bakes (#53 Phase 2). The binary's plate (eb0) is written only by
// bakes, and a bake overwrites just its own rect: earlier bakes elsewhere on the
// plate stay until the plate is pruned.
import { describe, expect, it } from 'vitest';
import { pruneEnvironmentBackground, restoreWorldRaster } from '../composition.mjs';
import { TTMDispatch } from '../script-runner.mjs';
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

// GJGULIVR.TTM (BUILDING:4/6) is the one script that uses GET (0xa054) and PUT
// (0xa064). Scene 53 GETs the ship-less sea, draws the ship and bakes it; scene 64
// PUTs the saved sea back and re-bakes, so the anchored ship leaves the plate.
describe('GET / PUT (0xa054 / 0xa064)', () => {
    const opcode = (value) => TTMDispatch.find((entry) => entry.opcode === value).callback;
    const sceneState = (surface) => ({
        surface,
        saveBkg: [saveSlot()],
        getSlots: [null],
        frameOperations: [],
        presentFrameOperation: presentSurfaceFrameOperation,
    });

    it('PUT writes back what GET saved, and is replayed with the frame', () => {
        const surface = createSoftwareSurface();
        const state = sceneState(surface);
        opcode(0xa050)(state, 10, 10, 8, 8); // GET over an empty sea
        surface.fillRect(10, 10, 8, 8, 'white'); // the ship
        expect(alphaAt(surface, 12, 12)).toBe(255);

        state.frameOps = [];
        opcode(0xa060)(state, 10, 10, 8, 8); // PUT
        expect(alphaAt(surface, 12, 12)).toBe(0);
        expect(state.frameOps.map((op) => op.type)).toEqual([FrameOperationType.PUT_REGION]);

        // Replay (composeTtmFrame) repeats the PUT over whatever is drawn first.
        surface.fillRect(10, 10, 8, 8, 'white');
        for (const op of state.frameOps) presentSurfaceFrameOperation(state, op, true);
        expect(alphaAt(surface, 12, 12)).toBe(0);
    });

    it('a STORE_AREA after the PUT bakes the restored pixels, not the ship', () => {
        const surface = createSoftwareSurface();
        const state = sceneState(surface);
        opcode(0xa050)(state, 10, 10, 8, 8);
        surface.fillRect(10, 10, 8, 8, 'white');
        storeArea(state, 10, 10, 8, 8);
        expect(alphaAt(state.saveBkg[0].surface, 12, 12)).toBe(255);

        opcode(0xa060)(state, 10, 10, 8, 8);
        storeArea(state, 10, 10, 8, 8);
        expect(alphaAt(state.saveBkg[0].surface, 12, 12)).toBe(0);
    });

    it('PUT without a GET draws nothing', () => {
        const surface = createSoftwareSurface();
        const state = sceneState(surface);
        surface.fillRect(10, 10, 8, 8, 'white');
        opcode(0xa060)(state, 10, 10, 8, 8);
        expect(alphaAt(surface, 12, 12)).toBe(255);
    });
});

// The binary restores the world raster from the plate under last tick's draws
// before the scripts run, so a bake or GET reads the plate plus this tick's draws.
describe('restoreWorldRaster', () => {
    it("removes last tick's sprites, keeps the plate, and a following STORE_AREA bakes no stale sprite", () => {
        const surface = createSoftwareSurface();
        const saved = saveSlot();
        const state = { surface, saveBkg: [saved] };
        const root = { surface, ttmEnvironments: new Map([[1, { assets: { saveBkg: [saved] } }]]) };

        surface.fillRect(10, 10, 4, 4, 'white'); // baked
        storeArea(state, 10, 10, 4, 4);
        surface.fillRect(40, 40, 4, 4, 'white'); // last tick's sprite

        restoreWorldRaster(root);
        expect(alphaAt(surface, 11, 11)).toBe(255);
        expect(alphaAt(surface, 41, 41)).toBe(0);

        storeArea(state, 30, 30, 20, 20);
        expect(alphaAt(saved.surface, 41, 41)).toBe(0);
        expect(alphaAt(saved.surface, 11, 11)).toBe(255);
    });

    it('a pruned plate is erased from the raster by the next restore', () => {
        const surface = createSoftwareSurface();
        const saved = saveSlot();
        const state = { surface, saveBkg: [saved] };
        const root = { surface, ttmEnvironments: new Map([[1, { assets: { saveBkg: [saved] } }]]) };

        surface.fillRect(10, 10, 4, 4, 'white');
        storeArea(state, 10, 10, 4, 4);
        restoreWorldRaster(root);
        expect(alphaAt(surface, 11, 11)).toBe(255);

        pruneEnvironmentBackground(root, 1);
        restoreWorldRaster(root);
        expect(alphaAt(surface, 11, 11)).toBe(0);
    });

    it('does nothing when nothing was drawn since the last restore', () => {
        const surface = createSoftwareSurface();
        const root = { surface, ttmEnvironments: new Map() };
        surface.fillRect(40, 40, 4, 4, 'white');
        restoreWorldRaster(root);
        const revision = surface.revision;
        restoreWorldRaster(root);
        expect(surface.revision).toBe(revision);
    });
});

describe.skipIf(!hasData)('BUILDING.ADS #4 plate (GJGULIVR GET/PUT)', () => {
    it('the anchored ship is baked by scene 53 and un-baked by scene 64', () => {
        const ship = { x: 194, y: 123, width: 175, height: 142 };
        const counts = [];
        let plate = null;
        const { completed } = driveGag({
            adsName: 'BUILDING.ADS',
            tag: 4,
            seed: 1,
            onTick: (rt) => {
                plate ??= rt.state.ttmEnvironments.get(2)?.assets?.saveBkg?.[0];
                if (plate && plate.revision > counts.length) counts.push(opaqueIn(plate.surface, ship));
            },
        });
        expect(completed).toBe(true);
        expect(counts.length).toBe(2);
        expect(counts[0]).toBeGreaterThan(1000);
        expect(counts[1]).toBeLessThan(counts[0] / 10);
    });
});

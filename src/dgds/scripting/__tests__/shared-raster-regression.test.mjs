import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { getSceneState } from '../scene-factory.mjs';
import { createSoftwareSurface } from '../surface.mjs';
import { PALETTE } from '../../palette.mjs';

// These tests drive the REAL #runTtmController + presenter opcode chain
// (DgdsRuntime -> script-runner -> surface-frame-presenter) against an actual
// pixel-backed createSoftwareSurface() raster, exactly as the browser host
// would. They never poke scene internals to force pixels onto the surface;
// they only read pixels back out afterward to make assertions.

const RED = 12;
const BLUE = 9;
const redRgba = PALETTE[RED];
const blueRgba = PALETTE[BLUE];

const createRuntime = (overrides) =>
    new DgdsRuntime({
        type: 'ADS',
        singleAdsScene: true,
        random: () => 0,
        timingCompatibility: createTimingCompatibility(),
        surfaceFactory: () => createSoftwareSurface(),
        resourceProvider: { resolve: () => undefined },
        data: {
            name: 'shared-raster-regression',
            resources: [{ id: 1, name: 'SCENES.TTM' }],
            // A single ADS tag that ends immediately: the TTM children below are
            // pushed straight into runtime.state.scenes (as the committed z-order
            // guard test in runtime.test.mjs does), and #runTtmController paints
            // them into the shared raster every tick regardless of ADS progress.
            scenes: [{ tagId: { id: 1 }, script: [{ opcode: 0xffff, params: [] }] }],
        },
        ...overrides,
    });

// One-shot TTM sequence: set the foreground color, fill a 10x10 rect at
// (100,100), then fall off the end of the script. With the default runCount
// of 0 (getSceneState -> runMode ONCE, retries 0) that COMPLETED status
// finishes the scene on the very tick it draws, so it emits nothing on any
// later tick -- "stopped".
const oneShotRectScript = (colorIndex) => [
    { opcode: 0x2000, params: [colorIndex, 0] },
    { opcode: 0xa100, params: [100, 100, 10, 10] },
];

const pixelAt = (surface, x, y) => {
    const offset = (y * surface.width + x) * 4;
    return {
        r: surface.pixels[offset],
        g: surface.pixels[offset + 1],
        b: surface.pixels[offset + 2],
        a: surface.pixels[offset + 3],
    };
};

describe('shared raster regression coverage', () => {
    it("a neighbor draw overwrites a stopped scene's stale pixels (no frozen frame)", () => {
        const ttm = {
            tags: [
                { id: 5, description: 'scene A' },
                { id: 6, description: 'scene B' },
            ],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 5, script: oneShotRectScript(RED) },
                { tagId: 6, script: oneShotRectScript(BLUE) },
            ],
        };
        const runtime = createRuntime({ resourceProvider: { resolve: () => ttm } });

        const sceneA = getSceneState(runtime.state, 1, 5, 0, 1);
        runtime.state.scenes.push(sceneA);

        runtime.tick(20);

        // Scene A drew its rect and is now stopped -- it emitted no further ops.
        expect(sceneA.runState).toBe('finished');
        expect(pixelAt(runtime.state.surface, 105, 105)).toMatchObject(redRgba);

        // A second, unrelated scene now draws over that exact location.
        const sceneB = getSceneState(runtime.state, 1, 6, 0, 1);
        runtime.state.scenes.push(sceneB);

        runtime.tick(20);

        // Scene A stayed finished (emitted nothing this tick); the shared
        // raster at (105,105) must show B's fresh draw, not A's stale pixels
        // left frozen behind a per-scene surface that never got composited.
        expect(sceneA.runState).toBe('finished');
        expect(pixelAt(runtime.state.surface, 105, 105)).toMatchObject(blueRgba);
    });

    it('an untouched region of a stopped scene persists (background not wiped each tick)', () => {
        const ttm = {
            tags: [{ id: 7, description: 'scene A' }],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 7, script: oneShotRectScript(RED) },
            ],
        };
        const runtime = createRuntime({ resourceProvider: { resolve: () => ttm } });

        const sceneA = getSceneState(runtime.state, 1, 7, 0, 1);
        runtime.state.scenes.push(sceneA);

        runtime.tick(20);
        expect(sceneA.runState).toBe('finished');
        expect(pixelAt(runtime.state.surface, 105, 105)).toMatchObject(redRgba);

        // Nothing else in the scene graph touches (100,100)-(110,110) on any
        // subsequent tick. A regression that clears (or reallocates) the
        // shared raster every tick -- instead of overwrite-is-the-clear --
        // would wipe this region even though no scene asked for that.
        for (let i = 0; i < 5; i++) {
            runtime.tick(20);
            expect(pixelAt(runtime.state.surface, 105, 105)).toMatchObject(redRgba);
        }

        // Sanity: the surface is a real pixel raster, not a stub -- confirm
        // untouched pixels elsewhere are still blank so the assertion above is
        // actually meaningful and not trivially true of every pixel.
        expect(pixelAt(runtime.state.surface, 300, 300)).toMatchObject({ a: 0 });
    });
});

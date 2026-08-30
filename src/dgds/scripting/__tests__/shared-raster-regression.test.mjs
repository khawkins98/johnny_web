import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { getSceneState } from '../scene-factory.mjs';
import { createSoftwareSurface } from '../surface.mjs';
import { composeTtmFrame } from '../composition.mjs';
import { TtmRunMode } from '../ttm-run-state.mjs';
import { PALETTE } from '../../palette.mjs';

// The renderer is IMMEDIATE-MODE, reconstructed from the original engine: every
// tick composeTtmFrame clears the shared raster to transparent and redraws every
// ACTIVE scene's current frame in z-order. A finished scene is not redrawn and so
// vanishes (the original's aged display-list restore); a moving sprite leaves no
// trail because each composed frame is independent. These are the properties that
// fix "Johnny left behind", the walk trail, and the overlap glitch.

const RED = 12;
const redRgba = PALETTE[RED];

const fillOp = (x, y = 100) => ({ type: 'fill-rect', x, y, width: 10, height: 10, color: RED });
const alphaAt = (surface, x, y) => surface.pixels[(y * surface.width + x) * 4 + 3];

describe('immediate-mode composition: no trail, no frozen frames, correct overlap', () => {
    it('a moving sprite leaves no trail: only the current frame is composed', () => {
        const surface = createSoftwareSurface();
        const walker = { sceneIdx: 1, tagId: 5, runState: 'running', state: { surface, frameOps: [fillOp(100)] } };
        const state = { surface, scenes: [walker] };

        composeTtmFrame(state);
        expect(alphaAt(surface, 105, 105)).not.toBe(0); // sprite at first position

        // Next frame: the scene records a new current frame at a moved position.
        walker.state.frameOps = [fillOp(200)];
        composeTtmFrame(state);
        expect(alphaAt(surface, 205, 105)).not.toBe(0); // new position lit
        expect(alphaAt(surface, 105, 105)).toBe(0); // OLD position cleared -- no trail
    });

    it('does not accumulate pixels across many moving frames', () => {
        const surface = createSoftwareSurface();
        const walker = { sceneIdx: 1, tagId: 5, runState: 'running', state: { surface, frameOps: [fillOp(0)] } };
        const state = { surface, scenes: [walker] };
        for (let x = 0; x <= 300; x += 20) {
            walker.state.frameOps = [fillOp(x)];
            composeTtmFrame(state);
        }
        const litColumns = [];
        for (let x = 0; x <= 320; x += 20) {
            if (alphaAt(surface, x + 5, 105) !== 0) litColumns.push(x);
        }
        expect(litColumns).toEqual([300]); // only the last frame's footprint is lit
    });

    it('a finished scene vanishes on the next compose (aged out, never left frozen)', () => {
        const surface = createSoftwareSurface();
        const actor = { sceneIdx: 1, tagId: 5, runState: 'running', state: { surface, frameOps: [fillOp(100)] } };
        const state = { surface, scenes: [actor] };

        composeTtmFrame(state);
        expect(alphaAt(surface, 105, 105)).not.toBe(0); // active -> shown

        actor.runState = 'finished'; // the scene's TTM completed
        composeTtmFrame(state);
        expect(alphaAt(surface, 105, 105)).toBe(0); // gone -- not frozen on the raster
    });

    it('overlapping active scenes both render fully each tick (no hole punched by z-order)', () => {
        const surface = createSoftwareSurface();
        // Two scenes overlapping at (100,100): back (drawn first) and front (drawn
        // last). Both are ACTIVE, so both are redrawn every compose -- the earlier
        // scene is never left with a transparent hole where the later one moved.
        const back = { sceneIdx: 1, tagId: 5, runState: 'running', state: { surface, frameOps: [fillOp(100, 100)] } };
        const front = { sceneIdx: 1, tagId: 6, runState: 'running', state: { surface, frameOps: [fillOp(104, 100)] } };
        const state = { surface, scenes: [back, front], ttmSequenceOrder: ['1:5', '1:6'] };
        back.sequenceKey = '1:5';
        front.sequenceKey = '1:6';

        composeTtmFrame(state);
        // Union of both rects is lit: back-only (100..103), overlap, and front-only (110..113).
        expect(alphaAt(surface, 101, 105)).not.toBe(0); // back's exposed left edge -- no hole
        expect(alphaAt(surface, 106, 105)).not.toBe(0); // overlap
        expect(alphaAt(surface, 112, 105)).not.toBe(0); // front's right edge
    });
});

describe('immediate-mode shared raster: real runtime integration', () => {
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
                scenes: [{ tagId: { id: 1 }, script: [{ opcode: 0xffff, params: [] }] }],
            },
            ...overrides,
        });

    it('drives a real TTM scene through tick + compose onto the shared raster', () => {
        const ttm = {
            tags: [{ id: 5, description: 'actor' }],
            scenes: [
                { tagId: 0, script: [] },
                // set color, draw a 10x10 rect at (100,100) every tick (KEEP_GOING)
                { tagId: 5, script: [{ opcode: 0x2000, params: [RED, 0] }, { opcode: 0xa100, params: [100, 100, 10, 10] }] },
            ],
        };
        const runtime = createRuntime({ resourceProvider: { resolve: () => ttm } });
        const actor = getSceneState(runtime.state, 1, 5, 0, 1);
        actor.runMode = TtmRunMode.KEEP_GOING; // stays active, redraws each tick
        runtime.state.scenes.push(actor);

        runtime.tick(20);
        composeTtmFrame(runtime.state);
        expect(pixelAt(runtime.state.surface, 105, 105)).toMatchObject(redRgba);
        // A pixel no scene drew stays transparent (real raster, not a stub).
        expect(alphaAt(runtime.state.surface, 300, 300)).toBe(0);
    });
});

const pixelAt = (surface, x, y) => ({
    r: surface.pixels[(y * surface.width + x) * 4],
    g: surface.pixels[(y * surface.width + x) * 4 + 1],
    b: surface.pixels[(y * surface.width + x) * 4 + 2],
    a: surface.pixels[(y * surface.width + x) * 4 + 3],
});

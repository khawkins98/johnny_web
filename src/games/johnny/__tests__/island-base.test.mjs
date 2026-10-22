import { describe, expect, it, vi } from 'vitest';
import { johnnyCastaway } from '../manifest.mjs';
import { createJohnnyStoryController, JOHNNY_SCENES, SceneFlags } from '../story-controller.mjs';
import { createHolidayOverlay } from '../ui/holidays.mjs';
import { occludeBehindTrunk } from '../walking.mjs';

// Island geometry from the binary (#53 phase 2.3). The island bake (FUN_1010_0136)
// rebases the world origin `30c6 = anchor - 0x121`, then:
//   island layer 0      at 30c6 + 0x121 (289)  -> layouts[1].x + titleState.x
//   palm trunk (#13)    at 30c6 + 0x1bb (443)  -> layout + layer offset 154
//   host walk sprites   at 30c6 + table x      -> titleState.x (FUN_1010_1b00 caller)
//   TTM sprite offset   at 30c6 + 1            -> sceneOffset.x (FUN_1010_00fc)
//   LEFT_ISLAND scenes  at 30c6 + 0x111 (273)
// Fixed layouts (FUN_1010_1b00): 30c6 = 0x121 or 0x11, so the island sits at 289/17.
// A normal-play DOSBox-X capture shows island layer 0 at exactly x=289 (fixed layout
// 1) and x=17 (fixed layout 2), with TTM sprites at offset (1, 20).

const memoryStorage = (values = {}) => ({
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
        values[key] = String(value);
    },
});

const controller = () =>
    createJohnnyStoryController({
        random: () => 0.25,
        storyRandom: { modulo: (divisor) => Math.floor(divisor / 3), weightedBucket: () => 1 },
        storage: memoryStorage(),
        now: () => new Date(2026, 6, 21, 12),
    });

const background = johnnyCastaway.background;

describe('Johnny island base (binary 30c6 geometry)', () => {
    it('places the two island layouts at the binary bases 289 and 17', () => {
        expect(background.layouts[1].x).toBe(0x121);
        expect(background.layouts[2].x).toBe(0x11);
    });

    it('draws TTM sprites 288 px left of island layer 0 (offset = 30c6 + 1)', () => {
        const selection = controller().preview('BUILDING.ADS', 1);
        const { titleState } = selection;
        expect(titleState.island).toBe(true);
        const islandLayer0X = background.layouts[titleState.islandLayoutId].x + background.layers[0].x + titleState.x;
        expect(titleState.sceneOffset.x).toBe(titleState.x + 1);
        expect(islandLayer0X - titleState.sceneOffset.x).toBe(288);
        expect(titleState.sceneOffset.y).toBe(titleState.y);
    });

    it('applies the LEFT_ISLAND foreground offset as 30c6 + 0x111', () => {
        const left = JOHNNY_SCENES.find((scene) => scene.script === 'VISITOR.ADS' && scene.tagId === 5);
        expect(left.flags & SceneFlags.LEFT_ISLAND).toBeTruthy();
        const { titleState } = controller().preview('VISITOR.ADS', 5);
        expect(titleState.sceneOffset.x).toBe(titleState.x + 0x111);
    });

    it('leaves off-island scenes unshifted (FUN_1010_00fc zeroes the offset)', () => {
        const { titleState } = controller().preview('SUZY.ADS', 1);
        expect(titleState.island).toBe(false);
        expect(titleState.sceneOffset).toEqual({ x: 0, y: 0 });
    });

    it('draws the Halloween overlay at the binary 30c6 + 0x19b', () => {
        vi.stubGlobal('document', {
            createElement: () => ({
                getContext: () => ({
                    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
                    putImageData: () => {},
                }),
            }),
        });
        const image = { width: 1, height: 1, pixels: [{ r: 1, g: 2, b: 3, a: 255 }] };
        const context = { drawImage: vi.fn() };
        const overlay = createHolidayOverlay({
            resourceProvider: { resolve: () => ({ images: [image, image, image, image] }) },
            now: () => new Date(2026, 9, 30),
            storage: { getItem: () => null },
        });
        const titleState = { island: true, islandLayoutId: 1, x: -40, y: 10 };
        expect(overlay({ titleState, game: johnnyCastaway }, context)).toBe(true);
        expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), -40 + 0x19b, 10 + 0x12a);
        vi.unstubAllGlobals();
    });

    it('keeps host walks on 30c6 so the trunk occluder lands on the background trunk', () => {
        const { titleState } = controller().preview('BUILDING.ADS', 1);
        const trunkLayer = background.layers.find((layer) => layer.frame === 13);
        const backgroundTrunkX = background.layouts[1].x + trunkLayer.x + titleState.x;
        expect(backgroundTrunkX - titleState.x).toBe(0x1bb);
        const context = { drawImage: vi.fn() };
        occludeBehindTrunk(context, {}, { x: 450, y: 200 }, { width: 20, height: 40 }, titleState.x, titleState.y);
        expect(context.drawImage).toHaveBeenCalledWith({}, backgroundTrunkX, trunkLayer.y + titleState.y);
    });
});

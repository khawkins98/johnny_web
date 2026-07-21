import { describe, expect, it } from 'vitest';
import { decodeJohnnyWalkData, planJohnnyWalkFrames } from '../walking.mjs';

describe('Johnny host walking', () => {
    it('decodes flip, frame and coordinates directly from SCRANTIC.SCR layout', () => {
        const archive = new ArrayBuffer(0x188ea + 480 * 6);
        const view = new DataView(archive);
        view.setUint16(0x188ea, 0x8013, true);
        view.setUint16(0x188ec, 306, true);
        view.setUint16(0x188ee, 238, true);
        expect(decodeJohnnyWalkData(archive)[0]).toEqual({ flipX: true, frame: 18, x: 306, y: 238 });
    });

    it('uses host bookmarks to join scene endpoints', () => {
        const data = Array.from({ length: 480 }, () => ({ flipX: false, frame: -1, x: 0, y: 0 }));
        data[68] = { flipX: false, frame: 3, x: 10, y: 20 };
        data[69] = { flipX: false, frame: -1, x: 0, y: 0 };
        for (let heading = 0; heading < 8; heading++) {
            data[91 + heading] = { flipX: false, frame: heading, x: 1, y: 2 };
            data[145 + 9 + heading] = { flipX: false, frame: heading, x: 3, y: 4 };
        }
        const frames = planJohnnyWalkFrames(
            { fromSpot: 0, fromHeading: 6, toSpot: 1, toHeading: 7 },
            data,
        );
        expect(frames).toContain(data[68]);
        expect(frames.at(-1)).toBe(data[145 + 9 + 7]);
    });
});

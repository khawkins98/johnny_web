import { describe, expect, it, vi } from 'vitest';
import {
    decodeJohnnyWalkData,
    planJohnnyWalkFrames,
    runJohnnyWalk,
    selectJohnnyWalkPath,
} from '../walking.mjs';

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
            () => 0,
        );
        expect(frames).toContain(data[68]);
        expect(frames.at(-1)).toBe(data[145 + 9 + 7]);
    });

    it('selects among non-repeating routes instead of always taking the shortest path', () => {
        const first = selectJohnnyWalkPath(0, 3, () => 0);
        const last = selectJohnnyWalkPath(0, 3, () => 0.999999);

        expect(first[0]).toBe(0);
        expect(first.at(-1)).toBe(3);
        expect(new Set(first).size).toBe(first.length);
        expect(last[0]).toBe(0);
        expect(last.at(-1)).toBe(3);
        expect(new Set(last).size).toBe(last.length);
        expect(last).not.toEqual(first);
    });

    it('handles same, invalid, and extreme random path selections deterministically', () => {
        expect(selectJohnnyWalkPath(2, 2, () => 0.5)).toEqual([2]);
        expect(selectJohnnyWalkPath(-1, 2, () => 0.5)).toEqual([]);
        expect(selectJohnnyWalkPath(0, 1, () => 1).at(-1)).toBe(1);
        expect(selectJohnnyWalkPath(0, 1, () => -1).at(-1)).toBe(1);
    });

    it('redraws the persistent island behind every walking frame', async () => {
        const archiveBuffer = new ArrayBuffer(0x188ea + 480 * 6);
        const context = { clearRect: vi.fn() };
        const presentBackground = vi.fn();
        const wait = vi.fn(() => Promise.resolve());
        await runJohnnyWalk({
            walk: { fromSpot: 0, fromHeading: 0, toSpot: 0, toHeading: 0 },
            titleState: { x: 0, y: 0 },
            archiveBuffer,
            resourceProvider: { resolve: () => ({ images: [] }) },
            context,
            presentBackground,
            wait,
        });

        expect(presentBackground).toHaveBeenCalledOnce();
        expect(wait).toHaveBeenCalledWith(1600, { signal: null });
        expect(context.clearRect).toHaveBeenCalledOnce();
    });

    it('clears and stops before later frames when its host attempt is aborted', async () => {
        const archiveBuffer = new ArrayBuffer(0x188ea + 480 * 6);
        const context = { clearRect: vi.fn() };
        const controller = new AbortController();
        const wait = vi.fn(async () => {
            controller.abort();
        });

        const completed = await runJohnnyWalk({
            walk: { fromSpot: 0, fromHeading: 0, toSpot: 0, toHeading: 0 },
            titleState: { x: 0, y: 0 },
            archiveBuffer,
            resourceProvider: { resolve: () => ({ images: [] }) },
            context,
            wait,
            signal: controller.signal,
        });

        expect(completed).toBe(false);
        expect(wait).toHaveBeenCalledOnce();
        expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 640, 480);
    });
});

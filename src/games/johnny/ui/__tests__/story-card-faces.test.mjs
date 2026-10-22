import { describe, expect, it, vi } from 'vitest';
import { IMAGE_HEIGHT, IMAGE_WIDTH, createCardFaceQueue, cropWindow, familyOf } from '../story-card-faces.mjs';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const fakeStore = (entries = {}) => {
    const puts = [];
    return {
        puts,
        get: vi.fn(async (key) => {
            const hit = Object.entries(entries).find(([suffix]) => key.endsWith(suffix));
            return hit ? hit[1] : undefined;
        }),
        put: vi.fn(async (key, value) => { puts.push([key, value]); }),
    };
};

describe('card face queue', () => {
    it('serves a stored picture without running the gag', async () => {
        const picture = { width: 268, height: 220 };
        const resolveEntry = vi.fn();
        const store = fakeStore({ 'FISHING.ADS:1': picture });
        const queue = createCardFaceQueue({ resolveEntry, store });
        const onReady = vi.fn();
        queue.request({ script: 'FISHING.ADS', tagId: 1 }, onReady);
        await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith(picture));
        expect(resolveEntry).not.toHaveBeenCalled();

        // Then it is served from memory.
        const again = vi.fn();
        queue.request({ script: 'FISHING.ADS', tagId: 1 }, again);
        expect(again).toHaveBeenCalledWith(picture);
        expect(store.get).toHaveBeenCalledTimes(1);
    });

    it('renders an uncached gag once and stores the result, even when asked twice', async () => {
        // jsdom has no 2D canvas, so the offscreen run yields "no usable frame" (null).
        const store = fakeStore();
        const queue = createCardFaceQueue({ resolveEntry: () => null, store });
        const first = vi.fn();
        const second = vi.fn();
        queue.request({ script: 'BUILDING.ADS', tagId: 2 }, first);
        queue.request({ script: 'BUILDING.ADS', tagId: 2 }, second);
        await vi.waitFor(() => expect(second).toHaveBeenCalledWith(null));
        expect(first).toHaveBeenCalledWith(null);
        expect(store.puts).toHaveLength(1);
        expect(store.puts[0][0]).toMatch(/BUILDING\.ADS:2$/);
    });

    it('drops requests for cards that are no longer on screen', async () => {
        const store = fakeStore();
        const queue = createCardFaceQueue({ resolveEntry: () => null, store });
        // Occupy the queue so the next request waits its turn.
        queue.request({ script: 'BUILDING.ADS', tagId: 1 }, () => {});
        const gone = vi.fn();
        queue.request({ script: 'MARY.ADS', tagId: 2 }, gone, { wanted: () => false });
        await flush();
        await vi.waitFor(() => expect(store.puts.map(([key]) => key).some((key) => key.endsWith('BUILDING.ADS:1'))).toBe(true));
        await flush();
        expect(gone).not.toHaveBeenCalled();
        expect(store.get.mock.calls.some(([key]) => key.endsWith('MARY.ADS:2'))).toBe(false);
    });

    it('gives pauses no picture', () => {
        const queue = createCardFaceQueue({ resolveEntry: () => null, store: fakeStore() });
        const onReady = vi.fn();
        queue.request({ script: 'POSE', tagId: 1 }, onReady);
        expect(onReady).toHaveBeenCalledWith(null);
    });
});

describe('family icons', () => {
    it('maps scripts to an icon family', () => {
        expect(familyOf('FISHING.ADS')).toBe('FISHING');
        expect(familyOf('SUZY.ADS')).toBe('SUZY');
        expect(familyOf('POSE')).toBe('PAUSE');
        expect(familyOf('STAND.ADS')).toBe('PAUSE');
        expect(familyOf('UNKNOWN.ADS')).toBe('MISCGAG');
    });
});

describe('picture crop', () => {
    const action = { minX: 300, minY: 360, maxX: 340, maxY: 400 };

    it('centres on the action and stays inside the 640x480 frame', () => {
        const window = cropWindow(action);
        expect(window).toMatchObject({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
        expect(window.x).toBe(320 - IMAGE_WIDTH / 2);
        expect(window.y + IMAGE_HEIGHT).toBe(480);
    });

    it('stays inside a framed scene that is big enough', () => {
        // Suzy's beach: a smaller picture with black around it.
        const frame = { minX: 132, minY: 52, maxX: 503, maxY: 318 };
        const window = cropWindow({ minX: 140, minY: 280, maxX: 200, maxY: 310 }, frame);
        expect(window.x).toBe(132);
        expect(window.y + IMAGE_HEIGHT - 1).toBe(318);
    });

    it('ignores a lit area too small to hold the picture', () => {
        const tiny = { minX: 300, minY: 200, maxX: 340, maxY: 240 };
        expect(cropWindow(action, tiny)).toEqual(cropWindow(action));
    });
});

import { describe, expect, it, vi } from 'vitest';
import { runJohnnySequenceTransition } from '../transitions.mjs';

const context = () => ({
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: '',
});

describe('Johnny sequence transitions', () => {
    it.each([0, 1, 2, 3, 4])('draws and clears host wipe %i', async (type) => {
        const foreground = context();
        const background = context();
        const wait = vi.fn(() => Promise.resolve());
        await runJohnnySequenceTransition({ type, context: foreground, mainContext: background, wait });

        expect(wait).toHaveBeenCalledTimes(21);
        expect(foreground.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
        expect(background.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
        expect(foreground.arc.mock.calls.length + foreground.fillRect.mock.calls.length).toBeGreaterThan(0);
    });

    it('clears and stops a wipe when its host attempt is aborted', async () => {
        const foreground = context();
        const background = context();
        const controller = new AbortController();
        const wait = vi.fn(async () => controller.abort());

        const completed = await runJohnnySequenceTransition({
            context: foreground,
            mainContext: background,
            wait,
            signal: controller.signal,
        });

        expect(completed).toBe(false);
        expect(wait).toHaveBeenCalledOnce();
        expect(foreground.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
        expect(background.clearRect).not.toHaveBeenCalled();
    });
});

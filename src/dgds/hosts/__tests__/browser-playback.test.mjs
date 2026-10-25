import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaybackControl } from '../browser-playback.mjs';

afterEach(() => vi.useRealTimers());
describe('browser playback session', () => {
    it('holds an interlude at its remaining duration and resumes without catching up', async () => {
        vi.useFakeTimers();
        const playback = createPlaybackControl({ now: () => Date.now() });
        const done = vi.fn();
        const waiting = playback.wait(300).then(done);
        await vi.advanceTimersByTimeAsync(100);
        playback.setPaused(true);
        await vi.advanceTimersByTimeAsync(10000);
        expect(done).not.toHaveBeenCalled();
        playback.setPaused(false);
        await vi.advanceTimersByTimeAsync(199);
        expect(done).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await waiting;
        expect(done).toHaveBeenCalledWith(true);
    });
    it('applies a speed change to the remainder of a walk/pose/wipe delay', async () => {
        vi.useFakeTimers();
        const playback = createPlaybackControl({ now: () => Date.now() });
        const done = vi.fn();
        const waiting = playback.wait(1000).then(done);
        await vi.advanceTimersByTimeAsync(250);
        playback.setRate(2);
        await vi.advanceTimersByTimeAsync(374);
        expect(done).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await waiting;
        expect(done).toHaveBeenCalledWith(true);
    });
    it('aborts while paused and releases its timer/listener', async () => {
        vi.useFakeTimers();
        const playback = createPlaybackControl({ now: () => Date.now() });
        const abort = new AbortController();
        playback.setPaused(true);
        const waiting = playback.wait(300, { signal: abort.signal });
        abort.abort();
        await expect(waiting).resolves.toBe(false);
        playback.setPaused(false);
        expect(vi.getTimerCount()).toBe(0);
    });
});

import { describe, expect, it, vi } from 'vitest';
import { createBrowserScheduler } from '../browser-scheduler.mjs';

describe('browser scheduler host adapter', () => {
    it('converts host frames to ticks without owning game state', () => {
        const callbacks = [];
        const consume = vi.fn((timestamp) => (timestamp === 20 ? 2 : 0));
        const onTicks = vi.fn();
        const scheduler = createBrowserScheduler({
            clock: { consume },
            requestFrame: (callback) => {
                callbacks.push(callback);
                return callbacks.length;
            },
            cancelFrame: vi.fn(),
        });

        scheduler.start(onTicks);
        callbacks.shift()(20);

        expect(consume).toHaveBeenCalledWith(20);
        expect(onTicks).toHaveBeenCalledWith(2);
        expect(scheduler.running).toBe(true);
    });

    it('cancels the pending host frame when stopped', () => {
        const cancelFrame = vi.fn();
        const scheduler = createBrowserScheduler({
            clock: { consume: () => 0 },
            requestFrame: () => 41,
            cancelFrame,
        });

        const stop = scheduler.start(() => {});
        stop();

        expect(cancelFrame).toHaveBeenCalledWith(41);
        expect(scheduler.running).toBe(false);
    });

    it('rejects two loops on the same scheduler instance', () => {
        const scheduler = createBrowserScheduler({
            clock: { consume: () => 0 },
            requestFrame: () => 1,
            cancelFrame: () => {},
        });
        scheduler.start(() => {});

        expect(() => scheduler.start(() => {})).toThrow('already running');
    });
});

it('consumes paused host time without sending ticks or replaying a pause backlog', () => {
    let callback, paused = false;
    const onTicks = vi.fn();
    const scheduler = createBrowserScheduler({ isPaused:()=>paused, requestFrame:fn=>(callback=fn,1), cancelFrame:vi.fn() });
    scheduler.start(onTicks);callback(0);paused=true;callback(20);callback(10000);
    expect(onTicks).toHaveBeenCalledTimes(1);
    paused=false;callback(10020);
    expect(onTicks).toHaveBeenLastCalledWith(1);expect(onTicks).toHaveBeenCalledTimes(2);scheduler.stop();
});

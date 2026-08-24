import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startProcess, stopProcess } from '../process.mjs';
import { diagnostics } from '../diagnostics.mjs';

const context = () => ({
    clearRect: vi.fn(),
    createImageData: vi.fn(),
    putImageData: vi.fn(),
});

describe('browser process lifecycle', () => {
    beforeEach(() => {
        diagnostics.setMode('off');
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn(() => 17),
        );
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    afterEach(() => {
        stopProcess('test-cleanup');
        diagnostics.setMode('off');
        vi.unstubAllGlobals();
    });

    it('stops an active process with a structured restart outcome', () => {
        const onComplete = vi.fn();
        startProcess({
            type: 'ADS',
            context: context(),
            mainContext: context(),
            data: { name: 'test', resources: [], scenes: [] },
            entries: [],
            game: { background: { cloud: { frames: [0] } } },
            random: () => 0,
            onComplete,
        });

        expect(stopProcess('restart')).toBe(true);
        expect(onComplete).toHaveBeenCalledWith({ reason: 'restart' });
        expect(cancelAnimationFrame).toHaveBeenCalledWith(17);
        expect(stopProcess('restart')).toBe(false);
    });

    it('automatically persists the localhost flight recorder when a runtime stops', async () => {
        const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ path: 'traces/flight.jsonl' }) }));
        vi.stubGlobal('fetch', fetch);
        diagnostics.setMode('on');
        startProcess({
            type: 'ADS',
            context: context(),
            mainContext: context(),
            data: { name: 'test', resources: [], scenes: [] },
            entries: [],
            game: { background: { cloud: { frames: [0] } } },
            random: () => 0,
        });

        stopProcess('observed-glitch');

        await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
        expect(fetch.mock.calls[0][0]).toBe('/__dgds_trace');
        expect(fetch.mock.calls[0][1].headers['x-dgds-trace-id']).toMatch(/^dgds-/);
        expect(fetch.mock.calls[0][1].body).toContain('"type":"runtime-stop"');
        expect(fetch.mock.calls[0][1].body).toContain('"reason":"observed-glitch"');
    });
});

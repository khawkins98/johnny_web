// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runLoadingScreen } from '../loading-screen.mjs';

const page = () => {
    document.body.innerHTML = `
        <div id="jc-loading"><div class="jc-loading-bar" role="progressbar" aria-valuenow="0"></div></div>
        <div id="start-overlay"></div><div id="data-error"></div>`;
    return document.getElementById('jc-loading');
};

describe('loading screen', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('stays up until the title screen is shown, then fades and removes itself', async () => {
        const cover = page();
        const gone = runLoadingScreen({ art: [] });
        await vi.advanceTimersByTimeAsync(500);
        expect(cover.isConnected).toBe(true);
        expect(cover.classList.contains('is-done')).toBe(false);

        document.getElementById('start-overlay').classList.add('visible');
        await vi.advanceTimersByTimeAsync(100);
        expect(cover.classList.contains('is-done')).toBe(true);
        expect(cover.querySelector('.jc-loading-bar').getAttribute('aria-valuenow')).toBe('100');
        await vi.advanceTimersByTimeAsync(400);
        await gone;
        expect(document.getElementById('jc-loading')).toBeNull();
    });

    it('lifts for the missing-data card too', async () => {
        const cover = page();
        runLoadingScreen({ art: [] });
        document.getElementById('data-error').classList.add('visible');
        await vi.advanceTimersByTimeAsync(100);
        expect(cover.classList.contains('is-done')).toBe(true);
    });

    it('never waits past its limit, whatever is still loading', async () => {
        const cover = page();
        // A picture that never arrives, and no screen shown.
        runLoadingScreen({ art: ['never.png'], maxWait: 3000 });
        await vi.advanceTimersByTimeAsync(2900);
        expect(cover.classList.contains('is-done')).toBe(false);
        await vi.advanceTimersByTimeAsync(600);
        expect(document.getElementById('jc-loading')).toBeNull();
    });

    it('does nothing on a page without the cover', async () => {
        document.body.innerHTML = '';
        await expect(runLoadingScreen({ art: [] })).resolves.toBeUndefined();
    });
});

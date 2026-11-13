// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSaverRequest, saverLinkFor, setupSaverMode, POINTER_IDLE_MS } from '../saver-mode.mjs';

const visit = (address) => window.history.replaceState(null, '', address);
/** MutationObserver callbacks are delivered as microtasks. */
const settle = () => vi.advanceTimersByTimeAsync(0);
const wakeLock = () => {
    const sentinels = [];
    const request = vi.fn(async () => {
        const sentinel = { release: vi.fn(async () => {}) };
        sentinels.push(sentinel);
        return sentinel;
    });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    return { request, sentinels };
};

describe('screensaver link', () => {
    it('recognises the saver flag, and lets it be switched off', () => {
        expect(isSaverRequest('?saver')).toBe(true);
        expect(isSaverRequest('?saver=1')).toBe(true);
        expect(isSaverRequest('?faithfulRng=on&saver')).toBe(true);
        expect(isSaverRequest('')).toBe(false);
        expect(isSaverRequest('?screensaver')).toBe(false);
        expect(isSaverRequest('?saver=off')).toBe(false);
        expect(isSaverRequest('?saver=0')).toBe(false);
        expect(isSaverRequest('?saver=false')).toBe(false);
    });

    it('points at this copy of the app, without the scene being watched or a data reset', () => {
        expect(saverLinkFor({ origin: 'https://example.org', pathname: '/johnny_web/', search: '?reset', hash: '#stage=FISHING.ADS:3' }))
            .toBe('https://example.org/johnny_web/?saver');
        expect(saverLinkFor({ origin: 'http://localhost:5173', pathname: '/index.html', search: '', hash: '' }))
            .toBe('http://localhost:5173/index.html?saver');
    });
});

describe('saver mode', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => {
        vi.useRealTimers();
        delete navigator.wakeLock;
        document.body.className = '';
        visit('/');
    });

    it('does nothing on an ordinary visit, even in Full view', async () => {
        const lock = wakeLock();
        const saver = setupSaverMode();
        expect(saver.armed).toBe(false);
        document.body.classList.add('jc-full-view');
        await settle();
        expect(document.body.classList.contains('jc-saver')).toBe(false);
        expect(lock.request).not.toHaveBeenCalled();
        saver.destroy();
    });

    it('waits for the picture: no wake lock or hidden pointer over the title or import card', async () => {
        visit('/?saver');
        const lock = wakeLock();
        const saver = setupSaverMode();
        expect(saver.armed).toBe(true);
        await vi.advanceTimersByTimeAsync(POINTER_IDLE_MS * 2);
        expect(document.body.classList.contains('jc-saver')).toBe(false);
        expect(document.body.classList.contains('jc-saver-idle')).toBe(false);
        expect(lock.request).not.toHaveBeenCalled();
        saver.destroy();
    });

    it('keeps the screen awake and hides a still pointer once Full view starts', async () => {
        visit('/?saver');
        const lock = wakeLock();
        const saver = setupSaverMode();
        document.body.classList.add('jc-full-view');
        await settle();
        expect(document.body.classList.contains('jc-saver')).toBe(true);
        expect(lock.request).toHaveBeenCalledWith('screen');

        await vi.advanceTimersByTimeAsync(POINTER_IDLE_MS);
        expect(document.body.classList.contains('jc-saver-idle')).toBe(true);
        window.dispatchEvent(new Event('pointermove'));
        expect(document.body.classList.contains('jc-saver-idle')).toBe(false);
        await vi.advanceTimersByTimeAsync(POINTER_IDLE_MS);
        expect(document.body.classList.contains('jc-saver-idle')).toBe(true);
        saver.destroy();
    });

    it('takes the wake lock again when the tab comes back into view', async () => {
        visit('/?saver');
        const lock = wakeLock();
        const saver = setupSaverMode();
        document.body.classList.add('jc-full-view');
        await settle();
        expect(lock.request).toHaveBeenCalledTimes(1);
        // The browser drops the lock while the tab is hidden; returning asks again.
        document.dispatchEvent(new Event('visibilitychange'));
        await settle();
        expect(lock.request).toHaveBeenCalledTimes(2);
        saver.destroy();
    });

    it('ends for good when Full view is left: lock released, pointer back, flag off the address', async () => {
        visit('/?faithfulRng=on&saver#stage=FISHING.ADS:3');
        const lock = wakeLock();
        const saver = setupSaverMode();
        document.body.classList.add('jc-full-view');
        await settle();
        await vi.advanceTimersByTimeAsync(POINTER_IDLE_MS);

        document.body.classList.remove('jc-full-view');
        await settle();
        expect(saver.armed).toBe(false);
        expect(document.body.classList.contains('jc-saver')).toBe(false);
        expect(document.body.classList.contains('jc-saver-idle')).toBe(false);
        expect(lock.sentinels[0].release).toHaveBeenCalled();
        expect(window.location.search).toBe('?faithfulRng=on');
        expect(window.location.hash).toBe('#stage=FISHING.ADS:3');

        // Full view by hand afterwards is ordinary Full view.
        document.body.classList.add('jc-full-view');
        await settle();
        await vi.advanceTimersByTimeAsync(POINTER_IDLE_MS);
        expect(document.body.classList.contains('jc-saver')).toBe(false);
        expect(lock.request).toHaveBeenCalledTimes(1);
        saver.destroy();
    });

    it('runs without a wake lock where the browser has none or refuses it', async () => {
        visit('/?saver');
        const saver = setupSaverMode();
        document.body.classList.add('jc-full-view');
        await settle();
        expect(document.body.classList.contains('jc-saver')).toBe(true);
        saver.destroy();

        document.body.className = '';
        Object.defineProperty(navigator, 'wakeLock', {
            configurable: true,
            value: { request: vi.fn(async () => { throw new DOMException('hidden', 'NotAllowedError'); }) },
        });
        visit('/?saver');
        const refused = setupSaverMode();
        document.body.classList.add('jc-full-view');
        await settle();
        expect(document.body.classList.contains('jc-saver')).toBe(true);
        refused.destroy();
    });

    it('releases a lock that arrives after saver mode has already ended', async () => {
        visit('/?saver');
        let grant;
        const sentinel = { release: vi.fn(async () => {}) };
        Object.defineProperty(navigator, 'wakeLock', {
            configurable: true,
            value: { request: vi.fn(() => new Promise((resolve) => { grant = () => resolve(sentinel); })) },
        });
        const saver = setupSaverMode();
        document.body.classList.add('jc-full-view');
        await settle();
        document.body.classList.remove('jc-full-view');
        await settle();
        grant();
        await settle();
        expect(sentinel.release).toHaveBeenCalled();
        saver.destroy();
    });

    it('cleans up after itself', async () => {
        visit('/?saver');
        const lock = wakeLock();
        const saver = setupSaverMode();
        document.body.classList.add('jc-full-view');
        await settle();
        saver.destroy();
        expect(document.body.classList.contains('jc-saver')).toBe(false);
        expect(lock.sentinels[0].release).toHaveBeenCalled();
        // destroy() is a teardown, not the user leaving: the link still means saver mode.
        expect(window.location.search).toBe('?saver');
    });
});

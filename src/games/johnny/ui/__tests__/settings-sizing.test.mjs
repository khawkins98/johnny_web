import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupSettingsUI } from '../settings.mjs';

// A controllable stand-in for the WebGL compositor, which jsdom cannot run.
const crt = vi.hoisted(() => ({ setActive: null, setResample: null }));
vi.mock('../crt/presentation.mjs', () => ({
    createCrtPresentation: ({ onActiveChange }) => {
        crt.setActive = onActiveChange;
        return { update() {}, dispose() {}, setResample: crt.setResample };
    },
}));

const start = ({ mode, width = 1000, height = 750, dpr = 1, hud = '' } = {}) => {
    document.body.innerHTML = `<div id="root"><canvas width="640" height="480"></canvas></div><section id="enhanced-hud" class="${hud}"></section>`;
    document.body.classList.remove('jc-deck-visible', 'jc-full-view');
    localStorage.clear();
    if (mode) localStorage.setItem('jc-scale-mode', mode);
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);
    vi.stubGlobal('devicePixelRatio', dpr);
    const settings = setupSettingsUI();
    return { settings, root: document.getElementById('root') };
};
const resampling = () => crt.setResample.mock.calls.at(-1)[0];

beforeEach(() => { crt.setResample = vi.fn(); });
afterEach(() => { vi.unstubAllGlobals(); document.body.classList.remove('jc-full-view'); });

it('fills the opening under a CRT look and returns to device-pixel sizing without one', () => {
    const { root } = start({ dpr: 2 });
    expect(root.style.transform).toBe('scale(1.5)');
    crt.setActive(true);
    expect(root.style.transform).toBe('none');
    expect(root.style.width).toBe('100vw');
    expect(resampling()).toBe(false);
    crt.setActive(false);
    expect(root.style.transform).toBe('scale(1.5)');
});

it.each([
    // [saved size, viewport, DPR, HUD class, expected request, why]
    ['auto', [1700, 1250], 2, '', false, 'clean 2.5x step is taken, nothing to resample'],
    ['auto', [1900, 1300], 1, '', true, '2.7 device px with no nearby clean step'],
    ['auto', [900, 675], 1, '', false, 'under two device pixels per source pixel'],
    ['freeform', [1900, 1300], 1, '', false, 'an explicitly chosen size is left to the browser'],
    ['stretch', [1700, 1250], 1, 'is-hidden', true, 'TV-off 2.5x at DPR 1 sizes itself, whatever is saved'],
    ['stretch', [1024, 768], 1, 'is-hidden', false, 'TV-off 1.5x is under two device pixels'],
])('asks for even resampling with %s at %j, DPR %s %s: %s (%s)', (mode, [width, height], dpr, hud, expected) => {
    start({ mode, width, height, dpr, hud });
    expect(resampling()).toBe(expected);
});

it('lets Full view resample at any saved size, and stops when a CRT look takes over', () => {
    const { settings } = start({ mode: 'native', width: 1900, height: 1300 });
    expect(resampling()).toBe(false);
    document.body.classList.add('jc-full-view');
    settings.refreshLayout();
    expect(resampling()).toBe(true);
    crt.setActive(true);
    expect(resampling()).toBe(false);
});

it('re-applies sizing when the device pixel ratio changes without a resize', () => {
    const queries = [];
    vi.stubGlobal('matchMedia', vi.fn((query) => {
        const list = { query, addEventListener: vi.fn((type, listener) => { list.listener = listener; }) };
        queries.push(list);
        return list;
    }));
    const { root } = start({ mode: 'integer', dpr: 1 });
    vi.stubGlobal('matchMedia', window.matchMedia);
    expect(queries.at(-1).query).toBe('(resolution: 1dppx)');
    expect(root.style.transform).toBe('scale(1)');
    // Dragged to a 2x display: the old query stops matching.
    vi.stubGlobal('devicePixelRatio', 2);
    queries.at(-1).listener();
    expect(root.style.transform).toBe('scale(1.5)');
    expect(queries.at(-1).query).toBe('(resolution: 2dppx)');
});

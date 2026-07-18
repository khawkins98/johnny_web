import { describe, expect, it } from 'vitest';
import { createBrowserCompatibility } from '../compatibility.mjs';
import { createFrameBoundary } from '../frame-timing.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { drawBackground } from '../frame-renderer.mjs';
import { loadOcean, loadScreen } from '../background-resources.mjs';
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';

describe('browser compatibility profile', () => {
    it('reads settings with a fallback', () => {
        const storage = { getItem: key => key === 'enabled' ? 'on' : null };
        const compatibility = createBrowserCompatibility({ storage });

        expect(compatibility.setting('enabled', 'off')).toBe('on');
        expect(compatibility.setting('missing', 'off')).toBe('off');
    });

    it('survives unavailable browser storage', () => {
        const storage = { getItem: () => { throw new Error('blocked'); } };
        const compatibility = createBrowserCompatibility({ storage });
        expect(compatibility.setting('anything', 'fallback')).toBe('fallback');
    });

    it('provides deterministic inclusive random integers', () => {
        expect(createBrowserCompatibility({ random: () => 0 }).randomInt(3, 5)).toBe(3);
        expect(createBrowserCompatibility({ random: () => 0.999 }).randomInt(3, 5)).toBe(5);
        expect(createBrowserCompatibility({ random: () => 0 }).randomInt(5, 3)).toBe(3);
    });

    it('exposes its named timing compatibility profile', () => {
        const compatibility = createBrowserCompatibility();
        expect(compatibility.timing.profile).toBe('faithful-browser');
        expect(compatibility.timing.patchNames).toEqual(['browser-yield-floor']);
    });
});

describe('frame timing compatibility', () => {
    it('preserves authored delays and floors zero-delay presentation', () => {
        const timing = createTimingCompatibility();

        expect(timing.mapFrameBoundary(createFrameBoundary(9))).toMatchObject({
            authoredDelayTicks: 9,
            runtimeDelayTicks: 9,
        });
        expect(timing.mapFrameBoundary(createFrameBoundary(0))).toMatchObject({
            authoredDelayTicks: 0,
            runtimeDelayTicks: 1,
        });
    });

    it('applies named compatibility patches outside the faithful directive', () => {
        const timing = createTimingCompatibility({
            profile: 'test-double-speed',
            patches: [{ name: 'halve-holds', map: ticks => Math.ceil(ticks / 2) }],
        });
        const boundary = createFrameBoundary(9);

        expect(timing.mapFrameBoundary(boundary)).toEqual({
            authoredDelayTicks: 9,
            runtimeDelayTicks: 5,
            profile: 'test-double-speed',
            patches: ['halve-holds'],
        });
        expect(boundary.delayTicks).toBe(9);
    });
});

describe('deterministic background compatibility', () => {
    it('resolves screen behavior from injected game metadata', () => {
        const state = {
            game: {
                background: {
                    screens: { 'CUSTOM.SCR': 7 },
                    assets: [],
                    oceans: [],
                    settings: {},
                },
            },
            entries: [],
            bkgScreen: null,
            bkgOcean: [],
            compatibility: createBrowserCompatibility({ random: () => 0 }),
        };

        loadScreen(state, 'CUSTOM.SCR');

        expect(state.island).toBe(7);
    });

    it('advances clouds and waves from injected time and settings', () => {
        const compatibility = createBrowserCompatibility({
            storage: { getItem: key => key === 'jc-clouds' || key === 'jc-waves' ? 'on' : null },
            now: () => 1000,
            random: () => 0.5,
        });
        const state = {
            game: johnnyCastaway,
            compatibility,
            island: 1,
            bkgScreen: null,
            bkgRes: null,
            cloudElapsed: 900,
            cloudX: 10,
            waveElapsed: 900,
            waveFrame: 2,
        };

        drawBackground(state, {});

        expect(state.cloudX).toBe(9);
        expect(state.cloudElapsed).toBe(0);
        expect(state.waveFrame).toBe(3);
        expect(state.waveElapsed).toBe(1250);
    });

    it('selects local night and deterministic day oceans', () => {
        const oceans = ['day-0', 'day-1', 'day-2', 'night'];
        const state = {
            game: johnnyCastaway,
            entries: [],
            bkgOcean: oceans,
            compatibility: createBrowserCompatibility({
                storage: { getItem: key => key === 'jc-time' ? 'local' : null },
                currentHour: () => 22,
                random: () => 0,
            }),
        };

        loadOcean(state);
        expect(state.bkgScreen).toBe('night');

        state.compatibility = createBrowserCompatibility({
            storage: { getItem: () => 'original' },
            random: () => 0.5,
        });
        state.isNightMode = false;
        loadOcean(state);
        expect(state.bkgScreen).toBe('day-1');
    });
});

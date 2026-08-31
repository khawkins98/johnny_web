import { describe, expect, it, vi } from 'vitest';
import { createBrowserPresentationPolicy } from '../../hosts/browser-presentation-policy.mjs';
import { createFrameBoundary } from '../frame-timing.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { drawBackground } from '../frame-renderer.mjs';
import { loadOcean, loadScreen } from '../background-resources.mjs';
import { johnnyCastaway } from '../../../games/johnny/manifest.mjs';

describe('browser presentation policy', () => {
    it('reads settings with a fallback', () => {
        const storage = { getItem: (key) => (key === 'enabled' ? 'on' : null) };
        const policy = createBrowserPresentationPolicy({ storage });

        expect(policy.setting('enabled', 'off')).toBe('on');
        expect(policy.setting('missing', 'off')).toBe('off');
    });

    it('survives unavailable browser storage', () => {
        const storage = {
            getItem: () => {
                throw new Error('blocked');
            },
        };
        const policy = createBrowserPresentationPolicy({ storage });
        expect(policy.setting('anything', 'fallback')).toBe('fallback');
    });
});

describe('frame timing compatibility', () => {
    it('rescales the authored 16ms-unit delay to 20ms fine ticks, floored to one', () => {
        const timing = createTimingCompatibility();

        // round(9 * 16 / 20) = round(7.2) = 7 fine ticks.
        expect(timing.mapFrameBoundary(createFrameBoundary(9))).toMatchObject({
            authoredDelayTicks: 9,
            runtimeDelayTicks: 7,
        });
        // A zero-delay frame still floors to one fine tick so the countdown arms
        // frameReady; the 50ms WM_TIMER present gate provides the real minimum.
        expect(timing.mapFrameBoundary(createFrameBoundary(0))).toMatchObject({
            authoredDelayTicks: 0,
            runtimeDelayTicks: 1,
        });
    });

    it('applies named compatibility patches outside the faithful directive', () => {
        const timing = createTimingCompatibility({
            profile: 'test-double-speed',
            patches: [{ name: 'halve-holds', map: (ticks) => Math.ceil(ticks / 2) }],
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
            resourceProvider: { resolve: () => undefined },
            bkgScreen: null,
            bkgOcean: [],
            random: () => 0,
        };

        loadScreen(state, 'CUSTOM.SCR');

        expect(state.backgroundId).toBe(7);
    });

    it('advances clouds and waves from injected time and settings', () => {
        let now = 1000;
        const policy = createBrowserPresentationPolicy({
            storage: { getItem: (key) => (key === 'jc-clouds' || key === 'jc-waves' ? 'on' : null) },
            now: () => now,
            random: () => 0.5,
        });
        const state = {
            game: johnnyCastaway,
            backgroundId: 1,
            bkgScreen: null,
            bkgOcean: [],
            bkgRes: null,
            cloudElapsed: 900,
            cloudX: 10,
            waveElapsed: 900,
            waveFrame: 2,
        };

        drawBackground(state, {}, policy);
        now = 1801;
        drawBackground(state, {}, policy);

        expect(policy.backgroundState(state)).toMatchObject({
            cloudX: 9,
            cloudOriginX: 10,
            cloudElapsed: 2121,
            waveRegions: [1, 1, 0],
            waveElapsed: 1960,
        });
        expect(state).toMatchObject({
            cloudX: 10,
            cloudElapsed: 900,
            waveFrame: 2,
            waveElapsed: 900,
        });
    });

    it('keeps persistent cloud drift independent of each ADS runtime random origin', () => {
        let now = 1000;
        const presentationKey = {};
        const policy = createBrowserPresentationPolicy({
            storage: { getItem: (key) => (key === 'jc-clouds' ? 'on' : null) },
            now: () => now,
            random: () => 0,
        });
        const makeState = (cloudX) => ({
            game: johnnyCastaway,
            backgroundId: 1,
            bkgScreen: null,
            bkgOcean: [],
            bkgRes: null,
            cloudElapsed: 900,
            cloudX,
            titleState: { presentationKey, island: true, islandLayoutId: 1, clouds: [] },
        });

        const first = drawBackground(makeState(100), {}, policy);
        now = 1001;
        const second = drawBackground(makeState(500), {}, policy);

        expect(first.cloudDrift).toBe(0);
        expect(second.cloudDrift).toBe(-1);
        expect(policy.backgroundState(presentationKey)).toMatchObject({ cloudOriginX: 0, cloudX: -1 });
    });

    it('selects deterministic authored day and night oceans', () => {
        const oceans = ['day-0', 'day-1', 'day-2', 'night'];
        const state = {
            game: johnnyCastaway,
            resourceProvider: { resolve: () => undefined },
            bkgOcean: oceans,
            random: () => 0.5,
            isNightMode: false,
        };

        loadOcean(state);
        expect(state.bkgScreen).toBe('day-1');

        state.isNightMode = true;
        loadOcean(state);
        expect(state.bkgScreen).toBe('night');
    });

    it('applies local time as a non-mutating presentation override', () => {
        const day = { images: [{ _canvas: { name: 'day' }, width: 1, height: 1 }] };
        const night = { images: [{ _canvas: { name: 'night' }, width: 1, height: 1 }] };
        const context = { clearRect: vi.fn(), drawImage: vi.fn() };
        const state = {
            game: johnnyCastaway,
            bkgScreen: day,
            bkgOcean: [day, day, day, night],
            dayOceanIndex: 0,
            backgroundId: 0,
        };
        const policy = createBrowserPresentationPolicy({
            storage: { getItem: (key) => (key === 'jc-time' ? 'local' : null) },
            currentHour: () => 22,
        });

        drawBackground(state, context, policy);

        expect(context.drawImage).toHaveBeenCalledWith(night.images[0]._canvas, 0, 0);
        expect(state.bkgScreen).toBe(day);
    });

    it('keeps host-owned island placement independent of a child TTM background id', () => {
        const island = { images: [{ _canvas: { name: 'island' }, width: 10, height: 10 }] };
        const context = { clearRect: vi.fn(), drawImage: vi.fn() };
        const state = {
            game: {
                background: {
                    layouts: { 1: { x: 288 }, 2: { x: 16 } },
                    layers: [{ source: 'bkgRes', frame: 0, x: 0, y: 279 }],
                    settings: { clouds: 'clouds', waves: 'waves', time: 'time' },
                },
            },
            bkgOcean: [],
            bkgRes: island,
            backgroundId: 2,
            titleState: { island: true, islandLayoutId: 1, x: -272, presentationKey: {}, clouds: [] },
        };

        drawBackground(state, context, createBrowserPresentationPolicy({ storage: null, random: () => 0 }));

        expect(context.drawImage).toHaveBeenCalledWith(island.images[0]._canvas, 0, 0, 10, 10, 16, 279, 10, 10);
    });
});

import { describe, expect, it, vi } from 'vitest';
import { createBrowserFramePresenter } from '../browser-frame-presenter.mjs';

const createContext = () => ({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
});

const createState = () => ({
    scenes: [],
    ttmEnvironments: new Map(),
    surface: { clear: vi.fn(), canvas: { name: 'composition' } },
    compatibility: {
        now: () => 0,
        random: () => 0,
        setting: () => 'off',
    },
    island: 0,
    fadingOut: false,
    fadingIn: false,
    fadeOpacity: 0,
    frameDelta: 1000 / 60,
});

describe('browser frame presenter', () => {
    it('owns final composition and Canvas presentation', () => {
        const context = createContext();
        const mainContext = createContext();
        const presenter = createBrowserFramePresenter({ context, mainContext });
        const state = createState();

        presenter.present(state, {
            clearForeground: true,
            backgroundOnly: false,
            compose: true,
        });

        expect(context.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
        expect(mainContext.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
        expect(state.surface.clear).toHaveBeenCalledOnce();
        expect(context.drawImage).toHaveBeenCalledWith(state.surface.canvas, 0, 0);
    });

    it('does not compose when the runtime directive only clears', () => {
        const context = createContext();
        const mainContext = createContext();
        const presenter = createBrowserFramePresenter({ context, mainContext });
        const state = createState();

        presenter.present(state, {
            clearForeground: true,
            backgroundOnly: false,
            compose: false,
        });

        expect(context.clearRect).toHaveBeenCalledOnce();
        expect(state.surface.clear).not.toHaveBeenCalled();
        expect(mainContext.clearRect).not.toHaveBeenCalled();
    });

    it('owns fade rendering and fade-in progression', () => {
        const context = createContext();
        const presenter = createBrowserFramePresenter({
            context,
            mainContext: createContext(),
        });
        const state = {
            ...createState(),
            fadingIn: true,
            fadeOpacity: 0.5,
            frameDelta: 100,
        };

        presenter.present(state, {
            clearForeground: false,
            backgroundOnly: false,
            compose: true,
        });

        expect(context.fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
        expect(state.fadeOpacity).toBeCloseTo(0.25);
    });
});

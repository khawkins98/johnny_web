import { describe, expect, it, vi } from 'vitest';
import { createBrowserFramePresenter } from '../browser-frame-presenter.mjs';

const createContext = () => ({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    createImageData: vi.fn((width, height) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
    })),
    putImageData: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
});
const presentationPolicy = {
    now: () => 0,
    currentHour: () => 12,
    random: () => 0,
    setting: () => 'off',
};

const createState = () => ({
    scenes: [],
    ttmEnvironments: new Map(),
    surface: {
        clear: vi.fn(),
        width: 2,
        height: 1,
        pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]),
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
        const presenter = createBrowserFramePresenter({ context, mainContext, presentationPolicy });
        const state = createState();

        presenter.present(state, {
            clearForeground: true,
            backgroundOnly: false,
            compose: true,
        });

        expect(context.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
        expect(mainContext.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
        expect(state.surface.clear).toHaveBeenCalledOnce();
        expect(context.createImageData).toHaveBeenCalledWith(2, 1);
        expect(context.putImageData).toHaveBeenCalledWith(
            expect.objectContaining({ data: state.surface.pixels }),
            0,
            0,
        );
    });

    it('does not compose when the runtime directive only clears', () => {
        const context = createContext();
        const mainContext = createContext();
        const presenter = createBrowserFramePresenter({ context, mainContext, presentationPolicy });
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

    it('reuses an unchanged retained composition', () => {
        const context = createContext();
        const mainContext = createContext();
        const presenter = createBrowserFramePresenter({ context, mainContext, presentationPolicy });
        const state = createState();
        const directive = {
            clearForeground: true,
            backgroundOnly: false,
            compose: true,
        };

        presenter.present(state, directive);
        presenter.present(state, directive);

        expect(state.surface.clear).toHaveBeenCalledOnce();
        expect(context.putImageData).toHaveBeenCalledOnce();
        expect(mainContext.clearRect).toHaveBeenCalledTimes(2);
    });

    it('owns fade rendering and fade-in progression', () => {
        const context = createContext();
        const presenter = createBrowserFramePresenter({
            context,
            mainContext: createContext(),
            presentationPolicy,
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

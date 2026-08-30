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
        // The shared raster's revision drives host uploads now (scenes draw into it
        // directly; there is no per-tick recompose). Bump it to simulate a draw.
        revision: 0,
        pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]),
    },
    backgroundId: 0,
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
        // composeTtmFrame is now trace-only; the presenter uploads the shared raster
        // directly rather than recomposing it (so state.surface.clear is not called).
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

    it('retains the uploaded foreground across controller-only ticks', () => {
        const context = createContext();
        const presenter = createBrowserFramePresenter({
            context,
            mainContext: createContext(),
            presentationPolicy,
        });
        const state = createState();

        presenter.present(state, { clearForeground: false, backgroundOnly: false, compose: true });
        presenter.present(state, { clearForeground: false, backgroundOnly: false, compose: false });

        expect(context.clearRect).toHaveBeenCalledOnce();
        expect(context.putImageData).toHaveBeenCalledOnce();
    });

    it('preserves an interlude frame until the new runtime has visible pixels', () => {
        const context = createContext();
        const state = createState();
        state.surface.bounds = null;
        state.scenes = [{ sceneIdx: 1, tagId: 1, runState: 'running', state: { layerRevision: 0 } }];
        const presenter = createBrowserFramePresenter({
            context,
            mainContext: createContext(),
            presentationPolicy,
            preserveInitialForeground: true,
        });

        presenter.present(state, { clearForeground: false, backgroundOnly: false, compose: true });
        expect(context.clearRect).not.toHaveBeenCalled();
        expect(context.putImageData).not.toHaveBeenCalled();

        // The new runtime advances its first frame (layerRevision bump -> the
        // composition signature changes) and now has visible pixels (bounds set).
        // The interlude is released and the fresh foreground is uploaded.
        state.surface.bounds = { x: 1, y: 1, width: 1, height: 1 };
        state.scenes[0].state.layerRevision = 1;
        presenter.present(state, { clearForeground: false, backgroundOnly: false, compose: true });
        expect(context.clearRect).toHaveBeenCalledOnce();
        expect(context.putImageData).toHaveBeenCalledOnce();
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

        // The raster revision did not change between ticks, so the foreground is
        // uploaded once and reused on the second tick.
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

    it('decorates the background after drawing it', () => {
        const mainContext = createContext();
        const backgroundDecorator = vi.fn();
        const presenter = createBrowserFramePresenter({
            context: createContext(),
            mainContext,
            presentationPolicy,
            backgroundDecorator,
        });
        const state = createState();

        presenter.presentBackground(state);

        expect(backgroundDecorator).toHaveBeenCalledWith(state, mainContext);
    });
});

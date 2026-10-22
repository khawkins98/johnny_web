import { describe, expect, it, vi } from 'vitest';
import { johnnyCastaway } from '../manifest.mjs';
import { createJohnnyIslandPresentationState, createPreviewHostPainter } from '../island-presenter.mjs';
import { createJohnnyStoryController } from '../story-controller.mjs';
import { createBrowserPresentationPolicy } from '../../../dgds/hosts/browser-presentation-policy.mjs';

describe('persistent Johnny island presentation', () => {
    it('loads one host-owned background state for reuse across ADS events', () => {
        const resourceProvider = { resolve: vi.fn((name) => ({ name })) };
        const state = createJohnnyIslandPresentationState({ game: johnnyCastaway, resourceProvider });

        expect(state.bkgOcean.map(({ name }) => name)).toEqual([
            'OCEAN00.SCR',
            'OCEAN01.SCR',
            'OCEAN02.SCR',
            'NIGHT.SCR',
        ]);
        expect(state.bkgRes).toEqual({ name: 'BACKGRND.BMP' });
        expect(state.bkgRaft).toEqual({ name: 'MRAFT.BMP' });
        expect(resourceProvider.resolve).toHaveBeenCalledTimes(6);
    });

    it('pins host island composition to layout one even when a child TTM loads another layout', () => {
        const controller = createJohnnyStoryController({
            random: () => 0.9,
            storage: null,
            now: () => new Date(2026, 6, 21, 12),
        });

        const selection = controller.preview('FISHING.ADS', 4, { storyDay: 1 });

        expect(selection.titleState).toMatchObject({
            islandLayoutId: 1,
        });
    });
});

describe('preview host backdrop', () => {
    const fakeContext = () => ({ fillRect: vi.fn(), drawImage: vi.fn(), putImageData: vi.fn(), clearRect: vi.fn(), fillStyle: null });
    const island = (titleState) => ({ titleState, bkgOcean: [], bkgScreen: null });

    it('starts scenes off the island (the "meanwhile" clock, Suzy, the office) on black', () => {
        const context = fakeContext();
        const paint = createPreviewHostPainter({ island: island({ island: false }), presentationPolicy: {} });
        expect(paint(context)).toBeNull();
        expect(context.fillStyle).toBe('#000');
        expect(context.fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
    });

    it('keeps the island for island scenes that load no screen (WOULDBEAS)', () => {
        const state = island({ island: true });
        const context = fakeContext();
        const paint = createPreviewHostPainter({ island: state, presentationPolicy: createBrowserPresentationPolicy() });
        expect(paint(context)).toBe(state);
        expect(context.fillRect).not.toHaveBeenCalledWith(0, 0, 640, 480);
    });
});

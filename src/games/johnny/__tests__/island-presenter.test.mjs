import { describe, expect, it, vi } from 'vitest';
import { johnnyCastaway } from '../manifest.mjs';
import { createJohnnyIslandPresentationState } from '../island-presenter.mjs';
import { createJohnnyStoryController } from '../story-controller.mjs';

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

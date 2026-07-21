import { describe, expect, it, vi } from 'vitest';
import { johnnyCastaway } from '../manifest.mjs';
import { createJohnnyIslandPresentationState } from '../island-presenter.mjs';

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
});

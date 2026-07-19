import { describe, expect, it, vi } from 'vitest';
import { createJohnnySceneSelector } from '../scene-selector.mjs';

const scripts = new Map([
    ['ACTIVITY.ADS', { scenes: [{ tagId: { id: 1 } }] }],
    ['BUILDING.ADS', { scenes: [{ tagId: { id: 2 } }] }],
    ['FISHING.ADS', { scenes: [{ tagId: { id: 3 } }] }],
    ['MISCGAG.ADS', { scenes: [{ tagId: { id: 4 } }] }],
]);

describe('Johnny ambient scene selector', () => {
    it('makes scenes from the externally selected ADS files reachable', () => {
        const resourceProvider = { resolve: vi.fn((name) => scripts.get(name)) };
        const selectFirst = createJohnnySceneSelector({ random: () => 0 });
        const selectLast = createJohnnySceneSelector({ random: () => 0.9999 });

        expect(selectFirst({ resourceProvider })).toEqual({ script: 'ACTIVITY.ADS', tagId: 1 });
        expect(selectLast({ resourceProvider })).toEqual({ script: 'MISCGAG.ADS', tagId: 4 });
    });

    it('builds the decoded scene catalog only once', () => {
        const resourceProvider = { resolve: vi.fn((name) => scripts.get(name)) };
        const select = createJohnnySceneSelector({ random: () => 0 });

        select({ resourceProvider });
        select({ resourceProvider });

        expect(resourceProvider.resolve).toHaveBeenCalledTimes(4);
    });
});

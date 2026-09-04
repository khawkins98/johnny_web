import { describe, expect, it } from 'vitest';
import { RANDOM_END } from '../../../dgds/scripting/ads-scene-changes.mjs';
import { createFaithfulRng } from '../../../dgds/scripting/faithful-rng.mjs';
import { SET_TIMER } from '../../../dgds/scripting/ttm-opcodes.mjs';
import { createJohnnyStoryController } from '../story-controller.mjs';
import { pickWalkSegment } from '../walking.mjs';

const memoryStorage = () => {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    };
};

describe('Johnny shared authored RNG', () => {
    it('keeps controller, walking, TTM, and ADS draws in one ordered stream', () => {
        const draws = [];
        const table = Uint16Array.from({ length: 56 }, (_, index) => index * 977 + 1);
        const source = createFaithfulRng({ i: 55, j: 24, table }, { onDraw: (draw) => draws.push(draw) });
        const controller = createJohnnyStoryController({
            random: () => 0,
            storyRandom: source,
            storage: memoryStorage(),
            now: () => new Date(2026, 6, 21, 12),
        });

        controller.next();
        const beforeWalk = draws.length;
        pickWalkSegment([[1, 50], [2, 50]], () => 0, source);
        const beforeTimer = draws.length;
        SET_TIMER({ storyRandom: source }, 60, 180);
        const beforeAds = draws.length;
        RANDOM_END({
            randomize: true,
            random: () => { throw new Error('fallback random used'); },
            faithfulPick: source.pick,
            scenesRandom: [
                { sceneIdx: 1, tagId: 1, proportion: 1 },
                { sceneIdx: 2, tagId: 2, proportion: 1 },
            ],
            scenes: [],
            removeScenes: [],
            addScenes: [],
        });

        expect(draws[beforeWalk]).toMatchObject({ ordinal: beforeWalk, site: 'walk-route-segment' });
        expect(draws[beforeTimer]).toMatchObject({ ordinal: beforeTimer, site: 'ttm-random-delay' });
        expect(draws[beforeAds]).toMatchObject({ ordinal: beforeAds, site: 'ads-random' });
        expect(draws.map(({ ordinal }) => ordinal)).toEqual(draws.map((_, index) => index));
    });
});

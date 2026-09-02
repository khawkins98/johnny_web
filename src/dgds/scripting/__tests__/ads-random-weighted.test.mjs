import { describe, expect, it } from 'vitest';
import { ADSDispatch } from '../script-runner.mjs';

// Regression for crosscheck B2: ADS RANDOM (0x3010..0x30ff) must pick a staged
// ADD_SCENE WEIGHTED by its 4th arg (`proportion`), not uniformly. This mirrors the
// original binary FUN_1048_0cda (sum weights via FUN_1048_0c8d, draw rng in [0,total),
// walk the cumulative weight) and jc_reborn's adsRandomPickOp (rand()%totalWeight).
// The port previously did Math.floor(random()*len), giving every branch 1/N and
// making FISHING.ADS #2 break its ambient loop (via 1:15, weight 1 of 15) ~3x too
// often (1/5 instead of 1/15).

const callback = (opcode) => ADSDispatch.find((d) => d.opcode === opcode).callback;
const RANDOM_START = callback(0x3010);
const ADD_SCENE = callback(0x2005);
const RANDOM_END = callback(0x30ff);

// Drive a single RANDOM block with a fixed rng() value and return the tagId that
// RANDOM_END committed into addScenes. sceneIdx/tagId are 100+i / 200+i in stage order.
const pickFromBlock = (weights, roll01) => {
    const state = {
        type: 'ADS',
        scenes: [],
        addScenes: [],
        removeScenes: [],
        scenesRandom: [],
        playedHistory: new Set(),
        randomize: false,
        random: () => roll01,
    };
    RANDOM_START(state);
    weights.forEach((w, i) => ADD_SCENE(state, 100 + i, 200 + i, 1, w));
    RANDOM_END(state);
    return state.addScenes[0]?.tagId;
};

describe('ADS RANDOM picks weighted by proportion (crosscheck B2)', () => {
    // FISHING.ADS #2 stages {1:38 w=5, 1:21 w=3, 1:22 w=3, 1:23 w=3, 1:15 w=1};
    // total weight 15. Cumulative buckets: [0,5)->A [5,8)->B [8,11)->C [11,14)->D [14,15)->E.
    const fishingWeights = [5, 3, 3, 3, 1];

    it('lands in the cumulative-weight bucket, not the uniform 1/N bucket', () => {
        // roll = floor(0.5 * 15) = 7 -> bucket B (2nd staged, tagId 201).
        // A uniform picker would give floor(0.5 * 5) = index 2 -> tagId 202.
        expect(pickFromBlock(fishingWeights, 0.5)).toBe(201);
    });

    it('does NOT over-pick the low-weight break branch (the B2 symptom)', () => {
        // roll = floor(0.9 * 15) = 13 -> bucket D (tagId 203). The weight-1 break
        // branch E (tagId 204) is reachable ONLY for roll >= 14 (rng >= 14/15 ~ 0.933).
        // A uniform picker at 0.9 gives floor(0.9 * 5) = index 4 -> the break (204).
        expect(pickFromBlock(fishingWeights, 0.9)).toBe(203);
        // The break IS still reachable at the top of the range.
        expect(pickFromBlock(fishingWeights, 0.99)).toBe(204);
    });

    it('selects the first bucket at roll 0 and honours weight order', () => {
        expect(pickFromBlock(fishingWeights, 0)).toBe(200); // A, weight 5
        // roll = floor(0.34 * 15) = 5 -> first index of bucket B.
        expect(pickFromBlock(fishingWeights, 0.34)).toBe(201);
    });

    it('is identical to uniform when all weights are equal (ACTIVITY.ADS #7 case)', () => {
        // All-weight-1 RANDOM blocks (as in ACTIVITY tag 7) resolve the same weighted
        // or uniform, so B2 leaves their scene identities untouched.
        expect(pickFromBlock([1, 1, 1], 0.5)).toBe(201); // floor(0.5*3)=1
        expect(pickFromBlock([1, 1, 1], 0)).toBe(200);
        expect(pickFromBlock([1, 1, 1], 0.9)).toBe(202); // floor(0.9*3)=2
    });
});

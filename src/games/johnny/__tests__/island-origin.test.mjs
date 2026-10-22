import { describe, expect, it } from 'vitest';
import { johnnyCastaway } from '../manifest.mjs';
import {
    accumulateIslandLayout,
    createJohnnyStoryController,
    isLayoutCompatible,
    JOHNNY_SCENES,
    resolveIslandOrigin,
} from '../story-controller.mjs';

// How the original picks the island's world origin (30c6/30c4) for a planned batch.
//
// FUN_1010_1c41 (1010:1c41) runs once per planned record, ending first, and folds
// catalogue word +0xd into 30c0:
//   0x20 -> 30c0 = 1 (fixed layout 2)   0x10 -> 30c0 = 2 (fixed layout 1)
//   0x01 -> |= 0x04 (top-left)          0x02 -> |= 0x08 (top-right)
//   0x04 -> |= 0x10 (bottom-left)       0x08 -> |= 0x20 (bottom-right)
// and flagsB 0x200 forces 30c2 = 0 (high tide).
//
// FUN_1010_1b00 (1010:1b00) resolves it at the bake: 30c0 & 2 -> (289, 299);
// 30c0 & 1 -> (17, 309); otherwise a random band that depends on the tide
// (30c2): high tide x 67 + rand % 226, y 255 + rand % 129; low tide x 168 +
// rand % 111, y 255 + rand % 59. Quadrant bits halve the ranges and offset them.
// The bake then rebases: 30c6 = x - 0x121, 30c4 = y - 0x117, which is titleState.

const memoryStorage = (values = {}) => ({
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
        values[key] = String(value);
    },
});

const scene = (script, tagId) => JOHNNY_SCENES.find((s) => s.script === script && s.tagId === tagId);
const background = johnnyCastaway.background;
const layer0 = ({ titleState }) => ({
    x: background.layouts[titleState.islandLayoutId].x + background.layers[0].x + titleState.x,
    y: background.layers[0].y + titleState.y,
});

// With the original's default StartTime (0900), 12:00 is phase 6 (day sky). The
// rendered tide is a per-batch coin flip (`rand & 1`, site 'island-tide'), not a
// phase: `chooseBit` picks it in these tests.
const HIGH_TIDE = () => new Date(2026, 6, 21, 12);

const recordingSource = (chooseModulo = () => 0, chooseBit = () => 0) => {
    const draws = [];
    return {
        draws,
        source: {
            modulo(divisor, site) {
                draws.push({ site, divisor });
                return chooseModulo(divisor, site);
            },
            bit(mask, site) {
                draws.push({ site, mask });
                return chooseBit(mask, site);
            },
            weightedBucket: () => 1,
        },
    };
};

const controller = ({ now = HIGH_TIDE, chooseModulo, chooseBit, random = () => 0 } = {}) => {
    const { draws, source } = recordingSource(chooseModulo, chooseBit);
    const story = createJohnnyStoryController({ random, storyRandom: source, storage: memoryStorage(), now });
    return { story, draws };
};

const islandDraws = (draws) => draws.filter(({ site }) => site === 'island-x' || site === 'island-y');

describe('catalogue word +0xd (flagsD)', () => {
    it('carries the binary layout words for the records that have them', () => {
        const expected = {
            'BUILDING.ADS#2': 0x08,
            'VISITOR.ADS#5': 0x01,
            'MARY.ADS#2': 0x08,
            'MARY.ADS#3': 0x08,
            'MARY.ADS#1': 0x08,
            'MARY.ADS#4': 0x08,
            'MARY.ADS#5': 0x03,
            'FISHING.ADS#3': 0x10,
            'FISHING.ADS#6': 0x10,
            'FISHING.ADS#4': 0x20,
            'FISHING.ADS#5': 0x05,
            'ACTIVITY.ADS#11': 0x0a,
            'BUILDING.ADS#4': 0x08,
            'BUILDING.ADS#6': 0x08,
            'ACTIVITY.ADS#9': 0x10,
            'VISITOR.ADS#1': 0x10,
            'WALKSTUF.ADS#1': 0x10,
            'VISITOR.ADS#3': 0x10,
        };
        for (const s of JOHNNY_SCENES) {
            expect(s.flagsD, `${s.script}#${s.tagId}`).toBe(expected[`${s.script}#${s.tagId}`] ?? 0);
        }
    });
});

describe('accumulateIslandLayout (FUN_1010_1c41)', () => {
    it('is 0 for a batch without layout words', () => {
        expect(accumulateIslandLayout([scene('BUILDING.ADS', 1), scene('ACTIVITY.ADS', 1)])).toBe(0);
    });

    it('maps +0xd 0x10 to fixed layout 1 (bit 2) and 0x20 to fixed layout 2 (bit 1)', () => {
        expect(accumulateIslandLayout([scene('FISHING.ADS', 3)])).toBe(2);
        expect(accumulateIslandLayout([scene('FISHING.ADS', 4)])).toBe(1);
    });

    it('ORs the quadrant bits across the batch', () => {
        expect(accumulateIslandLayout([scene('MARY.ADS', 2)])).toBe(0x20);
        expect(accumulateIslandLayout([scene('MARY.ADS', 5)])).toBe(0x0c);
        expect(accumulateIslandLayout([scene('FISHING.ADS', 5)])).toBe(0x14);
        expect(accumulateIslandLayout([scene('ACTIVITY.ADS', 11)])).toBe(0x28);
        expect(accumulateIslandLayout([scene('VISITOR.ADS', 5), scene('MARY.ADS', 2)])).toBe(0x24);
    });

    it('lets a later fixed-layout record overwrite an earlier one, keeping later quadrant bits', () => {
        // The ending is folded first; a later 0x10 record replaces its value. (The
        // picker's compatibility filter keeps the first of these pairs from being
        // planned; the fold itself is order-dependent.)
        expect(accumulateIslandLayout([scene('FISHING.ADS', 4), scene('VISITOR.ADS', 1)])).toBe(2);
        expect(accumulateIslandLayout([scene('MARY.ADS', 2), scene('VISITOR.ADS', 1)])).toBe(2);
        expect(accumulateIslandLayout([scene('VISITOR.ADS', 1), scene('MARY.ADS', 2)])).toBe(0x22);
    });
});

describe('isLayoutCompatible (FUN_1018_0edb)', () => {
    it('accepts anything while the batch has no layout state, and any record without a word', () => {
        for (const flagsD of [0, 0x01, 0x08, 0x10, 0x20, 0x3f]) expect(isLayoutCompatible(flagsD, 0)).toBe(true);
        for (const bits of [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x3e]) expect(isLayoutCompatible(0, bits)).toBe(true);
    });

    it('refuses fixed layout 2 against layout 1 or a right quadrant, and layout 1 against layout 2 or a left one', () => {
        expect(isLayoutCompatible(0x20, 0x02)).toBe(false);
        expect(isLayoutCompatible(0x20, 0x08)).toBe(false);
        expect(isLayoutCompatible(0x20, 0x20)).toBe(false);
        expect(isLayoutCompatible(0x20, 0x01)).toBe(true);
        expect(isLayoutCompatible(0x20, 0x14)).toBe(true);
        expect(isLayoutCompatible(0x10, 0x01)).toBe(false);
        expect(isLayoutCompatible(0x10, 0x04)).toBe(false);
        expect(isLayoutCompatible(0x10, 0x10)).toBe(false);
        expect(isLayoutCompatible(0x10, 0x14)).toBe(false); // left column (FISHING#5)
        expect(isLayoutCompatible(0x10, 0x0c)).toBe(false); // top row (MARY#5)
        expect(isLayoutCompatible(0x10, 0x02)).toBe(true);
        expect(isLayoutCompatible(0x10, 0x20)).toBe(true); // bottom-right (MARY#2)
        expect(isLayoutCompatible(0x10, 0x28)).toBe(true); // right column (ACTIVITY#11)
    });

    it('refuses a quadrant that the batch already excludes', () => {
        expect(isLayoutCompatible(0x01, 0x02)).toBe(false); // TL vs layout 1
        expect(isLayoutCompatible(0x01, 0x20)).toBe(false); // TL vs BR
        expect(isLayoutCompatible(0x01, 0x10)).toBe(false); // TL vs BL
        expect(isLayoutCompatible(0x01, 0x04)).toBe(true);
        expect(isLayoutCompatible(0x03, 0x08)).toBe(true); // top row vs TR
        expect(isLayoutCompatible(0x03, 0x10)).toBe(false); // top row vs BL
        expect(isLayoutCompatible(0x05, 0x20)).toBe(false); // left column vs BR
        expect(isLayoutCompatible(0x05, 0x10)).toBe(true);
        expect(isLayoutCompatible(0x08, 0x01)).toBe(false); // BR vs layout 2
        expect(isLayoutCompatible(0x08, 0x04)).toBe(false); // BR vs TL
        expect(isLayoutCompatible(0x08, 0x20)).toBe(true);
        expect(isLayoutCompatible(0x0a, 0x08)).toBe(true); // right column vs TR
        expect(isLayoutCompatible(0x0a, 0x04)).toBe(false); // right column vs TL
    });
});

describe('resolveIslandOrigin (FUN_1010_1b00)', () => {
    const draws = (values) => {
        const log = [];
        const draw = (divisor, site) => {
            log.push({ site, divisor });
            return values[site] ?? 0;
        };
        return { log, draw };
    };

    it('fixed layout 1 puts island layer 0 at 289/299 without drawing', () => {
        const { log, draw } = draws({});
        expect(resolveIslandOrigin(2, false, draw)).toEqual({ x: 289 - 289, y: 299 - 279 });
        expect(resolveIslandOrigin(0x3e, true, draw)).toEqual({ x: 0, y: 20 });
        expect(log).toEqual([]);
    });

    it('fixed layout 2 puts island layer 0 at 17/309 without drawing', () => {
        const { log, draw } = draws({});
        expect(resolveIslandOrigin(1, false, draw)).toEqual({ x: 17 - 289, y: 309 - 279 });
        expect(resolveIslandOrigin(0x3d, true, draw)).toEqual({ x: -272, y: 30 });
        expect(log).toEqual([]);
    });

    it('high tide draws x from [67, 293) and y from [255, 384)', () => {
        const { log, draw } = draws({ 'island-x': 225, 'island-y': 128 });
        expect(resolveIslandOrigin(0, false, draw)).toEqual({ x: 67 + 225 - 289, y: 255 + 128 - 279 });
        expect(log).toEqual([
            { site: 'island-x', divisor: 226 },
            { site: 'island-y', divisor: 129 },
        ]);
    });

    it('low tide draws x from [168, 279) and y from [255, 314)', () => {
        const { log, draw } = draws({ 'island-x': 110, 'island-y': 58 });
        expect(resolveIslandOrigin(0, true, draw)).toEqual({ x: 168 + 110 - 289, y: 255 + 58 - 279 });
        expect(log).toEqual([
            { site: 'island-x', divisor: 111 },
            { site: 'island-y', divisor: 59 },
        ]);
    });

    it('a single quadrant halves both ranges and offsets the lower/right ones', () => {
        const half = (n) => Math.floor(n / 2);
        const top = { 'island-x': 0, 'island-y': 0 };
        const quadrants = [
            [0x04, 67, 255], // top-left
            [0x08, 67 + half(226), 255], // top-right
            [0x10, 67, 255 + half(129)], // bottom-left
            [0x20, 67 + half(226), 255 + half(129)], // bottom-right
        ];
        for (const [bits, x, y] of quadrants) {
            const { log, draw } = draws(top);
            expect(resolveIslandOrigin(bits, false, draw), `bits ${bits}`).toEqual({ x: x - 289, y: y - 279 });
            expect(log).toEqual([
                { site: 'island-x', divisor: half(226) },
                { site: 'island-y', divisor: half(129) },
            ]);
        }
        const { log, draw } = draws(top);
        expect(resolveIslandOrigin(0x20, true, draw)).toEqual({ x: 168 + half(111) - 289, y: 255 + half(59) - 279 });
        expect(log).toEqual([
            { site: 'island-x', divisor: half(111) },
            { site: 'island-y', divisor: half(59) },
        ]);
    });

    it('a full row keeps the x range and a full column keeps the y range', () => {
        let { log, draw } = draws({});
        expect(resolveIslandOrigin(0x0c, false, draw)).toEqual({ x: 67 - 289, y: 255 - 279 }); // top row
        expect(log.map(({ divisor }) => divisor)).toEqual([226, 64]);
        ({ log, draw } = draws({}));
        expect(resolveIslandOrigin(0x30, false, draw)).toEqual({ x: 67 - 289, y: 255 + 64 - 279 }); // bottom row
        expect(log.map(({ divisor }) => divisor)).toEqual([226, 64]);
        ({ log, draw } = draws({}));
        expect(resolveIslandOrigin(0x14, false, draw)).toEqual({ x: 67 - 289, y: 255 - 279 }); // left column
        expect(log.map(({ divisor }) => divisor)).toEqual([113, 129]);
        ({ log, draw } = draws({}));
        expect(resolveIslandOrigin(0x28, false, draw)).toEqual({ x: 67 + 113 - 289, y: 255 - 279 }); // right column
        expect(log.map(({ divisor }) => divisor)).toEqual([113, 129]);
        ({ log, draw } = draws({}));
        expect(resolveIslandOrigin(0x3c, false, draw)).toEqual({ x: 67 - 289, y: 255 - 279 }); // all four
        expect(log.map(({ divisor }) => divisor)).toEqual([226, 129]);
        ({ log, draw } = draws({}));
        expect(resolveIslandOrigin(0x24, false, draw)).toEqual({ x: 67 - 289, y: 255 - 279 }); // TL + BR -> top-left
        expect(log.map(({ divisor }) => divisor)).toEqual([113, 64]);
    });
});

describe('island origin in planned batches', () => {
    it('pins a batch ending in FISHING#3 to fixed layout 1 (island layer 0 at 289/299)', () => {
        const { story, draws } = controller();
        story.planFrom('FISHING.ADS', 3, { storyDay: 1 });
        const selections = [];
        do selections.push(story.next());
        while (!selections.at(-1).sequenceEnd && selections.length < 40);
        expect(selections.at(-1).tagId).toBe(3);
        for (const selection of selections) {
            expect(selection.titleState).toMatchObject({ x: 0, y: 20 });
            expect(layer0(selection)).toEqual({ x: 289, y: 299 });
        }
        expect(islandDraws(draws)).toEqual([]);
    });

    it('pins a batch ending in FISHING#4 to fixed layout 2 (island layer 0 at 17/309)', () => {
        const { story, draws } = controller();
        story.planFrom('FISHING.ADS', 4, { storyDay: 1 });
        const selections = [];
        do selections.push(story.next());
        while (!selections.at(-1).sequenceEnd && selections.length < 40);
        const final = selections.at(-1);
        expect(final.tagId).toBe(4);
        for (const selection of selections) {
            expect(selection.titleState).toMatchObject({ x: -272, y: 30 });
            expect(layer0(selection)).toEqual({ x: 17, y: 309 });
        }
        // LEFT_ISLAND TTM sprites land at 30c6 + 0x111: 1 px right of the island.
        expect(final.titleState.sceneOffset).toEqual({ x: -272 + 0x111, y: 30 });
        expect(islandDraws(draws)).toEqual([]);
    });

    it('an intermediate VISITOR#1 pins the whole batch to fixed layout 1', () => {
        const { story, draws } = controller();
        story.planFrom('VISITOR.ADS', 1, { storyDay: 1 });
        const selections = [];
        do selections.push(story.next());
        while (!selections.at(-1).sequenceEnd && selections.length < 40);
        expect(selections[0].tagId).toBe(1);
        for (const selection of selections) expect(layer0(selection)).toEqual({ x: 289, y: 299 });
        expect(islandDraws(draws)).toEqual([]);
    });

    it('VISITOR#1 is an ordinary intermediate candidate (binary flagsB 0x3)', () => {
        // With a weight roulette that always lands on the last candidate, the
        // planner must be able to reach VISITOR#1 from a plain island ending.
        const { story } = controller({
            chooseModulo: (divisor, site) => (site === 'director-intermediate-scene' ? divisor - 1 : 0),
        });
        story.planFrom('ACTIVITY.ADS', 1, { storyDay: 1 });
        const selections = [];
        do selections.push(story.next());
        while (!selections.at(-1).sequenceEnd && selections.length < 40);
        expect(selections.some((s) => s.script === 'VISITOR.ADS' && s.tagId === 1)).toBe(true);
        for (const selection of selections) expect(layer0(selection)).toEqual({ x: 289, y: 299 });
    });

    it('never plans VISITOR#1 after an ending that excludes fixed layout 1', () => {
        const run = (script, tagId) => {
            const { story } = controller({
                chooseModulo: (divisor, site) => (site === 'director-intermediate-scene' ? divisor - 1 : 0),
            });
            story.planFrom(script, tagId, { storyDay: 1 });
            const selections = [];
            do selections.push(story.next());
            while (!selections.at(-1).sequenceEnd && selections.length < 40);
            return selections;
        };
        // FISHING#4 (layout 2), FISHING#5 (left column) and VISITOR#5 (top-left) all
        // refuse VISITOR#1's 0x10; MARY#2 (bottom-right) accepts it.
        for (const [script, tagId] of [['FISHING.ADS', 4], ['FISHING.ADS', 5], ['VISITOR.ADS', 5]]) {
            const selections = run(script, tagId);
            expect(selections.at(-1).tagId).toBe(tagId);
            expect(selections.some((s) => s.script === 'VISITOR.ADS' && s.tagId === 1), `${script}#${tagId}`).toBe(false);
        }
        expect(layer0(run('FISHING.ADS', 4)[0])).toEqual({ x: 17, y: 309 });
        const mary = run('MARY.ADS', 2);
        expect(mary.some((s) => s.script === 'VISITOR.ADS' && s.tagId === 1)).toBe(true);
        expect(layer0(mary[0])).toEqual({ x: 289, y: 299 });
    });

    it('draws the high-tide band for a plain island batch', () => {
        const { story, draws } = controller({ chooseModulo: (divisor) => divisor - 1 });
        const first = story.preview('MISCGAG.ADS', 1);
        expect(first.titleState.lowTide).toBe(false);
        expect(islandDraws(draws)).toEqual([
            { site: 'island-x', divisor: 226 },
            { site: 'island-y', divisor: 129 },
        ]);
        expect(layer0(first)).toEqual({ x: 67 + 225, y: 255 + 128 });
    });

    it('draws the low-tide band when the coin flip lands on low tide', () => {
        const { story, draws } = controller({ chooseBit: () => 1 });
        const first = story.preview('MISCGAG.ADS', 1);
        expect(first.titleState.lowTide).toBe(true);
        expect(draws.filter(({ site }) => site === 'island-tide')).toEqual([{ site: 'island-tide', mask: 1 }]);
        expect(islandDraws(draws)).toEqual([
            { site: 'island-x', divisor: 111 },
            { site: 'island-y', divisor: 59 },
        ]);
        expect(layer0(first)).toEqual({ x: 168, y: 255 });
    });

    it('flagsB 0x200 forces high tide (30c2 = 0) without a coin flip, so the high-tide band', () => {
        const { story, draws } = controller({ chooseBit: () => 1 });
        story.planFrom('ACTIVITY.ADS', 1, { storyDay: 1 });
        const first = story.next();
        expect(first.titleState.lowTide).toBe(false);
        expect(draws.some(({ site }) => site === 'island-tide')).toBe(false);
        expect(islandDraws(draws)).toEqual([
            { site: 'island-x', divisor: 226 },
            { site: 'island-y', divisor: 129 },
        ]);
    });

    it('applies the ending quadrant: MARY#2 lands bottom-right', () => {
        const { story, draws } = controller();
        story.planFrom('MARY.ADS', 2, { storyDay: 1 });
        const final = story.next();
        expect(islandDraws(draws)).toEqual([
            { site: 'island-x', divisor: 113 },
            { site: 'island-y', divisor: 64 },
        ]);
        expect(layer0(final)).toEqual({ x: 67 + 113, y: 255 + 64 });
    });

    it('previews of a fixed-layout scene use that layout', () => {
        const { story } = controller();
        expect(layer0(story.preview('WALKSTUF.ADS', 1))).toEqual({ x: 289, y: 299 });
        expect(layer0(story.preview('ACTIVITY.ADS', 9))).toEqual({ x: 289, y: 299 });
        expect(layer0(story.preview('FISHING.ADS', 6))).toEqual({ x: 289, y: 299 });
    });

    it('leaves off-island batches at the zero origin', () => {
        const { story, draws } = controller();
        const suzy = story.preview('SUZY.ADS', 1);
        expect(suzy.titleState.island).toBe(false);
        expect(suzy.titleState).toMatchObject({ x: 0, y: 0 });
        expect(islandDraws(draws)).toEqual([]);
    });

    it('uses the same bands on the plain random() path', () => {
        let calls = 0;
        const story = createJohnnyStoryController({
            random: () => {
                calls++;
                return 0.999;
            },
            storage: memoryStorage(),
            now: HIGH_TIDE,
        });
        const first = story.preview('MISCGAG.ADS', 1);
        expect(calls).toBeGreaterThan(0);
        // random() -> 0.999 lands the tide coin on 1 (low tide) and the band's far corner.
        expect(first.titleState.lowTide).toBe(true);
        expect(layer0(first)).toEqual({ x: 168 + 110, y: 255 + 58 });
        const high = createJohnnyStoryController({ random: () => 0, storage: memoryStorage(), now: HIGH_TIDE });
        const highFirst = high.preview('MISCGAG.ADS', 1);
        expect(highFirst.titleState.lowTide).toBe(false);
        expect(layer0(highFirst)).toEqual({ x: 67, y: 255 });
        const fixed = createJohnnyStoryController({ random: () => 0.5, storage: memoryStorage(), now: HIGH_TIDE });
        expect(layer0(fixed.preview('FISHING.ADS', 4))).toEqual({ x: 17, y: 309 });
    });
});

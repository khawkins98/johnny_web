import { describe, expect, it } from 'vitest';
import { createJohnnyStoryController, JOHNNY_SCENES } from '../story-controller.mjs';

const memoryStorage = (initial = {}) => {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        values,
    };
};

describe('Johnny host story controller', () => {
    it('carries the executable-owned 63-scene catalogue', () => {
        expect(JOHNNY_SCENES).toHaveLength(63);
        expect(new Set(JOHNNY_SCENES.map(({ script }) => script))).toEqual(
            new Set([
                'ACTIVITY.ADS',
                'BUILDING.ADS',
                'FISHING.ADS',
                'JOHNNY.ADS',
                'MARY.ADS',
                'MISCGAG.ADS',
                'STAND.ADS',
                'SUZY.ADS',
                'VISITOR.ADS',
                'WALKSTUF.ADS',
            ]),
        );
    });

    it('plans ordinary scenes followed by one final and rotates five wipes', () => {
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage: memoryStorage(),
            now: () => new Date(2026, 6, 21, 12),
        });

        const firstSequence = [];
        do firstSequence.push(controller.next());
        while (!firstSequence.at(-1).sequenceEnd);
        expect(firstSequence).toHaveLength(7);
        expect(firstSequence.slice(0, -1).every(({ sequenceEnd }) => !sequenceEnd)).toBe(true);
        expect(firstSequence.at(-1).transition).toBe(0);

        const transitions = [0];
        for (let sequence = 0; sequence < 5; sequence++) {
            let selection;
            do selection = controller.next();
            while (!selection.sequenceEnd);
            transitions.push(selection.transition);
        }
        expect(transitions).toEqual([0, 1, 2, 3, 4, 0]);
    });

    it('advances the persistent 11-day story only when the calendar day changes', () => {
        const storage = memoryStorage({ 'jc-story-date': '201', 'jc-story-day': '11' });
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage,
            now: () => new Date(2026, 6, 21, 12), // day 202: wraps 11 -> 1
        });
        controller.next();
        expect(storage.values.get('jc-story-day')).toBe('1');
        expect(storage.values.get('jc-story-date')).toBe('202');
    });

    it('carries island directives and walk endpoints outside DGDS', () => {
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage: memoryStorage(),
            now: () => new Date(2026, 6, 21, 20),
        });
        const selections = [];
        do selections.push(controller.next());
        while (!selections.at(-1).sequenceEnd);

        expect(selections[0].titleState).toMatchObject({ island: true, night: true, storyDay: 1 });
        expect(selections[1].walk).toMatchObject({ fromSpot: expect.any(Number), toSpot: expect.any(Number) });
    });
});

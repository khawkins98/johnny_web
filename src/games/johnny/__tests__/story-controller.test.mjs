import { describe, expect, it } from 'vitest';
import { createJohnnyStoryController, JOHNNY_SCENES, SceneFlags } from '../story-controller.mjs';

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

    it('describes debug action semantics from recovered host flags', () => {
        const controller = createJohnnyStoryController({ random: () => 0, storage: memoryStorage() });
        expect(controller.describe('JOHNNY.ADS', 1)).toMatchObject({
            fixedDay: 11,
            final: true,
            first: true,
            action: 'solo-finale',
        });
        expect(controller.describe('FISHING.ADS', 3).action).toBe('ending-finale');
        expect(controller.describe('STAND.ADS', 1).action).toBe('starting-event');
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
        expect(selections[1].titleState.presentationKey).toBe(selections[0].titleState.presentationKey);
        expect(selections[1].titleState.oceanIndex).toBe(selections[0].titleState.oceanIndex);
    });

    it('previews one contextualized scene without disturbing the planned queue', () => {
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage: memoryStorage(),
            now: () => new Date(2026, 6, 21, 12),
        });
        controller.next();
        const queued = controller.snapshot();
        const preview = controller.preview('JOHNNY.ADS', 3, { storyDay: 1 });

        expect(preview).toMatchObject({
            script: 'JOHNNY.ADS',
            tagId: 3,
            preview: true,
            sequenceEnd: false,
            titleState: { storyDay: 6 },
        });
        expect(controller.snapshot()).toEqual(queued);
    });

    it.each([0, 0.999999])('anchors and terminates every catalogue entry at random boundary %f', (randomValue) => {
        for (const anchor of JOHNNY_SCENES) {
            const controller = createJohnnyStoryController({
                random: () => randomValue,
                storage: memoryStorage(),
                now: () => new Date(2026, 6, 21, 12),
            });
            controller.planFrom(anchor.script, anchor.tagId, { storyDay: anchor.day || 1 });
            const selections = [];
            do selections.push(controller.next());
            while (!selections.at(-1).sequenceEnd && selections.length < 30);

            expect(selections.at(-1).sequenceEnd, `${anchor.script}#${anchor.tagId} did not terminate`).toBe(true);
            const anchorIndex = selections.findIndex(
                (selection) => selection.script === anchor.script && selection.tagId === anchor.tagId,
            );
            expect(anchorIndex, `${anchor.script}#${anchor.tagId} was absent`).toBeGreaterThanOrEqual(0);
            if (anchor.flags & SceneFlags.FINAL) expect(anchorIndex).toBe(selections.length - 1);
            else expect(anchorIndex).toBe(0);

            for (const selection of selections.slice(0, -1)) {
                const metadata = JOHNNY_SCENES.find(
                    (scene) => scene.script === selection.script && scene.tagId === selection.tagId,
                );
                if (selection.titleState.lowTide) {
                    expect(metadata.flags & SceneFlags.LOWTIDE_OK, `${selection.script}#${selection.tagId} at low tide`).toBeTruthy();
                }
                if (selection.titleState.x || selection.titleState.y) {
                    expect(metadata.flags & SceneFlags.VARPOS_OK, `${selection.script}#${selection.tagId} at variable position`).toBeTruthy();
                }
            }

            expect(controller.status()).toMatchObject({
                storyDay: anchor.day || 1,
                current: selections.length,
                remaining: 0,
                active: { script: selections.at(-1).script, tagId: selections.at(-1).tagId },
            });
        }
    });
});

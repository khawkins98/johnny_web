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
    it('carries the executable-owned 79-record catalogue (validated against the binary in catalogue-oracle)', () => {
        expect(JOHNNY_SCENES).toHaveLength(79);
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
                // Pure-pose "stand at spot" fillers (binary adsId 0xFF).
                'POSE',
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

    it('publishes queued and active status changes to debug consumers immediately', () => {
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage: memoryStorage(),
            now: () => new Date(2026, 6, 21, 12),
        });
        const statuses = [];
        const unsubscribe = controller.subscribeStatus((status) => statuses.push(status));

        expect(statuses).toEqual([null]);
        const first = controller.next();
        expect(statuses.at(-1)).toMatchObject({
            current: 1,
            active: { script: first.script, tagId: first.tagId },
        });

        unsubscribe();
        controller.next();
        expect(statuses).toHaveLength(3);
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
        // Length is now the 300-unit spatial walk-span budget (intermediates fill until
        // the budget/slot cap), not the old fixed 6 + rand(14). Deterministic under the
        // seeded rng: the ending's width is spent first, then width-25/15 intermediates.
        expect(firstSequence).toHaveLength(11);
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

    it('advances the story via the dual counter: the calendar day chases the unlocked target one step per real day', () => {
        // Recovered from FUN_1018_0ba5: `cur` (jc-story-day) chases `target`
        // (jc-story-target) by one step whenever the real calendar date changes, and
        // never advances past the target or without a date change.
        // Date key is full y/m/d (year included, so a run one calendar year later still
        // registers as a change). Seed the previous calendar day.
        const storage = memoryStorage({ 'jc-story-date': '2026-6-20', 'jc-story-day': '3', 'jc-story-target': '6' });
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage,
            now: () => new Date(2026, 6, 21, 12), // a new calendar day
        });
        controller.next();
        expect(storage.values.get('jc-story-day')).toBe('4'); // chased target by one
        expect(storage.values.get('jc-story-date')).toBe('2026-6-21');
    });

    it('does not advance the story day when the calendar date is unchanged', () => {
        const storage = memoryStorage({ 'jc-story-date': '2026-6-21', 'jc-story-day': '3', 'jc-story-target': '6' });
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage,
            now: () => new Date(2026, 6, 21, 12), // same calendar day as the stored key
        });
        controller.next();
        expect(storage.values.get('jc-story-day')).toBe('3');
    });

    it('wraps the story back to day 1 after the day-11 finale (target unlocked to 12)', () => {
        // Binary unlock is uncapped: once target reaches 12, the next calendar tick drives
        // cur to 12 and the cur>11 branch resets the whole story to day 1. The old
        // `target < 11` cap made this wrap unreachable, pinning the story on day 11.
        const storage = memoryStorage({ 'jc-story-date': '2026-6-20', 'jc-story-day': '11', 'jc-story-target': '12' });
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage,
            now: () => new Date(2026, 6, 21, 12),
        });
        controller.next();
        expect(storage.values.get('jc-story-day')).toBe('1'); // chased to 12, then wrapped
        expect(storage.values.get('jc-story-target')).toBe('1');
    });

    it('derives tide deterministically from the wall clock + persisted StartTime, not randomness', () => {
        const clock = () => new Date(2026, 6, 21, 15, 0);
        const lowTideFor = (rng) => {
            const storage = memoryStorage({ 'jc-start-time': '721' });
            const controller = createJohnnyStoryController({ random: rng, storage, now: clock });
            controller.next();
            return controller.status().lowTide;
        };
        // Same clock + StartTime -> same tide regardless of the rng stream.
        expect(lowTideFor(() => 0)).toBe(lowTideFor(() => 0.999));
        // StartTime (month*100 + day) is captured and persisted on first run.
        const storage = memoryStorage();
        createJohnnyStoryController({ random: () => 0, storage, now: clock }).next();
        expect(storage.values.get('jc-start-time')).toBe(String((6 + 1) * 100 + 21));
    });

    it('sizes a sequence by the 300-unit walk-span budget (bounded, not a fixed count)', () => {
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage: memoryStorage(),
            now: () => new Date(2026, 6, 21, 12),
        });
        const sequence = [];
        do sequence.push(controller.next());
        while (!sequence.at(-1).sequenceEnd);
        expect(sequence.length).toBeGreaterThan(1);
        expect(sequence.length).toBeLessThan(298); // the binary's slot cap
        expect(sequence.at(-1).sequenceEnd).toBe(true);
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
            // POSE fillers have no ADS and are not independently anchorable (Chunk 2).
            if (anchor.flags & SceneFlags.POSE) continue;
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
                    // Tide is now a [tideMin, tideMax) window; a scene shown at low tide
                    // must be eligible for a low phase (tideMin below the 12-phase mark).
                    expect(metadata.tideMin, `${selection.script}#${selection.tagId} at low tide`).toBeLessThan(12);
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

    it('a pose scene selection carries its spot/heading and no ADS script to play', () => {
        const controller = createJohnnyStoryController({
            random: () => 0,
            storage: memoryStorage(),
            now: () => new Date('2024-06-15T12:00:00Z'),
        });
        // First pose record is A (spot 0) facing NW (heading 3).
        const selection = controller.preview('POSE', 1);
        expect(selection.script).toBe('POSE');
        expect(selection.pose).toEqual({ spot: 0, heading: 3 });
    });

    it('does not exclude poses from the intermediate pool (only FINAL is masked)', () => {
        // Poses are ADS-less "stand" fillers and must be selectable as intermediates.
        const poseCount = JOHNNY_SCENES.filter((s) => (s.flags & SceneFlags.POSE) !== 0).length;
        expect(poseCount).toBe(14);
        // None of the 14 poses is flagged FINAL (which is the only intermediate mask).
        expect(
            JOHNNY_SCENES.filter(
                (s) => (s.flags & SceneFlags.POSE) !== 0 && (s.flags & SceneFlags.FINAL) !== 0,
            ),
        ).toEqual([]);
    });
});

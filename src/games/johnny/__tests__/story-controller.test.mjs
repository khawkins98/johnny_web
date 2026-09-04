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
    it('shares typed raw draws across final, ocean, and intermediate decisions', () => {
        const draws = [];
        const storyRandom = {
            modulo(divisor, site) {
                draws.push({ kind: 'modulo', divisor, site });
                if (divisor === 10) return 1;
                return site === 'director-intermediate-scene' ? divisor - 1 : 0;
            },
            weightedBucket(weights, site) {
                draws.push({ kind: 'bucket', weights, site });
                return 1;
            },
        };
        const controller = createJohnnyStoryController({
            random: () => 0,
            storyRandom,
            storage: memoryStorage(),
            now: () => new Date(2026, 6, 21, 12),
        });

        controller.next();

        expect(draws.slice(0, 3)).toEqual([
            { kind: 'modulo', divisor: 10, site: 'director-keyframe-gate' },
            expect.objectContaining({ kind: 'modulo', site: 'director-final-scene' }),
            { kind: 'modulo', divisor: 3, site: 'island-ocean' },
        ]);
        expect(draws.some((draw) => draw.site === 'director-intermediate-scene')).toBe(true);
    });

    it('can attach the shared source before the first selection', () => {
        const sites = [];
        const controller = createJohnnyStoryController({ random: () => 0, storage: memoryStorage() });
        controller.setRandomSource({
            modulo: (divisor, site) => (sites.push(site), divisor === 10 ? 0 : 0),
            weightedBucket: () => 1,
        });

        controller.next();
        expect(sites).toContain('director-keyframe-gate');
        expect(sites).toContain('island-ocean');
    });

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
        // Length is the 300-unit spatial walk-span budget (intermediates fill until the
        // budget/slot cap), not the old fixed 6 + rand(14). Deterministic under the seeded
        // rng: the faithful ending selection (10%-gated keyframe else weight-roulette)
        // picks the finale, whose width is spent first, then intermediates fill the budget.
        expect(firstSequence).toHaveLength(12);
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

    it('final selection is weighted with last-two anti-repeat, not a uniform pick (#2)', () => {
        let seed = 0x1234;
        const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
        const controller = createJohnnyStoryController({
            random: rng,
            storage: memoryStorage(),
            now: () => new Date(2026, 6, 21, 12), // fixed date -> constant story day
        });
        const finals = [];
        controller.subscribeStatus((status) => {
            if (!status?.final) return;
            const key = `${status.final.script}#${status.final.tagId}`;
            if (finals.at(-1) !== key) finals.push(key);
        });
        for (let i = 0; i < 80; i++) controller.next();
        // Endings vary (not one finale replayed forever) and no ending repeats within a
        // window of three (the binary's last-two anti-repeat).
        expect(new Set(finals).size).toBeGreaterThan(3);
        for (let i = 2; i < finals.length; i++) {
            expect(finals[i]).not.toBe(finals[i - 1]);
            expect(finals[i]).not.toBe(finals[i - 2]);
        }
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
        // The calendar wrap (cur 11 -> 12 -> reset 1) is deterministic in updateStoryDay,
        // independent of which finale the sequence then selects.
        expect(storage.values.get('jc-story-day')).toBe('1'); // chased to 12, then wrapped
    });

    describe('story-day tooling (settings + dev panel)', () => {
        const clock = () => new Date(2026, 6, 21, 12);

        it('getStoryDay reads back the persisted day, clamped 1-11, defaulting to 1', () => {
            const controller = createJohnnyStoryController({ random: () => 0, storage: memoryStorage() });
            expect(controller.getStoryDay()).toBe(1);

            const clamped = createJohnnyStoryController({
                random: () => 0,
                storage: memoryStorage({ 'jc-story-day': '99' }),
            });
            expect(clamped.getStoryDay()).toBe(11);
        });

        it('getStartTime reads back the persisted StartTime, or null when unset', () => {
            const unset = createJohnnyStoryController({ random: () => 0, storage: memoryStorage() });
            expect(unset.getStartTime()).toBeNull();

            const set = createJohnnyStoryController({
                random: () => 0,
                storage: memoryStorage({ 'jc-start-time': '721' }),
            });
            expect(set.getStartTime()).toBe(721);
        });

        it('setStoryDay clamps to 1-11 and writes day, target, and date so the arc holds from there', () => {
            const storage = memoryStorage();
            const controller = createJohnnyStoryController({ random: () => 0, storage, now: clock });

            expect(controller.setStoryDay(6)).toBe(6);
            expect(storage.values.get('jc-story-day')).toBe('6');
            expect(storage.values.get('jc-story-target')).toBe('6');
            expect(storage.values.get('jc-story-date')).toBe('2026-6-21');
            expect(controller.getStoryDay()).toBe(6);

            expect(controller.setStoryDay(0)).toBe(1);
            expect(controller.setStoryDay(99)).toBe(11);
        });

        it('advanceStoryDay steps forward and wraps 11 -> 1', () => {
            const storage = memoryStorage();
            const controller = createJohnnyStoryController({ random: () => 0, storage, now: clock });

            controller.setStoryDay(3);
            expect(controller.advanceStoryDay()).toBe(4);
            expect(storage.values.get('jc-story-day')).toBe('4');

            controller.setStoryDay(11);
            expect(controller.advanceStoryDay()).toBe(1);
            expect(storage.values.get('jc-story-day')).toBe('1');
        });

        it('resetStory sets day 1 and re-anchors StartTime to today', () => {
            const storage = memoryStorage({
                'jc-story-day': '8',
                'jc-story-target': '9',
                'jc-start-time': '101',
            });
            const controller = createJohnnyStoryController({ random: () => 0, storage, now: clock });

            expect(controller.resetStory()).toBe(1);
            expect(storage.values.get('jc-story-day')).toBe('1');
            expect(storage.values.get('jc-story-target')).toBe('1');
            expect(storage.values.get('jc-story-date')).toBe('2026-6-21');
            expect(storage.values.get('jc-start-time')).toBe(String((6 + 1) * 100 + 21));
            expect(controller.getStoryDay()).toBe(1);
            expect(controller.getStartTime()).toBe((6 + 1) * 100 + 21);
        });

        it('after setStoryDay(N) a subsequent sequence status reflects day N', () => {
            const storage = memoryStorage();
            const controller = createJohnnyStoryController({ random: () => 0, storage, now: clock });
            controller.setStoryDay(6);
            controller.next();
            expect(controller.status().storyDay).toBe(6);
        });
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
                    // The island origin randomizes per ISLAND chain (binary: it is
                    // randomized unconditionally for an island chain; VARPOS only gates
                    // waves, not position). So a variable position implies an island
                    // chain, NOT a per-scene VARPOS_OK flag.
                    expect(
                        selection.titleState.island,
                        `${selection.script}#${selection.tagId} at variable position must be an island chain`,
                    ).toBeTruthy();
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

describe('faithful island positioning (phase7)', () => {
    const clock = () => new Date(2026, 6, 21, 12);
    const drive = (script, tag) => {
        const c = createJohnnyStoryController({ random: () => 0, storage: memoryStorage(), now: clock });
        c.planFrom(script, tag, { storyDay: 1 });
        const out = [];
        do out.push(c.next());
        while (!out.at(-1).sequenceEnd && out.length < 30);
        return out;
    };

    it('randomizes the island origin for a non-VARPOS island chain and never pins the fabricated -272', () => {
        // FISHING#4 is FINAL|ISLAND|LEFT_ISLAND with NO VARPOS_OK -- the exact scene the
        // old code pinned to a whole-island x=-272 (the visible teleport). The binary
        // randomizes the origin for every island chain regardless of VARPOS.
        const selections = drive('FISHING.ADS', 4);
        const finalSel = selections.at(-1);
        expect(finalSel.tagId).toBe(4);
        // titleState.x is the raw island world origin. random()=0 -> the third position
        // branch -> -114 (in the [-222,-113] random band). The old code pinned this
        // LEFT_ISLAND-without-VARPOS chain to the fabricated whole-island x=-272.
        expect(finalSel.titleState.x).toBe(-114);
        expect(finalSel.titleState.x).toBeGreaterThanOrEqual(-222);
        expect(finalSel.titleState.x).toBeLessThanOrEqual(-113);
        // No scene in the chain sits at the fabricated whole-island -272.
        for (const s of selections) expect(s.titleState.x).not.toBe(-272);
    });

    it('VARPOS gates waves, not position', () => {
        // ACTIVITY#1 is FINAL|ISLAND|VARPOS_OK -> waves OFF for the chain.
        expect(drive('ACTIVITY.ADS', 1).at(-1).titleState.waves).toBe(false);
        // FISHING#4 is ISLAND without VARPOS -> waves ON.
        expect(drive('FISHING.ADS', 4).at(-1).titleState.waves).toBe(true);
    });
});

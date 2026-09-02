import { describe, expect, it } from 'vitest';
import { buildAdsSlots, stepAdsSlots } from '../ads-slots.mjs';
import { isTtmRunning, TtmRunState } from '../ttm-run-state.mjs';

// Opcode constants (mirror the ADSDispatch table in script-runner.mjs).
const IF_PLAYED = 0x1350;
const IF_NOT_PLAYED = 0x1330;
const IF_NOT_RUNNING = 0x1360;
const AND = 0x1420;
const ADD_SCENE = 0x2005;
const END_IF = 0xfff0;
const END_BRANCH = 0x1510;
const END = 0xffff;
const RANDOM_START = 0x3010;
const RANDOM_END = 0x30ff;

const op = (opcode, ...params) => ({ opcode, params });

/**
 * Build a minimal ADS runtime state whose ADD_SCENE -> applySceneChanges path
 * actually materializes scenes, without needing proprietary data. Every scene
 * slot is a stub TTM environment with an empty prologue (prologueLength 0 => the
 * environment is "ready" immediately, so applySceneChanges never runs a TTM).
 * Newly added scenes come up in `STARTING` (i.e. isTtmRunning === true); the
 * test controls the lifecycle by flipping runState to FINISHED by hand.
 */
const makeState = (sceneIdxTags, { random = () => 0 } = {}) => {
    const scenesRes = {};
    for (const [sceneIdx, tags] of Object.entries(sceneIdxTags)) {
        scenesRes[sceneIdx] = {
            // scenes[0] is the shared prologue (empty script => length 0 => ready).
            scenes: tags.map((tagId) => ({ tagId, script: [] })),
        };
    }
    return {
        type: 'ADS',
        currentScene: 0,
        scenes: [],
        addScenes: [],
        removeScenes: [],
        scenesRandom: [],
        playedHistory: new Set(),
        randomize: false,
        random,
        scenesRes,
        surface: {},
        surfaceFactory: () => ({}),
    };
};

/** Find a live scene entry by (sceneIdx, tagId). */
const find = (state, sceneIdx, tagId) => state.scenes.find((s) => s.sceneIdx === sceneIdx && s.tagId === tagId);
/** Count live entries for a (sceneIdx, tagId) -- proves presence-dedup. */
const count = (state, sceneIdx, tagId) =>
    state.scenes.filter((s) => s.sceneIdx === sceneIdx && s.tagId === tagId).length;
/** Mark a live scene finished (the ADS-visible "played" transition). */
const finish = (state, sceneIdx, tagId) => {
    const s = find(state, sceneIdx, tagId);
    s.runState = TtmRunState.FINISHED;
};

describe('buildAdsSlots', () => {
    it('splits a 2-chunk script into 2 chunks with correct start/end', () => {
        // chunk0: IF_PLAYED a -> ADD b ;  chunk1: IF_PLAYED b -> ADD c
        const script = [
            op(IF_PLAYED, 9, 1),
            op(ADD_SCENE, 9, 2, 0, 1),
            op(END_IF),
            op(END_BRANCH),
            op(IF_PLAYED, 9, 2),
            op(ADD_SCENE, 9, 3, 0, 1),
            op(END_IF),
            op(END_BRANCH),
        ];
        const { slots } = buildAdsSlots(script);
        expect(slots).toHaveLength(2);
        expect(slots[0]).toMatchObject({ chunkStart: 0, chunkEnd: 3, ip: 0, flag: 'fresh' });
        expect(slots[1]).toMatchObject({ chunkStart: 4, chunkEnd: 7, ip: 4, flag: 'fresh' });
    });

    it('drops degenerate segments (a trailing lone END) so the chunk list is the guarded chain', () => {
        const script = [
            op(IF_NOT_PLAYED, 3, 36),
            op(ADD_SCENE, 3, 36, 0, 1),
            op(END_IF),
            op(END_BRANCH),
            op(END), // trailing terminator-only segment -- not a chunk
        ];
        const { slots } = buildAdsSlots(script);
        expect(slots).toHaveLength(1);
        expect(slots[0]).toMatchObject({ chunkStart: 0, chunkEnd: 3 });
    });
});

describe('stepAdsSlots re-poll handoff', () => {
    it('fires b once (after a finishes) then c once (after b finishes), deduped on presence', () => {
        // a = 9:1, b = 9:2, c = 9:3. Nothing in the script adds `a`; the test
        // supplies a's completion externally (as the binary's neighbouring gag
        // would), then b's, and checks the chain hands off exactly once.
        const script = [
            op(IF_PLAYED, 9, 1),
            op(ADD_SCENE, 9, 2, 0, 1),
            op(END_IF),
            op(END_BRANCH),
            op(IF_PLAYED, 9, 2),
            op(ADD_SCENE, 9, 3, 0, 1),
            op(END_IF),
            op(END_BRANCH),
        ];
        const state = makeState({ 9: [1, 2, 3] });
        const { slots } = buildAdsSlots(script);

        // Tick 1: a not yet played -> nothing fires.
        stepAdsSlots(state, slots, script);
        expect(count(state, 9, 2)).toBe(0);
        expect(count(state, 9, 3)).toBe(0);

        // a finishes -> chunk0 fires ADD b exactly once; chunk1 blocks (b running).
        state.playedHistory.add('9:1');
        stepAdsSlots(state, slots, script);
        expect(count(state, 9, 2)).toBe(1);
        expect(count(state, 9, 3)).toBe(0);
        expect(isTtmRunning(find(state, 9, 2))).toBe(true);

        // Re-poll with nothing changed: b is still present -> NO duplicate add.
        stepAdsSlots(state, slots, script);
        expect(count(state, 9, 2)).toBe(1);
        expect(count(state, 9, 3)).toBe(0);

        // b finishes -> chunk1 hands off to c exactly once.
        finish(state, 9, 2);
        stepAdsSlots(state, slots, script);
        expect(count(state, 9, 3)).toBe(1);
        expect(find(state, 9, 2)).toBeUndefined(); // b was removed on handoff

        // Re-poll: c already present -> NO duplicate add of c on re-poll.
        stepAdsSlots(state, slots, script);
        expect(count(state, 9, 3)).toBe(1);
    });
});

describe('stepAdsSlots fire-retry shape (IF_NOT_RUNNING skip-then-take)', () => {
    it('skips ADD z while x or y runs, takes the branch once both stop, and does not double-add on re-poll', () => {
        // IF_NOT_RUNNING x AND IF_NOT_RUNNING y -> ADD z   (x=5:1, y=5:2, z=5:3)
        const script = [
            op(IF_NOT_RUNNING, 5, 1),
            op(AND),
            op(IF_NOT_RUNNING, 5, 2),
            op(ADD_SCENE, 5, 3, 0, 1),
            op(END_IF),
            op(END_IF),
            op(END_BRANCH),
        ];
        const state = makeState({ 5: [1, 2, 3] });
        const { slots } = buildAdsSlots(script);
        const slot = slots[0];

        // Seed x and y as live (running) siblings the guard depends on.
        state.scenes.push(
            { sceneIdx: 5, tagId: 1, runState: TtmRunState.RUNNING },
            { sceneIdx: 5, tagId: 2, runState: TtmRunState.RUNNING },
        );

        // Both running -> guard blocks on x; z NOT added; slot parked (< end).
        stepAdsSlots(state, slots, script);
        expect(count(state, 5, 3)).toBe(0);
        expect(slot.ip).toBeLessThan(slot.chunkEnd);

        // x stops, y still running -> guard now blocks on y; still no z.
        finish(state, 5, 1);
        stepAdsSlots(state, slots, script);
        expect(count(state, 5, 3)).toBe(0);
        expect(slot.ip).toBeLessThan(slot.chunkEnd);

        // y stops too -> the branch is finally taken; z added exactly once.
        finish(state, 5, 2);
        stepAdsSlots(state, slots, script);
        expect(count(state, 5, 3)).toBe(1);

        // Re-poll with both still stopped: z already present -> no double-add.
        stepAdsSlots(state, slots, script);
        expect(count(state, 5, 3)).toBe(1);
    });

    it('RANDOM commits eagerly once and is not re-picked while the slot is parked past it', () => {
        // IF_PLAYED g -> RANDOM{a} ; IF_NOT_RUNNING a -> (body).  The RANDOM
        // block commits ADD a the moment it is entered; because the slot parks
        // PAST the RANDOM on the IF_NOT_RUNNING guard, re-polling never re-picks
        // (which would spawn a duplicate a). g=5:9, a=5:1.
        const script = [
            op(IF_PLAYED, 5, 9),
            op(RANDOM_START),
            op(ADD_SCENE, 5, 1, 0, 1),
            op(RANDOM_END),
            op(IF_NOT_RUNNING, 5, 1),
            op(ADD_SCENE, 5, 5, 0, 1),
            op(END_IF),
            op(END_IF),
            op(END_BRANCH),
        ];
        const state = makeState({ 5: [1, 5, 9] });
        const { slots } = buildAdsSlots(script);
        state.playedHistory.add('5:9'); // g already played -> guard passes

        // Tick 1: RANDOM eagerly commits a; a is now running so IF_NOT_RUNNING
        // parks past the RANDOM. a added exactly once.
        stepAdsSlots(state, slots, script);
        expect(count(state, 5, 1)).toBe(1);
        expect(isTtmRunning(find(state, 5, 1))).toBe(true);

        // Re-poll while a still runs: RANDOM is NOT re-entered -> still one a.
        stepAdsSlots(state, slots, script);
        expect(count(state, 5, 1)).toBe(1);
        stepAdsSlots(state, slots, script);
        expect(count(state, 5, 1)).toBe(1);
    });
});

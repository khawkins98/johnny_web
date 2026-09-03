import { describe, expect, it } from 'vitest';
import { buildAdsSlots, stepAdsSlots } from '../ads-slots.mjs';
import { isTtmFinished, isTtmRunning, TtmRunState } from '../ttm-run-state.mjs';

// Opcode constants (mirror the ADSDispatch table in script-runner.mjs).
const IF_PLAYED = 0x1350;
const IF_NOT_PLAYED = 0x1330;
const IF_NOT_RUNNING = 0x1360;
const IF_RUNNING = 0x1370;
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

    it('merges a fall-through ladder (IF_RUNNING / IF_NOT_PLAYED arms) into the entry slot', () => {
        // Mirrors FISHING tag 3's octopus ladder shape:
        //   chunk0 IF_NOT_PLAYED a  -> ADD         (opening pass, entry, own slot)
        //   chunk1 IF_PLAYED     b  -> IF_RUNNING  (ladder ENTRY, slot start)
        //   chunk2 IF_RUNNING    c  -> ...         (fall-through arm, MERGE)
        //   chunk3 IF_NOT_PLAYED c  -> ...         (else arm, MERGE)
        //   chunk4 IF_PLAYED     d  -> ADD         (entry again, own slot)
        const IF_RUNNING = 0x1370;
        const script = [
            op(IF_NOT_PLAYED, 1, 1),
            op(ADD_SCENE, 1, 2, 0, 1),
            op(END_IF),
            op(END_BRANCH), // 3
            op(IF_PLAYED, 1, 44),
            op(IF_RUNNING, 1, 47),
            op(ADD_SCENE, 1, 48, 0, 1),
            op(END_IF),
            op(END_IF),
            op(END_BRANCH), // 9
            op(IF_RUNNING, 1, 46),
            op(ADD_SCENE, 1, 47, 0, 1),
            op(END_IF),
            op(END_BRANCH), // 13
            op(IF_NOT_PLAYED, 1, 45),
            op(ADD_SCENE, 1, 45, 0, 1),
            op(END_IF),
            op(END_BRANCH), // 17
            op(IF_PLAYED, 1, 13),
            op(ADD_SCENE, 1, 15, 0, 1),
            op(END_IF),
            op(END_BRANCH), // 21
        ];
        const { slots } = buildAdsSlots(script);
        // 4 slots: chunk0, MERGED(chunk1+2+3), chunk4 => the two IF_RUNNING/
        // IF_NOT_PLAYED arms fold into the IF_PLAYED entry's slot.
        expect(slots).toHaveLength(3);
        expect(slots[0]).toMatchObject({ chunkStart: 0, chunkEnd: 3 });
        expect(slots[1]).toMatchObject({ chunkStart: 4, chunkEnd: 17 }); // merged ladder
        expect(slots[2]).toMatchObject({ chunkStart: 18, chunkEnd: 21 });
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

        // b finishes -> chunk1 hands off to c exactly once. b stays PRESENT as a
        // finished node (the binary keeps the display-list node until an explicit
        // STOP / gag clear) so a re-poll of any predecessor chunk dedups on its
        // presence instead of resurrecting it -- IF_PLAYED no longer removes it.
        finish(state, 9, 2);
        stepAdsSlots(state, slots, script);
        expect(count(state, 9, 3)).toBe(1);
        expect(find(state, 9, 2)).toBeDefined(); // b lingers present-as-finished
        expect(isTtmFinished(find(state, 9, 2))).toBe(true);

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

describe('stepAdsSlots failed-entry re-arm scoped to the slot entry (F3 regression)', () => {
    it('a NON-LEADING (nested) IF_PLAYED that fails-as-jump skips only its own body -- it does NOT blow away the whole slot and re-arm to chunkStart', () => {
        // Shape: entry IF_RUNNING c -> [nested IF_PLAYED n -> ADD x] -> END_IF ;
        //        fall-through arm IF_NOT_PLAYED d -> ADD y  (merged into the same slot).
        // c=1:46 (running), n=1:90 (never played -- guard fails-as-jump), x=1:91,
        // d=1:45 (not played -- guard passes), y=1:92.
        //
        // The entry's own guard (IF_RUNNING) SUCCEEDS, so the walk enters the
        // entry's body and hits the NESTED, non-leading IF_PLAYED. Before the F3
        // fix, ads-slots.mjs keyed the "failed ENTRY guard" re-arm off the opcode
        // alone (any IF_PLAYED whose guard fails-as-jump), so this nested failure
        // was mistaken for the slot's entry guard failing: the whole slot re-armed
        // to chunkStart immediately, and the merged fall-through arm (y) never ran
        // -- EVER, since re-arming just re-triggers the same nested failure next
        // tick. After the fix (gated on `i === chunkStart`), a non-leading guard
        // failure only skips its own body (x) and falls through normally: y fires.
        const script = [
            op(IF_RUNNING, 1, 46), // 0: entry guard (succeeds -- c is running)
            op(IF_PLAYED, 1, 90), // 1: nested, non-leading -- never played, fails-as-jump
            op(ADD_SCENE, 1, 91, 0, 1), // 2: x -- must be SKIPPED
            op(END_IF), // 3: closes nested IF_PLAYED
            op(END_IF), // 4: closes entry IF_RUNNING
            op(END_BRANCH), // 5: entry's own END_BRANCH
            op(IF_NOT_PLAYED, 1, 45), // 6: fall-through arm entry (merged)
            op(ADD_SCENE, 1, 92, 0, 1), // 7: y -- must be ADDED (ladder falls through)
            op(END_IF), // 8
            op(END_BRANCH), // 9: slot's final END_BRANCH
        ];
        const state = makeState({ 1: [45, 46, 90, 91, 92] });
        const { slots } = buildAdsSlots(script);
        expect(slots).toHaveLength(1); // confirms the arm actually merged
        expect(slots[0]).toMatchObject({ chunkStart: 0, chunkEnd: 9 });

        // Seed c as a running sibling so the entry guard passes.
        state.scenes.push({ sceneIdx: 1, tagId: 46, runState: TtmRunState.RUNNING });

        stepAdsSlots(state, slots, script);

        expect(count(state, 1, 91)).toBe(0); // x: correctly skipped (nested guard failed)
        expect(count(state, 1, 92)).toBe(1); // y: fall-through arm still fires
        expect(slots[0].ip).toBe(0); // pass completed and re-armed normally, not mid-abort
    });
});

import { describe, expect, it } from 'vitest';
import { TagFlag, drawRandomPick, isAdsTagEnded, resetAdsProgram, skipBlock, stepAdsProgram } from '../ads-walker.mjs';
import { TtmRunMode, TtmRunState, isTtmRunning } from '../ttm-run-state.mjs';
import { clearPulses, count, find, finishNode, makeAdsState, makeProgram, op } from './support/ads-stub-state.mjs';

// Unit tests for the ADS interpreter, each pinned to the disassembled handler it
// reproduces (SCRANTIC.SCR segment 1048; see the module header of ads-walker.mjs).

const IF_NOT_PLAYED = 0x1330;
const IF_PLAYED = 0x1350;
const IF_NOT_RUNNING = 0x1360;
const IF_RUNNING = 0x1370;
const WHILE_RUNNING = 0x1070;
const AND = 0x1420;
const OR = 0x1430;
const END_BRANCH = 0x1510;
const END_WHILE = 0x1520;
const ADD = 0x2005;
const STOP = 0x2010;
const RANDOM_START = 0x3010;
const RANDOM_WEIGHT = 0x3020;
const RANDOM_END = 0x30ff;
const FADE_OUT = 0xf010;
const GOSUB = 0xf200;
const END = 0xffff;

const start = (program, index = 0) => {
    resetAdsProgram(program, index);
    return program;
};

describe('whole-tag walk (FUN_1048_1acb / FUN_1048_1925)', () => {
    it('evaluates every top-level block each tick, so a later block fires the tick its scene completes even while an earlier one is unmet', () => {
        // Mirrors BUILDING.ADS tag 5: IF_PLAYED 3:82 -> ADD 3:83 ; IF_PLAYED 3:141 -> ADD 3:140.
        const program = start(
            makeProgram([
                op(IF_PLAYED, 3, 82),
                op(ADD, 3, 83, 0, 1),
                op(END_BRANCH),
                op(IF_PLAYED, 3, 141),
                op(ADD, 3, 140, 0, 1),
                op(END_BRANCH),
                op(END),
            ]),
        );
        const state = makeAdsState({ 3: [82, 83, 140, 141] });
        state.scenes.push({ sceneIdx: 3, tagId: 82, runState: TtmRunState.RUNNING });
        state.scenes.push({ sceneIdx: 3, tagId: 141, runState: TtmRunState.FINISHED, playedPulse: true });

        stepAdsProgram(state, program);

        expect(count(state, 3, 140)).toBe(1); // 141's pulse fired its block
        expect(count(state, 3, 83)).toBe(0); // 82 is still running: its block is skipped, not parked
    });

    it('a tag flagged fresh (3) or woken (4) becomes active (1) as the loop reaches it; idle tags are not walked', () => {
        const script = [op(ADD, 1, 1, 0, 1), op(END)];
        const program = makeProgram(script, script, script);
        resetAdsProgram(program, 1);
        const state = makeAdsState({ 1: [1] });
        expect(program.tags.map((t) => t.flag)).toEqual([TagFlag.IDLE, TagFlag.START, TagFlag.IDLE]);

        stepAdsProgram(state, program);

        expect(program.tags[1].flag).toBe(TagFlag.ACTIVE);
        expect(count(state, 1, 1)).toBe(1); // only the selected tag ran
    });
});

describe('IF_PLAYED is the one-tick state-4 pulse (cond handler 13bd; clear at dc:14988)', () => {
    const chain = () =>
        start(
            makeProgram([
                op(IF_PLAYED, 9, 1),
                op(ADD, 9, 2, 0, 1),
                op(END_BRANCH),
                op(IF_PLAYED, 9, 2),
                op(ADD, 9, 3, 0, 1),
                op(END_BRANCH),
                op(END),
            ]),
        );

    it('fires once on the pulse tick and is false again once the node pass clears state 4', () => {
        const program = chain();
        const state = makeAdsState({ 9: [1, 2, 3] });
        state.scenes.push({ sceneIdx: 9, tagId: 1, runState: TtmRunState.RUNNING });

        stepAdsProgram(state, program);
        expect(count(state, 9, 2)).toBe(0);

        finishNode(state, 9, 1); // node pass: 9:1 ended -> state 4
        stepAdsProgram(state, program);
        expect(count(state, 9, 2)).toBe(1);
        expect(isTtmRunning(find(state, 9, 2))).toBe(true);

        clearPulses(state); // node pass: state 4 -> 0
        stepAdsProgram(state, program);
        stepAdsProgram(state, program);
        expect(count(state, 9, 2)).toBe(1); // no re-fire while 9:1 lingers finished
        expect(count(state, 9, 3)).toBe(0); // 9:2 still running
    });

    it('a finished scene without the pulse (state 0) is neither played nor running', () => {
        const program = start(
            makeProgram([
                op(IF_PLAYED, 9, 1),
                op(ADD, 9, 2, 0, 1),
                op(END_BRANCH),
                op(IF_NOT_RUNNING, 9, 1),
                op(ADD, 9, 3, 0, 1),
                op(END_BRANCH),
                op(IF_RUNNING, 9, 1),
                op(ADD, 9, 4, 0, 1),
                op(END_BRANCH),
                op(END),
            ]),
        );
        const state = makeAdsState({ 9: [1, 2, 3, 4] });
        state.scenes.push({ sceneIdx: 9, tagId: 1, runState: TtmRunState.FINISHED, playedPulse: false });

        stepAdsProgram(state, program);

        expect(count(state, 9, 2)).toBe(0);
        expect(count(state, 9, 3)).toBe(1);
        expect(count(state, 9, 4)).toBe(0);
    });
});

describe('ADD never de-duplicates (FUN_1048_0db6)', () => {
    it('restarts a finished node as a fresh instance, in a plain body and inside RANDOM alike', () => {
        const program = start(
            makeProgram([
                op(IF_PLAYED, 1, 44),
                op(ADD, 1, 44, 0, 1), // the campfire self-rearm shape
                op(END_BRANCH),
                op(IF_PLAYED, 1, 10),
                op(RANDOM_START),
                op(ADD, 1, 10, 0, 1),
                op(RANDOM_END),
                op(END_BRANCH),
                op(END),
            ]),
        );
        const state = makeAdsState({ 1: [10, 44] });
        stepAdsProgram(state, program);
        state.scenes.push(
            { sceneIdx: 1, tagId: 44, runState: TtmRunState.FINISHED, playedPulse: true, marker: 'old44' },
            { sceneIdx: 1, tagId: 10, runState: TtmRunState.FINISHED, playedPulse: true, marker: 'old10' },
        );

        stepAdsProgram(state, program);

        expect(count(state, 1, 44)).toBe(1);
        expect(count(state, 1, 10)).toBe(1);
        expect(find(state, 1, 44).marker).toBeUndefined(); // a new object, running from its start
        expect(find(state, 1, 10).marker).toBeUndefined();
        expect(isTtmRunning(find(state, 1, 44))).toBe(true);
        expect(isTtmRunning(find(state, 1, 10))).toBe(true);
    });

    it('on a RUNNING node overwrites only mode/count/timer and keeps the instance (no frame reset)', () => {
        const program = start(makeProgram([op(ADD, 1, 5, -180, 1), op(END)]));
        const state = makeAdsState({ 1: [5] });
        stepAdsProgram(state, program);
        const first = find(state, 1, 5);
        expect(first).toMatchObject({ runMode: TtmRunMode.TIME_LIMITED, timeLimitTicks: 180, retries: 0 });
        first.timeLimitTicks = 20; // some time has passed

        program.tags[0].script[0] = op(ADD, 1, 5, 3, 1); // re-ADD as counted x3
        stepAdsProgram(state, program);

        expect(count(state, 1, 5)).toBe(1);
        expect(find(state, 1, 5)).toBe(first);
        expect(first).toMatchObject({ runMode: TtmRunMode.COUNTED, retries: 2, timeLimitTicks: null });
    });

    it('IF_NOT_PLAYED goes false the moment ADD runs (+0x2d), not when the scene finishes', () => {
        const program = start(
            makeProgram([op(IF_NOT_PLAYED, 1, 42), op(ADD, 1, 42, 0, 1), op(END_BRANCH), op(END)]),
        );
        const state = makeAdsState({ 1: [42] });
        stepAdsProgram(state, program);
        expect(count(state, 1, 42)).toBe(1);
        const instance = find(state, 1, 42);

        stepAdsProgram(state, program); // 1:42 still running: must not be re-ADDed (a running ADD would keep the instance anyway)
        state.scenes.length = 0; // even with the node gone...
        stepAdsProgram(state, program);
        expect(count(state, 1, 42)).toBe(0); // ...+0x2d != 0 keeps IF_NOT_PLAYED false
        expect(instance).toBeDefined();
    });
});

describe('condition chains (FUN_1048_1223, asm 13ca-14a2)', () => {
    const body = (cond) => start(makeProgram([...cond, op(ADD, 5, 99, 0, 1), op(END_BRANCH), op(END)]));
    const running = (state, ...tags) => {
        for (const tagId of tags) state.scenes.push({ sceneIdx: 5, tagId, runState: TtmRunState.RUNNING });
    };

    it('AND: a false term skips the rest and the body; all true runs the body', () => {
        const program = body([op(IF_NOT_RUNNING, 5, 1), op(AND), op(IF_NOT_RUNNING, 5, 2), op(AND), op(IF_NOT_RUNNING, 5, 3)]);
        const state = makeAdsState({ 5: [1, 2, 3, 99] });
        running(state, 2);
        stepAdsProgram(state, program);
        expect(count(state, 5, 99)).toBe(0);

        state.scenes.length = 0;
        stepAdsProgram(state, program);
        expect(count(state, 5, 99)).toBe(1);
    });

    it('OR: the first true term short-circuits; the body runs once', () => {
        const program = body([op(IF_PLAYED, 5, 1), op(OR), op(IF_PLAYED, 5, 2), op(OR), op(IF_PLAYED, 5, 3)]);
        const state = makeAdsState({ 5: [1, 2, 3, 99] });
        state.scenes.push({ sceneIdx: 5, tagId: 2, runState: TtmRunState.FINISHED, playedPulse: true });
        stepAdsProgram(state, program);
        expect(count(state, 5, 99)).toBe(1);
    });

    it('mixes condition types left to right without precedence', () => {
        // IF_RUNNING 1 (false) OR IF_NOT_RUNNING 2 (true) AND IF_PLAYED 3 (false) -> ((F or T) and F) = F
        const program = body([op(IF_RUNNING, 5, 1), op(OR), op(IF_NOT_RUNNING, 5, 2), op(AND), op(IF_PLAYED, 5, 3)]);
        const state = makeAdsState({ 5: [1, 2, 3, 99] });
        stepAdsProgram(state, program);
        expect(count(state, 5, 99)).toBe(0);

        // true OR x AND false -> sticky keeps it true: (T or _) ... and F -> result F | sticky T = T
        const program2 = body([op(IF_NOT_RUNNING, 5, 1), op(OR), op(IF_RUNNING, 5, 2), op(AND), op(IF_PLAYED, 5, 3)]);
        const state2 = makeAdsState({ 5: [1, 2, 3, 99] });
        stepAdsProgram(state2, program2);
        expect(count(state2, 5, 99)).toBe(1);
    });
});

describe('nested blocks and skipping (FUN_1048_106b / 11db)', () => {
    it('a false outer condition skips its whole body including nested IFs and an F010', () => {
        const script = [
            op(IF_RUNNING, 1, 1), // 0 false
            op(IF_NOT_RUNNING, 1, 2), // 1
            op(ADD, 1, 3, 0, 1), // 2
            op(FADE_OUT, -1), // 3
            op(END_BRANCH), // 4
            op(ADD, 1, 4, 0, 1), // 5
            op(END_BRANCH), // 6
            op(ADD, 1, 5, 0, 1), // 7 runs
            op(END),
        ];
        expect(skipBlock(script, 1)).toBe(6);
        const program = start(makeProgram(script));
        const state = makeAdsState({ 1: [1, 2, 3, 4, 5] });
        stepAdsProgram(state, program);
        expect(count(state, 1, 3)).toBe(0);
        expect(count(state, 1, 4)).toBe(0);
        expect(count(state, 1, 5)).toBe(1);
        expect(program.tags[0].flag).toBe(TagFlag.ACTIVE);
    });

    it('a chain counts as one IF when matching the closing 0x1510', () => {
        const script = [
            op(IF_NOT_RUNNING, 1, 1), // 0
            op(AND), // 1
            op(IF_NOT_RUNNING, 1, 2), // 2
            op(IF_RUNNING, 1, 3), // 3 nested
            op(ADD, 1, 9, 0, 1), // 4
            op(END_BRANCH), // 5 closes nested
            op(END_BRANCH), // 6 closes the chain's IF
            op(END),
        ];
        expect(skipBlock(script, 3)).toBe(6);
    });
});

describe('F010 (asm 1669-16bf) and GOSUB (asm 16c2)', () => {
    it('F010 -1 ends only the tag being walked and aborts that walk; the runtime completes once its nodes drain', () => {
        const program = start(
            makeProgram([op(ADD, 1, 1, 0, 1), op(FADE_OUT, -1), op(ADD, 1, 2, 0, 1), op(END)]),
        );
        const state = makeAdsState({ 1: [1, 2] });
        stepAdsProgram(state, program);
        expect(count(state, 1, 1)).toBe(1);
        expect(count(state, 1, 2)).toBe(0); // nothing after the F010 runs
        expect(program.tags[0].flag).toBe(TagFlag.ENDED);
        expect(isAdsTagEnded(program.tags[0])).toBe(true);
        expect(state.scenes).toHaveLength(1); // nodes untouched: the live TTM drains on its own

        stepAdsProgram(state, program); // an ended tag is never walked again
        expect(count(state, 1, 2)).toBe(0);
    });

    it('a GOSUB target later in file order is walked the same tick; its own top-level F010 ends only itself and the caller re-wakes it every tick (STAND shape)', () => {
        const caller = [
            op(GOSUB, 2),
            op(IF_NOT_RUNNING, 1, 53),
            op(ADD, 1, 53, 0, 1),
            op(END_BRANCH),
            op(END),
        ];
        const init = [op(IF_NOT_PLAYED, 1, 42), op(ADD, 1, 42, 0, 1), op(END_BRANCH), op(FADE_OUT, -1), op(END)];
        const program = start(makeProgram(caller, init));
        const state = makeAdsState({ 1: [42, 53] });

        stepAdsProgram(state, program);
        expect(count(state, 1, 42)).toBe(1); // tag 2 woke and ran this tick
        expect(count(state, 1, 53)).toBe(1); // the caller kept walking past its GOSUB
        expect(program.tags[0].flag).toBe(TagFlag.ACTIVE); // caller NOT ended by the callee's F010
        expect(program.tags[1].flag).toBe(TagFlag.ENDED);
        expect(isAdsTagEnded(program.tags[0])).toBe(false);

        stepAdsProgram(state, program);
        expect(program.tags[1].flag).toBe(TagFlag.ENDED); // woken (4) -> active (1) -> ended again by its F010
        expect(count(state, 1, 42)).toBe(1); // IF_NOT_PLAYED 1:42 is false now (+0x2d)
    });

    it('an F010 nested inside a body only fires when the body runs (ACTIVITY:1 / STAND exit roll shape)', () => {
        const program = start(
            makeProgram([
                op(IF_NOT_RUNNING, 1, 14),
                op(ADD, 1, 11, 0, 1),
                op(FADE_OUT, -1),
                op(END_BRANCH),
                op(END),
            ]),
        );
        const state = makeAdsState({ 1: [11, 14] });
        state.scenes.push({ sceneIdx: 1, tagId: 14, runState: TtmRunState.RUNNING });
        stepAdsProgram(state, program);
        expect(program.tags[0].flag).toBe(TagFlag.ACTIVE);
        expect(count(state, 1, 11)).toBe(0);

        state.scenes[0].runState = TtmRunState.FINISHED;
        stepAdsProgram(state, program);
        expect(count(state, 1, 11)).toBe(1);
        expect(program.tags[0].flag).toBe(TagFlag.ENDED);
    });
});

describe('WHILE 0x1070 (asm 17a0): the only mid-script resume', () => {
    // ACTIVITY.ADS tag 7 shape: IF_PLAYED 4:10 { RANDOM{ADD 4:5}; WHILE_RUNNING 4:5 {} END_WHILE; ADD 4:22 }
    const program = () =>
        start(
            makeProgram([
                op(IF_PLAYED, 4, 5), // 0: the reading-loop re-entry
                op(ADD, 4, 7, 0, 1), // 1
                op(END_BRANCH), // 2
                op(IF_PLAYED, 4, 10), // 3
                op(ADD, 4, 5, 2, 1), // 4
                op(WHILE_RUNNING, 4, 5), // 5
                op(END_WHILE), // 6
                op(ADD, 4, 22, 0, 1), // 7
                op(END_BRANCH), // 8
                op(IF_PLAYED, 4, 22), // 9
                op(ADD, 4, 23, 0, 1), // 10
                op(FADE_OUT, -1), // 11
                op(END_BRANCH), // 12
                op(END),
            ]),
        );

    it('arms the resume on true, skips the top blocks while armed, and on false continues past END_WHILE to the enclosing 0x1510', () => {
        const p = program();
        const state = makeAdsState({ 4: [5, 7, 10, 22, 23] });
        state.scenes.push({ sceneIdx: 4, tagId: 10, runState: TtmRunState.FINISHED, playedPulse: true });

        stepAdsProgram(state, p); // 4:10 pulse -> ADD 4:5 -> WHILE true -> armed, walk ends
        expect(count(state, 4, 5)).toBe(1);
        expect(p.tags[0].resumeIp).toBe(5);
        expect(count(state, 4, 22)).toBe(0);
        clearPulses(state);

        stepAdsProgram(state, p); // resumes AT the WHILE; still running -> stays armed
        expect(p.tags[0].resumeIp).toBe(5);

        finishNode(state, 4, 5); // 4:5 ends: pulse
        stepAdsProgram(state, p);
        // The WHILE went false: resume cleared, ADD 4:22 ran, the walk stopped at
        // the enclosing 0x1510. The top-level IF_PLAYED 4:5 block was NOT walked
        // this tick (the walk started at the WHILE), so the reading loop is not
        // re-entered: the one-shot local override falls out of the structure.
        expect(p.tags[0].resumeIp).toBe(-1);
        expect(count(state, 4, 22)).toBe(1);
        expect(count(state, 4, 7)).toBe(0);
        clearPulses(state);

        stepAdsProgram(state, p); // from the top again; the 4:5 pulse is gone
        expect(count(state, 4, 7)).toBe(0);
        finishNode(state, 4, 22);
        stepAdsProgram(state, p);
        expect(count(state, 4, 23)).toBe(1);
        expect(p.tags[0].flag).toBe(TagFlag.ENDED);
    });
});

describe('RANDOM (FUN_1048_0cda / 0c8d)', () => {
    it('weights: ADD uses its 4th param, STOP its 3rd, 0x3020 its 1st; the pick is executed unless it is 0x3020', () => {
        // STAND tag 1 exit roll: RANDOM{ STOP 1:53 (w1) ; 3020 5 } -> total 6.
        const program = start(
            makeProgram([
                op(RANDOM_START),
                op(STOP, 1, 53, 1),
                op(RANDOM_WEIGHT, 5),
                op(RANDOM_END),
                op(END),
            ]),
        );
        const picks = [];
        const state = makeAdsState({ 1: [53] }, { faithfulPick: (total) => (picks.push(total), 1) });
        state.scenes.push({ sceneIdx: 1, tagId: 53, runState: TtmRunState.RUNNING });
        stepAdsProgram(state, program);
        expect(picks).toEqual([6]);
        expect(count(state, 1, 53)).toBe(0); // pick 1 -> the STOP

        state.scenes.push({ sceneIdx: 1, tagId: 53, runState: TtmRunState.RUNNING });
        state.faithfulPick = () => 2; // 2..6 -> the 0x3020 no-op
        stepAdsProgram(state, program);
        expect(count(state, 1, 53)).toBe(1);
    });

    it('draws exactly one word per block and maps it onto the cumulative buckets; total 0 draws nothing', () => {
        const program = start(
            makeProgram([
                op(RANDOM_START),
                op(ADD, 1, 38, 0, 5),
                op(ADD, 1, 21, 0, 3),
                op(ADD, 1, 22, 0, 3),
                op(ADD, 1, 23, 0, 3),
                op(ADD, 1, 15, 0, 1),
                op(RANDOM_END),
                op(END),
            ]),
        );
        const pickWith = (value) => {
            let draws = 0;
            const state = makeAdsState({ 1: [15, 21, 22, 23, 38] }, { faithfulPick: () => (draws++, value) });
            stepAdsProgram(state, program);
            expect(draws).toBe(1);
            return state.scenes.map((s) => s.tagId);
        };
        expect(pickWith(1)).toEqual([38]);
        expect(pickWith(5)).toEqual([38]);
        expect(pickWith(6)).toEqual([21]);
        expect(pickWith(8)).toEqual([21]);
        expect(pickWith(11)).toEqual([22]);
        expect(pickWith(14)).toEqual([23]);
        expect(pickWith(15)).toEqual([15]);

        const zero = start(makeProgram([op(RANDOM_START), op(ADD, 1, 38, 0, 0), op(RANDOM_END), op(END)]));
        const state = makeAdsState({ 1: [38] }, {
            faithfulPick: () => {
                throw new Error('no draw for total 0');
            },
        });
        stepAdsProgram(state, zero);
        expect(state.scenes).toEqual([]);
    });

    it('the seeded-LCG fallback consumes one draw and lands in the same buckets (floor(random * total))', () => {
        expect(drawRandomPick({ random: () => 0.5 }, 15)).toBe(8); // floor(7.5) + 1 -> bucket B
        expect(drawRandomPick({ random: () => 0.9 }, 15)).toBe(14); // bucket D, not the weight-1 break
        expect(drawRandomPick({ random: () => 0.99 }, 15)).toBe(15); // the break
        expect(drawRandomPick({ faithfulPick: () => 7, random: () => 0 }, 15)).toBe(7);
    });
});

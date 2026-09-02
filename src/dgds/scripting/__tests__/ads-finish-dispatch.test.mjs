import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { DGDS_TICK_MS } from '../timing.mjs';
import { getSceneState } from '../scene-factory.mjs';
import { ADSDispatch } from '../script-runner.mjs';

const createSurface = () => ({ clear() {} });

const createRuntime = (overrides) =>
    new DgdsRuntime({
        type: 'TTM',
        data: { scripts: undefined },
        backgroundId: 0,
        random: () => 0,
        timingCompatibility: createTimingCompatibility(),
        surfaceFactory: createSurface,
        resourceProvider: { resolve: () => undefined },
        wmTimerMs: DGDS_TICK_MS,
        ...overrides,
    });

// Mirrors BUILDING.ADS tag 5 (campfire): two independent IF_PLAYED barriers,
// the SECOND-in-file scene (whistle, 3:141) finishes while the FIRST-in-file
// scene (fire, 3:82) is still playing. The finish-dispatch must fire 141's
// handoff the tick it finishes, without waiting for 82's barrier to clear.
describe('ADS finish-dispatch (Task 3): order-independent handoff', () => {
    const buildTtm = () => ({
        tags: [
            { id: 82, description: 'fire dying' },
            { id: 141, description: 'whistle' },
            { id: 83, description: 'embers' },
            { id: 140, description: 'walk to tree' },
        ],
        scenes: [
            { tagId: 0, script: [] },
            // 82's own script self-loops via GOTO so it never naturally
            // completes within the test's tick window -- it stays genuinely
            // "still playing" until the test explicitly finishes it, instead
            // of a trivial 1-opcode script completing on the very first tick
            // it is ticked (which would silently defeat the "still playing"
            // premise of these tests).
            { tagId: 82, script: [{ opcode: 0x1200, params: [82] }] },
            { tagId: 141, script: [{ opcode: 0x0110, params: [] }] },
            { tagId: 83, script: [{ opcode: 0x0110, params: [] }] },
            { tagId: 140, script: [{ opcode: 0x0110, params: [] }] },
        ],
    });

    const buildScript = () => [
        { opcode: 0x1350, params: [3, 82] }, // 0: IF_PLAYED 3:82 (fire) -- file-first, still playing
        { opcode: 0x2005, params: [3, 83, 1, 1] }, // 1: ADD 3:83 (embers)
        { opcode: 0xfff0, params: [] }, // 2: END_IF
        { opcode: 0x1510, params: [] }, // 3: END_SCENE_BRANCH
        { opcode: 0x1350, params: [3, 141] }, // 4: IF_PLAYED 3:141 (whistle) -- file-second, already finished
        { opcode: 0x2005, params: [3, 140, 1, 1] }, // 5: ADD 3:140 (walk to tree)
        { opcode: 0xfff0, params: [] }, // 6: END_IF
        { opcode: 0x1510, params: [] }, // 7: END_SCENE_BRANCH
        { opcode: 0xffff, params: [] }, // 8: END
    ];

    it('fires the second-in-file chunk the tick its scene finishes, even while the first barrier is still unresolved', () => {
        const ttm = buildTtm();
        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'campfire-order-test',
                resources: [{ id: 3, name: 'BUILDING.TTM' }],
                scenes: [{ tagId: { id: 5 }, script: buildScript() }],
            },
        });

        const fire = getSceneState(runtime.state, 3, 82, 1, 1);
        fire.runState = 'running'; // still playing -- the classic PC will park here
        const whistle = getSceneState(runtime.state, 3, 141, 1, 1);
        whistle.runState = 'finished';
        whistle.state.played = true;
        runtime.state.scenes.push(fire, whistle);

        const result = runtime.tick(20);

        // The still-playing fire barrier keeps the linear PC parked at index 0
        // -- the top-level ADS script has not reached its end this tick.
        expect(result.completed).toBe(false);
        // But the finish-dispatch fires 141's chunk anyway, order-independent
        // of 82's earlier, still-unresolved barrier.
        expect(runtime.state.scenes.some((s) => s.sceneIdx === 3 && s.tagId === 140)).toBe(true);
        // 82's own successor must NOT have fired -- it genuinely hasn't finished.
        expect(runtime.state.scenes.some((s) => s.sceneIdx === 3 && s.tagId === 83)).toBe(false);
    });

    it('does not re-fire a lingering finished scene every tick (double-fire guard)', () => {
        const ttm = buildTtm();
        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'campfire-order-test',
                resources: [{ id: 3, name: 'BUILDING.TTM' }],
                scenes: [{ tagId: { id: 5 }, script: buildScript() }],
            },
        });

        const fire = getSceneState(runtime.state, 3, 82, 1, 1);
        fire.runState = 'running';
        const whistle = getSceneState(runtime.state, 3, 141, 1, 1);
        whistle.runState = 'finished';
        whistle.state.played = true;
        runtime.state.scenes.push(fire, whistle);

        runtime.tick(20);
        const firstCount = runtime.state.scenes.filter((s) => s.sceneIdx === 3 && s.tagId === 140).length;
        expect(firstCount).toBe(1);

        // 82 still hasn't finished; 141's finished instance lingers (the classic
        // linear IF_PLAYED hasn't reached it to remove it). A second tick must
        // NOT stage a second, duplicate 140.
        runtime.tick(20);
        const secondCount = runtime.state.scenes.filter((s) => s.sceneIdx === 3 && s.tagId === 140).length;
        expect(secondCount).toBe(1);
    });
});

// RANDOM double-pick regression: a chunk body containing a 0x3010 RANDOM
// block is NON-idempotent -- RANDOM_END picks ONE of several staged
// ADD_SCENEs. The finish-dispatch fires the chunk on the scene's finish; the
// linear runner then reaches the SAME IF_PLAYED for the now-finished scene.
// If the linear runner re-runs the RANDOM body it picks a DIFFERENT scene,
// spawning a concurrent duplicate (the telescope "multiple Johnnies":
// STAND.ADS #15 chains RANDOM scan blocks with no STOP_SCENE). The body must
// fire exactly once. (A plain-ADD body double-firing is a harmless no-op --
// covered by the "double-fire guard" test above -- so the bug is only visible
// with a RANDOM block AND a random source that yields different picks.)
describe('ADS finish-dispatch: RANDOM handoff chunk fires exactly once (no double-pick)', () => {
    const buildTtm = () => ({
        tags: [
            { id: 40, description: 'scan that finishes' },
            { id: 50, description: 'random candidate A' },
            { id: 51, description: 'random candidate B' },
            { id: 99, description: 'never-finishing blocker (keeps the ADS scene alive)' },
        ],
        scenes: [
            { tagId: 0, script: [] },
            { tagId: 40, script: [{ opcode: 0x0110, params: [] }] },
            { tagId: 50, script: [{ opcode: 0x1200, params: [50] }] }, // self-loop: stays running
            { tagId: 51, script: [{ opcode: 0x1200, params: [51] }] },
            { tagId: 99, script: [{ opcode: 0x1200, params: [99] }] },
        ],
    });

    // IF_PLAYED 9:40 { RANDOM_START; ADD 9:50; ADD 9:51; RANDOM_END } -- one of
    // 50/51 chosen. No STOP_SCENE, mirroring STAND.ADS #15's scan chain. The
    // RANDOM block is FIRST so the linear PC reaches it (the double-fire needs
    // BOTH the dispatch AND the linear runner to process it); a trailing
    // IF_PLAYED on a never-finishing 9:99 then parks the PC so the ADS scene
    // does not run to completion and clear its display list before we inspect.
    const buildScript = () => [
        { opcode: 0x1350, params: [9, 40] }, // 0: IF_PLAYED 9:40
        { opcode: 0x3010, params: [] }, // 1: RANDOM_START
        { opcode: 0x2005, params: [9, 50, 0, 1] }, // 2: ADD 9:50 (idx 0)
        { opcode: 0x2005, params: [9, 51, 0, 1] }, // 3: ADD 9:51 (idx 1)
        { opcode: 0x30ff, params: [] }, // 4: RANDOM_END
        { opcode: 0xfff0, params: [] }, // 5: END_IF
        { opcode: 0x1510, params: [] }, // 6: END_SCENE_BRANCH
        { opcode: 0x1350, params: [9, 99] }, // 7: IF_PLAYED 9:99 -- still running -> BLOCK here
        { opcode: 0x2005, params: [9, 98, 0, 1] }, // 8: ADD 9:98 (never reached)
        { opcode: 0xfff0, params: [] }, // 9: END_IF
        { opcode: 0x1510, params: [] }, // 10: END_SCENE_BRANCH
        { opcode: 0xffff, params: [] }, // 11: END
    ];

    it('picks exactly one of the RANDOM candidates when the scene finishes, not one per firing path', () => {
        const ttm = buildTtm();
        // Distinct successive values so the dispatch pick (idx 0 -> 50) and any
        // erroneous second linear pick (idx 1 -> 51) would differ, making a
        // double-fire observable as BOTH scenes present.
        const rolls = [0, 0.99, 0.99, 0.99];
        let r = 0;
        const runtime = createRuntime({
            type: 'ADS',
            random: () => rolls[Math.min(r++, rolls.length - 1)],
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'random-double-pick-test',
                resources: [{ id: 9, name: 'STAND.TTM' }],
                scenes: [{ tagId: { id: 15 }, script: buildScript() }],
            },
        });

        const scan = getSceneState(runtime.state, 9, 40, 1, 1);
        scan.runState = 'finished';
        scan.state.played = true;
        const blocker = getSceneState(runtime.state, 9, 99, 1, 1);
        blocker.runState = 'running';
        runtime.state.scenes.push(scan, blocker);

        runtime.tick(20);

        // Exactly ONE of the RANDOM candidates is live. WITHOUT the fix the
        // dispatch picks one and the linear re-run picks another, leaving BOTH
        // (count 2). WITH the fix the linear runner skips the already-fired
        // RANDOM body, so exactly one remains. (Which one depends on how many
        // times state.random is consumed before RANDOM_END, which is not
        // asserted -- only the count, which is the invariant that matters.)
        const liveCandidates = runtime.state.scenes.filter(
            (s) => s.sceneIdx === 9 && (s.tagId === 50 || s.tagId === 51),
        ).length;
        expect(liveCandidates).toBe(1);
    });
});

// Crash regression: during the concluding-children hold of a `singleAdsScene`
// gag that is the LAST scene in its ADS, `state.currentScene === adsSceneEnd`
// sits PAST the scenes array. When the finish-dispatch fires a chunk body that
// contains a nested/OR-chained IF opcode, IF_PLAYED -> handleIfCondition used
// to read `state.data.scenes[currentScene].script` -- `undefined` there ->
// "can't access property script" (the live browser crash). The fix reads the
// script `reentryNow` actually indexes (`state.activeAdsScript`, which the
// finish-dispatch sets), never the out-of-range raw scene. Exercised directly
// through the IF_PLAYED dispatch entry with currentScene out of range and
// activeAdsScript set -- the exact state the dispatch presents.
describe('ADS finish-dispatch: IF_PLAYED with currentScene past the scenes array does not crash', () => {
    const entry = ADSDispatch.find((e) => e.opcode === 0x1350);
    // The chunk body the dispatch runs (activeAdsScript). reentryNow indexes
    // THIS, not the raw data.scenes[...].script.
    const activeAdsScript = [
        { opcode: 0x1350, params: [3, 30] }, // 0: nested IF_PLAYED 3:30
        { opcode: 0x2005, params: [3, 99, 1, 1] }, // 1: ADD 3:99
        { opcode: 0xfff0, params: [] }, // 2: END_IF
        { opcode: 0x1510, params: [] }, // 3: END_SCENE_BRANCH
    ];

    const outOfRangeState = () => ({
        continue: true,
        scenes: [],
        playedHistory: new Set(['3:30']), // 3:30 already finished/removed -> "played"
        removeScenes: [],
        orMode: false,
        orChainPassed: false,
        data: { scenes: [{ script: [] }] }, // length 1
        currentScene: 1, // PAST the array (== adsSceneEnd during the last-scene hold)
        reentryNow: 0, // indexes activeAdsScript, not data.scenes[1]
        jumpTo: undefined,
        activeAdsScript,
    });

    it('resolves the script from activeAdsScript, not the out-of-range data.scenes[currentScene]', () => {
        const state = outOfRangeState();
        // Pre-fix: reads state.data.scenes[1].script -> data.scenes[1] is
        // undefined -> throws "can't access property script".
        expect(() => entry.callback(state, 3, 30)).not.toThrow();
    });
});

// SHOULD-FIX 2 regression: `dispatchedAdsKeys` must not leak across ADS scene
// (gag) boundaries. A (slot,tag) key dispatched (finish-observed) in an
// earlier gag must not soften a GENUINE, freshly-added instance of that same
// (slot,tag) barriered by a later gag's linear IF_PLAYED -- that barrier must
// still BLOCK (wait for the new instance), not skip.
describe('ADS finish-dispatch (SHOULD-FIX 2): dispatchedAdsKeys does not leak across ADS scene boundaries', () => {
    const buildTtm = () => ({
        tags: [
            { id: 0, description: 'root' },
            { id: 50, description: 'reused tag: finishes fast' },
            { id: 60, description: 'gag1 successor' },
        ],
        scenes: [
            { tagId: 0, script: [] },
            { tagId: 50, script: [{ opcode: 0x0110, params: [] }] },
            { tagId: 60, script: [{ opcode: 0x0110, params: [] }] },
        ],
    });

    // gag0 (index 0): adds 3:50, waits for it to finish via the classic
    // WHILE_RUNNING barrier (NOT a chunk-dispatch), then ends. Ending a
    // non-selected (singleAdsScene:false) gag calls clearAdsSceneBatch,
    // which must clear dispatchedAdsKeys along with scenes/addScenes.
    const gag0Script = () => [
        { opcode: 0x2005, params: [3, 50, 1, 1] }, // 0: ADD 3:50
        { opcode: 0x1510, params: [] }, // 1: commit
        { opcode: 0x1070, params: [3, 50] }, // 2: WHILE_RUNNING 3:50 -- parks until finished
        { opcode: 0xffff, params: [] }, // 3: END -> clearAdsSceneBatch (multi-scene mode)
    ];

    // gag1 (index 1): adds a FRESH 3:50 instance (same slot:tag as gag0's),
    // then a genuine linear IF_PLAYED barrier on it. This must BLOCK -- the
    // fresh instance has not finished -- regardless of gag0 having dispatched
    // that same key earlier.
    const gag1Script = () => [
        { opcode: 0x2005, params: [3, 50, 1, 1] }, // 0: ADD 3:50 (fresh instance)
        { opcode: 0x1510, params: [] }, // 1: commit
        { opcode: 0x1350, params: [3, 50] }, // 2: IF_PLAYED 3:50
        { opcode: 0x2005, params: [3, 60, 1, 1] }, // 3: ADD 3:60 (successor)
        { opcode: 0xfff0, params: [] }, // 4: END_IF
        { opcode: 0x1510, params: [] }, // 5: END_SCENE_BRANCH
        { opcode: 0xffff, params: [] }, // 6: END
    ];

    it('a genuine barrier keyed to a tag dispatched in an earlier scene still blocks', () => {
        const ttm = buildTtm();
        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: () => ttm },
            singleAdsScene: false,
            data: {
                name: 'multi-scene-dispatch-leak-test',
                resources: [{ id: 3, name: 'LEAK.TTM' }],
                scenes: [
                    { tagId: { id: 5 }, script: gag0Script() }, // gag0, index 0
                    { tagId: { id: 6 }, script: gag1Script() }, // gag1, index 1
                ],
            },
        });

        // Tick 1: gag0 adds 3:50 and parks at WHILE_RUNNING; the TTM
        // controller then finishes 3:50's trivial single-op script the same
        // tick.
        runtime.tick(20);
        expect(runtime.state.scenes.some((s) => s.sceneIdx === 3 && s.tagId === 50)).toBe(true);

        // Tick 2: the finish-dispatch observes 3:50 as finished and adds
        // "3:50" to dispatchedAdsKeys (regardless of any matching chunk --
        // gag0 has no IF_PLAYED chunk for it). WHILE_RUNNING then unblocks,
        // and gag0 reaches its own END, which clears the scene batch
        // (including, with the fix, dispatchedAdsKeys) and advances to gag1.
        runtime.tick(20);
        expect(runtime.state.currentScene).toBe(1);
        expect(runtime.state.scenes.some((s) => s.sceneIdx === 3 && s.tagId === 50)).toBe(false);

        // Tick 3: gag1 adds a FRESH 3:50 and hits its own IF_PLAYED barrier
        // on it, evaluated the SAME tick, immediately after the ADD -- before
        // the TTM controller has run even once for the fresh instance, so it
        // is genuinely still "starting" (not done). Under the bug, the
        // leaked "3:50" key in dispatchedAdsKeys wrongly softens this
        // barrier (skip instead of wait), so 3:60 appears immediately even
        // though the fresh 3:50 instance has not finished. Fixed, the
        // barrier genuinely blocks: the successor is not staged this tick.
        runtime.tick(20);
        expect(runtime.state.scenes.some((s) => s.sceneIdx === 3 && s.tagId === 50)).toBe(true);
        expect(runtime.state.scenes.some((s) => s.sceneIdx === 3 && s.tagId === 60)).toBe(false);
        expect(runtime.state.addScenes.some((s) => s.sceneIdx === 3 && s.tagId === 60)).toBe(false);
    });
});

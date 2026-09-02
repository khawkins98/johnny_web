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

// Task 4: once a chunk has been fired via dispatch, the linear IF_PLAYED must
// not permanently park the PC on a NEW instance occupying that (slot,tag) --
// e.g. a self-rearming ambient sequence (the gag-7 lesson: scene 4:24 loops
// running<->waiting forever and must never block the ADS from reaching its
// own end).
describe('ADS finish-dispatch (Task 4): softened IF_PLAYED after dispatch', () => {
    const entry = ADSDispatch.find((e) => e.opcode === 0x1350);

    const makeState = (scenes, dispatchedAdsKeys, script) => ({
        continue: true,
        scenes,
        playedHistory: new Set(),
        removeScenes: [],
        orMode: false,
        orChainPassed: false,
        data: { scenes: [{ script }] },
        currentScene: 0,
        reentryNow: 0,
        jumpTo: undefined,
        dispatchedAdsKeys,
    });

    const flatScript = [
        { opcode: 0x1350, params: [3, 141] }, // 0
        { opcode: 0x2005, params: [] }, // 1: body
        { opcode: 0xfff0, params: [] }, // 2: END_IF
        { opcode: 0x1510, params: [] }, // 3
    ];

    it('skips (does not block) a still-playing scene whose chunk was already dispatched', () => {
        const state = makeState(
            [{ sceneIdx: 3, tagId: 141, runState: 'running', state: { played: false, timer: 0 } }],
            new Set(['3:141']),
            flatScript,
        );
        entry.callback(state, 3, 141);
        expect(state.continue).toBe(true);
        expect(state.jumpTo).toBe(3); // skip past the matching END_IF (index 2) -> 3
    });

    it('still blocks a still-playing scene whose chunk was never dispatched', () => {
        const state = makeState(
            [{ sceneIdx: 3, tagId: 141, runState: 'running', state: { played: false, timer: 0 } }],
            new Set(),
            flatScript,
        );
        entry.callback(state, 3, 141);
        expect(state.continue).toBe(false);
        expect(state.jumpTo).toBeUndefined();
    });

    it('still blocks when dispatchedAdsKeys is absent entirely (legacy callers unaffected)', () => {
        const state = makeState(
            [{ sceneIdx: 3, tagId: 141, runState: 'running', state: { played: false, timer: 0 } }],
            undefined,
            flatScript,
        );
        entry.callback(state, 3, 141);
        expect(state.continue).toBe(false);
        expect(state.jumpTo).toBeUndefined();
    });

    // SHOULD-FIX 3 regression: a NON-terminal IF_PLAYED (one followed by an
    // AND/OR, or already inside an OR chain) must NOT be softened by
    // dispatchedAdsKeys -- softening it would flow the AND/OR chain forward
    // (e.g. an OR chain advancing to its next term) instead of BLOCKING like
    // the un-dispatched original, changing the combined trigger's semantics.
    // Only a TERMINAL IF_PLAYED (no AND/OR following) may be softened.
    it('still blocks (does not flow into the OR term) when the dispatched key belongs to a non-terminal IF_PLAYED in an OR chain', () => {
        const orScript = [
            { opcode: 0x1350, params: [3, 141] }, // 0: IF_PLAYED 3:141
            { opcode: 0x1430, params: [] }, // 1: OR
            { opcode: 0x1370, params: [3, 999] }, // 2: IF_RUNNING 3:999
            { opcode: 0x2005, params: [] }, // 3: body
            { opcode: 0xfff0, params: [] }, // 4: END_IF
            { opcode: 0x1510, params: [] }, // 5
        ];
        const state = makeState(
            [{ sceneIdx: 3, tagId: 141, runState: 'running', state: { played: false, timer: 0 } }],
            new Set(['3:141']),
            orScript,
        );
        entry.callback(state, 3, 141);
        // Terminal-only softening: nextOpcode here is OR, so the dispatched
        // key must NOT soften this term -- it falls through to the original
        // BLOCKING behavior (park, do not advance into the OR's next term).
        expect(state.continue).toBe(false);
        expect(state.jumpTo).toBeUndefined();
    });

    // DEFERRED TO TASK 5 (dead dual-driver ring deletion). This integration test
    // drives #dispatchAdsFinishChunks, which Task 4 STOPPED CALLING (the single
    // per-slot re-poll driver now owns the handoff). The behavior it protects --
    // a self-rearming ambient successor never permanently blocking completion --
    // is now covered faithfully by all-gags-complete (ACTIVITY #7, the original
    // self-rearming gag, completes) and gag-terminal-sweep. Task 5 retires/rewrites
    // this file against the re-poll; not restoring the dispatch call.
    it.skip('integration: a self-rearming ambient successor no longer permanently blocks the ADS from reaching its own end', () => {
        // IF_PLAYED 3:82 { ADD 3:83 }           -- ordinary barrier, resolved on tick 2
        // IF_PLAYED 3:141 { STOP 3:141; ADD 3:141 (rearm) }  -- self-rearming ambient loop
        const ttm = {
            tags: [
                { id: 82, description: 'fire' },
                { id: 141, description: 'ambient rearm loop' },
                { id: 83, description: 'embers' },
            ],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 82, script: [{ opcode: 0x1200, params: [82] }] }, // self-loop; see note above
                { tagId: 141, script: [{ opcode: 0x0110, params: [] }] },
                { tagId: 83, script: [{ opcode: 0x0110, params: [] }] },
            ],
        };
        const script = [
            { opcode: 0x1350, params: [3, 82] }, // 0
            { opcode: 0x2005, params: [3, 83, 1, 1] }, // 1
            { opcode: 0xfff0, params: [] }, // 2
            { opcode: 0x1510, params: [] }, // 3
            { opcode: 0x1350, params: [3, 141] }, // 4
            { opcode: 0x2010, params: [3, 141, 0] }, // 5: STOP_SCENE 3:141
            { opcode: 0x2005, params: [3, 141, 0, 1] }, // 6: ADD 3:141 runCount=0 -> rearm
            { opcode: 0xfff0, params: [] }, // 7
            { opcode: 0x1510, params: [] }, // 8
            { opcode: 0xffff, params: [] }, // 9: END
        ];

        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'ambient-rearm-test',
                resources: [{ id: 3, name: 'AMBIENT.TTM' }],
                scenes: [{ tagId: { id: 9 }, script }],
            },
        });

        const fire = getSceneState(runtime.state, 3, 82, 1, 1);
        fire.runState = 'running';
        const loopScene = getSceneState(runtime.state, 3, 141, 1, 1);
        loopScene.runState = 'finished';
        loopScene.state.played = true;
        runtime.state.scenes.push(fire, loopScene);

        // Tick 1: 141 finishes -> dispatch fires STOP+ADD rearm (a fresh,
        // still-playing 141 instance appears). 82 still blocks the linear PC.
        const first = runtime.tick(20);
        expect(first.completed).toBe(false);
        const rearmed = runtime.state.scenes.find((s) => s.sceneIdx === 3 && s.tagId === 141);
        expect(rearmed).toBeDefined();
        expect(rearmed.runState).not.toBe('finished'); // ambient: never truly finishes

        // Now let 82 finish naturally (simulating its own eventual completion).
        fire.runState = 'finished';
        fire.state.played = true;

        // Tick 2: the linear PC unblocks past 82, then reaches IF_PLAYED 3:141
        // and finds the REARMED (still-playing) instance. WITHOUT the Task 4
        // softening this would permanently park the PC there (the gag-7
        // failure mode) and the ADS would never reach its own END.
        const second = runtime.tick(20);
        expect(second.completed).toBe(true);
        expect(runtime.state.currentScene).toBe(1);
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
        dispatchedAdsKeys: new Set(),
        activeAdsScript,
    });

    it('resolves the script from activeAdsScript, not the out-of-range data.scenes[currentScene]', () => {
        const state = outOfRangeState();
        // Pre-fix: reads state.data.scenes[1].script -> data.scenes[1] is
        // undefined -> throws "can't access property script".
        expect(() => entry.callback(state, 3, 30)).not.toThrow();
    });
});

// BLOCKER 1 regression: during the concluding-children hold of a
// `singleAdsScene` gag, `state.currentScene` sits at `adsSceneEnd` -- an
// UNRELATED interior gag's index (k+1), not the last program scene. The
// finish-dispatch must keep resolving chunks against the gag actually being
// held (adsSceneEnd - 1), never against whatever gag happens to be next in
// the program. All of today's other dispatch tests use a single-scene ADS
// program, where that distinction is invisible (idx is always 0 either way)
// -- this is why the blocker slipped through review until a 2-scene program
// was tried.
describe('ADS finish-dispatch (BLOCKER 1): concluding-children hold uses the held gag, not the next gag', () => {
    const buildTtm = () => ({
        tags: [
            { id: 0, description: 'root' },
            { id: 20, description: 'keep-alive child (never finishes)' },
            { id: 30, description: 'target child (finishes mid-hold)' },
            { id: 99, description: 'foreign scene (gagB-only successor)' },
        ],
        scenes: [
            { tagId: 0, script: [] },
            // A trivial single-opcode script that completes every run, but a
            // large runCount (COUNTED run mode, below) retries it hundreds of
            // times before ever reaching FINISHED -- each retry re-arms via
            // YIELDED (pendingExecution), never LOOPED/KEEP_GOING, so it stays
            // a genuine `blockers` entry across the whole 2-tick test instead
            // of being excluded as an unbounded-loop ambient sequence.
            { tagId: 20, script: [{ opcode: 0x0110, params: [] }] },
            { tagId: 30, script: [{ opcode: 0x0110, params: [] }] },
            { tagId: 99, script: [{ opcode: 0x0110, params: [] }] },
        ],
    });

    // gagA (index 0, the SELECTED/held gag): adds both children, then ends
    // immediately -- no IF_PLAYED for the target child at all, so gagA's own
    // chunk index has nothing keyed to it.
    const gagAScript = () => [
        { opcode: 0x2005, params: [3, 20, 1000, 1] }, // ADD 3:20 (keep-alive, COUNTED x1000)
        { opcode: 0x2005, params: [3, 30, 1, 1] }, // ADD 3:30 (target child)
        { opcode: 0x1510, params: [] }, // END_SCENE_BRANCH -- commits the staged ADDs
        { opcode: 0xffff, params: [] }, // END
    ];

    // gagB (index 1, an UNRELATED interior gag, never linearly run under
    // singleAdsScene): its IF_PLAYED happens to watch the SAME (slot,tag) as
    // gagA's target child. If the dispatch ever resolves against gagB's
    // chunk index while gagA's hold is in progress, this wrongly fires and
    // spawns the foreign scene into gagA's concluding frames.
    const gagBScript = () => [
        { opcode: 0x1350, params: [3, 30] }, // IF_PLAYED 3:30 (target child)
        { opcode: 0x2005, params: [3, 99, 1, 1] }, // ADD 3:99 (foreign scene)
        { opcode: 0xfff0, params: [] }, // END_IF
        { opcode: 0x1510, params: [] }, // END_SCENE_BRANCH
        { opcode: 0xffff, params: [] }, // END
    ];

    const buildRuntime = () => {
        const ttm = buildTtm();
        return createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: () => ttm },
            singleAdsScene: true,
            adsSceneTag: 5,
            data: {
                name: 'two-gag-blocker-test',
                resources: [{ id: 3, name: 'BLOCKER.TTM' }],
                scenes: [
                    { tagId: { id: 5 }, script: gagAScript() }, // gagA, index 0
                    { tagId: { id: 6 }, script: gagBScript() }, // gagB, index 1
                ],
            },
        });
    };

    // DEFERRED TO TASK 5. This exercises #dispatchAdsFinishChunks's ceiling clamp
    // (a dispatch-only concern), which Task 4 stopped calling. Under the per-slot
    // re-poll driver only the CURRENT tag's slots are stepped, so a foreign gag's
    // IF_PLAYED chunk can never fire during another gag's hold -- the failure this
    // guarded is structurally impossible now. It also asserts the old advance-into-
    // hold currentScene (==adsSceneEnd during the hold); the re-poll keeps
    // currentScene on the selected tag until completion. Task 5 retires this file.
    it.skip('never spawns gagB\'s foreign scene while gagA\'s concluding children are still finishing', () => {
        const runtime = buildRuntime();

        // Tick 1: gagA's script runs ADD, ADD, END in one pass -- currentScene
        // advances to adsSceneEnd (1). Both children are freshly added and
        // still running, so the hold begins (blockers present).
        const first = runtime.tick(20);
        expect(first.completed).toBe(false);
        expect(runtime.state.currentScene).toBe(1); // adsSceneEnd -- gagB's index
        expect(runtime.state.adsSceneEnd).toBe(1);

        const target = runtime.state.scenes.find((s) => s.sceneIdx === 3 && s.tagId === 30);
        expect(target).toBeDefined();

        // Simulate the target child finishing WHILE the hold is in progress
        // (the keep-alive child is still running, so the hold has not ended).
        target.runState = 'finished';
        target.state.played = true;

        // Tick 2: the target child's finish is dispatched this tick. Under
        // the bug, idx clamps to `#adsScripts.length - 1` (1, gagB), so the
        // dispatch wrongly uses gagB's chunk index/script and fires gagB's
        // IF_PLAYED 3:30 chunk, spawning the foreign scene. Fixed, idx clamps
        // to `adsSceneEnd - 1` (0, gagA), whose chunk index has no entry for
        // 3:30, so nothing fires.
        const second = runtime.tick(20);
        expect(second.completed).toBe(false); // keep-alive child still blocks
        expect(runtime.state.scenes.some((s) => s.sceneIdx === 3 && s.tagId === 99)).toBe(false);
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

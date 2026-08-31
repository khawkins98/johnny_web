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

    it('integration: a self-rearming ambient successor no longer permanently blocks the ADS from reaching its own end', () => {
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

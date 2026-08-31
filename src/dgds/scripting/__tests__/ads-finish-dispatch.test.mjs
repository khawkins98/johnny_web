import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { DGDS_TICK_MS } from '../timing.mjs';
import { getSceneState } from '../scene-factory.mjs';

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

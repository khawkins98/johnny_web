import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
import { DGDS_TICK_MS } from '../timing.mjs';
import { getSceneState } from '../scene-factory.mjs';
import { createRecordingSurface } from '../surface.mjs';
import { moveSequenceToBack } from '../ttm-sequence-order.mjs';
import { isTtmFinished, TtmRunMode } from '../ttm-run-state.mjs';

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
        // These tests exercise per-tick LOGICAL behaviour (delays, time-limits,
        // run-counts, ADS sequencing, z-order), not the 50 ms WM_TIMER present
        // cadence. Run the frame-advance gate per fine tick so each tick advances
        // a ready frame; the present-cadence itself is covered by its own test and
        // the golden suite (which use the faithful default period).
        wmTimerMs: DGDS_TICK_MS,
        ...overrides,
    });

describe('DgdsRuntime', () => {
    it('owns mutable execution state per instance', () => {
        const first = createRuntime();
        const second = createRuntime();

        first.state.currentScene = 8;
        first.state.playedHistory.add('1:9');

        expect(second.state.currentScene).toBe(0);
        expect(second.state.playedHistory).toEqual(new Set());
        expect(second.state.playedHistory).not.toBe(first.state.playedHistory);
    });

    it('reports the injected game identity for diagnostics', () => {
        const runtime = createRuntime({
            game: { id: 'test-title', version: '2.0' },
        });

        expect(runtime.describe()).toMatchObject({
            game: { id: 'test-title', version: '2.0' },
        });
    });

    it('loads ADS resource declarations through the provider', () => {
        const decoded = { name: 'SCENES.TTM', scenes: [] };
        const resolve = (name) => (name === 'SCENES.TTM' ? decoded : undefined);
        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve },
            data: {
                name: 'test',
                resources: [{ id: 4, name: 'SCENES.TTM' }],
                scenes: [],
            },
        });

        expect(runtime.state.scenesRes[4]).toBe(decoded);
        expect(runtime.state).not.toHaveProperty('entries');
    });

    it('runs an ADS RUN_SCRIPT target inline before continuing the selected scene', () => {
        const ttm = {
            name: 'INIT.TTM',
            tags: [{ id: 42, description: 'initializer' }],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 42, script: [{ opcode: 0x0ff0, params: [] }] },
            ],
        };
        const runtime = createRuntime({
            type: 'ADS',
            adsSceneTag: 1,
            singleAdsScene: true,
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'subroutine-test',
                resources: [{ id: 1, name: 'INIT.TTM' }],
                scenes: [
                    {
                        tagId: { id: 1 },
                        script: [
                            { opcode: 0xf200, params: [14] },
                            { opcode: 0xffff, params: [] },
                        ],
                    },
                    {
                        tagId: { id: 14 },
                        script: [
                            { opcode: 0x2005, params: [1, 42, 0, 1] },
                            { opcode: 0x1510, params: [] },
                            { opcode: 0xffff, params: [] },
                        ],
                    },
                ],
            },
        });

        runtime.tick(20);

        expect(runtime.state.scenes).toEqual([expect.objectContaining({ sceneIdx: 1, tagId: 42 })]);
    });

    it('rejects recursive ADS RUN_SCRIPT chains', () => {
        expect(() =>
            createRuntime({
                type: 'ADS',
                data: {
                    name: 'recursive',
                    resources: [],
                    scenes: [{ tagId: { id: 1 }, script: [{ opcode: 0xf200, params: [1] }] }],
                },
            }),
        ).toThrow('Recursive ADS RUN_SCRIPT chain');
    });

    it('advances only when the host supplies a logical tick', () => {
        const runtime = createRuntime();

        expect(runtime.state.tick).toBe(0);
        expect(runtime.tick(1000 / 60)).toMatchObject({
            completed: true,
            audioOperations: [],
        });
        expect(runtime.state.tick).toBe(1);
        expect(runtime.state.frameDelta).toBeCloseTo(1000 / 60);
    });

    it('requires host services instead of selecting browser globals', () => {
        expect(
            () =>
                new DgdsRuntime({
                    random: () => 0,
                    timingCompatibility: createTimingCompatibility(),
                }),
        ).toThrow('surfaceFactory');
    });

    it('requires a synchronous named-resource provider', () => {
        expect(
            () =>
                new DgdsRuntime({
                    random: () => 0,
                    timingCompatibility: createTimingCompatibility(),
                    surfaceFactory: createSurface,
                }),
        ).toThrow('resourceProvider');
    });

    it('does not retain browser contexts or completion callbacks', () => {
        const runtime = createRuntime({
            context: { name: 'foreground' },
            mainContext: { name: 'background' },
            audioManager: { name: 'audio' },
            onComplete: () => {},
        });

        expect(runtime.state).not.toHaveProperty('context');
        expect(runtime.state).not.toHaveProperty('mainContext');
        expect(runtime.state).not.toHaveProperty('audioManager');
        expect(runtime.state).not.toHaveProperty('onComplete');
        expect(runtime.state).not.toHaveProperty('compatibility');
    });

    it('returns logical audio operations from the current tick', () => {
        const runtime = createRuntime({
            data: {
                scripts: [{ opcode: 0xc050, params: [6] }],
            },
        });

        expect(runtime.tick(1000 / 60)).toMatchObject({
            completed: true,
            audioOperations: [
                {
                    type: 'play-sample',
                    sample: 6,
                    tick: 1,
                },
            ],
        });
    });

    it('returns logical frame operations without exposing a surface', () => {
        const runtime = createRuntime({
            foregroundColor: { r: 1, g: 2, b: 3 },
            presentFrameOperation: () => {},
            data: {
                scripts: [{ opcode: 0xa100, params: [5, 6, 7, 8] }],
            },
        });

        const result = runtime.tick(1000 / 60);

        expect(result.frameOperations).toMatchObject([
            {
                type: 'fill-rect',
                x: 5,
                y: 6,
                width: 7,
                height: 8,
                tick: 1,
            },
        ]);
        expect(result.frameOperations[0]).not.toHaveProperty('surface');
        expect(result.frameOperations[0]).not.toHaveProperty('canvas');
    });

    it('returns host presentation intent instead of drawing to Canvas', () => {
        const runtime = createRuntime({
            type: 'ADS',
            data: {
                name: 'test',
                resources: [],
                scenes: [
                    {
                        tagId: { id: 1, description: 'test scene' },
                        script: [{ opcode: 0xffff, params: [] }],
                    },
                ],
            },
        });

        expect(runtime.tick(1000 / 60)).toMatchObject({
            completed: true,
            presentation: {
                clearForeground: false,
                backgroundOnly: false,
                compose: true,
            },
        });
    });

    it('runs only the ADS tag selected by the host', () => {
        const runtime = createRuntime({
            type: 'ADS',
            adsSceneTag: 2,
            singleAdsScene: true,
            data: {
                name: 'test',
                resources: [],
                scenes: [
                    { tagId: { id: 1, description: 'first' }, script: [{ opcode: 0xffff, params: [] }] },
                    { tagId: { id: 2, description: 'selected' }, script: [{ opcode: 0xffff, params: [] }] },
                    { tagId: { id: 3, description: 'third' }, script: [{ opcode: 0xffff, params: [] }] },
                ],
            },
        });

        expect(runtime.state.currentScene).toBe(1);
        expect(runtime.tick(1000 / 60).completed).toBe(true);
        expect(runtime.state.currentScene).toBe(2);
    });

    it('waits for a concluding child added immediately before selected ADS END', () => {
        const ttm = {
            tags: [{ id: 1, description: 'conclusion' }],
            scenes: [
                { tagId: 0, script: [] },
                {
                    tagId: 1,
                    script: [
                        { opcode: 0x1020, params: [2] },
                        { opcode: 0x0ff0, params: [] },
                        { opcode: 0x0110, params: [] },
                    ],
                },
            ],
        };
        const runtime = createRuntime({
            type: 'ADS',
            adsSceneTag: 1,
            singleAdsScene: true,
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'test',
                resources: [{ id: 1, name: 'END.TTM' }],
                scenes: [
                    {
                        tagId: { id: 1, description: 'test scene' },
                        script: [
                            { opcode: 0x1330, params: [1, 1] },
                            { opcode: 0x2005, params: [1, 1, 0, 1] },
                            { opcode: 0xfff0, params: [] },
                            { opcode: 0x1510, params: [] },
                            { opcode: 0xffff, params: [] },
                        ],
                    },
                ],
            },
        });

        expect(runtime.tick(20).completed).toBe(false);
        // The per-slot re-poll driver keeps interpreting the SELECTED tag every
        // tick (currentScene stays on it); it does not advance into a stop-at-END
        // hold. currentScene only jumps to adsSceneEnd on completion.
        expect(runtime.state.currentScene).toBe(0);
        expect(runtime.state.scenes.map((scene) => scene.tagId)).toEqual([1]);

        expect(runtime.tick(20).completed).toBe(false);
        expect(runtime.tick(20).completed).toBe(false);
        expect(runtime.tick(20).completed).toBe(true);
        expect(runtime.state.scenes).toEqual([]);
        expect(runtime.state.playedHistory.has('1:1')).toBe(true);
    });

    it('atomically replaces a completed scene with its triggered successor', () => {
        const ttm = {
            tags: [
                { id: 1, description: 'predecessor' },
                { id: 2, description: 'successor' },
            ],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 1, script: [{ opcode: 0x0110, params: [] }] },
                { tagId: 2, script: [{ opcode: 0x0ff0, params: [] }] },
            ],
        };
        const runtime = createRuntime({
            type: 'ADS',
            adsSceneTag: 1,
            singleAdsScene: true,
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'handoff-test',
                resources: [{ id: 1, name: 'HANDOFF.TTM' }],
                scenes: [
                    {
                        tagId: { id: 1 },
                        script: [
                            { opcode: 0x1350, params: [1, 1] },
                            { opcode: 0x2005, params: [1, 2, 1, 1] },
                            { opcode: 0xfff0, params: [] },
                            { opcode: 0x1510, params: [] },
                            { opcode: 0xffff, params: [] },
                        ],
                    },
                ],
            },
        });
        const predecessor = getSceneState(runtime.state, 1, 1, 1, 1);
        predecessor.runState = 'finished';
        predecessor.state.played = true;
        runtime.state.scenes.push(predecessor);

        const result = runtime.tick(20);

        expect(result.presentation.compose).toBe(true);
        // Under the per-slot re-poll driver IF_PLAYED leaves the finished
        // predecessor PRESENT (present-as-finished, so a re-poll dedups on it)
        // rather than removing it, and stages the successor. The predecessor
        // lingers finished (composeTtmFrame ages it out so it stops drawing);
        // the successor is added and running.
        const successorScene = runtime.state.scenes.find((scene) => scene.tagId === 2);
        expect(successorScene).toBeDefined();
        expect(isTtmFinished(successorScene)).toBe(false);
        const lingeringPredecessor = runtime.state.scenes.find((scene) => scene.tagId === 1);
        expect(lingeringPredecessor).toBeDefined();
        expect(isTtmFinished(lingeringPredecessor)).toBe(true);
    });

    it('finishes a GOTO-looping child when its negative ADS run-count lifetime expires', () => {
        const ttm = {
            tags: [{ id: 1, description: 'looping action' }],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 1, script: [{ opcode: 0x1200, params: [1] }] },
            ],
        };
        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: (name) => (name === 'LOOP.TTM' ? ttm : undefined) },
            data: {
                name: 'test',
                resources: [{ id: 1, name: 'LOOP.TTM' }],
                scenes: [
                    {
                        tagId: { id: 1, description: 'test scene' },
                        script: [
                            { opcode: 0x1350, params: [1, 1] },
                            { opcode: 0xfff0, params: [] },
                            { opcode: 0x1510, params: [] },
                        ],
                    },
                ],
            },
        });
        const child = getSceneState(runtime.state, 1, 1, -3, 1);
        runtime.state.scenes.push(child);

        runtime.tick(20);
        runtime.tick(20);
        expect(child.runState).toBe('running');
        expect(child.state.played).toBe(false);

        runtime.tick(20);
        expect(child.runState).toBe('finished');
        expect(child.state.played).toBe(true);

        expect(runtime.tick(20).completed).toBe(true);
        expect(runtime.state.playedHistory.has('1:1')).toBe(true);
    });

    it('counts a time-limited child lifetime while its authored frame delay is waiting', () => {
        const ttm = {
            tags: [{ id: 1, description: 'slow loop' }],
            scenes: [
                { tagId: 0, script: [] },
                {
                    tagId: 1,
                    script: [
                        { opcode: 0x1020, params: [8] },
                        { opcode: 0x0ff0, params: [] },
                        { opcode: 0x1200, params: [1] },
                    ],
                },
            ],
        };
        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'test',
                resources: [{ id: 1, name: 'SLOW.TTM' }],
                scenes: [
                    {
                        tagId: { id: 1, description: 'test scene' },
                        script: [
                            { opcode: 0x1350, params: [1, 1] },
                            { opcode: 0xfff0, params: [] },
                            { opcode: 0x1510, params: [] },
                        ],
                    },
                ],
            },
        });
        const child = getSceneState(runtime.state, 1, 1, -3, 1);
        runtime.state.scenes.push(child);

        // SET_DELAY 8 rescales 16ms->20ms fine ticks: round(8 * 16 / 20) = 6.
        runtime.tick(20);
        expect(child.state.waitTicks).toBe(6);
        runtime.tick(20);
        expect(child.state.waitTicks).toBe(5);
        runtime.tick(20);

        expect(child.runState).toBe('finished');
        expect(child.state.played).toBe(true);
    });

    it('repeats a finite TTM body until its negative ADS run-count lifetime expires', () => {
        const ttm = {
            tags: [{ id: 1, description: 'finite fire cycle' }],
            scenes: [
                { tagId: 0, script: [] },
                {
                    tagId: 1,
                    script: [
                        { opcode: 0x0ff0, params: [] },
                        { opcode: 0x0110, params: [] },
                    ],
                },
            ],
        };
        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'test',
                resources: [{ id: 1, name: 'FIRE.TTM' }],
                scenes: [{ tagId: { id: 1 }, script: [{ opcode: 0x1350, params: [1, 1] }] }],
            },
        });
        const child = getSceneState(runtime.state, 1, 1, -5, 1);
        runtime.state.scenes.push(child);

        runtime.tick(20);
        expect(child.runState).toBe('running');
        expect(child.state.played).toBe(false);
        runtime.tick(20);
        expect(child.state.runs).toBe(1);

        runtime.tick(20);
        expect(child.runState).toBe('running');
        expect(child.state.played).toBe(false);
        runtime.tick(20);
        expect(child.state.runs).toBe(2);

        runtime.tick(20);
        expect(child.runState).toBe('finished');
        expect(child.state.played).toBe(true);
    });

    it('restarts a branch-rearmed child until ADS explicitly stops it', () => {
        const ttm = {
            tags: [{ id: 1, description: 'persistent fire cycle' }],
            scenes: [
                { tagId: 0, script: [] },
                {
                    tagId: 1,
                    script: [
                        { opcode: 0x0ff0, params: [] },
                        { opcode: 0x0110, params: [] },
                    ],
                },
            ],
        };
        const runtime = createRuntime({
            type: 'ADS',
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'test',
                resources: [{ id: 1, name: 'FIRE.TTM' }],
                scenes: [{ tagId: { id: 1 }, script: [{ opcode: 0x1350, params: [1, 1] }] }],
            },
        });
        const child = getSceneState(runtime.state, 1, 1, 0, 1);
        child.runMode = 'keep-going';
        runtime.state.scenes.push(child);

        for (let tick = 0; tick < 6; tick++) runtime.tick(20);

        expect(child.runState).toBe('running');
        expect(child.state.played).toBe(false);
        expect(child.state.runs).toBeGreaterThan(1);
        expect(child.execution.reason).toBe('restart-until-stopped');
    });

    it('skips (does not park) an IF_NOT_RUNNING guarded add while its child runs, taking it once the child stops', () => {
        const finiteScript = [
            { opcode: 0x0ff0, params: [] },
            { opcode: 0x0110, params: [] },
        ];
        const ttm = {
            tags: [
                { id: 1, description: 'first action' },
                { id: 2, description: 'dependent action' },
            ],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 1, script: finiteScript },
                { tagId: 2, script: finiteScript },
            ],
        };
        const runtime = createRuntime({
            type: 'ADS',
            adsSceneTag: 1,
            singleAdsScene: true,
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'same-branch',
                resources: [{ id: 1, name: 'ACTION.TTM' }],
                scenes: [
                    {
                        tagId: { id: 1 },
                        script: [
                            { opcode: 0x2005, params: [1, 1, 1, 1] },
                            { opcode: 0x1360, params: [1, 1] },
                            { opcode: 0x2005, params: [1, 2, 1, 1] },
                            { opcode: 0xfff0, params: [] },
                            { opcode: 0x1510, params: [] },
                            { opcode: 0xffff, params: [] },
                        ],
                    },
                ],
            },
        });

        // Tick 1: ADD 1:1, then IF_NOT_RUNNING 1:1 -- 1:1 is now running, so the
        // guard FAILS and the guarded ADD 1:2 is SKIPPED this tick (not parked on
        // a wait-barrier). Only 1:1 is live.
        expect(runtime.tick(20).completed).toBe(false);
        expect(runtime.state.currentScene).toBe(0);
        expect(runtime.state.scenes.map((scene) => scene.tagId)).toEqual([1]);
        expect(runtime.state.scenes.some((scene) => scene.tagId === 2)).toBe(false);

        // The re-poll re-evaluates the guard every tick. Once 1:1 stops running,
        // the guard passes and 1:2 is added; the gag then drains to completion
        // (currentScene advances to adsSceneEnd = 1). It must not park forever.
        let completed = false;
        let saw2WhileChildRan = false;
        for (let i = 0; i < 50 && !completed; i++) {
            const oneRunning = runtime.state.scenes.some(
                (scene) => scene.tagId === 1 && !isTtmFinished(scene),
            );
            const twoPresent = runtime.state.scenes.some((scene) => scene.tagId === 2);
            if (oneRunning && twoPresent) saw2WhileChildRan = true;
            completed = runtime.tick(20).completed;
        }
        expect(saw2WhileChildRan, '1:2 must not appear while 1:1 is still running').toBe(false);
        expect(completed).toBe(true);
        expect(runtime.state.currentScene).toBe(1);
    });

    it('rejects an unknown host-selected ADS tag', () => {
        expect(() =>
            createRuntime({
                type: 'ADS',
                adsSceneTag: 99,
                singleAdsScene: true,
                data: { name: 'test', resources: [], scenes: [] },
            }),
        ).toThrow('ADS scene 99 does not exist');
    });

    it('keeps the host-owned title state in sync with the night-mode control', () => {
        const oceans = ['day-0', 'day-1', 'day-2', 'night'];
        const runtime = createRuntime({
            type: 'ADS',
            game: { background: { oceans: ['O0', 'O1', 'O2', 'NIGHT'] } },
            titleState: Object.freeze({ island: true, night: false }),
            bkgOcean: oceans,
            data: { name: 'test', resources: [], scenes: [] },
        });
        runtime.state.scenes.push({
            state: {
                titleState: runtime.state.titleState,
                bkgOcean: oceans,
                bkgScreen: oceans[0],
            },
        });

        runtime.setNightMode(true);

        expect(runtime.state.titleState.night).toBe(true);
        expect(runtime.state.bkgScreen).toBe('night');
        expect(runtime.state.scenes[0].state.titleState.night).toBe(true);
        expect(runtime.state.scenes[0].state.bkgScreen).toBe('night');
    });

    it('uses an injected host-owned surface instead of allocating one', () => {
        const injected = createRecordingSurface();
        const runtime = createRuntime({ surface: injected });

        expect(runtime.state.surface).toBe(injected);
    });

    it('draws scenes in mutable ttmSequenceOrder so MOVE_SEQUENCE_TO_BACK re-layers', () => {
        // Two TTM sequences (campfire "1:3" and actor "1:21") both draw an
        // identifiable rect into the ONE shared raster every tick, forever
        // (KEEP_GOING), so #runTtmController's live paint order is what
        // decides which one lands on top each time.
        const ttm = {
            tags: [
                { id: 3, description: 'campfire' },
                { id: 21, description: 'actor' },
            ],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 3, script: [{ opcode: 0xa100, params: [10, 10, 5, 5] }] },
                { tagId: 21, script: [{ opcode: 0xa100, params: [50, 50, 5, 5] }] },
            ],
        };
        const surface = createRecordingSurface();
        const runtime = createRuntime({
            type: 'ADS',
            singleAdsScene: true,
            surface,
            resourceProvider: { resolve: () => ttm },
            data: {
                name: 'zorder-test',
                resources: [{ id: 1, name: 'SCENES.TTM' }],
                scenes: [{ tagId: { id: 1 }, script: [{ opcode: 0xffff, params: [] }] }],
            },
        });

        // Default paint order comes straight from resource declaration order.
        expect(runtime.state.ttmSequenceOrder).toEqual(['1:0', '1:3', '1:21']);

        const campfire = getSceneState(runtime.state, 1, 3, 0, 1);
        const actor = getSceneState(runtime.state, 1, 21, 0, 1);
        campfire.runMode = TtmRunMode.KEEP_GOING;
        actor.runMode = TtmRunMode.KEEP_GOING;
        runtime.state.scenes.push(campfire, actor);

        const drawnRectX = (surfaceRecording) =>
            surfaceRecording.commands.filter((command) => command.operation === 'fillRect').map((command) => command.x);

        runtime.tick(20);
        // Default order [1:3, 1:21] => actor (x=50) paints last, on top.
        expect(drawnRectX(surface)).toEqual([10, 50]);

        // Mutate the SAME array the runtime reads from every tick.
        const order = runtime.state.ttmSequenceOrder;
        moveSequenceToBack(order, 1, 3);
        expect(order).toEqual(['1:0', '1:21', '1:3']);

        surface.commands.length = 0;
        runtime.tick(20);
        // Live order now paints the campfire (x=10) last, on top of the actor.
        expect(drawnRectX(surface)).toEqual([50, 10]);
    });

    it('gates frame advancement to the 50ms WM_TIMER present, not every 20ms fine tick', () => {
        // A zero-delay KEEP_GOING scene that redraws every frame. Faithful to the
        // original, its frame must advance at most once per 50ms WM_TIMER present
        // (~every 2.5 fine ticks), not once per 20ms tick (which would be 50 fps).
        const ttm = {
            tags: [{ id: 3, description: 'fast loop' }],
            scenes: [
                { tagId: 0, script: [] },
                { tagId: 3, script: [{ opcode: 0xa100, params: [10, 10, 5, 5] }] },
            ],
        };
        const runtime = new DgdsRuntime({
            type: 'ADS',
            singleAdsScene: true,
            random: () => 0,
            timingCompatibility: createTimingCompatibility(),
            surfaceFactory: () => createRecordingSurface(),
            resourceProvider: { resolve: () => ttm },
            // NOTE: the faithful default present period (WM_TIMER_MS = 50ms) -- no override.
            data: {
                name: 'gate',
                resources: [{ id: 1, name: 'S.TTM' }],
                scenes: [{ tagId: { id: 1 }, script: [{ opcode: 0xffff, params: [] }] }],
            },
        });
        const scene = getSceneState(runtime.state, 1, 3, 0, 1);
        scene.runMode = TtmRunMode.KEEP_GOING;
        runtime.state.scenes.push(scene);

        let advances = 0;
        let lastRevision = scene.state.layerRevision || 0;
        for (let tick = 0; tick < 20; tick++) {
            runtime.tick(DGDS_TICK_MS);
            const revision = scene.state.layerRevision || 0;
            if (revision !== lastRevision) advances++;
            lastRevision = revision;
        }
        // 20 fine ticks * 20ms = 400ms of playback. At the 50ms present cadence
        // that is ~8 frame advances, NOT 20. (Un-gated, this would be ~20.)
        expect(advances).toBeGreaterThanOrEqual(6);
        expect(advances).toBeLessThanOrEqual(10);
    });
});

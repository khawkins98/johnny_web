import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';
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
                clearForeground: true,
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
        expect(runtime.state.currentScene).toBe(1);
        expect(runtime.state.scenes.map((scene) => scene.tagId)).toEqual([1]);

        expect(runtime.tick(20).completed).toBe(false);
        expect(runtime.tick(20).completed).toBe(false);
        expect(runtime.tick(20).completed).toBe(true);
        expect(runtime.state.scenes).toEqual([]);
        expect(runtime.state.playedHistory.has('1:1')).toBe(true);
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
        expect(child.lifecycle).toBe('running');
        expect(child.state.played).toBe(false);

        runtime.tick(20);
        expect(child.lifecycle).toBe('completed');
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

        runtime.tick(20);
        expect(child.state.waitTicks).toBe(8);
        runtime.tick(20);
        expect(child.state.waitTicks).toBe(7);
        runtime.tick(20);

        expect(child.lifecycle).toBe('completed');
        expect(child.state.played).toBe(true);
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
});

import { describe, expect, it } from 'vitest';
import { DgdsRuntime } from '../runtime.mjs';
import { createTimingCompatibility } from '../timing-compatibility.mjs';

const createSurface = () => ({ clear() {} });

const createRuntime = overrides => new DgdsRuntime({
    type: 'TTM',
    data: { scripts: undefined },
    island: 0,
    random: () => 0,
    compatibility: {},
    timingCompatibility: createTimingCompatibility(),
    surfaceFactory: createSurface,
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
        expect(() => new DgdsRuntime({
            random: () => 0,
            timingCompatibility: createTimingCompatibility(),
        })).toThrow('surfaceFactory');
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
    });

    it('returns logical audio operations from the current tick', () => {
        const runtime = createRuntime({
            data: {
                scripts: [{ opcode: 0xc050, params: [6] }],
            },
        });

        expect(runtime.tick(1000 / 60)).toMatchObject({
            completed: true,
            audioOperations: [{
                type: 'play-sample',
                sample: 6,
                tick: 1,
            }],
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

        expect(result.frameOperations).toMatchObject([{
            type: 'fill-rect',
            x: 5,
            y: 6,
            width: 7,
            height: 8,
            tick: 1,
        }]);
        expect(result.frameOperations[0]).not.toHaveProperty('surface');
        expect(result.frameOperations[0]).not.toHaveProperty('canvas');
    });

    it('returns host presentation intent instead of drawing to Canvas', () => {
        const runtime = createRuntime({
            type: 'ADS',
            entries: [],
            data: {
                name: 'test',
                resources: [],
                scenes: [{
                    tagId: { id: 1, description: 'test scene' },
                    script: [{ opcode: 0xffff, params: [] }],
                }],
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
});

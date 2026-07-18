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
});

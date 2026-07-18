import { describe, expect, it } from 'vitest';
import { createTraceRecorder, traceEvent } from '../trace.mjs';

describe('structured DGDS tracing', () => {
    it('records deterministic JSON Lines with engine and scene identity', () => {
        const trace = createTraceRecorder();
        const state = {
            trace,
            tick: 12,
            sceneIdx: 1,
            tagId: 9,
        };

        traceEvent(state, 'draw-sprite', { frame: 22, x: 366, y: 279 });

        expect(trace.snapshot()).toEqual([{
            sequence: 0,
            type: 'draw-sprite',
            tick: 12,
            sceneIdx: 1,
            tagId: 9,
            frame: 22,
            x: 366,
            y: 279,
        }]);
        expect(trace.toJSONLines()).toBe(
            '{"sequence":0,"type":"draw-sprite","tick":12,"sceneIdx":1,"tagId":9,"frame":22,"x":366,"y":279}\n',
        );
    });

    it('can be reset between deterministic runs', () => {
        const trace = createTraceRecorder({ pixelHashes: true });
        trace.record('composition', { tick: 1 });
        trace.clear();
        trace.record('composition', { tick: 1 });

        expect(trace.pixelHashes).toBe(true);
        expect(trace.snapshot()[0]).toMatchObject({ sequence: 0, tick: 1 });
    });
});

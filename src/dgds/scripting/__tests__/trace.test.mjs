import { describe, expect, it, vi } from 'vitest';
import { createTraceRecorder, downloadJSONLines, traceFilename } from '../trace.mjs';
import { traceEvent } from '../trace-event.mjs';

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

        expect(trace.snapshot()).toEqual([
            {
                sequence: 0,
                type: 'draw-sprite',
                tick: 12,
                sceneIdx: 1,
                tagId: 9,
                frame: 22,
                x: 366,
                y: 279,
            },
        ]);
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

    it('does not let payload detail overwrite the structured event type', () => {
        const trace = createTraceRecorder();
        trace.record('host-interlude', { type: 'walk', phase: 'start' });

        expect(trace.snapshot()).toEqual([
            { sequence: 0, type: 'host-interlude', detailType: 'walk', phase: 'start' },
        ]);
    });

    it('starts with a session header and stops recording when disabled', () => {
        const trace = createTraceRecorder();
        trace.startSession({ enabledAt: '2026-07-18T12:00:00.000Z', mode: 'trace' });
        trace.record('composition', { tick: 4 });
        trace.stopSession({ tick: 5 });
        trace.record('composition', { tick: 6 });

        expect(trace.snapshot().map((event) => event.type)).toEqual(['session-start', 'composition', 'session-stop']);
        expect(trace.active).toBe(false);
    });

    it('keeps a bounded rolling window and reports dropped events', () => {
        const trace = createTraceRecorder({ maxEvents: 2 });
        trace.record('first');
        trace.record('second');
        trace.record('third');

        expect(trace.snapshot().map((event) => event.type)).toEqual(['second', 'third']);
        expect(trace.dropped).toBe(1);
    });

    it('persists JSONL to the localhost trace endpoint', async () => {
        const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ path: 'traces/example.jsonl' }) }));
        vi.stubGlobal('fetch', fetch);
        const trace = createTraceRecorder();
        trace.record('browser-presentation', { tick: 1 });

        await expect(trace.persist()).resolves.toEqual({ path: 'traces/example.jsonl' });
        expect(fetch).toHaveBeenCalledWith('/__dgds_trace', {
            method: 'POST',
            headers: { 'content-type': 'application/x-ndjson' },
            body: '{"sequence":0,"type":"browser-presentation","tick":1}\n',
        });
        vi.unstubAllGlobals();
    });

    it('supplies a stable trace id when overwriting a localhost session snapshot', async () => {
        const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ path: 'traces/session.jsonl' }) }));
        vi.stubGlobal('fetch', fetch);
        const trace = createTraceRecorder();

        await trace.persist('/__dgds_trace', { traceId: 'session-7' });

        expect(fetch.mock.calls[0][1].headers).toEqual({
            'content-type': 'application/x-ndjson',
            'x-dgds-trace-id': 'session-7',
        });
        vi.unstubAllGlobals();
    });

    it('downloads JSONL with a timestamped filename', () => {
        const click = vi.fn();
        const remove = vi.fn();
        const anchor = { style: {}, click, remove };
        const documentRef = {
            createElement: vi.fn(() => anchor),
            body: { appendChild: vi.fn() },
        };
        const urlRef = {
            createObjectURL: vi.fn(() => 'blob:trace'),
            revokeObjectURL: vi.fn(),
        };
        const filename = traceFilename(new Date('2026-07-18T16:18:06.014Z'));

        expect(
            downloadJSONLines('{"type":"session-start"}\n', {
                filename,
                documentRef,
                urlRef,
            }),
        ).toEqual({ filename: 'dgds-2026-07-18T16:18:06.014Z.jsonl' });
        expect(anchor).toMatchObject({ href: 'blob:trace', download: filename });
        expect(documentRef.body.appendChild).toHaveBeenCalledWith(anchor);
        expect(click).toHaveBeenCalledOnce();
        expect(remove).toHaveBeenCalledOnce();
        expect(urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:trace');
    });
});

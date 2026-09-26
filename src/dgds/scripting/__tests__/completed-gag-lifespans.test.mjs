import { describe, expect, it } from 'vitest';
import { completedGagLifespans } from '../../../../tools/faithfulness-oracle/completed-gag-lifespans.mjs';
import { summarizeLiveSamples } from '../../../../tools/faithfulness-oracle/fingerprint.mjs';

const asTimeline = (rows) => rows.map((live, t) => JSON.stringify({ t, live })).join('\n');

describe('completed original gag lifespans', () => {
    it('splits on ADS reloads, keeps internal blank ticks, and excludes the timeout tail', () => {
        const timeline = asTimeline([
            [], ['2:1'], ['2:1'], [], ['2:1', '2:3'], [],
            ['2:1'], ['2:1'], ['2:1'], ['2:3'], [],
            ['2:1'], ['2:1'], // final gag has no following reload
        ]);
        const trace = [
            '1 ads-loader id=0065',
            ...Array.from({ length: 6 }, (_, i) => `${i + 2} tick x`),
            '8 ads-loader id=0065',
            ...Array.from({ length: 5 }, (_, i) => `${i + 9} tick x`),
            '14 ads-loader id=0065',
            '15 tick x', '16 tick x',
        ].join('\n');
        const result = completedGagLifespans(trace, timeline, 0x65);
        expect(result.loaderStarts).toEqual([0, 6, 11]);
        expect(result.completedEpisodes).toBe(2);
        expect(result.censoredEpisodes).toBe(1);
        expect(result.occupancy).toEqual({
            '2:1': { min: 3, max: 3 },
            '2:3': { min: 1, max: 1 },
        });
        expect(result.spanLifespans).toEqual({
            '2:1': { min: 1, max: 3 },
            '2:3': { min: 1, max: 1 },
        });
        expect(result.occurrences).toEqual({
            '2:1': { min: 1, max: 2 },
            '2:3': { min: 1, max: 1 },
        });
    });

    it('records no duration when the only gag has not finished', () => {
        const result = completedGagLifespans('1 ads-loader id=0065\n2 tick x',
            asTimeline([['2:1']]), 0x65);
        expect(result.completedEpisodes).toBe(0);
        expect(result.censoredEpisodes).toBe(1);
        expect(result.occupancy).toEqual({});
        expect(result.spanLifespans).toEqual({});
        expect(result.occurrences).toEqual({});
    });
});

describe('browser actor spans', () => {
    it('counts one live sample per key but retains duplicate instances for concurrency', () => {
        const result = summarizeLiveSamples([
            ['1:21', '1:21'], ['1:21'], [], ['1:21'],
        ]);
        expect(result.maxConc).toBe(2);
        expect(result.actorTicks['1:21']).toBe(3);
        expect(result.actorSpanTicks['1:21']).toEqual({ min: 1, max: 2 });
        expect(result.actorOccurrences['1:21']).toBe(2);
    });
});

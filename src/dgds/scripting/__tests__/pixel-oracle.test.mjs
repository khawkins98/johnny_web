// Pixel oracle (tools/faithfulness-oracle/pixel-oracle): unit checks of the pure
// alignment and scoring code, plus the local-only gate against a real capture of
// the original (skipped without game data or a capture, like the other oracle tests).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { alignSpans, pickKeyframes, toSpans } from '../../../../tools/faithfulness-oracle/pixel-oracle/align.mjs';
import { SoftCanvas } from '../../../../tools/faithfulness-oracle/pixel-oracle/soft-canvas.mjs';
import {
    HEIGHT,
    WIDTH,
    foregroundShift,
    hostRemnantMask,
    scoreFrame,
} from '../../../../tools/faithfulness-oracle/pixel-oracle/score.mjs';
import { hasData } from './support/drive-gag.mjs';

const N = WIDTH * HEIGHT;
const rgb = (fill = [0, 0, 0]) => {
    const a = new Uint8Array(N * 3);
    for (let p = 0; p < N; p++) a.set(fill, p * 3);
    return a;
};
const rgba = () => new Uint8ClampedArray(N * 4);
const box = (img, channels, x0, y0, w, h, color) => {
    for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) img.set(color, (y * WIDTH + x) * channels);
    }
};

describe('pixel oracle alignment', () => {
    it('cuts live-set spans and skips empty gaps', () => {
        const live = [[], ['1:1'], ['1:1'], [], ['1:2'], ['1:2', '3:1']];
        expect(toSpans(live)).toEqual([
            { key: '1:1', start: 1, end: 3 },
            { key: '1:2', start: 4, end: 5 },
            { key: '1:2 3:1', start: 5, end: 6 },
        ]);
    });

    it('aligns span sequences by key, weighting by original samples', () => {
        const orig = toSpans([[], ['a'], ['a'], ['x'], ['b'], ['b'], ['b']]);
        const ours = toSpans([[], ['a'], ['a'], ['a'], ['a'], ['b'], ['b'], ['b'], ['b'], ['b']]);
        const { pairs, matchedOrig, totalOrig } = alignSpans(orig, ours);
        expect(pairs).toEqual([
            [0, 0],
            [2, 1],
        ]);
        expect(matchedOrig).toBe(5);
        expect(totalOrig).toBe(6);
        const frames = pickKeyframes({ orig, ours, pairs });
        expect(frames[0]).toMatchObject({ origTick: 1, ourTick: 1, kind: 'transition' });
        expect(frames.some((f) => f.kind === 'mid')).toBe(false);
        expect(frames.at(-1)).toMatchObject({ origTick: 4, ourTick: 5, kind: 'transition' });
    });
});

describe('pixel oracle scoring', () => {
    const backdrop = () => {
        const b = rgb();
        box(b, 3, 100, 100, 200, 100, [0, 0, 200]); // title-screen leftovers
        return b;
    };

    it('scores an identical sprite as a match and ignores untouched host pixels', () => {
        const orig = backdrop();
        box(orig, 3, 10, 10, 20, 20, [255, 0, 0]);
        const fg = rgba();
        box(fg, 4, 10, 10, 20, 20, [255, 0, 0, 255]);
        const s = scoreFrame({ orig, backdrop: backdrop(), fg, bg: rgba(), bgKind: 'none' });
        expect(s.mask).toBe(400);
        expect(s.diff).toBe(0);
    });

    it('classifies original-only drawing, black plate restores and stale rows', () => {
        const orig = backdrop();
        box(orig, 3, 400, 50, 10, 10, [0, 255, 0]); // only the original drew this
        box(orig, 3, 100, 100, 10, 10, [0, 0, 0]); // plate restore over the leftovers
        box(orig, 3, 0, 400, 10, 10, [255, 255, 0]); // stale screen below row 350
        const s = scoreFrame({ orig, backdrop: backdrop(), fg: rgba(), bg: rgba(), bgKind: 'none' });
        expect(s.origOnly).toBe(100);
        expect(s.eb0).toBe(100);
        expect(s.stale).toBe(100);
        expect(s.diff).toBe(100);
        // over the original backdrop the plate restore is visible too
        expect(s.diffOnBackdrop).toBe(200);
    });

    it('learns a clean palette substitution instead of counting it', () => {
        const orig = rgb();
        box(orig, 3, 50, 50, 20, 20, [192, 220, 192]);
        const fg = rgba();
        box(fg, 4, 50, 50, 20, 20, [212, 212, 212, 255]);
        const s = scoreFrame({ orig, backdrop: rgb(), fg, bg: rgba(), bgKind: 'none' });
        expect(s.remapped).toBe(400);
        expect(s.diff).toBe(0);
        expect(s.rawDiffPct).toBe(100);
    });

    it('finds a one-pixel foreground offset', () => {
        const orig = rgb();
        const fg = rgba();
        for (let i = 0; i < 40; i++) {
            const c = [(i * 37) % 256, (i * 91) % 256, 255];
            box(orig, 3, 101 + i, 100, 1, 30, c);
            box(fg, 4, 100 + i, 100, 1, 30, [...c, 255]);
        }
        expect(foregroundShift({ orig, fg })).toMatchObject({ dx: 1, dy: 0, rate: 1 });
    });

    it('masks host drawing our first frame does not explain', () => {
        const first = rgb();
        box(first, 3, 300, 300, 30, 5, [0, 0, 255]); // host waves
        box(first, 3, 10, 10, 5, 5, [255, 0, 0]); // the gag's sprite
        const fg = rgba();
        box(fg, 4, 11, 10, 5, 5, [255, 0, 0, 255]);
        const ignore = hostRemnantMask({ first, backdrop: rgb(), fg, bg: rgba(), bgKind: 'none' });
        expect(ignore.reduce((a, b) => a + b, 0)).toBe(150);
    });
});

describe('soft canvas', () => {
    it('mirrors drawImage under scale(-1, 1) like Canvas 2D', () => {
        const src = new SoftCanvas(2, 1);
        src.data.set([255, 0, 0, 255, 0, 255, 0, 255]);
        const dst = new SoftCanvas(4, 1);
        const ctx = dst.getContext('2d');
        ctx.save();
        ctx.translate(1 + 2, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(src, 0, 0);
        ctx.restore();
        expect([...dst.data]).toEqual([0, 0, 0, 0, 0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0]);
    });
});

// Local-only gate: SUZY.ADS #1 is faithful once the background is composited.
const here = path.dirname(fileURLToPath(import.meta.url));
const suzyCapture = path.resolve(here, '../../../../scratchpad/pixel-oracle/captures/SUZY_1');
describe.skipIf(!hasData || !existsSync(path.join(suzyCapture, 'timeline.jsonl')))('pixel oracle gate (local capture)', () => {
    it('scores SUZY:1 faithful against the original', async () => {
        const { compareGag } = await import('../../../../tools/faithfulness-oracle/pixel-oracle/compare.mjs');
        const result = compareGag({ gag: 'SUZY:1', captureDir: suzyCapture, seeds: 4 });
        expect(result.coverage).toBeGreaterThanOrEqual(95);
        expect(result.alignedMedian).toBeLessThanOrEqual(2);
        expect(result.alignedMax).toBeLessThanOrEqual(8);
    }, 180000);
});

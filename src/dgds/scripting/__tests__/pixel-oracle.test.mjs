// Pixel oracle (tools/faithfulness-oracle/pixel-oracle): unit checks of the pure
// alignment and scoring code, plus the local-only gate against a real capture of
// the original (skipped without game data or a capture, like the other oracle tests).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { alignSpans, pickKeyframes, searchWindows, toSpans } from '../../../../tools/faithfulness-oracle/pixel-oracle/align.mjs';
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
        expect(frames[0]).toMatchObject({ origTick: 1, ourTick: 1, kind: 'first-frame' });
        expect(frames.some((f) => f.kind === 'mid')).toBe(false);
        expect(frames.at(-1)).toMatchObject({ origTick: 4, ourTick: 5, kind: 'transition' });
    });

    it("gives the gag's first frame its own keyframe kind when both first spans match", () => {
        const orig = toSpans([[], ['a'], ['a'], ['b'], ['b']]);
        const ours = toSpans([[], ['a'], ['a'], ['a'], ['b'], ['b']]);
        const frames = pickKeyframes({ orig, ours, pairs: alignSpans(orig, ours).pairs });
        expect(frames.map((f) => f.kind)).toEqual(['first-frame', 'transition']);
        expect(frames[0]).toMatchObject({ origTick: 1, ourTick: 1, span: 0 });
    });

    it('keeps a plain transition when our first span is not the matched one', () => {
        // our seed took another branch first: span 0 of ours is unmatched
        const orig = toSpans([[], ['b'], ['b']]);
        const ours = toSpans([[], ['x'], ['b'], ['b']]);
        const frames = pickKeyframes({ orig, ours, pairs: alignSpans(orig, ours).pairs });
        expect(frames.map((f) => f.kind)).toEqual(['transition']);
    });
});

describe('pixel oracle search windows', () => {
    const has = (ticks) => (t) => ticks.includes(t);
    it('keeps a transition at the base window, shifting each original candidate by its sample offset', () => {
        // The original's first live tick has no dump; its next sample is about 3 of our ticks later.
        const w = searchWindows({ kf: { kind: 'transition', origTick: 1, ourTick: 1 }, ourSpanLen: 300, hasFrame: has([0, 2]) });
        expect(w).toEqual([
            { origTick: 0, from: 1, to: 4 },
            { origTick: 2, from: 1, to: 10 },
        ]);
    });
    it("extends the first frame's window forward by our measured first-frame hold only", () => {
        // The original passes a loading first frame at its next sample (the load's
        // wall time eats the hold); ours holds it for the authored delay. Our second
        // frame can therefore be up to `firstFrameHold` ticks later than mapped.
        const kf = { kind: 'first-frame', origTick: 1, ourTick: 1 };
        expect(searchWindows({ kf, ourSpanLen: 300, hasFrame: has([2]), firstFrameHold: 11 })).toEqual([
            { origTick: 2, from: 1, to: 21 },
        ]);
        // without a measured hold it is an ordinary transition window
        expect(searchWindows({ kf, ourSpanLen: 300, hasFrame: has([2]) })).toEqual([{ origTick: 2, from: 1, to: 10 }]);
        // a long first-frame hold (MARY:5, STAND:11) is capped like a mid-span window
        expect(searchWindows({ kf, ourSpanLen: 300, hasFrame: has([2]), firstFrameHold: 325 })).toEqual([
            { origTick: 2, from: 1, to: 50 },
        ]);
        // the hold never widens other kinds
        const t = { kind: 'transition', origTick: 1, ourTick: 1 };
        expect(searchWindows({ kf: t, ourSpanLen: 300, hasFrame: has([2]), firstFrameHold: 11 })).toEqual([
            { origTick: 2, from: 1, to: 10 },
        ]);
    });
    it('widens a mid-span keyframe with the span length, capped', () => {
        const short = searchWindows({ kf: { kind: 'mid', origTick: 50, ourTick: 100 }, ourSpanLen: 20, hasFrame: has([50]) });
        expect(short).toEqual([{ origTick: 50, from: 94, to: 106 }]);
        const mid = searchWindows({ kf: { kind: 'mid', origTick: 50, ourTick: 100 }, ourSpanLen: 140, hasFrame: has([50]) });
        expect(mid).toEqual([{ origTick: 50, from: 72, to: 128 }]);
        const long = searchWindows({ kf: { kind: 'mid', origTick: 50, ourTick: 100 }, ourSpanLen: 1000, hasFrame: has([50]) });
        expect(long).toEqual([{ origTick: 50, from: 60, to: 140 }]);
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

describe('forced host offsets', () => {
    // FUN_1010_00fc: TTM sprites at 30c6 + 1, or 30c6 + 0x111 for LEFT_ISLAND (0x400).
    // A forced capture never runs the island bake or the planner, so 30c6 = 0 and
    // 30b4 != 2: every forced scene, off-island ones included, gets 1 or 273.
    it('matches the binary with 30c6 = 0', async () => {
        const { forcedTitleState } = await import('../../../../tools/faithfulness-oracle/pixel-oracle/render-ours.mjs');
        expect(forcedTitleState('SUZY.ADS', 1).sceneOffset).toEqual({ x: 1, y: 0 });
        expect(forcedTitleState('BUILDING.ADS', 4).sceneOffset).toEqual({ x: 1, y: 0 });
        expect(forcedTitleState('FISHING.ADS', 4).sceneOffset).toEqual({ x: 273, y: 0 });
        expect(forcedTitleState('MARY.ADS', 5).sceneOffset).toEqual({ x: 273, y: 0 });
    });
});

describe('normal-play capture parsing (host log)', async () => {
    const np = await import('../../../../tools/faithfulness-oracle/pixel-oracle/normal-play.mjs');
    const hc = await import('../../../../tools/faithfulness-oracle/pixel-oracle/host-check.mjs');
    const log = [
        '#SCRANTIC host: header',
        'HOST 0 clk=0 day=1,1 hol=0 ph=1 b4=0 b2=0 c0=0 c2=1 c4=92 c6=-214 off=92,-213 qi=0 q=105:5,255:1,101:6',
        'HOST 238 clk=924 day=1,1 hol=0 ph=1 b4=0 b2=0 c0=0 c2=1 c4=92 c6=-214 off=92,-213 qi=1 q=105:5,255:1,101:6',
        'HOST 300 clk=1200 day=1,1 hol=0 ph=1 b4=0 b2=0 c0=0 c2=1 c4=92 c6=-214 off=92,-213 qi=2 q=105:5,255:1,101:6',
        'HOST 900 clk=4000 day=1,1 hol=0 ph=13 b4=0 b2=1 c0=2 c2=0 c4=20 c6=0 off=20,1 qi=0 q=110:1,102:2',
        'HOST 1500 clk=7000 day=1,1 hol=0 ph=13 b4=0 b2=1 c0=2 c2=0 c4=20 c6=0 off=20,1 qi=1 q=110:1,102:2',
    ].join('\n');

    it('names catalogue records the way the binary numbers ADS ids', () => {
        expect(np.gagName({ adsId: 105, tag: 5 })).toBe('JOHNNY#5');
        expect(np.gagName({ adsId: 110, tag: 1 })).toBe('VISITOR#1');
        expect(np.gagName({ adsId: 255, tag: 1 })).toBe('POSE');
    });

    it('parses HOST lines with signed origins and the planned queue', () => {
        const states = np.parseHostLog(log);
        expect(states).toHaveLength(5);
        expect(states[0]).toMatchObject({ tick: 0, clk: 0, day: 1, dayCur: 1, phase: 1, tideCoin: 1, x: -214, y: 92, qi: 0 });
        expect(states[0].offset).toEqual({ x: 92, y: -213 });
        expect(states[0].queue).toEqual([
            { adsId: 105, tag: 5 },
            { adsId: 255, tag: 1 },
            { adsId: 101, tag: 6 },
        ]);
    });

    it('cuts batches at queue changes and times each record from the qi steps', () => {
        const batches = np.batchesFromHost(np.parseHostLog(log), { endTick: 2000 });
        expect(batches).toHaveLength(2);
        const [a, b] = batches;
        expect(a).toMatchObject({ startTick: 0, endTick: 900, lowTide: true, night: false, wavesOff: false, layout: 'random', ending: 'ACTIVITY#6', complete: true });
        expect(a.queue).toEqual(['JOHNNY#5', 'POSE', 'ACTIVITY#6']);
        expect(a.gags.map((g) => [g.key, g.startTick])).toEqual([
            ['JOHNNY#5', 0],
            ['POSE', 238],
            ['ACTIVITY#6', 300],
        ]);
        // phase 13 is night; 0x1000 on BUILDING#2 stills the waves; 0x10 on VISITOR#1 pins layout 1
        expect(b).toMatchObject({ startTick: 900, endTick: 2000, night: true, wavesOff: true, layout: 'fixed1', origin: { x: 0, y: 20 }, complete: false });
    });

    it('classifies the folded layout word and the raft frame', () => {
        expect(np.layoutClass({ layoutBits: 2, offIsland: false })).toBe('fixed1');
        expect(np.layoutClass({ layoutBits: 1, offIsland: false })).toBe('fixed2');
        expect(np.layoutClass({ layoutBits: 0x28, offIsland: false })).toBe('random/q28');
        expect(np.layoutClass({ layoutBits: 0, offIsland: true })).toBe('off-island');
        expect([1, 2, 3, 6, 9].map((d) => np.raftFrameFor(d))).toEqual([1, 1, 2, 5, 5]);
        expect(np.raftFrameFor(4, true)).toBe(0);
    });

    it("builds the bake's titleState from a batch", () => {
        const [a] = np.batchesFromHost(np.parseHostLog(log));
        const ts = np.batchTitleState(a, { oceanIndex: 2 });
        expect(ts).toMatchObject({ island: true, islandLayoutId: 1, x: -214, y: 92, lowTide: true, night: false, raft: 1, waves: true, oceanIndex: 2, storyDay: 1 });
        expect(ts.sceneOffset).toEqual({ x: 92, y: -213 });
        expect(ts.clouds).toEqual([]);
    });

    it('summarises the story mix, including anti-repeat and the phase split of the tide coin', () => {
        const mk = (ending, phase, lowTide, extra = []) => ({
            queue: [...extra, ending],
            ending,
            phase,
            lowTide,
            night: phase >= 12,
            forcedNight: false,
            offIsland: false,
            wavesOff: false,
            layout: 'fixed1',
            origin: { x: 0, y: 20 },
            day: 1,
            complete: true,
        });
        const run = {
            name: 'r',
            batches: [mk('A#1', 1, false, ['VISITOR#1']), mk('B#2', 2, true), mk('A#1', 13, true), mk('A#1', 13, false)],
        };
        const mix = np.storyMix([run]);
        expect(mix.batches).toBe(4);
        expect(mix.endings[0]).toEqual({ key: 'A#1', count: 3, pct: 75 });
        expect(mix.antiRepeat).toEqual({ pairsChecked: 3, repeatPrev: 1, triplesChecked: 2, repeatTwoBack: 1 });
        expect(mix.lowTide.dayPhase).toEqual({ n: 2, low: 1 });
        expect(mix.lowTide.nightPhase).toEqual({ n: 2, low: 1 });
        expect(mix.visitor1).toMatchObject({ batches: 1, pct: 25 });
        expect(np.renderStoryMix(mix)).toContain('| A#1 | 3 | 75% |');
    });

    it('judges a host-canvas result on island, ocean and waves only', () => {
        const ok = { neverIslandPct: 0.1, neverOceanPct: 0.2, neverSkyPct: 9, waves: { samples: 10, matchedPct: 100 } };
        expect(np.hostVerdict(ok)).toBe('faithful');
        expect(np.hostVerdict({ ...ok, neverOceanPct: 3 })).toBe('divergent: ocean');
        expect(np.hostVerdict({ ...ok, neverIslandPct: 1, waves: { samples: 10, matchedPct: 50 } })).toBe('divergent: island, waves');
        expect(np.hostVerdict({ skipped: 'off-island' })).toBe('skipped');
    });

    it('counts the RNG draws before and during the first planner call', async () => {
        const { firstPlannerDraws } = await import('../../../../tools/faithfulness-oracle/pixel-oracle/align-planner.mjs');
        const trace = [
            '#SCRANTIC trace',
            'RNG 1 entry_ic=1 caller=140F:1EF0 i=55 j=24 ti=DA2D tj=0FDE sum=EA0B ax=EA0B',
            'RNG 2 entry_ic=2 caller=140F:1EF0 i=0 j=25 ti=DD23 tj=4D8E sum=2AB1 ax=2AB1',
            '100 director 140F:06BF ret=141F:15E6 args=0001,1310,044A,0000 ax=13BF bx=1310',
            'RNG 3 entry_ic=3 caller=140F:0DA3 i=1 j=26 ti=9533 tj=FC7D sum=91B0 ax=91B0',
            'RNG 4 entry_ic=4 caller=140F:0E67 i=2 j=27 ti=F3CD tj=8D38 sum=8105 ax=8105',
            'RNG 5 entry_ic=5 caller=140F:0E67 i=3 j=28 ti=4BC2 tj=5948 sum=A50A ax=A50A',
            '200 ads-loader id=0068',
            'RNG 6 entry_ic=6 caller=13DF:0D5C i=4 j=29 ti=F7E2 tj=E36F sum=DB51 ax=DB51',
        ].join('\n');
        expect(firstPlannerDraws(trace)).toEqual({
            before: 2,
            during: 3,
            callers: [
                ['140F:0E67', 2],
                ['140F:0DA3', 1],
            ],
        });
    });

    it('samples the first two dumps of a batch and spreads the rest', () => {
        const frames = new Map([0, 1, 2, 16, 32, 48, 64, 80, 96, 112, 128, 144].map((t) => [t, `t${t}`]));
        const ticks = hc.sampleTicks(frames, { startTick: 0, endTick: 150 }, 6);
        expect(ticks.slice(0, 2)).toEqual([0, 1]);
        expect(ticks).toHaveLength(6);
        expect(ticks.at(-1)).toBeGreaterThanOrEqual(112);
        expect(hc.sampleTicks(frames, { startTick: 100, endTick: null }, 6)).toEqual([112, 128, 144]);
        const black = new Uint8Array(640 * 480 * 3);
        expect(hc.blackShare(black)).toBe(1);
        black.fill(200, 0, 640 * 480 * 3 * 0.5);
        expect(hc.blackShare(black)).toBeCloseTo(0.5, 3);
        expect(hc.horizonRow(false)).toBe(150);
        expect(hc.horizonRow(true)).toBe(205);
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

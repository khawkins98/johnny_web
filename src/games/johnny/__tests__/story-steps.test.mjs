import { describe, expect, it } from 'vitest';
import { JOHNNY_SCENES } from '../story-controller.mjs';
import {
    TIDE_BANDS, bandById, bandForPhase, describeTideWindow, describeWhenItPlays, gagCountsByBand, gagFacts, gagsFor,
    keySceneFor, visitSequence,
} from '../story-steps.mjs';

describe('tide bands', () => {
    it('cover all 16 phases with no gaps', () => {
        for (let phase = 0; phase < 16; phase++) expect(bandForPhase(phase)).not.toBeNull();
        expect(bandForPhase(7).id).toBe('early');
        expect(bandForPhase(8).id).toBe('late');
        expect(bandForPhase(12).id).toBe('night');
        expect(bandForPhase(null)).toBeNull();
    });

    it('line up with every tide window edge in the catalogue', () => {
        const edges = new Set(TIDE_BANDS.flatMap((band) => [band.min, band.max]));
        for (const record of JOHNNY_SCENES) {
            expect(edges.has(record.tideMin)).toBe(true);
            expect(edges.has(record.tideMax)).toBe(true);
        }
    });
});

describe('gagsFor', () => {
    it('puts the day key scene first and excludes other days\' key scenes', () => {
        const gags = gagsFor(7, bandById('early'));
        expect(gags[0]).toMatchObject({ script: 'MARY.ADS', tagId: 4, keyDay: 7 });
        expect(gags.filter((gag) => gag.keyDay)).toHaveLength(1);
    });

    it('applies tide windows by band to common gags only', () => {
        const key = (gag) => gag.key;
        // BUILDING#9 is [12,16): night only.
        expect(gagsFor(1, bandById('night')).map(key)).toContain('BUILDING.ADS:9');
        expect(gagsFor(1, bandById('early')).map(key)).not.toContain('BUILDING.ADS:9');
        // A key scene is reached through the keyframe gate, which ignores the window:
        // day 5's MARY#1 is [12,16) but can end a daytime visit (captures: JOHNNY#6 and
        // JOHNNY#1 played by day). So it is listed in every band on its day.
        for (const band of TIDE_BANDS) {
            expect(gagsFor(5, band)[0]).toMatchObject({ script: 'MARY.ADS', tagId: 1, keyDay: 5 });
        }
        // Day 4's MARY#3 is [8,16) and still heads the early-day list (captured at phase 5).
        expect(gagsFor(4, bandById('early'))[0]).toMatchObject({ script: 'MARY.ADS', tagId: 3, keyDay: 4 });
        // Another day's key scene never appears.
        expect(gagsFor(4, bandById('night')).filter((gag) => gag.keyDay)).toHaveLength(1);
    });

    it('lists ACTIVITY#11, which plays alone or opens a visit', () => {
        expect(gagsFor(1, bandById('early')).map((gag) => gag.key)).toContain('ACTIVITY.ADS:11');
    });

    it('leaves out idle fillers and orders the rest by weight', () => {
        const gags = gagsFor(1, bandById('late')).filter((gag) => !gag.keyDay);
        expect(gags.some((gag) => gag.script === 'POSE' || gag.script === 'STAND.ADS')).toBe(false);
        expect(gags.map((gag) => gag.weight)).toEqual([...gags.map((gag) => gag.weight)].sort((a, b) => b - a));
    });

    it('counts gags per band', () => {
        const counts = gagCountsByBand(1);
        expect(Object.keys(counts)).toEqual(['early', 'late', 'night']);
        expect(counts.early).toBe(gagsFor(1, bandById('early')).length);
    });

    it('finds key scenes for days that have one', () => {
        expect(keySceneFor(1)).toMatchObject({ script: 'MARY.ADS', tagId: 2 });
        expect(keySceneFor(0)).toBeNull();
    });
});

describe('visitSequence', () => {
    it('orders the visit and folds back-to-back poses', () => {
        const visit = visitSequence({
            seen: [{ script: 'FISHING.ADS', tagId: 1, index: 1 }],
            active: { script: 'BUILDING.ADS', tagId: 1 },
            current: 2,
            planned: [
                { script: 'POSE', tagId: 1, sequence: { index: 3 } },
                { script: 'POSE', tagId: 1, sequence: { index: 4 } },
                { script: 'MARY.ADS', tagId: 2, sequence: { index: 5 } },
            ],
        });
        expect(visit.map((gag) => [gag.script, gag.role, gag.repeat])).toEqual([
            ['FISHING.ADS', 'seen', 1],
            ['BUILDING.ADS', 'live', 1],
            ['POSE', 'planned', 2],
            ['MARY.ADS', 'planned', 1],
        ]);
    });
});

describe('gag words', () => {
    it('describes tide windows by band', () => {
        expect(describeTideWindow(0, 16)).toBe('Any time');
        expect(describeTideWindow(12, 16)).toBe('Night only');
        expect(describeTideWindow(0, 12)).toBe('Daytime only');
        expect(describeTideWindow(0, 8)).toBe('Early day only');
    });

    it('says a key scene can come at any time of day, in about one visit in ten', () => {
        expect(describeWhenItPlays(gagFacts({ script: 'MARY.ADS', tagId: 1 }))).toBe(
            'Any time of day on day 5, in about 1 visit in 10',
        );
        expect(describeWhenItPlays(gagFacts({ script: 'BUILDING.ADS', tagId: 9 }))).toBe('Night only');
        expect(describeWhenItPlays(gagFacts({ script: 'ACTIVITY.ADS', tagId: 11 }))).toBe('Any time');
    });

    it('fills in catalogue facts for a gag reference', () => {
        expect(gagFacts({ script: 'MARY.ADS', tagId: 4, index: 3 })).toMatchObject({ index: 3, keyDay: 7, final: true, first: false });
        expect(gagFacts({ script: 'ACTIVITY.ADS', tagId: 11 })).toMatchObject({ final: true, first: true, keyDay: null });
        expect(gagFacts({ script: 'NOPE.ADS', tagId: 1 })).toEqual({ script: 'NOPE.ADS', tagId: 1 });
    });
});

import { describe, expect, it } from 'vitest';
import { JOHNNY_SCENES } from '../story-controller.mjs';
import { buildStorySpread, describeDoor, describeTideWindow, storyDoor } from '../story-doors.mjs';

const record = (script, tagId) => JOHNNY_SCENES.find((r) => r.script === script && r.tagId === tagId);

describe('storyDoor', () => {
    it('opens common, any-tide gags on every day', () => {
        expect(storyDoor(record('FISHING.ADS', 1), { storyDay: 3, tidePhase: 14 })).toEqual({ open: true, reasons: [] });
    });

    it('seals a day-locked key scene on other days', () => {
        // MARY#4 is day 7's key scene.
        expect(storyDoor(record('MARY.ADS', 4), { storyDay: 2, tidePhase: 0 }).reasons).toEqual([{ kind: 'day', day: 7 }]);
        expect(storyDoor(record('MARY.ADS', 4), { storyDay: 7, tidePhase: 0 }).open).toBe(true);
    });

    it('seals a gag outside its tide window, and reports both reasons when both apply', () => {
        // BUILDING#9 is [12,16): low tide only.
        expect(storyDoor(record('BUILDING.ADS', 9), { storyDay: 1, tidePhase: 3 }).reasons)
            .toEqual([{ kind: 'tide', min: 12, max: 16 }]);
        // SUZY#2 is day 9 and [12,16).
        expect(storyDoor(record('SUZY.ADS', 2), { storyDay: 1, tidePhase: 3 }).reasons.map((r) => r.kind))
            .toEqual(['day', 'tide']);
    });

    it('treats an unknown tide as open', () => {
        expect(storyDoor(record('BUILDING.ADS', 9), { storyDay: 1, tidePhase: null }).open).toBe(true);
    });
});

describe('buildStorySpread', () => {
    const base = {
        storyDay: 1,
        tidePhase: 3,
        seen: [{ script: 'FISHING.ADS', tagId: 1, index: 1 }],
        active: { script: 'BUILDING.ADS', tagId: 1 },
        current: 2,
        planned: [
            { script: 'POSE', tagId: 1, sequence: { index: 3 } },
            { script: 'POSE', tagId: 1, sequence: { index: 4 } },
            { script: 'MARY.ADS', tagId: 2, sequence: { index: 5 } },
        ],
    };

    it('lays the visit out in order with one live card', () => {
        const { visit } = buildStorySpread(base);
        expect(visit.map((c) => [c.script, c.role])).toEqual([
            ['FISHING.ADS', 'seen'],
            ['BUILDING.ADS', 'live'],
            ['POSE', 'planned'],
            ['MARY.ADS', 'planned'],
        ]);
        expect(visit.filter((c) => c.role === 'live')).toHaveLength(1);
    });

    it('folds back-to-back poses into one card with a repeat count', () => {
        const { visit } = buildStorySpread(base);
        expect(visit.find((c) => c.pose).repeat).toBe(2);
    });

    it('marks final and key-day cards from the catalogue', () => {
        const mary = buildStorySpread(base).visit.at(-1);
        expect(mary).toMatchObject({ final: true, keyDay: 1 });
    });

    it('keeps the deck to gags outside the visit, excluding idle fillers', () => {
        const { deck } = buildStorySpread(base);
        const keys = deck.map((c) => c.key);
        expect(keys).not.toContain('FISHING.ADS:1');
        expect(keys).not.toContain('BUILDING.ADS:1');
        expect(keys.some((k) => k.startsWith('STAND.ADS') || k.startsWith('POSE'))).toBe(false);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('orders the deck open first (by weight), then tide-sealed, then day-sealed by day', () => {
        const { deck, openWeight } = buildStorySpread(base);
        const rank = (c) => (c.door.open ? 0 : c.door.reasons.some((r) => r.kind === 'day') ? 2 : 1);
        const ranks = deck.map(rank);
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
        const open = deck.filter((c) => c.door.open);
        expect(open.map((c) => c.weight)).toEqual([...open.map((c) => c.weight)].sort((a, b) => b - a));
        expect(openWeight).toBe(open.reduce((sum, c) => sum + c.weight, 0));
        const days = deck.filter((c) => rank(c) === 2).map((c) => c.keyDay);
        expect(days).toEqual([...days].sort((a, b) => a - b));
    });
});

describe('door copy', () => {
    it('describes tide windows in words', () => {
        expect(describeTideWindow(0, 16)).toBe('Any tide');
        expect(describeTideWindow(12, 16)).toBe('Low tide only');
        expect(describeTideWindow(0, 12)).toBe('High tide only');
        expect(describeTideWindow(0, 8)).toBe('Tide phases 0–7');
    });

    it('describes a sealed door with every reason', () => {
        expect(describeDoor({ open: false, reasons: [{ kind: 'day', day: 9 }, { kind: 'tide', min: 12, max: 16 }] }))
            .toBe('Sealed · Day 9 only · Low tide only');
    });
});

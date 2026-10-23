import { describe, expect, it } from 'vitest';
import {
    createJohnnyStoryController,
    DEFAULT_START_TIME,
    isNightPhase,
    JOHNNY_SCENES,
    tidePhaseFor,
} from '../story-controller.mjs';

// How the original picks the sky, the tide and the wave animation for a batch.
//
// FUN_1018_0540 (1018:0540) computes the 16-phase clock 30ba once per batch:
//   hphase(x) = (x/50 + (x%100)/30 + 14) % 16     (FUN_1018_0c48, 1018:0c48)
//   30ba = (hphase(hour*100 + (min<30 ? 0 : 30)) - hphase(StartTime) + 16) % 16
// StartTime is the HHMM "Start Time" in the original's settings dialog
// (FUN_1008_12f7, 1008:12f7, rounds to the half hour; data-segment default 900).
//
// The bake FUN_1010_0136 (1010:0136) then, in this order:
//   sky:  solid colour 5 when 30b4 == 2 (flagsB 0x2000, off-island);
//         a random day ocean (rand % 3) when 30b4 == 0 && 30ba < 12;
//         NIGHT.SCR otherwise, i.e. phase 12..15 or 30b4 == 1 (flagsB 0x800).
//   tide: if 30c2 is still -1 (no planned record carried flagsB 0x200), 30c2 = rand & 1;
//         1 draws the low-tide sand/rock, waves and raft spot.
//   origin: FUN_1010_1b00.
// FUN_1010_1c41 (1010:1c41) sets 30b2 = 1 for flagsB 0x1000; the bake then clears
// the wave timer (2f40 = 0) and FUN_1010_040e skips the wave pass for the batch.

const memoryStorage = (values = {}) => ({
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
        values[key] = String(value);
    },
    removeItem: (key) => {
        delete values[key];
    },
});

const recordingSource = ({ modulo = () => 0, bit = () => 0 } = {}) => {
    const draws = [];
    return {
        draws,
        source: {
            modulo(divisor, site) {
                draws.push({ site, divisor });
                return modulo(divisor, site);
            },
            bit(mask, site) {
                draws.push({ site, mask });
                return bit(mask, site);
            },
            weightedBucket: () => 1,
        },
    };
};

const at = (hour, minute = 0) => () => new Date(2026, 9, 22, hour, minute);

const controller = ({ now = at(12), rng = {}, storage = memoryStorage() } = {}) => {
    const { draws, source } = recordingSource(rng);
    const story = createJohnnyStoryController({ random: () => 0, storyRandom: source, storage, now });
    return { story, draws };
};

const sites = (draws) => draws.map(({ site }) => site);

describe('the 16-phase clock (30ba)', () => {
    it('advances one phase per half hour from StartTime and wraps every eight hours', () => {
        expect(DEFAULT_START_TIME).toBe(900);
        expect(tidePhaseFor(new Date(2026, 9, 22, 9, 0))).toBe(0);
        expect(tidePhaseFor(new Date(2026, 9, 22, 9, 29))).toBe(0);
        expect(tidePhaseFor(new Date(2026, 9, 22, 9, 30))).toBe(1);
        expect(tidePhaseFor(new Date(2026, 9, 22, 15, 0))).toBe(12);
        expect(tidePhaseFor(new Date(2026, 9, 22, 17, 0))).toBe(0);
        expect(tidePhaseFor(new Date(2026, 9, 22, 23, 0))).toBe(12);
        expect(tidePhaseFor(new Date(2026, 9, 22, 1, 0))).toBe(0);
        // A different StartTime only shifts the origin.
        expect(tidePhaseFor(new Date(2026, 9, 22, 23, 0), 1500)).toBe(0);
    });

    it('bakes NIGHT.SCR for phases 12..15 only', () => {
        for (let phase = 0; phase < 16; phase++) expect(isNightPhase(phase)).toBe(phase >= 12);
    });

    it('matches the normal-play captures: a day sky at 21:15 and a night sky at 23:20', () => {
        // DOSBox-X captures of the original with no SCRANTIC.INI (StartTime 900):
        // 2026-10-22 21:15 showed the cyan day sky, 23:20 NIGHT.SCR.
        const day = controller({ now: at(21, 15) }).story.preview('MISCGAG.ADS', 1);
        expect(day.titleState).toMatchObject({ tidePhase: 8, night: false });
        const night = controller({ now: at(23, 20) }).story.preview('MISCGAG.ADS', 1);
        expect(night.titleState).toMatchObject({ tidePhase: 12, night: true });
    });
});

describe('the bake (FUN_1010_0136)', () => {
    it('draws a day ocean, then the tide coin, then the origin, for a day island batch', () => {
        const { story, draws } = controller({ now: at(12), rng: { bit: () => 1 } });
        const first = story.preview('MISCGAG.ADS', 1);
        expect(sites(draws)).toEqual(['island-ocean', 'island-tide', 'island-x', 'island-y']);
        expect(first.titleState).toMatchObject({ night: false, lowTide: true });
    });

    it('skips the ocean draw at night and still flips the tide coin', () => {
        const { story, draws } = controller({ now: at(23), rng: { bit: () => 0 } });
        const first = story.preview('MISCGAG.ADS', 1);
        expect(sites(draws)).toEqual(['island-tide', 'island-x', 'island-y']);
        expect(first.titleState).toMatchObject({ night: true, lowTide: false, oceanIndex: 0 });
    });

    it('draws no ocean for an off-island batch (30b4 == 2) but still flips the coin', () => {
        const { story, draws } = controller({ now: at(12) });
        const suzy = story.preview('SUZY.ADS', 1);
        expect(suzy.titleState.island).toBe(false);
        expect(sites(draws)).toEqual(['island-tide']);
    });

    it('flagsB 0x800 (MARY#1) bakes the night sky whatever the phase', () => {
        const mary = JOHNNY_SCENES.find((s) => s.script === 'MARY.ADS' && s.tagId === 1);
        expect(mary.forceNight).toBe(true);
        expect(JOHNNY_SCENES.filter((s) => s.forceNight)).toHaveLength(1);
        const { story, draws } = controller({ now: at(12) });
        const first = story.preview('MARY.ADS', 1, { storyDay: 5 });
        expect(first.titleState).toMatchObject({ tidePhase: 6, night: true, oceanIndex: 0 });
        expect(sites(draws)).not.toContain('island-ocean');
    });

    it('the rendered tide ignores the phase and the records\' tide windows', () => {
        // MARY#1 is a [12,16) ending without 0x200; at phase 12 the coin can still say
        // high tide.
        const high = controller({ now: at(23), rng: { bit: () => 0 } }).story.preview('MARY.ADS', 1, { storyDay: 5 });
        expect(high.titleState).toMatchObject({ tidePhase: 12, lowTide: false });
        // And ACTIVITY#9, a [0,12) ending without 0x200, can play at low tide.
        const low = controller({ now: at(12), rng: { bit: () => 1 } }).story.preview('ACTIVITY.ADS', 9);
        expect(low.titleState).toMatchObject({ tidePhase: 6, lowTide: true });
    });

    it('flagsB 0x200 anywhere in the batch pins high tide and skips the coin', () => {
        const { story, draws } = controller({ now: at(12), rng: { bit: () => 1 } });
        // ACTIVITY#8 (0x200) as an intermediate; the ending is picked for it.
        story.planFrom('ACTIVITY.ADS', 8, { storyDay: 1 });
        const first = story.next();
        expect(first.titleState.lowTide).toBe(false);
        expect(sites(draws)).not.toContain('island-tide');
    });

    it('flips one coin per batch, or none when a record pins the tide, and holds the result', () => {
        for (const [script, tag] of [['FISHING.ADS', 3], ['MISCGAG.ADS', 1], ['ACTIVITY.ADS', 5], ['WALKSTUF.ADS', 1]]) {
            let flips = 0;
            const { story } = controller({ now: at(12), rng: { bit: () => (flips++, 1) } });
            story.planFrom(script, tag, { storyDay: 1 });
            const selections = [];
            do selections.push(story.next());
            while (!selections.at(-1).sequenceEnd && selections.length < 40);
            const pinned = selections.some((selection) =>
                JOHNNY_SCENES.some(
                    (s) => s.script === selection.script && s.tagId === selection.tagId && s.forceLayout0,
                ),
            );
            expect(flips, `${script}#${tag}`).toBe(pinned ? 0 : 1);
            for (const selection of selections) expect(selection.titleState.lowTide).toBe(!pinned);
        }
    });
});

describe('still waves (flagsB 0x1000, 30b2)', () => {
    it('is carried by exactly the five records that bake plates near the water', () => {
        const stilled = JOHNNY_SCENES.filter((s) => s.wavesOff).map((s) => `${s.script}#${s.tagId}`);
        expect(stilled.sort()).toEqual(
            ['BUILDING.ADS#2', 'BUILDING.ADS#4', 'BUILDING.ADS#6', 'MARY.ADS#1', 'VISITOR.ADS#3'].sort(),
        );
    });

    it('turns titleState.waves off for every scene of a batch that contains one', () => {
        const { story } = controller({ now: at(12) });
        story.planFrom('BUILDING.ADS', 4, { storyDay: 1 });
        const selections = [];
        do selections.push(story.next());
        while (!selections.at(-1).sequenceEnd && selections.length < 40);
        expect(selections.length).toBeGreaterThan(1);
        for (const selection of selections) expect(selection.titleState.waves).toBe(false);
        expect(controller({ now: at(12) }).story.preview('FISHING.ADS', 3).titleState.waves).toBe(true);
    });
});

describe('explicit timeline clock context', () => {
    it.each([['early', 0, false], ['late', 8, false], ['night', 12, true]])(
        'pins %s for a preview independently of wall time and offset', (band, tidePhase, night) => {
            const storage = memoryStorage({ 'jc-start-time-hhmm': '2100' });
            const { story } = controller({ now: at(12), storage });
            const selection = story.preview('MISCGAG.ADS', 1, { storyDay: 3, band });
            expect(selection.titleState).toMatchObject({ storyDay: 3, band, tidePhase, night, startTime: 2100 });
            // A preview is isolated: neither the saved clock nor future visits change.
            expect(storage.getItem('jc-start-time-hhmm')).toBe('2100');
            expect(story.next().titleState.band).toBeNull();
        },
    );

    it('plans a selected night visit using night eligibility and expires at its end', () => {
        const { story } = controller({ now: at(12) });
        story.planFrom('MISCGAG.ADS', 1, { storyDay: 3, band: 'night' });
        expect(story.status()).toMatchObject({ band: 'night', night: true, tidePhase: 12, storyDay: 3 });
        const visit = story.snapshot();
        for (const selection of visit) {
            expect(selection.titleState).toMatchObject({ band: 'night', night: true, tidePhase: 12 });
            const record = JOHNNY_SCENES.find((s) => s.script === selection.script && s.tagId === selection.tagId);
            // The explicit anchor is allowed; all automatically chosen common gags obey the band.
            if (selection !== visit[0] && record.day === 0) {
                expect(record.tideMin).toBeLessThanOrEqual(12);
                expect(record.tideMax).toBeGreaterThan(12);
            }
            story.next();
        }
        expect(story.next().titleState).toMatchObject({ band: null, tidePhase: 6 });
    });

    it('returns immediately to the configured story clock and keeps its offset', () => {
        const storage = memoryStorage({ 'jc-start-time-hhmm': '2100' });
        const { story } = controller({ now: at(21), storage });
        story.planFrom('MISCGAG.ADS', 1, { storyDay: 3, band: 'night' });
        story.next();
        story.returnToLive();
        expect(story.next().titleState).toMatchObject({ band: null, tidePhase: 0 });
        expect(storage.getItem('jc-start-time-hhmm')).toBe('2100');
    });

    it('clears a selected visit on return to title without planning while idle', () => {
        const storage = memoryStorage({ 'jc-start-time-hhmm': '2100', 'jc-story-day': '3' });
        const { story, draws } = controller({ now: at(21), storage });
        story.planFrom('MISCGAG.ADS', 1, { storyDay: 3, band: 'night' });
        story.next();
        const drawCount = draws.length;

        story.clearRun();

        expect(story.status()).toBeNull();
        expect(story.snapshot()).toEqual([]);
        expect(draws).toHaveLength(drawCount);
        expect(storage.getItem('jc-start-time-hhmm')).toBe('2100');
        expect(storage.getItem('jc-story-day')).toBe('3');
        expect(story.next().titleState).toMatchObject({ band: null, tidePhase: 0 });
    });

    it('retains scene-required night and high tide, and off-island scenes', () => {
        const { story } = controller({ now: at(12), rng: { bit: () => 1 } });
        expect(story.preview('MARY.ADS', 1, { storyDay: 5, band: 'early' }).titleState)
            .toMatchObject({ band: 'early', forceNight: true, night: true });
        const forced = JOHNNY_SCENES.find((s) => s.forceLayout0);
        expect(story.preview(forced.script, forced.tagId, { band: 'night' }).titleState.lowTide).toBe(false);
        expect(story.preview('SUZY.ADS', 1, { band: 'night' }).titleState.island).toBe(false);
    });

    it.each([
        [900, 0, 59, true], [900, 1, 0, false], [900, 6, 59, false], [900, 7, 0, true],
        [900, 8, 59, true], [900, 9, 0, false], [900, 14, 59, false], [900, 15, 0, true],
        [900, 16, 59, true], [900, 17, 0, false], [900, 21, 0, false], [900, 22, 59, false],
        [900, 23, 0, true], [2100, 21, 0, false], [1530, 21, 29, false], [1530, 21, 30, true],
        [1530, 23, 29, true], [1530, 23, 30, false],
    ])('keeps original night boundaries with offset %i at %i:%i', (offset, h, m, night) => {
        expect(isNightPhase(tidePhaseFor(at(h, m)(), offset))).toBe(night);
    });
});

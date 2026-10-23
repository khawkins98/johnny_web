import { describe, expect, it } from 'vitest';
import {
    DEFAULT_START_TIME,
    LEGACY_START_TIME_KEY,
    START_TIME_KEY,
    bandClockRanges,
    dropLegacyStartTime,
    formatStartTime,
    normalizeStartTime,
    readStartTime,
    stepStartTime,
    writeStartTime,
} from '../start-time.mjs';
import { createJohnnyStoryController } from '../story-controller.mjs';

const memoryStorage = (initial = {}) => {
    const values = new Map(Object.entries(initial));
    return {
        values,
        getItem: (key) => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
    };
};

describe('Start Time (HHMM, the original settings dialog FUN_1008_12f7)', () => {
    it('defaults to 09:00 under the jc-start-time-hhmm key', () => {
        expect(DEFAULT_START_TIME).toBe(900);
        expect(START_TIME_KEY).toBe('jc-start-time-hhmm');
        expect(formatStartTime(DEFAULT_START_TIME)).toBe('09:00');
    });

    it('rounds down to the half hour like the dialog', () => {
        expect(normalizeStartTime(900)).toBe(900);
        expect(normalizeStartTime(929)).toBe(900);
        expect(normalizeStartTime(930)).toBe(930);
        expect(normalizeStartTime(1059)).toBe(1030);
        expect(normalizeStartTime(2400)).toBe(0);
        expect(normalizeStartTime(-5)).toBeNull();
        expect(normalizeStartTime(2460)).toBeNull();
        expect(normalizeStartTime(NaN)).toBeNull();
        expect(normalizeStartTime(null)).toBeNull();
        expect(normalizeStartTime('')).toBeNull();
    });

    it('steps by 30 minutes and wraps at 00:00 / 23:30', () => {
        expect(stepStartTime(900, 1)).toBe(930);
        expect(stepStartTime(930, 1)).toBe(1000);
        expect(stepStartTime(1000, -1)).toBe(930);
        expect(stepStartTime(930, -1)).toBe(900);
        expect(stepStartTime(2330, 1)).toBe(0);
        expect(stepStartTime(0, -1)).toBe(2330);
        // An unrounded value snaps to its half hour first.
        expect(stepStartTime(945, 1)).toBe(1000);
    });

    it('formats HHMM as HH:MM', () => {
        expect(formatStartTime(0)).toBe('00:00');
        expect(formatStartTime(730)).toBe('07:30');
        expect(formatStartTime(2330)).toBe('23:30');
    });

    it('persists and reads back, falling back to 09:00 for missing or bad values', () => {
        const storage = memoryStorage();
        expect(readStartTime(storage)).toBe(900);
        writeStartTime(storage, 1530);
        expect(storage.values.get('jc-start-time-hhmm')).toBe('1530');
        expect(readStartTime(storage)).toBe(1530);
        // Writing the default removes the override.
        writeStartTime(storage, 900);
        expect(storage.values.has('jc-start-time-hhmm')).toBe(false);
        expect(readStartTime(memoryStorage({ 'jc-start-time-hhmm': 'abc' }))).toBe(900);
        expect(readStartTime(memoryStorage({ 'jc-start-time-hhmm': '9999' }))).toBe(900);
        expect(readStartTime(memoryStorage({ 'jc-start-time-hhmm': '1045' }))).toBe(1030);
        const throwing = {
            getItem: () => {
                throw new Error('blocked');
            },
        };
        expect(readStartTime(throwing)).toBe(900);
        expect(readStartTime(null)).toBe(900);
    });

    it('turns a band of phases into local clock ranges, one per 8-hour cycle, in time-of-day order', () => {
        // Night is phases 12..15: 6-8 h after Start Time, every 8 h.
        expect(bandClockRanges(900, 12, 16)).toEqual(['07:00–09:00', '15:00–17:00', '23:00–01:00']);
        expect(bandClockRanges(900, 0, 8)).toEqual(['01:00–05:00', '09:00–13:00', '17:00–21:00']);
        expect(bandClockRanges(1530, 12, 16)).toEqual(['05:30–07:30', '13:30–15:30', '21:30–23:30']);
    });
});

describe('the legacy jc-start-time key (a first-run date before #61)', () => {
    it('is deleted when the controller loads and never read', () => {
        // 2200 as a "date" would be Feb 0; 1022 (Oct 22) would read as 10:00.
        const storage = memoryStorage({ 'jc-start-time': '1022' });
        const story = createJohnnyStoryController({ random: () => 0, storage, now: () => new Date(2026, 9, 22, 15, 0) });
        expect(storage.values.has('jc-start-time')).toBe(false);
        expect(story.getStartTime()).toBeNull();
        story.next();
        // 15:00 from the 09:00 default is phase 12 (night); from 10:00 it would be 10.
        expect(story.status()).toMatchObject({ tidePhase: 12, night: true, startTime: 900 });
    });

    it('is ignored by readStartTime and removed by dropLegacyStartTime', () => {
        const storage = memoryStorage({ 'jc-start-time': '1500' });
        expect(LEGACY_START_TIME_KEY).toBe('jc-start-time');
        expect(readStartTime(storage)).toBe(900);
        dropLegacyStartTime(storage);
        expect(storage.values.has('jc-start-time')).toBe(false);
        expect(() => dropLegacyStartTime(null)).not.toThrow();
    });
});

describe('the story controller uses the stored Start Time', () => {
    const at = (hour, minute = 0) => () => new Date(2026, 9, 22, hour, minute);

    it('puts night 6-8 h after the stored Start Time and reports it in the status', () => {
        // 15:00 with the default 09:00 is phase 12, night.
        const byDefault = createJohnnyStoryController({ random: () => 0, storage: memoryStorage(), now: at(15) });
        byDefault.next();
        expect(byDefault.status()).toMatchObject({ tidePhase: 12, night: true, startTime: 900 });

        // Start Time 12:00: 15:00 is phase 6 (day); 18:00 is phase 12 (night).
        const storage = memoryStorage({ 'jc-start-time-hhmm': '1200' });
        const day = createJohnnyStoryController({ random: () => 0, storage, now: at(15) });
        day.next();
        expect(day.status()).toMatchObject({ tidePhase: 6, night: false, startTime: 1200 });
        const night = createJohnnyStoryController({ random: () => 0, storage, now: at(18) });
        night.next();
        expect(night.status()).toMatchObject({ tidePhase: 12, night: true, startTime: 1200 });
    });

    it('picks up a changed Start Time at the next planned batch, not mid-batch', () => {
        const storage = memoryStorage();
        const story = createJohnnyStoryController({ random: () => 0, storage, now: at(15) });
        story.next();
        expect(story.status().night).toBe(true);
        writeStartTime(storage, 1200);
        // Drain the current batch: it keeps the sky it was baked with.
        while (story.status().remaining > 0) {
            story.next();
            expect(story.status().night).toBe(true);
        }
        story.next();
        expect(story.status()).toMatchObject({ tidePhase: 6, night: false, startTime: 1200 });
    });
});

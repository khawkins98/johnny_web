/**
 * start-time.mjs — the original's "Start Time" setting (HHMM, default 0900).
 *
 * The story clock counts half hours from Start Time and wraps every 8 hours
 * (story-controller tidePhaseFor); phases 12..15 bake the night sky. The
 * original's settings dialog (FUN_1008_12f7, 1008:12f7) keeps the value as HHMM:
 * its +/- buttons add or subtract 30 (0x1e) in HHMM arithmetic, a value below 0
 * or above 2359 wraps by 2400 (with a beep), and the minutes round down to :00
 * or :30, a minutes field of 60..69 carrying into the next hour. SCRANTIC.INI
 * persists it as [Screen Antics] StartTime; we persist it as `jc-start-time-hhmm`.
 *
 * One quirk is not copied: the dialog shows 23:30 + 30 as "24:00" before wrapping
 * to 00:30 on the next press. 24:00 and 00:00 give the same phases, so we wrap
 * straight to 00:00.
 */
export const START_TIME_KEY = 'jc-start-time-hhmm';
// Before #61, the first run wrote month*100 + day ("first run date") here, and #61
// then read it as HHMM, shifting returning players' night hours. Dates (101..1231)
// overlap valid HHMM, so the old key cannot be trusted: it is never read, only
// deleted, and the setting lives under START_TIME_KEY.
export const LEGACY_START_TIME_KEY = 'jc-start-time';

/** Delete the legacy date-valued key (idempotent; safe when storage is unavailable). */
export const dropLegacyStartTime = (storage) => {
    try {
        storage?.removeItem?.(LEGACY_START_TIME_KEY);
    } catch {
        // Persistence is optional.
    }
};
export const DEFAULT_START_TIME = 900;
const STEP_MINUTES = 30;
const DAY_MINUTES = 24 * 60;

const toMinutes = (hhmm) => Math.floor(hhmm / 100) * 60 + (hhmm % 100);
const fromMinutes = (minutes) => {
    const wrapped = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    return Math.floor(wrapped / 60) * 100 + (wrapped % 60);
};

/**
 * A valid HHMM rounded down to its half hour (24:00 reads as 00:00), or null when
 * the value is not a time of day.
 */
export const normalizeStartTime = (value) => {
    if (value == null || value === '') return null;
    const hhmm = Number(value);
    if (!Number.isInteger(hhmm) || hhmm < 0) return null;
    const hours = Math.floor(hhmm / 100);
    const minutes = hhmm % 100;
    if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
    return (hours % 24) * 100 + (minutes < 30 ? 0 : 30);
};

/** One half-hour step forward (+1) or back (-1), wrapping 23:30 <-> 00:00. */
export const stepStartTime = (startTime, direction) => {
    const base = normalizeStartTime(startTime) ?? DEFAULT_START_TIME;
    return fromMinutes(toMinutes(base) + Math.sign(direction) * STEP_MINUTES);
};

const pad = (value) => String(value).padStart(2, '0');

/** HHMM as "HH:MM". */
export const formatStartTime = (hhmm) => `${pad(Math.floor(hhmm / 100))}:${pad(hhmm % 100)}`;

/** The stored Start Time, normalized; 09:00 when unset, unreadable or invalid. */
export const readStartTime = (storage) => {
    let stored = null;
    try {
        stored = storage?.getItem(START_TIME_KEY) ?? null;
    } catch {
        // Storage may be unavailable (privacy mode); use the default.
    }
    if (stored == null || stored === '') return DEFAULT_START_TIME;
    return normalizeStartTime(stored) ?? DEFAULT_START_TIME;
};

/**
 * Persist a Start Time (normalized). The default removes the key, so "unset" and
 * "09:00" are the same state. Returns the value now in effect.
 */
export const writeStartTime = (storage, value) => {
    const startTime = normalizeStartTime(value) ?? DEFAULT_START_TIME;
    try {
        if (startTime === DEFAULT_START_TIME) storage?.removeItem?.(START_TIME_KEY);
        else storage?.setItem(START_TIME_KEY, String(startTime));
    } catch {
        // Persistence is optional.
    }
    return startTime;
};

/**
 * The local clock ranges a band of story-clock phases [min, max) covers, one per
 * 8-hour cycle, sorted by time of day: e.g. night (12..16) from 09:00 is
 * ["07:00–09:00", "15:00–17:00", "23:00–01:00"].
 */
export const bandClockRanges = (startTime, min, max) => {
    const start = toMinutes(normalizeStartTime(startTime) ?? DEFAULT_START_TIME);
    const ranges = [];
    for (let cycle = 0; cycle < 3; cycle++) {
        const from = start + cycle * 8 * 60 + min * STEP_MINUTES;
        const to = start + cycle * 8 * 60 + max * STEP_MINUTES;
        ranges.push({ at: from % DAY_MINUTES, text: `${formatStartTime(fromMinutes(from))}–${formatStartTime(fromMinutes(to))}` });
    }
    return ranges.sort((a, b) => a.at - b.at).map(({ text }) => text);
};

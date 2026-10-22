/**
 * story-steps.mjs — the data behind the story timeline's step-by-step view
 * (issue #47): pick a day, then a time of day, then a gag.
 *
 * Pure functions over the host catalogue (JOHNNY_SCENES). Day locks and
 * story-clock windows decide which gags the game can choose; this module
 * answers "on day D at this time, which gags can appear?" in the same terms
 * the picker uses.
 */
import { JOHNNY_SCENES, SceneFlags, TIDE_PHASES } from './story-controller.mjs';

/**
 * The story clock in three bands rather than 16 phases. The catalogue calls
 * these "tide" windows (tideMin/tideMax), but in the original the phase is a
 * half-hour clock counted from StartTime that repeats every 8 hours, and
 * phases 12+ bake the night sky. The beach's high/low tide is a separate
 * per-batch coin flip (story-controller createIslandState), so the bands are
 * named for the time of day. Every window starts and ends on phase 0, 8, 12 or
 * 16, so these bands are exact: a gag can appear for a whole band or not at all.
 */
export const TIDE_BANDS = Object.freeze([
    Object.freeze({ id: 'early', label: 'Early day', min: 0, max: 8 }),
    Object.freeze({ id: 'late', label: 'Late day', min: 8, max: 12 }),
    Object.freeze({ id: 'night', label: 'Night', min: 12, max: TIDE_PHASES }),
]);

export const bandForPhase = (phase) =>
    phase == null ? null : TIDE_BANDS.find((band) => phase >= band.min && phase < band.max) ?? null;

export const bandById = (id) => TIDE_BANDS.find((band) => band.id === id) ?? null;

const keyOf = ({ script, tagId }) => `${script}:${tagId}`;
// POSE and STAND.ADS records are idle fillers between gags, not gags people look for.
const isFiller = (record) => record.script === 'POSE' || record.script === 'STAND.ADS';

export const findRecord = ({ script, tagId }) =>
    JOHNNY_SCENES.find((record) => record.script === script && record.tagId === tagId) ?? null;

/** The key scene that unlocks a story day, if it has one. */
export const keySceneFor = (day) => (day > 0 ? JOHNNY_SCENES.find((record) => record.day === day) ?? null : null);

const coversBand = (record, band) => record.tideMin <= band.min && band.max <= record.tideMax;

/** Story-clock window [min, max) over 16 phases as words, in the bands above. */
export function describeTideWindow(min, max) {
    if (min === 0 && max === TIDE_PHASES) return 'Any time';
    if (min === 0 && max === 12) return 'Daytime only';
    const names = TIDE_BANDS.filter((band) => min <= band.min && band.max <= max).map((band) => band.label.toLowerCase());
    return names.length ? `${names.join(' or ')} only`.replace(/^./, (c) => c.toUpperCase()) : 'Any time';
}

const describeRecord = (record) => ({
    key: keyOf(record),
    script: record.script,
    tagId: record.tagId,
    final: Boolean(record.flags & SceneFlags.FINAL),
    keyDay: record.day || null,
    weight: record.weight,
    tideMin: record.tideMin,
    tideMax: record.tideMax,
});

/** Catalogue facts for a gag reference ({script, tagId}); the reference itself if unknown. */
export const gagFacts = (gag) => {
    const record = findRecord(gag);
    return record ? { ...gag, ...describeRecord(record) } : { ...gag };
};

/**
 * Gags the game can choose on `day` in time band `band`: the day's key scene first,
 * then common gags by selection weight (heaviest first).
 */
export function gagsFor(day, band) {
    const seen = new Set();
    const gags = [];
    for (const record of JOHNNY_SCENES) {
        if (isFiller(record) || (record.day !== 0 && record.day !== day) || !coversBand(record, band)) continue;
        const key = keyOf(record);
        if (seen.has(key)) continue;
        seen.add(key);
        gags.push(describeRecord(record));
    }
    return gags.sort((a, b) => Boolean(b.keyDay) - Boolean(a.keyDay) || b.weight - a.weight);
}

/** How many gags each time band allows on `day`, keyed by band id. */
export const gagCountsByBand = (day) =>
    Object.fromEntries(TIDE_BANDS.map((band) => [band.id, gagsFor(day, band).length]));

/**
 * The live visit in order: played, live, then planned gags. Back-to-back idle
 * poses fold into one entry with a count so the strip shows the visit's shape.
 */
export function visitSequence({ seen = [], active = null, current = 0, planned = [] }) {
    const raw = [
        ...seen.filter((gag) => gag.index < current).map((gag) => ({ ...gag, role: 'seen' })),
        ...(active ? [{ ...active, index: current, role: 'live' }] : []),
        ...planned.map((gag, offset) => ({
            script: gag.script,
            tagId: gag.tagId,
            index: gag.index ?? gag.sequence?.index ?? current + offset + 1,
            role: 'planned',
        })),
    ];
    const visit = [];
    for (const gag of raw) {
        const filler = gag.script === 'POSE' || gag.script === 'STAND.ADS';
        const previous = visit.at(-1);
        if (previous && filler && previous.filler && previous.role === gag.role) {
            previous.repeat++;
            continue;
        }
        visit.push({ ...gag, key: keyOf(gag), filler, repeat: 1 });
    }
    return visit;
}

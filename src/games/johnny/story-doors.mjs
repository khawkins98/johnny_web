/**
 * story-doors.mjs — the data behind the "Doors" story visualizer (issue #47).
 *
 * Pure functions: given the live visit and the story clock, lay out the
 * spread (the gags in this visit) and the deck (every other authored gag,
 * each either open for a later visit or sealed, with the reason).
 *
 * These are story-layer doors only: day locks and tide windows from the host
 * catalogue (JOHNNY_SCENES). They stay open or shut for as long as the day and
 * tide hold. Script-layer branches inside a gag (IF_PLAYED etc.) are a
 * different kind of door and are not modelled here.
 */
import { JOHNNY_SCENES, SceneFlags, TIDE_PHASES, inTideWindow } from './story-controller.mjs';

const keyOf = ({ script, tagId }) => `${script}:${tagId}`;
const isPose = (record) => record.script === 'POSE';
// STAND.ADS records are idle stand-at-spot fillers, like POSE. They pad a visit
// but are not gags anyone would want to look for in the deck.
const isFiller = (record) => isPose(record) || record.script === 'STAND.ADS';

const findRecord = ({ script, tagId }) =>
    JOHNNY_SCENES.find((record) => record.script === script && record.tagId === tagId) ?? null;

/** Why a catalogue record can or cannot appear right now. */
export function storyDoor(record, { storyDay, tidePhase = null }) {
    const reasons = [];
    if (record.day !== 0 && record.day !== storyDay) reasons.push({ kind: 'day', day: record.day });
    if (!inTideWindow(record, tidePhase)) {
        reasons.push({ kind: 'tide', min: record.tideMin, max: record.tideMax });
    }
    return { open: reasons.length === 0, reasons };
}

const cardFor = (gag, role) => {
    const record = findRecord(gag);
    const flags = record?.flags ?? 0;
    return {
        key: keyOf(gag),
        script: gag.script,
        tagId: gag.tagId,
        index: gag.index ?? null,
        role,
        repeat: 1,
        pose: gag.script === 'POSE',
        final: Boolean(flags & SceneFlags.FINAL),
        first: Boolean(flags & SceneFlags.FIRST),
        keyDay: record?.day || null,
        tideMin: record?.tideMin ?? 0,
        tideMax: record?.tideMax ?? TIDE_PHASES,
        weight: record?.weight ?? null,
    };
};

/**
 * Build the spread for the live visit plus the deck of everything else.
 *
 * @param {object} input
 * @param {number} input.storyDay      live story day (1..11)
 * @param {number|null} input.tidePhase live tide phase (0..15), null if unknown
 * @param {Array<{script,tagId,index}>} input.seen  gags already played this visit
 * @param {{script,tagId}|null} input.active        the gag playing now
 * @param {number} input.current       1-based index of the active gag
 * @param {Array<{script,tagId,sequence?}>} input.planned  queued gags, in order
 */
export function buildStorySpread({ storyDay, tidePhase = null, seen = [], active = null, current = 0, planned = [] }) {
    const raw = [
        ...seen.filter((gag) => gag.index < current).map((gag) => cardFor(gag, 'seen')),
        ...(active ? [cardFor({ ...active, index: current }, 'live')] : []),
        ...planned.map((gag, offset) => cardFor({
            ...gag,
            index: gag.index ?? gag.sequence?.index ?? current + offset + 1,
        }, 'planned')),
    ];

    // Poses repeat 1..6x back to back. Fold a run into one card with a count so
    // the spread shows the visit's shape, not a row of identical fillers.
    const visit = [];
    for (const card of raw) {
        const previous = visit.at(-1);
        if (previous && card.pose && previous.pose && previous.role === card.role) {
            previous.repeat++;
            continue;
        }
        visit.push(card);
    }

    const inVisit = new Set(raw.map((card) => card.key));
    const deck = [];
    const seenKeys = new Set();
    for (const record of JOHNNY_SCENES) {
        if (isFiller(record)) continue;
        const key = keyOf(record);
        if (inVisit.has(key) || seenKeys.has(key)) continue;
        seenKeys.add(key);
        deck.push({ ...cardFor(record, 'deck'), door: storyDoor(record, { storyDay, tidePhase }) });
    }
    const openWeight = deck.filter((card) => card.door.open).reduce((sum, card) => sum + card.weight, 0);
    const rank = (card) => (card.door.open ? 0 : card.door.reasons.some((reason) => reason.kind === 'day') ? 2 : 1);
    deck.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? a.keyDay - b.keyDay : b.weight - a.weight));

    return { storyDay, tidePhase, visit, deck, openWeight };
}

/** Short human copy for a sealed door, e.g. "Sealed until day 7 · high tide only". */
export function describeDoor(door) {
    if (door.open) return 'Open at this day and tide';
    const parts = door.reasons.map((reason) => (reason.kind === 'day'
        ? `Day ${reason.day} only`
        : describeTideWindow(reason.min, reason.max)));
    return `Sealed · ${parts.join(' · ')}`;
}

/** Tide window [min, max) over 16 phases as words. Phases 12..15 render as low tide. */
export function describeTideWindow(min, max) {
    if (min === 0 && max === TIDE_PHASES) return 'Any tide';
    if (min >= 12) return 'Low tide only';
    if (min === 0 && max === 12) return 'High tide only';
    return `Tide phases ${min}–${max - 1}`;
}

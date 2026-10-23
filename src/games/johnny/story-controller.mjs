import { bakeClouds, wordsFromRandom } from './clouds.mjs';
import {
    DEFAULT_START_TIME,
    START_TIME_KEY,
    dropLegacyStartTime,
    normalizeStartTime,
    readStartTime,
} from './start-time.mjs';

export { DEFAULT_START_TIME };

export const SceneFlags = Object.freeze({
    FINAL: 0x01,
    FIRST: 0x02,
    ISLAND: 0x04,
    LEFT_ISLAND: 0x08,
    VARPOS_OK: 0x10,
    NORAFT: 0x40,
    HOLIDAY_NOK: 0x80,
    // POSE: a pure-engine "stand at spot facing heading" filler (binary adsId 0xFF,
    // no ADS). Rendered from the walk sprite sheet; see Chunk 2. The tide window
    // ([tideMin, tideMax)) replaces the old boolean LOWTIDE_OK from the binary.
    POSE: 0x100,
});

const F = SceneFlags;

/**
 * The picker's record classes: the low nibble of the catalogue's flagsB word
 * (`+0xb`), which FUN_1018_0d76 (1018:0d76) masks on. The batch planner
 * FUN_1018_08b9 asks for the ENDING class, then one FIRST-class record for the
 * opening slot, then INTERMEDIATE-class records until the budget is spent; REPEAT
 * marks the idle poses that run 1..6 times. KEYFRAME is the planner's own mask for
 * the 10%-gated pick among the current story day's records.
 */
export const PickClass = Object.freeze({
    FIRST: 0x01,
    INTERMEDIATE: 0x02,
    ENDING: 0x04,
    REPEAT: 0x08,
    KEYFRAME: 0x80,
});

// Pure-pose records have no ADS file; this sentinel marks their `script`.
const POSE = 'POSE';
const A = 0;
const B = 1;
const C = 2;
const D = 3;
const E = 4;
const G = 5;
const S = 0;
const SW = 1;
const W = 2;
const NW = 3;
const N = 4;
const NE = 5;
const EAST = 6;
const SE = 7;

// Per-scene [width, weight] from the binary record (byte@0x07 walk-span width, byte@0x02
// selection weight). Width is spent from the 300-unit sequence budget; weight drives the
// intermediate-picker roulette. Pure poses are uniformly width 5 / weight 1 and repeat.
const SCENE_METRICS = new Map([
    ['ACTIVITY#8', [15, 30]], ['ACTIVITY#4', [10, 10]], ['ACTIVITY#1', [10, 10]], ['ACTIVITY#5', [50, 10]],
    ['ACTIVITY#7', [15, 10]], ['ACTIVITY#6', [25, 10]], ['ACTIVITY#10', [25, 10]], ['ACTIVITY#11', [30, 5]],
    ['ACTIVITY#12', [25, 10]], ['ACTIVITY#9', [20, 10]],
    ['BUILDING#1', [25, 10]], ['BUILDING#2', [60, 10]], ['BUILDING#5', [25, 10]], ['BUILDING#7', [10, 10]],
    ['BUILDING#9', [25, 10]], ['BUILDING#8', [10, 10]], ['BUILDING#3', [60, 10]], ['BUILDING#4', [105, 10]],
    ['BUILDING#6', [105, 10]],
    ['WALKSTUF#2', [15, 10]], ['WALKSTUF#3', [60, 10]], ['WALKSTUF#1', [60, 10]],
    ['VISITOR#4', [15, 10]], ['VISITOR#6', [10, 10]], ['VISITOR#7', [10, 10]], ['VISITOR#5', [60, 10]],
    ['VISITOR#1', [25, 15]], ['VISITOR#3', [105, 10]],
    ['MARY#2', [45, 10]], ['MARY#3', [60, 10]], ['MARY#1', [30, 10]], ['MARY#4', [35, 10]], ['MARY#5', [45, 10]],
    ['FISHING#1', [25, 10]], ['FISHING#2', [25, 10]], ['FISHING#7', [25, 10]], ['FISHING#8', [20, 10]],
    ['FISHING#3', [15, 10]], ['FISHING#6', [15, 10]], ['FISHING#4', [12, 10]], ['FISHING#5', [10, 10]],
    ['JOHNNY#4', [30, 15]], ['JOHNNY#5', [30, 15]], ['JOHNNY#2', [30, 10]], ['JOHNNY#3', [15, 10]],
    ['JOHNNY#6', [15, 10]], ['JOHNNY#1', [20, 10]],
    ['MISCGAG#2', [20, 10]], ['MISCGAG#1', [15, 10]],
    ['STAND#1', [15, 1]], ['STAND#2', [15, 1]], ['STAND#3', [15, 1]], ['STAND#4', [15, 1]], ['STAND#5', [15, 1]],
    ['STAND#6', [15, 1]], ['STAND#7', [15, 1]], ['STAND#8', [15, 1]], ['STAND#9', [15, 1]], ['STAND#10', [15, 1]],
    ['STAND#11', [15, 1]], ['STAND#12', [15, 1]], ['STAND#15', [15, 10]], ['STAND#16', [15, 10]],
    ['SUZY#1', [35, 10]], ['SUZY#2', [25, 10]],
]);

// Raw catalogue flagsB bit 0x0200 forces 30c2 = 0 (FUN_1010_1c41): the batch is
// baked at high tide, which also selects the wide island-position band 0.
// Kept as a semantic datum rather than folded into SceneFlags, whose bits are
// browser selection behavior rather than a copy of the executable record.
const FORCE_LAYOUT0 = new Set([
    'ACTIVITY#8', 'WALKSTUF#2', 'BUILDING#2', 'MARY#2', 'MARY#3', 'MARY#4', 'MARY#5',
    'ACTIVITY#1', 'FISHING#5', 'JOHNNY#4', 'JOHNNY#5', 'MISCGAG#2', 'ACTIVITY#6',
    'ACTIVITY#11', 'BUILDING#4', 'BUILDING#6', 'VISITOR#3',
]);

// Raw catalogue flagsB bit 0x0800 sets 30b4 = 1 (FUN_1010_1c41): the batch bakes
// NIGHT.SCR whatever the phase says (FUN_1010_0136 only draws a day ocean when
// `30b4 == 0 && 30ba < 12`). Only MARY#1 carries it; its window [12,16) is night anyway.
const FORCE_NIGHT = new Set(['MARY#1']);

// Raw catalogue flagsB bit 0x1000 sets 30b2 = 1 (FUN_1010_1c41): the bake draws the
// waves once, also into the background plate, and clears the wave timer
// (FUN_1010_0136 `2f40 = 0`; FUN_1010_040e skips the wave pass while 30b2 is set), so
// the ocean stands still for the whole batch. The gags that bake a sandcastle or a
// ship near the water line use it.
const WAVES_OFF = new Set(['BUILDING#2', 'BUILDING#4', 'BUILDING#6', 'MARY#1', 'VISITOR#3']);

// Raw catalogue word +0xd: the island layout word (binary FUN_1010_1c41). 0x10 pins
// the batch to fixed layout 1 (island layer 0 at 289/299), 0x20 to fixed layout 2
// (17/309); bits 1/2/4/8 restrict the random origin to the top-left, top-right,
// bottom-left or bottom-right quadrant of the band. Records absent here are 0.
const FLAGS_D = new Map([
    ['BUILDING#2', 0x08], ['VISITOR#5', 0x01], ['MARY#2', 0x08], ['MARY#3', 0x08], ['MARY#1', 0x08],
    ['MARY#4', 0x08], ['MARY#5', 0x03], ['FISHING#3', 0x10], ['FISHING#6', 0x10], ['FISHING#4', 0x20],
    ['FISHING#5', 0x05], ['ACTIVITY#11', 0x0a], ['BUILDING#4', 0x08], ['BUILDING#6', 0x08],
    ['ACTIVITY#9', 0x10], ['VISITOR#1', 0x10], ['WALKSTUF#1', 0x10], ['VISITOR#3', 0x10],
]);

// The binary's flagsB low nibble (PickClass bits), asserted record for record by the
// catalogue oracle. Every common non-ending record is 0x03 (first slot or
// intermediate) except ACTIVITY#8, 0x01 (first slot only); endings are 0x04, or 0x05
// when they also play alone (F.FIRST: ACTIVITY#11, MARY#3/#5, SUZY, JOHNNY#6/#1);
// the idle poses are 0x0b.
const classBitsFor = (key, flags) => {
    if (flags & F.POSE) return PickClass.FIRST | PickClass.INTERMEDIATE | PickClass.REPEAT;
    if (flags & F.FINAL) return PickClass.ENDING | (flags & F.FIRST ? PickClass.FIRST : 0);
    return key === 'ACTIVITY#8' ? PickClass.FIRST : PickClass.FIRST | PickClass.INTERMEDIATE;
};

// A scene record. `tideMin`/`tideMax` are the binary's tide-eligibility window
// [tideMin, tideMax) over the 16 tide phases (default [0,16) = any tide). `width`/`weight`
// come from SCENE_METRICS; `repeat` (binary flagsB & 0x08) marks the idle poses that may
// repeat 1..6x in a sequence; `classBits` is the flagsB low nibble the picker masks on.
const scene = (script, tagId, startSpot, startHeading, endSpot, endHeading, day, flags, tideMin = 0, tideMax = 16) => {
    const isPose = script === POSE;
    const key = `${script.replace('.ADS', '')}#${tagId}`;
    const [width, weight] = isPose ? [5, 1] : SCENE_METRICS.get(key) ?? [15, 10];
    return Object.freeze({
        script, tagId, startSpot, startHeading, endSpot, endHeading, day, flags,
        tideMin, tideMax, width, weight, repeat: isPose, forceLayout0: FORCE_LAYOUT0.has(key),
        forceNight: FORCE_NIGHT.has(key), wavesOff: WAVES_OFF.has(key),
        flagsD: FLAGS_D.get(key) ?? 0, classBits: classBitsFor(key, flags),
    });
};

/**
 * Fold the planned records' layout words into the binary's 30c0 (FUN_1010_1c41,
 * 1010:1c41), in the binary's order: the ending first, then the rest of the batch.
 * A 0x20 record sets 1, a 0x10 record sets 2 (replacing earlier quadrant bits);
 * bits 1/2/4/8 OR in 0x04/0x08/0x10/0x20. Returns 0 when no record carries a word.
 */
export const accumulateIslandLayout = (scenes) => {
    let bits = null;
    for (const { flagsD = 0 } of scenes) {
        if ((flagsD & 0x3f) === 0) continue;
        if (bits === null) bits = 0;
        if (flagsD & 0x20) bits = 1;
        else if (flagsD & 0x10) bits = 2;
        if (flagsD & 0x01) bits |= 0x04;
        if (flagsD & 0x02) bits |= 0x08;
        if (flagsD & 0x04) bits |= 0x10;
        if (flagsD & 0x08) bits |= 0x20;
    }
    return bits ?? 0;
};

/**
 * The picker's layout compatibility test (FUN_1018_0edb, 1018:0edb): a candidate's
 * +0xd word is refused when it conflicts with the batch's 30c0 so far. Fixed layout
 * 2 conflicts with layout 1 or a right quadrant (0x2a); layout 1 with layout 2 or a
 * left quadrant (0x15); a quadrant bit conflicts with the opposite column unless its
 * row-mate is set, and with the opposite row unless its column-mate is set.
 */
export const isLayoutCompatible = (flagsD, bits) => {
    if (!bits) return true;
    if (flagsD & 0x20 && bits & 0x2a) return false;
    if (flagsD & 0x10 && bits & 0x15) return false;
    if (flagsD & 0x01 && ((!(flagsD & 0x02) && bits & 0x2a) || (!(flagsD & 0x04) && bits & 0x30))) return false;
    if (flagsD & 0x02 && ((!(flagsD & 0x01) && bits & 0x15) || (!(flagsD & 0x08) && bits & 0x30))) return false;
    if (flagsD & 0x04 && ((!(flagsD & 0x08) && bits & 0x2a) || (!(flagsD & 0x01) && bits & 0x0c))) return false;
    if (flagsD & 0x08 && ((!(flagsD & 0x04) && bits & 0x15) || (!(flagsD & 0x02) && bits & 0x0c))) return false;
    return true;
};

// Island layer 0 top-left for each world origin: the bake draws it at
// 30c6 + 0x121, 30c4 + 0x117, so titleState (= 30c6/30c4) is origin - (289, 279).
const ISLAND_LAYER0 = Object.freeze({ x: 0x121, y: 0x117 });
const FIXED_LAYOUTS = Object.freeze({
    layout1: Object.freeze({ x: 0x121, y: 299 }),
    layout2: Object.freeze({ x: 0x11, y: 0x135 }),
});
// Random bands (FUN_1010_1b00): x/y minimum and range, by 30c2 (low tide).
const ISLAND_BANDS = Object.freeze({
    high: Object.freeze({ x: 0x43, width: 0xe2, y: 0xff, height: 0x81 }),
    low: Object.freeze({ x: 0xa8, width: 0x6f, y: 0xff, height: 0x3b }),
});

/**
 * Resolve the island world origin (titleState x/y) from the accumulated layout
 * word, the tide, and a `draw(divisor, site)` random source (FUN_1010_1b00,
 * 1010:1b00). 30c0 & 2 is fixed layout 1 (289/299), 30c0 & 1 fixed layout 2
 * (17/309); otherwise x = xmin + rand % width, y = ymin + rand % height in the
 * tide's band, with the quadrant bits halving a range (unless a whole row or
 * column is allowed) and offsetting it for the right/bottom quadrants.
 */
export const resolveIslandOrigin = (layoutBits, lowTide, draw) => {
    const fixed = layoutBits & 2 ? FIXED_LAYOUTS.layout1 : layoutBits & 1 ? FIXED_LAYOUTS.layout2 : null;
    if (fixed) return { x: fixed.x - ISLAND_LAYER0.x, y: fixed.y - ISLAND_LAYER0.y };
    const band = lowTide ? ISLAND_BANDS.low : ISLAND_BANDS.high;
    let { x, y, width, height } = band;
    const bits = layoutBits & 0x3c;
    if (bits !== 0) {
        const halfWidth = Math.floor(width / 2);
        const halfHeight = Math.floor(height / 2);
        if (bits === 0x10 || bits === 0x20 || bits === 0x30) y += halfHeight;
        if (!((bits & 0x04 && bits & 0x10) || (bits & 0x08 && bits & 0x20))) height = halfHeight;
        if (bits === 0x08 || bits === 0x20 || bits === 0x28) x += halfWidth;
        if (!((bits & 0x04 && bits & 0x08) || (bits & 0x10 && bits & 0x20))) width = halfWidth;
    }
    const originX = x + (width > 0 ? draw(width, 'island-x') : 0);
    const originY = y + (height > 0 ? draw(height, 'island-y') : 0);
    return { x: originX - ISLAND_LAYER0.x, y: originY - ISLAND_LAYER0.y };
};

/**
 * Host catalogue reconstructed from the original executable behavior and
 * cross-checked against the decoded ADS tags. This metadata is not present in
 * RESOURCE.001; it determines which authored scene the host asks DGDS to run.
 */
export const JOHNNY_SCENES = Object.freeze([
    scene('ACTIVITY.ADS', 8, null, null, D, SE, 0, F.FIRST | F.ISLAND | F.VARPOS_OK, 0, 8),
    scene('BUILDING.ADS', 1, G, W, A, W, 0, F.ISLAND | F.VARPOS_OK),
    scene('WALKSTUF.ADS', 2, E, EAST, D, SE, 0, F.ISLAND | F.VARPOS_OK, 0, 12),
    scene('BUILDING.ADS', 2, G, W, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('VISITOR.ADS', 4, D, S, D, W, 0, F.ISLAND | F.VARPOS_OK),
    scene('VISITOR.ADS', 6, D, S, D, SW, 0, F.ISLAND | F.VARPOS_OK),
    scene('VISITOR.ADS', 7, D, S, D, SW, 0, F.ISLAND | F.VARPOS_OK),
    scene('VISITOR.ADS', 5, E, SW, null, null, 0, F.FINAL | F.ISLAND | F.LEFT_ISLAND | F.VARPOS_OK),
    scene('MARY.ADS', 2, E, EAST, null, null, 1, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('MARY.ADS', 3, G, SW, null, null, 4, F.FINAL | F.FIRST | F.ISLAND | F.VARPOS_OK, 8, 16),
    scene('MARY.ADS', 1, E, SW, null, null, 5, F.FINAL | F.ISLAND | F.VARPOS_OK, 12, 16),
    scene('MARY.ADS', 4, E, EAST, null, null, 7, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('MARY.ADS', 5, null, null, null, null, 8, F.FINAL | F.FIRST | F.ISLAND | F.LEFT_ISLAND | F.VARPOS_OK | F.NORAFT),
    scene('ACTIVITY.ADS', 4, E, SE, E, SE, 0, F.ISLAND | F.VARPOS_OK),
    scene('ACTIVITY.ADS', 1, E, SE, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('BUILDING.ADS', 5, D, W, D, EAST, 0, F.ISLAND | F.VARPOS_OK, 0, 12),
    scene('BUILDING.ADS', 7, D, W, D, EAST, 0, F.ISLAND | F.VARPOS_OK, 0, 12),
    scene('BUILDING.ADS', 9, D, W, D, EAST, 0, F.ISLAND | F.VARPOS_OK, 12, 16),
    scene('BUILDING.ADS', 8, D, W, D, EAST, 0, F.ISLAND | F.VARPOS_OK, 12, 16),
    scene('FISHING.ADS', 1, D, W, D, EAST, 0, F.ISLAND | F.VARPOS_OK),
    scene('FISHING.ADS', 2, D, W, D, EAST, 0, F.ISLAND | F.VARPOS_OK),
    scene('FISHING.ADS', 7, E, EAST, E, W, 0, F.ISLAND | F.LEFT_ISLAND | F.VARPOS_OK),
    scene('FISHING.ADS', 8, E, EAST, E, W, 0, F.ISLAND | F.LEFT_ISLAND | F.VARPOS_OK),
    scene('FISHING.ADS', 3, D, W, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('FISHING.ADS', 6, D, W, null, null, 0, F.FINAL | F.ISLAND),
    scene('FISHING.ADS', 4, E, EAST, null, null, 0, F.FINAL | F.ISLAND | F.LEFT_ISLAND),
    scene('FISHING.ADS', 5, E, EAST, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('JOHNNY.ADS', 4, E, SW, G, NE, 0, F.ISLAND | F.VARPOS_OK, 0, 12),
    scene('JOHNNY.ADS', 5, E, SW, G, NE, 0, F.ISLAND | F.VARPOS_OK, 0, 12),
    scene('WALKSTUF.ADS', 3, D, W, E, EAST, 0, F.ISLAND | F.VARPOS_OK),
    scene('MISCGAG.ADS', 2, D, W, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK, 0, 8),
    scene('ACTIVITY.ADS', 5, E, SW, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('MISCGAG.ADS', 1, D, EAST, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('ACTIVITY.ADS', 7, D, SW, G, S, 0, F.ISLAND | F.VARPOS_OK),
    scene('ACTIVITY.ADS', 6, D, SW, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('ACTIVITY.ADS', 10, D, SW, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('ACTIVITY.ADS', 11, null, null, null, null, 0, F.FINAL | F.FIRST | F.ISLAND | F.VARPOS_OK),
    scene('ACTIVITY.ADS', 12, D, SW, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 1, A, SW, A, SW, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 2, A, W, A, W, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 3, A, NW, A, NW, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 4, B, SW, B, SW, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 5, B, S, B, S, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 6, B, SE, B, SE, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 7, C, NE, C, NE, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 8, C, EAST, C, EAST, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 9, D, NW, D, NW, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 10, D, SE, D, SE, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 11, E, NW, E, NW, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 12, G, S, G, S, 0, F.ISLAND | F.VARPOS_OK),
    scene('BUILDING.ADS', 3, A, EAST, C, EAST, 0, F.ISLAND | F.VARPOS_OK),
    scene('BUILDING.ADS', 4, A, EAST, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK, 0, 12),
    scene('BUILDING.ADS', 6, A, EAST, null, null, 0, F.FINAL | F.ISLAND | F.VARPOS_OK, 12, 16),
    scene(POSE, 1, A, NW, A, NW, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, A, W, A, W, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, A, SW, A, SW, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, B, SW, B, SW, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, B, SE, B, SE, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, B, S, B, S, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, C, NE, C, NE, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, C, EAST, C, EAST, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, C, SE, C, SE, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, D, NE, D, NE, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, E, NW, E, NW, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, G, SW, G, SW, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, G, S, G, S, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    scene(POSE, 1, G, SE, G, SE, 0, F.ISLAND | F.VARPOS_OK | F.POSE),
    // Binary flagsB=0x3 (intermediate/first-intermediate, no 0x4 ending bit) -- the day-2
    // keyframe plays as an intermediate, NOT a finale (matches JOHNNY#3, same 0x3 class).
    // The old table mis-flagged it FINAL; day 2's finale comes from the general ending pool.
    scene('JOHNNY.ADS', 2, E, SW, G, NE, 2, F.ISLAND | F.VARPOS_OK),
    scene('SUZY.ADS', 1, null, null, null, null, 3, F.FINAL | F.FIRST),
    scene('JOHNNY.ADS', 3, E, SW, G, NE, 6, F.ISLAND | F.VARPOS_OK),
    scene('SUZY.ADS', 2, null, null, null, null, 9, F.FINAL | F.FIRST, 12, 16),
    scene('JOHNNY.ADS', 6, null, null, null, null, 10, F.FINAL | F.FIRST, 12, 16),
    scene('JOHNNY.ADS', 1, null, null, null, null, 11, F.FINAL | F.FIRST, 12, 16),
    scene('STAND.ADS', 15, A, S, A, S, 0, F.ISLAND | F.VARPOS_OK),
    scene('STAND.ADS', 16, C, S, C, S, 0, F.ISLAND | F.VARPOS_OK),
    scene('ACTIVITY.ADS', 9, E, EAST, null, null, 0, F.FINAL | F.ISLAND, 0, 12),
    scene('VISITOR.ADS', 1, A, S, A, S, 0, F.ISLAND),
    scene('WALKSTUF.ADS', 1, A, NE, null, null, 0, F.FINAL | F.ISLAND),
    scene('VISITOR.ADS', 3, B, NE, null, null, 0, F.FINAL | F.ISLAND | F.HOLIDAY_NOK),
]);

const randomIndex = (random, length) => Math.min(length - 1, Math.floor(random() * length));
const pick = (random, values) => values[randomIndex(random, values.length)];
const hasAll = (flags, required) => (flags & required) === required;

// Weight-roulette over candidate scenes (binary picker FUN_1018_0d76 sums byte@0x02).
const weightedPick = (random, candidates, storyRandom = null, site = 'director-weighted-scene') => {
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = storyRandom ? storyRandom.modulo(total, site) + 1 : Math.floor(random() * total) + 1;
    for (const candidate of candidates) {
        if (roll <= candidate.weight) return candidate;
        roll -= candidate.weight;
    }
    return candidates[candidates.length - 1];
};
// Repeat count for an idle (flagsB & 0x08) scene: centre-weighted buckets summing 100 -> 1..6.
const REPEAT_WEIGHTS = [10, 20, 30, 20, 10, 10];
const repeatCount = (random, storyRandom = null) => {
    if (storyRandom) {
        let bucket = 0;
        while (bucket === 0) bucket = storyRandom.weightedBucket(REPEAT_WEIGHTS, 'director-repeat-count');
        return bucket;
    }
    let roll = Math.floor(random() * 100);
    for (let bucket = 0; bucket < REPEAT_WEIGHTS.length; bucket++) {
        if (roll < REPEAT_WEIGHTS[bucket]) return bucket + 1;
        roll -= REPEAT_WEIGHTS[bucket];
    }
    return REPEAT_WEIGHTS.length;
};

// The 16-phase clock (binary 30ba, FUN_1018_0540 / hasher FUN_1018_0c48) is
// TIME-OF-DAY driven at half-hour resolution, offset by StartTime, NOT random:
//   hphase(x) = (floor(x/50) + floor((x%100)/30) + 14) % 16
//   tidePhase = (hphase(hour*100 + (min<30?0:30)) - hphase(StartTime) + 16) % 16
// so it advances one phase per half hour and wraps every eight hours. StartTime is
// the HHMM "Start Time" of the original's settings dialog (FUN_1008_12f7 rounds it to
// the half hour; the data segment defaults it to 0900 and SCRANTIC.INI persists it).
// The phase is recomputed when each batch is planned. It gates eligibility through
// every record's [tideMin, tideMax) window and picks the sky at the bake: phases
// 12..15 bake NIGHT.SCR (FUN_1010_0136, `30ba < 0xc` selects a day ocean). It does
// NOT pick the rendered tide: that is 30c2, a per-batch coin flip (createIslandState).
// The catalogue calls the window a tide window, so the name stays.
const TIDE_PHASES = 16;
const NIGHT_PHASE = 12; // NIGHT.SCR when tidePhase >= 12 (0x0c)
const hphase = (x) => (Math.floor(x / 50) + Math.floor((x % 100) / 30) + 14) % TIDE_PHASES;
export const tidePhaseFor = (date, startTime = DEFAULT_START_TIME) => {
    const now = date.getHours() * 100 + (date.getMinutes() < 30 ? 0 : 30);
    return (hphase(now) - hphase(startTime) + TIDE_PHASES) % TIDE_PHASES;
};
export const isNightPhase = (tidePhase) => tidePhase >= NIGHT_PHASE;
export const inTideWindow = (candidate, tidePhase) =>
    tidePhase == null || (candidate.tideMin <= tidePhase && tidePhase < candidate.tideMax);
export { TIDE_PHASES };

/**
 * Can the planner reach this record on `storyDay` at `tidePhase` by any path? Shared
 * with the story timeline. A common record (day 0) needs the phase in its
 * [tideMin, tideMax) window (FUN_1018_0d76's ordinary classes). A day-locked record
 * is reached only through the 10% keyframe gate (FUN_1018_0d76(0x80)), which
 * compares the day and nothing else: no tide window, so a night-only key scene can
 * play by day (normal-play captures: JOHNNY#6 at phase 1, JOHNNY#1 at phases 3-4).
 */
export const isStoryEligible = (candidate, storyDay, tidePhase = null) =>
    candidate.day !== 0 ? candidate.day === storyDay : inTideWindow(candidate, tidePhase);
// StartTime (HHMM): the original's default 0900 unless the Settings "Start Time"
// control stored an override (start-time.mjs). Read once per planned batch, as the
// original recomputes the phase per New Scene. A corrupted value falls back to the
// default rather than poisoning tidePhase (NaN would empty the eligible set).
const getStartTime = (storage) => readStartTime(storage);

// Dual-counter day advance, recovered from FUN_1018_0ba5. Two persisted counters:
// `target` = the unlocked/keyframe day, and `cur` = the calendar day that chases it
// one step per real-calendar-day change. A keyframe scene actually playing unlocks the
// next day (target++). The JS port previously collapsed this to a single day++/clamp.
const updateStoryDay = (storage, date) => {
    // Full y/m/d key: the binary compares day+month+year, so a run exactly one calendar
    // year later must still register as a date change (a bare day-of-year would not).
    const currentDate = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    let storedDate;
    let target;
    let cur;
    try {
        storedDate = storage?.getItem('jc-story-date');
        target = Number(storage?.getItem('jc-story-target')) || 1;
        cur = Number(storage?.getItem('jc-story-day')) || 1;
    } catch {
        target = 1;
        cur = 1;
    }
    if (storedDate && storedDate !== currentDate) {
        if (cur < target) cur++; // calendar chases the unlocked target, one step per day
        if (cur > 11 || cur < 2) {
            target = 1;
            cur = 1;
        } // wrap/clamp to 1..11
    }
    try {
        storage?.setItem('jc-story-date', currentDate);
        storage?.setItem('jc-story-target', String(target));
        storage?.setItem('jc-story-day', String(cur));
    } catch {
        // Persistence is an optional host service, not an engine requirement.
    }
    return cur;
};

// Unlock the next keyframe day: when a day-locked keyframe scene is planned AND the
// calendar has caught up (target <= cur). The binary's unlock is unconditional
// (`DAT_2d9b + 1`, from FUN_1018_0ba5 at the next planning or FUN_1018_06bf when the
// keyframe finishes): target reaches 12, the next calendar tick drives `cur` to 12, and
// `updateStoryDay`'s `cur > 11` branch then wraps the whole story back to day 1. Capping
// target at 11 (the old code) made that wrap dead code and pinned the story on the day-11
// finale forever -- so there is intentionally no cap here.
const unlockKeyframeDay = (storage) => {
    try {
        const target = Number(storage?.getItem('jc-story-target')) || 1;
        const cur = Number(storage?.getItem('jc-story-day')) || 1;
        if (target <= cur) storage?.setItem('jc-story-target', String(target + 1));
    } catch {
        // Persistence is optional.
    }
};

// The keyframe gate's side effect (FUN_1018_0d76(0x80): `2d9b = 2d9c` once the 10%
// draw passes, before any record is looked at): the unlocked target falls back to
// the current day, so a key scene can be planned again on the same day and only
// a keyframe planned after the last open gate carries the story forward.
const resetKeyframeTarget = (storage) => {
    try {
        const cur = Number(storage?.getItem('jc-story-day')) || 1;
        storage?.setItem('jc-story-target', String(cur));
    } catch {
        // Persistence is optional.
    }
};

const createIslandState = (
    finalScene,
    storyDay,
    date,
    random,
    storyRandom = null,
    {
        startTime = DEFAULT_START_TIME,
        layoutBits = 0,
        forceHighTide = false,
        forceNight = false,
        wavesOff = false,
    } = {},
) => {
    const tidePhase = tidePhaseFor(date, startTime);
    const island = hasAll(finalScene.flags, F.ISLAND);
    // The bake (FUN_1010_0136) in the binary's order. Sky first: solid black for an
    // off-island batch (30b4 == 2, catalogue 0x2000), NIGHT.SCR when the phase is
    // 12..15 or a planned record carries 0x800 (30b4 == 1), else one of the three
    // day oceans by a random draw. The wall clock plays no part beyond the phase.
    const night = forceNight || isNightPhase(tidePhase);
    const draw = storyRandom
        ? (divisor, site) => storyRandom.modulo(divisor, site)
        : (divisor) => randomIndex(random, divisor);
    // Browser-created clouds remain on `random` and cannot advance this stream.
    const oceanIndex = !island || night ? 0 : draw(3, 'island-ocean');
    // Tide next (30c2): the planner resets it to -1; flagsB 0x200 on any planned
    // record sets 0 (high tide, FUN_1010_1c41); otherwise the bake flips a coin,
    // `rand & 1`, with 1 = low tide. The phase and the records' tide windows never
    // touch it, so a low-window gag can play at high tide and vice versa.
    const lowTide =
        !forceHighTide && (storyRandom ? storyRandom.bit(1, 'island-tide') === 1 : randomIndex(random, 2) === 1);
    let x = 0;
    let y = 0;
    // The island world origin is chosen ONCE per island CHAIN and held fixed for
    // every scene in it (binary FUN_1010_1b00 via the New-Scene bake FUN_1010_0136):
    // a fixed layout when any planned record carries +0xd 0x10/0x20, else a random
    // band for the tide, narrowed by the records' quadrant bits. LEFT_ISLAND is a
    // per-scene foreground nudge, not a whole-island move.
    if (island) {
        ({ x, y } = resolveIslandOrigin(layoutBits, lowTide, draw));
    }
    const raft = hasAll(finalScene.flags, F.NORAFT) ? 0 : storyDay <= 2 ? 1 : storyDay <= 5 ? storyDay - 1 : 5;
    return Object.freeze({
        island,
        // The host always composes Johnny's persistent island with the primary
        // island layout. TTM scenes may load ISLAND2.SCR for their own drawing;
        // that child-local background id must not move the host-owned island.
        islandLayoutId: 1,
        lowTide,
        tidePhase,
        night,
        raft,
        x,
        y,
        // false when any planned record carries flagsB 0x1000 (30b2 = 1): the waves
        // stand on their bake frames for the whole batch (frame-renderer honours it).
        waves: !wavesOff,
        holidayAllowed: !hasAll(finalScene.flags, F.HOLIDAY_NOK),
        oceanIndex,
        presentationKey: Object.freeze({}),
        // FUN_1010_0a38 at every bake: static for the batch, day and night (clouds.mjs).
        clouds: Object.freeze(bakeClouds(wordsFromRandom(random)).map((cloud) => Object.freeze(cloud))),
        storyDay,
    });
};

export const createJohnnyStoryController = ({
    random = Math.random,
    storyRandom: initialStoryRandom = null,
    storage = globalThis.localStorage,
    now = () => new Date(),
} = {}) => {
    let storyRandom = initialStoryRandom;
    // Once per load: forget the pre-#61 first-run date, which read as HHMM would
    // shift night. The Start Time setting lives under its own key.
    dropLegacyStartTime(storage);
    let queue = [];
    let transition = 0;
    let sequenceStatus = null;
    // Anti-repeat state (FUN_1018_08b9): 30e8 is the previous batch's ending, 30ea the
    // previous batch's keyframe intermediate (or none). The ending roulette refuses
    // only 30e8; the keyframe gate refuses both. Session memory, as in the binary.
    let lastEnding = null;
    let lastKeyframe = null;
    const statusListeners = new Set();

    const publishStatus = () => {
        for (const listener of statusListeners) listener(sequenceStatus);
    };

    // A percentage coin (FUN_1018_1f1b with one bucket): true when the draw lands in it.
    const chance = (percent, site) =>
        storyRandom ? storyRandom.weightedBucket([percent], site) !== 0 : random() * 100 < percent;

    /**
     * The picker, FUN_1018_0d76(mask, phase, budget). A candidate must carry the
     * class bit, be a common record (day 0), have the phase in its tide window, have
     * width/2 < budget (999 for the ending class) and not clash with the island layout
     * folded so far (FUN_1018_0edb); one is drawn by weight roulette in catalogue
     * order. The KEYFRAME mask is different: it first spends a draw on the 10% gate
     * (word % 10 == 0), sets the unlocked day back to the current day, and then
     * weighs every record locked to that day, ignoring tide windows and the layout.
     * Returns null when nothing qualifies (or the gate stays shut).
     */
    const pickRecord = (mask, { storyDay, tidePhase, budget = 999, layoutBits = 0 }) => {
        let candidates;
        let site;
        if (mask === PickClass.KEYFRAME) {
            if (storyRandom ? storyRandom.modulo(10, 'director-keyframe-gate') !== 0 : random() >= 0.1) return null;
            resetKeyframeTarget(storage);
            candidates = JOHNNY_SCENES.filter((candidate) => candidate.day === storyDay);
            site = 'director-keyframe-scene';
        } else {
            const limit = mask === PickClass.ENDING ? 999 : budget;
            candidates = JOHNNY_SCENES.filter(
                (candidate) =>
                    (candidate.classBits & mask) !== 0 &&
                    candidate.day === 0 &&
                    inTideWindow(candidate, tidePhase) &&
                    candidate.width / 2 < limit &&
                    isLayoutCompatible(candidate.flagsD, layoutBits),
            );
            site =
                mask === PickClass.ENDING
                    ? 'director-final-scene'
                    : mask === PickClass.FIRST
                      ? 'director-first-scene'
                      : 'director-intermediate-scene';
        }
        if (candidates.length === 0) return null;
        return weightedPick(random, candidates, storyRandom, site);
    };

    /**
     * The head of FUN_1018_08b9: the gated keyframe pick, then the ending roulette.
     * A keyframe that is neither the previous ending nor the previous keyframe is
     * taken: as the ending when it carries the ending bit, else as a pending
     * intermediate. The ending is then drawn from the ENDING class and re-drawn
     * (not pooled out) while it is null, equals the previous ending, or is a solo
     * ending (flagsB & 1) while a keyframe intermediate is pending. The binary
     * loops until the stream cooperates; a degenerate `random` here would never
     * cooperate, so after many refusals the refused records are dropped from the
     * pool instead.
     */
    const chooseEnding = (storyDay, tidePhase) => {
        let keyframe = null;
        let ending = null;
        const key = pickRecord(PickClass.KEYFRAME, { storyDay, tidePhase });
        if (key && key !== lastEnding && key !== lastKeyframe) {
            if (key.classBits & PickClass.ENDING) ending = key;
            else keyframe = key;
        }
        const refused = (candidate) =>
            !candidate || candidate === lastEnding || (keyframe && (candidate.classBits & PickClass.FIRST) !== 0);
        for (let attempt = 0; attempt < 64 && refused(ending); attempt++) {
            ending = pickRecord(PickClass.ENDING, { storyDay, tidePhase });
        }
        if (refused(ending)) {
            const pool = JOHNNY_SCENES.filter(
                (candidate) =>
                    (candidate.classBits & PickClass.ENDING) !== 0 &&
                    candidate.day === 0 &&
                    inTideWindow(candidate, tidePhase) &&
                    !refused(candidate),
            );
            if (pool.length > 0) ending = weightedPick(random, pool, storyRandom, 'director-final-scene');
            else ending ??= JOHNNY_SCENES.find((candidate) => (candidate.classBits & PickClass.ENDING) !== 0);
        }
        return { ending, keyframe };
    };

    const findScene = (script, tagId) =>
        JOHNNY_SCENES.find((candidate) => candidate.script === script && candidate.tagId === Number(tagId));

    const describeScene = (script, tagId) => {
        const selected = findScene(script, tagId);
        if (!selected) return null;
        const final = hasAll(selected.flags, F.FINAL);
        const first = hasAll(selected.flags, F.FIRST);
        return Object.freeze({
            script: selected.script,
            tagId: selected.tagId,
            fixedDay: selected.day || null,
            final,
            first,
            action: final ? (first ? 'solo-finale' : 'ending-finale') : 'starting-event',
        });
    };

    const makeSelection = ({ selected, walkFrom = null, islandState, index, total, wipe, anchor = null }) => {
        const sequenceEnd = index === total - 1;
        // TTM sprite offset (FUN_1010_00fc): 30c6 + 1, or 30c6 + 0x111 for LEFT_ISLAND,
        // where titleState.x is 30c6 (the island world origin, also the host walk
        // offset). Off-island scenes get no offset.
        const sceneOffset = Object.freeze({
            x:
                islandState.x +
                (islandState.island ? 1 : 0) +
                (hasAll(selected.flags, F.LEFT_ISLAND) ? 272 : 0),
            y: islandState.y,
        });
        return Object.freeze({
            script: selected.script,
            tagId: selected.tagId,
            // A pure-pose scene (binary adsId 0xFF) has no ADS; the host stands
            // Johnny at the spot/heading from the walk sheet instead of playing a
            // script. Carry the pose so the presentation loop can branch on it.
            pose: hasAll(selected.flags, F.POSE)
                ? Object.freeze({ spot: selected.startSpot, heading: selected.startHeading })
                : null,
            titleState: Object.freeze({ ...islandState, sceneOffset }),
            walk:
                walkFrom?.endSpot != null && selected.startSpot != null
                    ? Object.freeze({
                          fromSpot: walkFrom.endSpot,
                          fromHeading: walkFrom.endHeading,
                          toSpot: selected.startSpot,
                          toHeading: selected.startHeading,
                      })
                    : null,
            sequenceEnd,
            transition: sequenceEnd ? wipe : null,
            sequence: Object.freeze({
                index: index + 1,
                total,
                storyDay: islandState.storyDay,
                anchor,
            }),
        });
    };

    // A debug-run ending for an anchored ordinary scene: a common, non-solo ending
    // (any phase) whose layout word accepts the anchor's.
    const chooseDebugFinal = (anchor) => {
        const candidates = JOHNNY_SCENES.filter(
            (candidate) =>
                (candidate.classBits & (PickClass.ENDING | PickClass.FIRST)) === PickClass.ENDING &&
                candidate.day === 0 &&
                isLayoutCompatible(anchor.flagsD, accumulateIslandLayout([candidate])) &&
                (hasAll(anchor.flags, F.VARPOS_OK) ||
                    !hasAll(candidate.flags, F.LEFT_ISLAND) ||
                    hasAll(candidate.flags, F.VARPOS_OK)),
        );
        return pick(random, candidates);
    };

    // What FUN_1010_1c41 folds into the batch state from every planned record's
    // flags (ending first): the island layout word, and the 0x200 / 0x800 / 0x1000
    // bits that force high tide, the night sky and still waves for the whole batch.
    const batchOptions = (batch) => ({
        layoutBits: accumulateIslandLayout(batch),
        forceHighTide: batch.some((selected) => selected.forceLayout0),
        forceNight: batch.some((selected) => selected.forceNight),
        wavesOff: batch.some((selected) => selected.wavesOff),
    });

    // An idle record's repeat count (FUN_1018_08b9): centre-weighted 1..6, re-drawn
    // while it would overrun the budget (a count of 1 is always accepted, as is one
    // that lands exactly on 0). The binary re-draws until the stream cooperates; a
    // degenerate `random` never would, so after many tries the count is clamped.
    const fittingRepeatCount = (record, budget) => {
        let reps = repeatCount(random, storyRandom);
        for (let attempt = 0; attempt < 1000 && reps > 1 && record.width * reps > budget; attempt++) {
            reps = repeatCount(random, storyRandom);
        }
        if (reps > 1 && record.width * reps > budget) reps = Math.max(1, Math.floor(budget / record.width));
        return reps;
    };

    /**
     * The body of FUN_1018_08b9(phase, 300) once the ending (and any pending keyframe
     * intermediate) is known. The 300-unit walk-span budget pays for the ending and
     * the keyframe first; their layout words are folded first too (FUN_1010_1c41,
     * ending first). Unless the ending plays alone (flagsB & 1), the opening slot is
     * the pending keyframe on a 50% coin, else a FIRST-class pick. Then, while the
     * budget is not exactly spent and fewer than 298 records are queued: a pending
     * keyframe goes in on a 5% coin (its width was already paid), else an
     * INTERMEDIATE-class pick is placed, 1..6 times for an idle pose. A keyframe
     * never inserted is simply dropped. A debug `anchorScene` takes the opening
     * slot instead of the FIRST pick.
     */
    const createPlan = ({ storyDay, finalScene, keyframe = null, anchorScene = null, date = now(), startTime }) => {
        const resolvedStartTime = normalizeStartTime(startTime) ?? getStartTime(storage);
        const tidePhase = tidePhaseFor(date, resolvedStartTime);
        const planned = [];
        const folded = [finalScene];
        let previous = null;
        let budget = 300 - finalScene.width;
        let pending = null;
        if (keyframe) {
            budget -= keyframe.width;
            folded.push(keyframe);
            pending = keyframe;
        }
        const place = (record) => {
            planned.push({ scene: record, walkFrom: previous });
            previous = record;
        };
        const pay = (record) => {
            budget -= record.width;
            folded.push(record);
        };
        const pickNext = (mask) =>
            pickRecord(mask, { storyDay, tidePhase, budget, layoutBits: accumulateIslandLayout(folded) });

        if (anchorScene) {
            place(anchorScene);
            pay(anchorScene);
        } else if ((finalScene.classBits & PickClass.FIRST) === 0) {
            if (pending && (pending.classBits & PickClass.FIRST) !== 0 && chance(50, 'director-keyframe-first')) {
                place(pending);
                pending = null;
            } else {
                const first = pickNext(PickClass.FIRST);
                if (first) {
                    place(first);
                    pay(first);
                }
            }
        } else {
            budget = 0;
        }
        while (budget !== 0 && planned.length < 298) {
            if (pending && chance(5, 'director-keyframe-insert')) {
                place(pending);
                pending = null;
                continue;
            }
            const next = pickNext(PickClass.INTERMEDIATE);
            if (!next) break;
            const reps = next.classBits & PickClass.REPEAT ? fittingRepeatCount(next, budget) : 1;
            for (let placed = 0; placed < reps && planned.length < 298; placed++) {
                place(next);
                pay(next);
            }
        }
        planned.push({ scene: finalScene, walkFrom: previous });
        // The executable has folded every planned record's flags into the batch state
        // before the bake (FUN_1018_08b9 -> FUN_1010_1c41), ending first.
        const islandState = createIslandState(finalScene, storyDay, date, random, storyRandom, {
            startTime: resolvedStartTime,
            ...batchOptions(folded),
        });
        return { planned, islandState, startTime: resolvedStartTime };
    };

    const installPlan = ({ planned, islandState, startTime }, anchor = null) => {
        const wipe = transition;
        queue = planned.map(({ scene: selected, walkFrom }, index) =>
            makeSelection({
                selected,
                walkFrom,
                islandState,
                index,
                total: planned.length,
                wipe,
                anchor,
            }),
        );
        sequenceStatus = Object.freeze({
            storyDay: islandState.storyDay,
            total: planned.length,
            current: 0,
            remaining: planned.length,
            final: Object.freeze({ script: planned.at(-1).scene.script, tagId: planned.at(-1).scene.tagId }),
            anchor,
            lowTide: islandState.lowTide,
            tidePhase: islandState.tidePhase,
            night: islandState.night,
            // The Start Time this batch's phase was counted from (the story timeline
            // shows the clock ranges of its bands from it).
            startTime,
            next: Object.freeze({ script: planned[0].scene.script, tagId: planned[0].scene.tagId }),
        });
        publishStatus();
        transition = (transition + 1) % 5;
    };

    const buildSequence = () => {
        const date = now();
        const startTime = getStartTime(storage);
        const storyDay = updateStoryDay(storage, date);
        const { ending: finalScene, keyframe } = chooseEnding(storyDay, tidePhaseFor(date, startTime));
        lastEnding = finalScene;
        lastKeyframe = keyframe;
        // A day-locked keyframe planned for this sequence unlocks the next story day
        // (the dual-counter's second half; the binary sets 30ee and increments 2d9b
        // by the next planning). The calendar counter then chases it on the next
        // real-date change (see updateStoryDay).
        if (finalScene.day !== 0 || keyframe) unlockKeyframeDay(storage);
        installPlan(createPlan({ storyDay, finalScene, keyframe, date, startTime }));
    };

    const debugStoryDay = (sceneMetadata, requestedDay) =>
        sceneMetadata.day || Math.max(1, Math.min(11, Number(requestedDay) || 1));

    // Player/developer-facing story-day controls. These write the same three
    // persisted keys `updateStoryDay`/`getStartTime` read, so the arc holds and
    // then advances naturally from wherever it's set on the next real-date change.
    const getStoryDay = () => {
        let stored;
        try {
            stored = Number(storage?.getItem('jc-story-day')) || 1;
        } catch {
            stored = 1;
        }
        return Math.max(1, Math.min(11, stored));
    };

    // The stored Start Time override (normalized HHMM), or null when the 09:00
    // default applies.
    const getPersistedStartTime = () => {
        let stored;
        try {
            stored = storage?.getItem(START_TIME_KEY);
        } catch {
            return null;
        }
        if (!stored) return null;
        const startTime = normalizeStartTime(stored);
        return startTime == null || startTime === DEFAULT_START_TIME ? null : startTime;
    };

    const dateKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    const setStoryDay = (day) => {
        const clamped = Math.max(1, Math.min(11, Number(day) || 1));
        try {
            const currentDate = dateKey(now());
            storage?.setItem('jc-story-day', String(clamped));
            storage?.setItem('jc-story-target', String(clamped));
            storage?.setItem('jc-story-date', currentDate);
        } catch {
            // Persistence is optional.
        }
        return clamped;
    };

    const advanceStoryDay = () => {
        const next = getStoryDay() >= 11 ? 1 : getStoryDay() + 1;
        return setStoryDay(next);
    };

    // Restarting the story leaves the Start Time setting alone: it is a clock
    // preference, not story progress.
    const resetStory = () => setStoryDay(1);

    return {
        next() {
            if (queue.length === 0) buildSequence();
            const selection = queue.shift();
            sequenceStatus = Object.freeze({
                ...sequenceStatus,
                current: selection.sequence.index,
                remaining: queue.length,
                active: Object.freeze({ script: selection.script, tagId: selection.tagId }),
                next: queue.length
                    ? Object.freeze({ script: queue[0].script, tagId: queue[0].tagId })
                    : null,
            });
            publishStatus();
            return selection;
        },
        preview(script, tagId, { storyDay: requestedDay = 1 } = {}) {
            const selected = findScene(script, tagId);
            if (!selected) throw new RangeError(`Unknown Johnny scene ${script}#${tagId}`);
            const storyDay = debugStoryDay(selected, requestedDay);
            const finalScene = hasAll(selected.flags, F.FINAL) ? selected : chooseDebugFinal(selected);
            const date = now();
            const batch = finalScene === selected ? [selected] : [finalScene, selected];
            const islandState = createIslandState(finalScene, storyDay, date, random, storyRandom, {
                startTime: getStartTime(storage),
                ...batchOptions(batch),
            });
            return Object.freeze({
                ...makeSelection({ selected, islandState, index: 0, total: 1, wipe: null }),
                sequenceEnd: false,
                transition: null,
                preview: true,
            });
        },
        planFrom(script, tagId, { storyDay: requestedDay = 1 } = {}) {
            const selected = findScene(script, tagId);
            if (!selected) throw new RangeError(`Unknown Johnny scene ${script}#${tagId}`);
            const storyDay = debugStoryDay(selected, requestedDay);
            const finalScene = hasAll(selected.flags, F.FINAL) ? selected : chooseDebugFinal(selected);
            const anchorScene = hasAll(selected.flags, F.FINAL) ? null : selected;
            const anchor = Object.freeze({ script: selected.script, tagId: selected.tagId });
            installPlan(createPlan({ storyDay, finalScene, anchorScene }), anchor);
            return sequenceStatus;
        },
        status: () => sequenceStatus,
        getStoryDay,
        getStartTime: getPersistedStartTime,
        setStoryDay,
        advanceStoryDay,
        resetStory,
        setRandomSource(source) {
            storyRandom = source;
        },
        subscribeStatus(listener) {
            statusListeners.add(listener);
            listener(sequenceStatus);
            return () => statusListeners.delete(listener);
        },
        describe: describeScene,
        snapshot: () => Object.freeze([...queue]),
    };
};

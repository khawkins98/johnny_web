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

// A scene record. `tideMin`/`tideMax` are the binary's tide-eligibility window
// [tideMin, tideMax) over the 16 tide phases (default [0,16) = any tide). `width`/`weight`
// come from SCENE_METRICS; `repeat` (binary flagsB & 0x08) marks the idle poses that may
// repeat 1..6x in a sequence.
const scene = (script, tagId, startSpot, startHeading, endSpot, endHeading, day, flags, tideMin = 0, tideMax = 16) => {
    const isPose = script === POSE;
    const [width, weight] = isPose ? [5, 1] : SCENE_METRICS.get(`${script.replace('.ADS', '')}#${tagId}`) ?? [15, 10];
    return Object.freeze({
        script, tagId, startSpot, startHeading, endSpot, endHeading, day, flags,
        tideMin, tideMax, width, weight, repeat: isPose,
    });
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
const weightedPick = (random, candidates) => {
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = Math.floor(random() * total);
    for (const candidate of candidates) {
        if (roll < candidate.weight) return candidate;
        roll -= candidate.weight;
    }
    return candidates[candidates.length - 1];
};
// Repeat count for an idle (flagsB & 0x08) scene: centre-weighted buckets summing 100 -> 1..6.
const REPEAT_WEIGHTS = [10, 20, 30, 20, 10, 10];
const repeatCount = (random) => {
    let roll = Math.floor(random() * 100);
    for (let bucket = 0; bucket < REPEAT_WEIGHTS.length; bucket++) {
        if (roll < REPEAT_WEIGHTS[bucket]) return bucket + 1;
        roll -= REPEAT_WEIGHTS[bucket];
    }
    return REPEAT_WEIGHTS.length;
};

// Tide runs over 16 phases; a scene is eligible when its [tideMin, tideMax) window
// contains the current phase. Recovered from the original (FUN_1018_0540 / hasher
// FUN_1018_0c48): the phase is TIME-OF-DAY driven at half-hour resolution, offset by
// the persisted story StartTime, NOT random.
//   hphase(x) = (floor(x/50) + floor((x%100)/30) + 14) % 16
//   tidePhase = (hphase(hour*100 + (min<30?0:30)) - hphase(StartTime) + 16) % 16
// where StartTime is the (month*100 + day) captured when the story first started.
const TIDE_PHASES = 16;
const LOW_TIDE_PHASES = 12; // render low tide when tidePhase >= 12 (0x0c)
const hphase = (x) => (Math.floor(x / 50) + Math.floor((x % 100) / 30) + 14) % TIDE_PHASES;
const tidePhaseFor = (date, startTime) => {
    const now = date.getHours() * 100 + (date.getMinutes() < 30 ? 0 : 30);
    return (hphase(now) - hphase(startTime) + TIDE_PHASES) % TIDE_PHASES;
};
const inTideWindow = (candidate, tidePhase) =>
    tidePhase == null || (candidate.tideMin <= tidePhase && tidePhase < candidate.tideMax);
// The story StartTime reference (month*100 + day), captured on first run and persisted.
const getStartTime = (storage, date) => {
    let stored;
    try {
        stored = storage?.getItem('jc-start-time');
    } catch {
        // Storage may be unavailable (privacy mode); fall back to today's date.
    }
    // Guard a corrupted stored value: a NaN StartTime would poison tidePhase (NaN),
    // empty the eligible set, and crash the picker. Fall back to recomputing from today.
    if (stored) {
        const parsed = Number(stored);
        if (Number.isFinite(parsed)) return parsed;
    }
    const startTime = (date.getMonth() + 1) * 100 + date.getDate();
    try {
        storage?.setItem('jc-start-time', String(startTime));
    } catch {
        // Persistence is optional.
    }
    return startTime;
};

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

// Unlock the next keyframe day: only when a day-locked keyframe scene actually plays
// AND the calendar has caught up (target <= cur). The binary's unlock is unconditional
// (`DAT_2d9b + 1`): target reaches 12, the next calendar tick drives `cur` to 12, and
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

const createClouds = (random) => {
    const dimensions = [
        [128, 36],
        [192, 57],
        [264, 76],
    ];
    const flipX = random() < 0.5;
    let count;
    if (random() >= 0.5) count = 1;
    else if (random() >= 0.5) count = 0;
    else if (Math.floor(random() * 4) !== 0) count = 2;
    else if (Math.floor(random() * 4) !== 0) count = 3;
    else if (Math.floor(random() * 4) !== 0) count = 4;
    else count = 5;
    return Array.from({ length: count }, () => {
        const frame = randomIndex(random, 3);
        const [width, height] = dimensions[frame];
        return Object.freeze({
            frame: frame + 15,
            x: Math.floor(random() * (640 - width)),
            y: Math.floor(random() * (135 - height)),
            flipX,
        });
    });
};

const createIslandState = (
    finalScene,
    storyDay,
    date,
    random,
    { allowLowTide = true, allowVariablePosition = true, startTime = 0 } = {},
) => {
    const tidePhase = tidePhaseFor(date, startTime);
    const lowTide = allowLowTide && tidePhase >= LOW_TIDE_PHASES;
    let x = 0;
    let y = 0;
    if (allowVariablePosition && hasAll(finalScene.flags, F.VARPOS_OK)) {
        if (random() >= 0.5) {
            x = -222 + Math.floor(random() * 109);
            y = -44 + Math.floor(random() * 128);
        } else if (random() >= 0.5) {
            x = -114 + Math.floor(random() * 134);
            y = -14 + Math.floor(random() * 99);
        } else {
            x = -114 + Math.floor(random() * 119);
            y = -73 + Math.floor(random() * 60);
        }
    } else if (allowVariablePosition && hasAll(finalScene.flags, F.LEFT_ISLAND)) {
        x = -272;
    }
    const raft = hasAll(finalScene.flags, F.NORAFT) ? 0 : storyDay <= 2 ? 1 : storyDay <= 5 ? storyDay - 1 : 5;
    return Object.freeze({
        island: hasAll(finalScene.flags, F.ISLAND),
        // The host always composes Johnny's persistent island with the primary
        // island layout. TTM scenes may load ISLAND2.SCR for their own drawing;
        // that child-local background id must not move the host-owned island.
        islandLayoutId: 1,
        lowTide,
        tidePhase,
        night: date.getHours() < 6 || date.getHours() >= 18,
        raft,
        x,
        y,
        holidayAllowed: !hasAll(finalScene.flags, F.HOLIDAY_NOK),
        oceanIndex: randomIndex(random, 3),
        presentationKey: Object.freeze({}),
        clouds: Object.freeze(createClouds(random)),
        storyDay,
    });
};

export const createJohnnyStoryController = ({
    random = Math.random,
    storage = globalThis.localStorage,
    now = () => new Date(),
} = {}) => {
    let queue = [];
    let transition = 0;
    let sequenceStatus = null;
    const recentFinals = []; // anti-repeat: the last two chosen endings (FUN_1018_08b9)
    const statusListeners = new Set();

    const publishStatus = () => {
        for (const listener of statusListeners) listener(sequenceStatus);
    };

    const eligible = (storyDay, wanted = 0, unwanted = 0, tidePhase = null) =>
        JOHNNY_SCENES.filter(
            (candidate) =>
                hasAll(candidate.flags, wanted) &&
                (candidate.flags & unwanted) === 0 &&
                (candidate.day === 0 || candidate.day === storyDay) &&
                inTideWindow(candidate, tidePhase),
        );

    // Faithful ending selection (FUN_1018_08b9 / FUN_1018_0d76, phase6 §3): a 10%-gated
    // day-locked keyframe first, else a WEIGHT-ROULETTE over ordinary `flagsB & 4`
    // endings -- excluding first-intermediate (`flagsB & 1` -> F.FIRST) scenes and the
    // last two chosen endings (anti-repeat). Replaces the old uniform `pick`, which
    // over-represented keyframes and low-weight endings.
    const chooseFinalScene = (storyDay, tidePhase) => {
        const finals = eligible(storyDay, F.FINAL, 0, tidePhase);
        if (finals.length === 0) return pick(random, JOHNNY_SCENES.filter((s) => hasAll(s.flags, F.FINAL)));
        if (random() < 0.1) {
            const keyframe = finals.find((s) => s.day === storyDay && s.day !== 0 && !recentFinals.includes(s));
            if (keyframe) return keyframe;
        }
        let pool = finals.filter((s) => !hasAll(s.flags, F.FIRST) && !recentFinals.includes(s));
        if (pool.length === 0) pool = finals.filter((s) => !recentFinals.includes(s));
        if (pool.length === 0) pool = finals;
        return weightedPick(random, pool);
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
        const sceneOffset = Object.freeze({
            x: islandState.x + (hasAll(selected.flags, F.LEFT_ISLAND) ? 272 : 0),
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

    const chooseDebugFinal = (anchor, storyDay) => {
        const candidates = eligible(storyDay, F.FINAL, F.FIRST).filter(
            (candidate) =>
                hasAll(anchor.flags, F.VARPOS_OK) ||
                !hasAll(candidate.flags, F.LEFT_ISLAND) ||
                hasAll(candidate.flags, F.VARPOS_OK),
        );
        return pick(random, candidates);
    };

    const createPlan = ({ storyDay, finalScene, anchorScene = null, date = now(), startTime }) => {
        const resolvedStartTime = startTime ?? getStartTime(storage, date);
        const constraints = anchorScene
            ? {
                  startTime: resolvedStartTime,
                  allowLowTide: anchorScene.tideMax > LOW_TIDE_PHASES,
                  allowVariablePosition: hasAll(anchorScene.flags, F.VARPOS_OK),
              }
            : { startTime: resolvedStartTime };
        const islandState = createIslandState(finalScene, storyDay, date, random, constraints);
        const planned = [];
        let previous = null;

        if (anchorScene) {
            planned.push({ scene: anchorScene, walkFrom: null });
            previous = anchorScene;
        }

        if (!hasAll(finalScene.flags, F.FIRST)) {
            let wanted = 0;
            if (islandState.x !== 0 || islandState.y !== 0) wanted |= F.VARPOS_OK;
            // Poses are ADS-less "stand at spot" fillers, selectable as intermediates
            // (the host renders them via runJohnnyPose). Only FINAL scenes are excluded
            // from the intermediate pool here.
            let unwanted = F.FINAL | (anchorScene ? F.FIRST : 0);
            // 300-unit spatial walk-span budget (FUN_1018_08b9): the ending's width is
            // spent first, then intermediates fill until the budget runs out (or the 298
            // slot cap). Each candidate must fit its tide window (already applied by
            // eligible) and have width/2 < remaining budget; one is chosen by weight
            // roulette. An idle (repeat) scene runs 1..6x, centre-weighted, rejecting a
            // repeat count that would overrun the budget unless it lands exactly on 0.
            let budget = 300 - finalScene.width - (anchorScene ? anchorScene.width : 0);
            let slots = anchorScene ? 1 : 0;
            while (budget > 0 && slots < 298) {
                const candidates = eligible(storyDay, wanted, unwanted, islandState.tidePhase).filter(
                    (candidate) => candidate.width / 2 < budget,
                );
                if (candidates.length === 0) break;
                const next = weightedPick(random, candidates);
                let reps = 1;
                if (next.repeat) {
                    reps = repeatCount(random);
                    // Re-roll a repeat count that would overrun the budget (unless it lands
                    // exactly on 0), bounded so a degenerate/constant rng still terminates.
                    for (
                        let attempt = 0;
                        attempt < 8 && reps > 1 && next.width * reps > budget && next.width * reps - budget !== 0;
                        attempt++
                    ) {
                        reps = repeatCount(random);
                    }
                    // Hard guarantee: never place more repeats than the budget can hold.
                    reps = Math.min(reps, Math.max(1, Math.floor(budget / next.width)));
                }
                for (let placed = 0; placed < reps && slots < 298; placed++) {
                    planned.push({ scene: next, walkFrom: previous });
                    previous = next;
                    budget -= next.width;
                    slots++;
                }
                unwanted |= F.FIRST;
            }
        }
        planned.push({ scene: finalScene, walkFrom: previous });
        return { planned, islandState };
    };

    const installPlan = ({ planned, islandState }, anchor = null) => {
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
            next: Object.freeze({ script: planned[0].scene.script, tagId: planned[0].scene.tagId }),
        });
        publishStatus();
        transition = (transition + 1) % 5;
    };

    const buildSequence = () => {
        const date = now();
        const startTime = getStartTime(storage, date);
        const storyDay = updateStoryDay(storage, date);
        const finalScene = chooseFinalScene(storyDay, tidePhaseFor(date, startTime));
        recentFinals.push(finalScene);
        if (recentFinals.length > 2) recentFinals.shift();
        // A day-locked keyframe scene playing this sequence unlocks the next story day
        // (the dual-counter's second half). The calendar counter then chases it on the
        // next real-date change (see updateStoryDay).
        if (finalScene.day !== 0) unlockKeyframeDay(storage);
        installPlan(createPlan({ storyDay, finalScene, date, startTime }));
    };

    const debugStoryDay = (sceneMetadata, requestedDay) =>
        sceneMetadata.day || Math.max(1, Math.min(11, Number(requestedDay) || 1));

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
            const finalScene = hasAll(selected.flags, F.FINAL) ? selected : chooseDebugFinal(selected, storyDay);
            const date = now();
            const islandState = createIslandState(finalScene, storyDay, date, random, {
                startTime: getStartTime(storage, date),
                allowLowTide: selected.tideMax > LOW_TIDE_PHASES,
                allowVariablePosition: hasAll(selected.flags, F.VARPOS_OK),
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
            const finalScene = hasAll(selected.flags, F.FINAL) ? selected : chooseDebugFinal(selected, storyDay);
            const anchorScene = hasAll(selected.flags, F.FINAL) ? null : selected;
            const anchor = Object.freeze({ script: selected.script, tagId: selected.tagId });
            installPlan(createPlan({ storyDay, finalScene, anchorScene }), anchor);
            return sequenceStatus;
        },
        status: () => sequenceStatus,
        subscribeStatus(listener) {
            statusListeners.add(listener);
            listener(sequenceStatus);
            return () => statusListeners.delete(listener);
        },
        describe: describeScene,
        snapshot: () => Object.freeze([...queue]),
    };
};

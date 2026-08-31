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

// A scene record. `tideMin`/`tideMax` are the binary's tide-eligibility window
// [tideMin, tideMax) over the 16 tide phases (default [0,16) = any tide).
const scene = (script, tagId, startSpot, startHeading, endSpot, endHeading, day, flags, tideMin = 0, tideMax = 16) =>
    Object.freeze({ script, tagId, startSpot, startHeading, endSpot, endHeading, day, flags, tideMin, tideMax });

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
    scene('JOHNNY.ADS', 2, E, SW, G, NE, 2, F.FINAL | F.ISLAND | F.VARPOS_OK),
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
// Tide runs over 16 phases; a scene is eligible when its [tideMin, tideMax) window
// contains the current phase. Low tide is the first 12 phases (the binary's low-tide
// windows end at 12; high-tide variants start at 12). The exact wall-clock -> phase
// formula is recovered in a later chunk; this provisional mapping is deterministic.
const TIDE_PHASES = 16;
const LOW_TIDE_PHASES = 12;
const tidePhaseFor = (date) =>
    Math.floor(((date.getHours() * 60 + date.getMinutes()) / 1440) * TIDE_PHASES) % TIDE_PHASES;
const inTideWindow = (candidate, tidePhase) =>
    tidePhase == null || (candidate.tideMin <= tidePhase && tidePhase < candidate.tideMax);
const dayOfYear = (date) =>
    Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);

const updateStoryDay = (storage, date) => {
    const currentDate = String(dayOfYear(date));
    let storedDate;
    let storedDay;
    try {
        storedDate = storage?.getItem('jc-story-date');
        storedDay = storage?.getItem('jc-story-day');
    } catch {
        // Storage can be unavailable in privacy modes. The story still runs,
        // but starts at day one for this page session.
    }
    let currentDay = Number(storedDay) || 1;
    if (storedDate && storedDate !== currentDate) currentDay++;
    if (currentDay < 1 || currentDay > 11) currentDay = 1;
    try {
        storage?.setItem('jc-story-date', currentDate);
        storage?.setItem('jc-story-day', String(currentDay));
    } catch {
        // Persistence is an optional host service, not an engine requirement.
    }
    return currentDay;
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
    { allowLowTide = true, allowVariablePosition = true } = {},
) => {
    const tidePhase = tidePhaseFor(date);
    const lowTide = allowLowTide && tidePhase < LOW_TIDE_PHASES;
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

    const createPlan = ({ storyDay, finalScene, anchorScene = null, date = now() }) => {
        const constraints = anchorScene
            ? {
                  allowLowTide: anchorScene.tideMin < LOW_TIDE_PHASES,
                  allowVariablePosition: hasAll(anchorScene.flags, F.VARPOS_OK),
              }
            : undefined;
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
            // POSE records exist in the catalogue but have no render path yet (Chunk 2);
            // exclude them from selection until then.
            let unwanted = F.FINAL | F.POSE | (anchorScene ? F.FIRST : 0);
            const count = 6 + Math.floor(random() * 14);
            for (let index = anchorScene ? 1 : 0; index < count; index++) {
                // Tide-window eligibility replaces the old LOWTIDE_OK flag filter.
                const next = pick(random, eligible(storyDay, wanted, unwanted, islandState.tidePhase));
                planned.push({ scene: next, walkFrom: previous });
                previous = next;
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
        const storyDay = updateStoryDay(storage, date);
        const finalScene = pick(random, eligible(storyDay, F.FINAL, 0, tidePhaseFor(date)));
        installPlan(createPlan({ storyDay, finalScene, date }));
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
            const islandState = createIslandState(finalScene, storyDay, now(), random, {
                allowLowTide: selected.tideMin < LOW_TIDE_PHASES,
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

import { describe, expect, it } from 'vitest';
import { createJohnnyStoryController, JOHNNY_SCENES, PickClass, isStoryEligible } from '../story-controller.mjs';

// How the original plans a batch (FUN_1018_08b9 at 1018:08b9) and picks each record
// (FUN_1018_0d76 at 1018:0d76), pinned rule by rule. The random source is scripted
// per draw site so a test can land the roulette on a chosen record:
//   roll = word % total + 1 walks the candidates in catalogue order (0d76's second
//   loop), so a word equal to the weight before the target lands on it.

const memoryStorage = (initial = {}) => {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        values,
    };
};

const record = (script, tagId) => JOHNNY_SCENES.find((s) => s.script === script && s.tagId === tagId);
const key = (selection) => (selection.pose ? 'POSE' : `${selection.script.replace('.ADS', '')}#${selection.tagId}`);
const inWindow = (s, phase) => s.tideMin <= phase && phase < s.tideMax;

/** Candidates of a picker class at `phase`, in catalogue order (0d76's filter, budget 999, no layout yet). */
const classCandidates = (mask, phase) =>
    JOHNNY_SCENES.filter((s) => (s.classBits & mask) !== 0 && s.day === 0 && inWindow(s, phase));
/** The raw word that lands the roulette on `target` among `candidates`. */
const wordFor = (candidates, target) => {
    const index = candidates.indexOf(target);
    if (index < 0) throw new Error(`${target.script}#${target.tagId} is not a candidate`);
    return candidates.slice(0, index).reduce((sum, s) => sum + s.weight, 0);
};

/**
 * A scripted random source: `rules[site]` is a value, an array consumed in order
 * (its last value repeats), or a function of (divisor | weights, callIndex).
 */
const scripted = (rules = {}) => {
    const draws = [];
    const counts = new Map();
    const answer = (site, arg) => {
        const index = counts.get(site) ?? 0;
        counts.set(site, index + 1);
        const rule = rules[site];
        // Unscripted sites draw 0, except the idle repeat count, which the planner
        // (like the binary) re-draws while it is 0: default to one repeat.
        if (rule == null) return site === 'director-repeat-count' ? 1 : 0;
        if (typeof rule === 'function') return rule(arg, index);
        if (Array.isArray(rule)) return rule[Math.min(index, rule.length - 1)];
        return rule;
    };
    return {
        draws,
        source: {
            modulo(divisor, site) {
                const value = answer(site, divisor) % divisor;
                draws.push({ site, divisor, value });
                return value;
            },
            bit(mask, site) {
                const value = answer(site, mask) & mask;
                draws.push({ site, mask, value });
                return value;
            },
            weightedBucket(weights, site) {
                const value = answer(site, weights);
                draws.push({ site, weights, value });
                return value;
            },
        },
    };
};

// 12:00 with the default StartTime 0900 is phase 6 (a day sky, any-tide and
// daytime windows open); 23:00 is phase 12 (night).
const NOON = new Date(2026, 6, 21, 12);
const NIGHT = new Date(2026, 6, 21, 23);
const PHASE_NOON = 6;

const planner = ({ day = 1, now = NOON, rules = {}, storage = memoryStorage() } = {}) => {
    const { source, draws } = scripted(rules);
    storage.setItem('jc-story-day', String(day));
    storage.setItem('jc-story-target', String(day));
    storage.setItem('jc-story-date', `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`);
    const controller = createJohnnyStoryController({ random: () => 0.5, storyRandom: source, storage, now: () => now });
    const batch = () => {
        const queue = [];
        let selection;
        do {
            selection = controller.next();
            queue.push(key(selection));
        } while (!selection.sequenceEnd && queue.length < 400);
        return queue;
    };
    return { controller, draws, batch, storage };
};

const GATE_CLOSED = 1; // word % 10 != 0: FUN_1018_0d76(0x80) returns nothing

describe('catalogue picker classes (binary flagsB low nibble)', () => {
    it('exposes the four class bits the picker masks on', () => {
        expect(PickClass).toEqual({ FIRST: 0x01, INTERMEDIATE: 0x02, ENDING: 0x04, REPEAT: 0x08, KEYFRAME: 0x80 });
        expect(record('ACTIVITY.ADS', 11).classBits).toBe(0x05); // 0x205: a solo ending that may also open a batch
        expect(record('ACTIVITY.ADS', 8).classBits).toBe(0x01); // 0x201: first slot only
        expect(record('BUILDING.ADS', 1).classBits).toBe(0x03);
        expect(record('FISHING.ADS', 3).classBits).toBe(0x04);
        expect(record('MARY.ADS', 3).classBits).toBe(0x05);
        expect(record('JOHNNY.ADS', 2).classBits).toBe(0x03);
        expect(JOHNNY_SCENES.filter((s) => s.script === 'POSE').every((s) => s.classBits === 0x0b)).toBe(true);
    });
});

describe('the ending roulette (FUN_1018_0d76(4) from FUN_1018_08b9)', () => {
    it('draws by weight over every day-0 ending in the phase window, in catalogue order', () => {
        const candidates = classCandidates(PickClass.ENDING, PHASE_NOON);
        // The ending class is flagsB & 4 and day 0 only: day-locked endings are out,
        // solo endings (ACTIVITY#11) are in, night-only BUILDING#6 is out at noon.
        expect(candidates).toContain(record('ACTIVITY.ADS', 11));
        expect(candidates).not.toContain(record('BUILDING.ADS', 6));
        expect(candidates.some((s) => s.day !== 0)).toBe(false);
        const target = record('FISHING.ADS', 5);
        const { batch, draws } = planner({
            rules: { 'director-keyframe-gate': GATE_CLOSED, 'director-final-scene': wordFor(candidates, target) },
        });
        expect(batch().at(-1)).toBe('FISHING#5');
        const roulette = draws.find((d) => d.site === 'director-final-scene');
        expect(roulette.divisor).toBe(candidates.reduce((sum, s) => sum + s.weight, 0));
    });

    it('lets ACTIVITY#11 (flagsB 0x205) end a batch on its own', () => {
        const candidates = classCandidates(PickClass.ENDING, PHASE_NOON);
        const { batch, controller } = planner({
            rules: {
                'director-keyframe-gate': GATE_CLOSED,
                'director-final-scene': wordFor(candidates, record('ACTIVITY.ADS', 11)),
            },
        });
        expect(batch()).toEqual(['ACTIVITY#11']);
        expect(controller.status().final).toEqual({ script: 'ACTIVITY.ADS', tagId: 11 });
    });

    it('re-draws when the roulette lands on the previous ending, and only that one', () => {
        const candidates = classCandidates(PickClass.ENDING, PHASE_NOON);
        const a = wordFor(candidates, record('MISCGAG.ADS', 1));
        const b = wordFor(candidates, record('ACTIVITY.ADS', 5));
        // batch 1: A. batch 2: A is refused (30e8), the next word gives B. batch 3: A
        // is two back and accepted on the first word.
        const { batch, draws } = planner({
            rules: { 'director-keyframe-gate': GATE_CLOSED, 'director-final-scene': [a, a, b, a] },
        });
        expect(batch().at(-1)).toBe('MISCGAG#1');
        const before = draws.filter((d) => d.site === 'director-final-scene').length;
        expect(batch().at(-1)).toBe('ACTIVITY#5');
        expect(draws.filter((d) => d.site === 'director-final-scene').length - before).toBe(2);
        expect(batch().at(-1)).toBe('MISCGAG#1');
    });

    it('terminates on a degenerate random source that always lands on the previous ending', () => {
        const { batch } = planner({ rules: { 'director-keyframe-gate': GATE_CLOSED, 'director-final-scene': 0 } });
        const first = batch().at(-1);
        const second = batch().at(-1);
        expect(second).not.toBe(first);
    });
});

describe('the first slot (FUN_1018_0d76(1))', () => {
    it('is drawn from the flagsB-bit-1 class, separately from the intermediates', () => {
        const endings = classCandidates(PickClass.ENDING, PHASE_NOON);
        const ending = record('MISCGAG.ADS', 1);
        const firsts = classCandidates(PickClass.FIRST, PHASE_NOON).filter((s) => s.width / 2 < 300 - ending.width);
        // ACTIVITY#8 (0x201) and ACTIVITY#11 (0x205) are first-slot candidates but not
        // intermediates; JOHNNY#2 (day 2) is in neither class.
        expect(firsts).toContain(record('ACTIVITY.ADS', 8));
        expect(firsts).toContain(record('ACTIVITY.ADS', 11));
        expect(classCandidates(PickClass.INTERMEDIATE, PHASE_NOON)).not.toContain(record('ACTIVITY.ADS', 8));
        expect(classCandidates(PickClass.INTERMEDIATE, PHASE_NOON)).not.toContain(record('ACTIVITY.ADS', 11));
        expect(firsts).not.toContain(record('JOHNNY.ADS', 2));
        const { batch, draws } = planner({
            rules: {
                'director-keyframe-gate': GATE_CLOSED,
                'director-final-scene': wordFor(endings, ending),
                'director-first-scene': wordFor(firsts, record('ACTIVITY.ADS', 8)),
            },
        });
        const queue = batch();
        expect(queue[0]).toBe('ACTIVITY#8');
        expect(queue.at(-1)).toBe('MISCGAG#1');
        const sites = draws.map((d) => d.site).filter((s) => s.startsWith('director-'));
        expect(sites.slice(0, 3)).toEqual(['director-keyframe-gate', 'director-final-scene', 'director-first-scene']);
        expect(draws.find((d) => d.site === 'director-first-scene').divisor).toBe(
            firsts.reduce((sum, s) => sum + s.weight, 0),
        );
    });

    it('can open a multi-gag batch with ACTIVITY#11', () => {
        const endings = classCandidates(PickClass.ENDING, PHASE_NOON);
        const ending = record('ACTIVITY.ADS', 5);
        const firsts = classCandidates(PickClass.FIRST, PHASE_NOON).filter((s) => s.width / 2 < 300 - ending.width);
        const { batch } = planner({
            rules: {
                'director-keyframe-gate': GATE_CLOSED,
                'director-final-scene': wordFor(endings, ending),
                'director-first-scene': wordFor(firsts, record('ACTIVITY.ADS', 11)),
            },
        });
        const queue = batch();
        expect(queue[0]).toBe('ACTIVITY#11');
        expect(queue.length).toBeGreaterThan(2);
        expect(queue.at(-1)).toBe('ACTIVITY#5');
        expect(queue.slice(1, -1)).not.toContain('ACTIVITY#11');
    });

    it('is skipped for a solo ending (flagsB & 1): the batch is the ending alone', () => {
        const endings = classCandidates(PickClass.ENDING, PHASE_NOON);
        const { batch, draws } = planner({
            rules: {
                'director-keyframe-gate': GATE_CLOSED,
                'director-final-scene': wordFor(endings, record('ACTIVITY.ADS', 11)),
            },
        });
        expect(batch()).toEqual(['ACTIVITY#11']);
        expect(draws.some((d) => d.site === 'director-first-scene')).toBe(false);
        expect(draws.some((d) => d.site === 'director-intermediate-scene')).toBe(false);
    });
});

describe('day-locked records and the 10% keyframe gate (FUN_1018_0d76(0x80))', () => {
    it('never plays a day-locked record while the gate is closed', () => {
        // The ordinary classes require day == 0, so JOHNNY#2 cannot leak in on day 2
        // whatever the roulette does.
        for (const word of [0, 7, 31, 97]) {
            const { batch } = planner({
                day: 2,
                rules: {
                    'director-keyframe-gate': GATE_CLOSED,
                    'director-final-scene': word,
                    'director-first-scene': word,
                    'director-intermediate-scene': (divisor, i) => (word * 7 + i * 13) % divisor,
                },
            });
            for (let i = 0; i < 6; i++) expect(batch()).not.toContain('JOHNNY#2');
        }
    });

    it("opens on word % 10 == 0, picks among the day's records and sets the target day to the current day", () => {
        const storage = memoryStorage({ 'jc-story-target': '5' });
        const { batch, draws, controller } = planner({
            day: 2,
            storage,
            rules: { 'director-keyframe-gate': 0, 'director-keyframe-first': 1 },
        });
        const queue = batch();
        // JOHNNY#2 (flagsB 0x3) is an intermediate keyframe: here the 50% coin puts it first.
        expect(queue[0]).toBe('JOHNNY#2');
        expect(queue.filter((k) => k === 'JOHNNY#2')).toHaveLength(1);
        const sites = draws.map((d) => d.site);
        expect(sites.slice(0, 2)).toEqual(['director-keyframe-gate', 'director-keyframe-scene']);
        expect(draws[1].divisor).toBe(record('JOHNNY.ADS', 2).weight);
        // 2d9b = 2d9c on the gate, then the planned keyframe unlocks the next day.
        expect(storage.values.get('jc-story-target')).toBe('3');
        expect(controller.status().storyDay).toBe(2);
    });

    it('a keyframe intermediate is inserted by the 5% coin before an ordinary pick, else dropped', () => {
        const { batch, draws } = planner({
            day: 6,
            rules: { 'director-keyframe-gate': 0, 'director-keyframe-first': 0, 'director-keyframe-insert': [0, 0, 1] },
        });
        const queue = batch();
        expect(queue[0]).not.toBe('JOHNNY#3');
        // first slot, two ordinary picks (each preceded by a failed 5% coin), then the keyframe
        const inserts = draws.filter((d) => d.site === 'director-keyframe-insert');
        expect(inserts).toHaveLength(3);
        expect(inserts.every((d) => JSON.stringify(d.weights) === '[5]')).toBe(true);
        expect(queue.filter((k) => k === 'JOHNNY#3')).toHaveLength(1);
        const dropped = planner({
            day: 6,
            rules: { 'director-keyframe-gate': 0, 'director-keyframe-first': 0, 'director-keyframe-insert': 0 },
        });
        expect(dropped.batch()).not.toContain('JOHNNY#3');
    });

    it('rejects solo endings while a keyframe intermediate is pending', () => {
        const endings = classCandidates(PickClass.ENDING, PHASE_NOON);
        const solo = wordFor(endings, record('ACTIVITY.ADS', 11));
        const plain = wordFor(endings, record('FISHING.ADS', 3));
        const { batch, draws } = planner({
            day: 2,
            rules: { 'director-keyframe-gate': 0, 'director-keyframe-first': 1, 'director-final-scene': [solo, plain] },
        });
        const queue = batch();
        expect(queue.at(-1)).toBe('FISHING#3');
        expect(draws.filter((d) => d.site === 'director-final-scene')).toHaveLength(2);
    });

    it('ignores the tide window on the gate path: MARY#1 (night only) ends a noon batch on day 5', () => {
        const { batch, controller } = planner({ day: 5, rules: { 'director-keyframe-gate': 0 } });
        const queue = batch();
        expect(queue.at(-1)).toBe('MARY#1');
        expect(queue.length).toBeGreaterThan(1); // 0x1804 is not a solo ending: first slot and intermediates precede it
        expect(controller.status()).toMatchObject({ tidePhase: PHASE_NOON, night: true });
    });

    it('ignores the tide window on the gate path: JOHNNY#6 (night only) plays solo by day on day 10', () => {
        const { batch } = planner({ day: 10, rules: { 'director-keyframe-gate': 0 } });
        expect(batch()).toEqual(['JOHNNY#6']);
    });

    it('does not take the keyframe when it was the previous ending or the previous keyframe', () => {
        const storage = memoryStorage();
        const { batch } = planner({
            day: 3,
            storage,
            rules: { 'director-keyframe-gate': 0, 'director-final-scene': 0 },
        });
        expect(batch()).toEqual(['SUZY#1']);
        expect(storage.values.get('jc-story-target')).toBe('4');
        // The gate opens again, SUZY#1 == 30e8 is refused, 2d9b = 2d9c has already
        // happened, and an ordinary ending is drawn instead.
        const second = batch();
        expect(second.at(-1)).not.toBe('SUZY#1');
        expect(storage.values.get('jc-story-target')).toBe('3');
        // Two back it is allowed again.
        expect(batch()).toEqual(['SUZY#1']);
    });

    it('a dropped keyframe intermediate still counts as the previous keyframe (30ea)', () => {
        const { batch, draws } = planner({
            day: 6,
            rules: { 'director-keyframe-gate': 0, 'director-keyframe-first': 0, 'director-keyframe-insert': 0 },
        });
        expect(batch()).not.toContain('JOHNNY#3');
        const before = draws.length;
        // Second batch: the gate opens, JOHNNY#3 is 30ea and refused, so no keyframe
        // roulette or coin is drawn and it is still absent.
        expect(batch()).not.toContain('JOHNNY#3');
        const sites = draws.slice(before).map((d) => d.site);
        expect(sites[0]).toBe('director-keyframe-gate');
        expect(sites[1]).toBe('director-keyframe-scene');
        expect(sites).not.toContain('director-keyframe-first');
        expect(sites).not.toContain('director-keyframe-insert');
    });
});

describe('isStoryEligible (what the planner can reach on a day at a phase)', () => {
    it('admits common records in their window and day-locked records on their day at any phase', () => {
        expect(isStoryEligible(record('BUILDING.ADS', 6), 1, 6)).toBe(false); // [12,16)
        expect(isStoryEligible(record('BUILDING.ADS', 6), 1, 13)).toBe(true);
        expect(isStoryEligible(record('ACTIVITY.ADS', 11), 1, 6)).toBe(true);
        expect(isStoryEligible(record('MARY.ADS', 1), 5, 6)).toBe(true); // key scene: the gate ignores the window
        expect(isStoryEligible(record('MARY.ADS', 1), 4, 13)).toBe(false);
        expect(isStoryEligible(record('JOHNNY.ADS', 2), 2, 0)).toBe(true);
        expect(isStoryEligible(record('JOHNNY.ADS', 2), 3, 0)).toBe(false);
    });
});

describe('planned batches at night', () => {
    it('keeps the ordinary picks to the night window', () => {
        const { batch, controller } = planner({
            now: NIGHT,
            rules: { 'director-keyframe-gate': GATE_CLOSED, 'director-intermediate-scene': (d, i) => (i * 37) % d },
        });
        const queue = batch();
        expect(controller.status().tidePhase).toBe(12);
        for (const name of queue.slice(0, -1)) {
            if (name === 'POSE') continue;
            const [script, tag] = name.split('#');
            expect(inWindow(record(`${script}.ADS`, Number(tag)), 12), name).toBe(true);
        }
    });
});

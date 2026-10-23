// normal-play.mjs -- pure helpers for normal-play captures of the original
// (capture-normal-play.mjs): parse the DBX_HOST log into planned batches, name the
// catalogue records, derive the host selection (titleState) a batch was baked with,
// and summarise the story mix. No I/O; the CLIs are normal-play-report.mjs and
// host-check.mjs.
//
// A HOST line is written whenever a host/planner global changes:
//   HOST <tick> clk=<2e72> day=<2d9b>,<2d9c> hol=<30bc> ph=<30ba> b4=<30b4> b2=<30b2>
//        c0=<30c0> c2=<30c2> c4=<30c4> c6=<30c6> off=<46e4>,<46e6> qi=<30f2> q=<adsId:tag,...>
// (docs/scrantic-re-findings.md B.6). `q` is the planner's queue 30f4[] as
// adsId:tag pairs (adsId 255 = pure pose, no ADS), `qi` the index of the record the
// director is on. A batch is one queue; its ending is the last record.

/** ADS ids as the binary's name table numbers them (1068:166e). */
export const ADS_NAMES = Object.freeze({
    101: 'ACTIVITY',
    102: 'BUILDING',
    104: 'FISHING',
    105: 'JOHNNY',
    106: 'MARY',
    107: 'MISCGAG',
    108: 'STAND',
    109: 'SUZY',
    110: 'VISITOR',
    111: 'WALKSTUF',
});

/** 'JOHNNY#5' for adsId 105 tag 5; 'POSE' for the ADS-less pose records (0xff). */
export const gagName = ({ adsId, tag }) => (adsId === 255 ? 'POSE' : `${ADS_NAMES[adsId] ?? `ADS${adsId}`}#${tag}`);

const num = (text, key) => {
    const m = text.match(new RegExp(`(?:^| )${key}=(-?\\d+)`));
    return m ? Number(m[1]) : null;
};

/** Parse the DBX_HOST log text into host states, in tick order. */
export const parseHostLog = (text) => {
    const states = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line.startsWith('HOST ')) continue;
        const tick = Number(line.split(/\s+/)[1]);
        const day = line.match(/ day=(\d+),(\d+)/);
        const off = line.match(/ off=(-?\d+),(-?\d+)/);
        const q = line.match(/ q=(\S*)/)?.[1] ?? '';
        states.push({
            tick,
            clk: num(line, 'clk'),
            day: day ? Number(day[1]) : null, // 2d9b: the unlocked story day (selection)
            dayCur: day ? Number(day[2]) : null, // 2d9c: the calendar day (raft frame)
            holiday: num(line, 'hol') ?? 0,
            phase: num(line, 'ph'),
            b4: num(line, 'b4'),
            wavesOff: num(line, 'b2') === 1,
            layoutBits: num(line, 'c0'),
            tideCoin: num(line, 'c2'),
            y: num(line, 'c4'),
            x: num(line, 'c6'),
            offset: off ? { x: Number(off[1]), y: Number(off[2]) } : null,
            qi: num(line, 'qi'),
            queue: q
                ? q.split(',').map((pair) => {
                      const [adsId, tag] = pair.split(':').map(Number);
                      return { adsId, tag };
                  })
                : [],
        });
    }
    return states;
};

/**
 * Group host states into planned batches. A new batch starts when the queue text
 * changes (the planner wrote 30f4 and reset 30f2). Each batch records the bake-time
 * host selection and when the director moved to each record (`gags[i].startTick`,
 * from the qi changes; the last gag of a run is censored).
 */
export const batchesFromHost = (states, { endTick = null } = {}) => {
    const batches = [];
    let current = null;
    let lastQueue = null;
    for (const s of states) {
        const queueKey = s.queue.map((r) => `${r.adsId}:${r.tag}`).join(',');
        if (queueKey !== lastQueue) {
            lastQueue = queueKey;
            if (current) {
                current.endTick = s.tick;
                current.endedByNext = true;
            }
            current = {
                startTick: s.tick,
                endTick: null,
                clk: s.clk,
                day: s.day,
                dayCur: s.dayCur,
                holiday: s.holiday,
                phase: s.phase,
                offIsland: s.b4 === 2,
                night: s.b4 === 1 || (s.b4 === 0 && s.phase >= 12),
                forcedNight: s.b4 === 1,
                lowTide: s.tideCoin === 1,
                wavesOff: s.wavesOff,
                layoutBits: s.layoutBits,
                origin: { x: s.x, y: s.y },
                offset: s.offset,
                queue: s.queue.map(gagName),
                ending: s.queue.length ? gagName(s.queue[s.queue.length - 1]) : null,
                gags: [],
            };
            batches.push(current);
        }
        if (current && current.gags.length <= s.qi) {
            for (let i = current.gags.length; i <= s.qi && i < current.queue.length; i++) {
                current.gags.push({ key: current.queue[i], index: i, startTick: s.tick, clk: s.clk });
            }
        }
    }
    if (current && endTick != null) current.endTick = endTick;
    for (const b of batches) {
        // played to its ending: every record was reached and the next batch was planned
        b.complete = b.gags.length === b.queue.length && Boolean(b.endedByNext);
        delete b.endedByNext;
        b.layout = layoutClass(b);
    }
    return batches;
};

/** Island layout class from the folded word 30c0: fixed1 / fixed2 / random[/qNN] / off-island. */
export const layoutClass = ({ layoutBits, offIsland }) => {
    if (offIsland) return 'off-island';
    if (layoutBits & 2) return 'fixed1';
    if (layoutBits & 1) return 'fixed2';
    const quadrant = layoutBits & 0x3c;
    return quadrant ? `random/q${quadrant.toString(16)}` : 'random';
};

/** Raft frame as the bake draws it (FUN_1010_1d69): day 2d9c - 1 clamped to 1..5; 0 = no raft (30b0). */
export const raftFrameFor = (dayCur, noRaft = false) => (noRaft ? 0 : Math.min(5, Math.max(1, (dayCur ?? 1) - 1)));

/**
 * The host selection (titleState) the batch was baked with, for drawBackground.
 * x/y are the binary's rebased world origin 30c6/30c4 (island layer 0 is drawn at
 * x + 289, y + 279). `oceanIndex` is not in the log (the bake draws `rand % 3`
 * straight into the screen), so the caller passes the one that matches.
 */
export const batchTitleState = (batch, { oceanIndex = 0, clouds = [] } = {}) => {
    const noRaft = batch.ending === 'MARY#5';
    return Object.freeze({
        island: !batch.offIsland,
        islandLayoutId: 1,
        lowTide: batch.lowTide,
        tidePhase: batch.phase,
        night: batch.night,
        raft: raftFrameFor(batch.dayCur, noRaft),
        x: batch.origin.x,
        y: batch.origin.y,
        waves: !batch.wavesOff,
        holidayAllowed: batch.ending !== 'VISITOR#3',
        oceanIndex,
        presentationKey: Object.freeze({}),
        clouds: Object.freeze(clouds),
        storyDay: batch.day,
        sceneOffset: Object.freeze({ x: batch.offset?.x ?? batch.origin.x + 1, y: batch.offset?.y ?? batch.origin.y }),
    });
};

const count = (values) => values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map());
const sorted = (map) => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);

/**
 * Story mix over planned batches (what the original's planner chose), as counts
 * and the shares the simulator (tools/story-mix/simulate.mjs) reports for ours.
 * `runs` is [{ name, batches }], so anti-repeat is checked within a run.
 */
export const storyMix = (runs) => {
    const batches = runs.flatMap((r) => r.batches);
    const n = batches.length;
    const endings = sorted(count(batches.map((b) => b.ending)));
    const intermediates = sorted(count(batches.flatMap((b) => b.queue.slice(0, -1))));
    const perBatch = sorted(count(batches.flatMap((b) => [...new Set(b.queue)])));
    const layouts = sorted(count(batches.map((b) => b.layout)));
    const dayPhase = batches.filter((b) => b.phase < 12);
    const nightPhase = batches.filter((b) => b.phase >= 12);
    const island = batches.filter((b) => !b.offIsland);
    // the planner's queue only; a batch whose first record is a day-locked
    // intermediate keyframe (JOHNNY#2/#3) or whose ending is the day's key scene
    const dayLocked = { 'JOHNNY#2': 2, 'JOHNNY#3': 6, 'SUZY#1': 3, 'MARY#3': 4, 'MARY#1': 5, 'MARY#4': 7, 'MARY#5': 8, 'SUZY#2': 9, 'JOHNNY#6': 10, 'JOHNNY#1': 11, 'MARY#2': 1 };
    const keyframes = [];
    for (const run of runs) {
        for (const b of run.batches) {
            for (const [key, day] of Object.entries(dayLocked)) {
                if (b.queue.includes(key)) keyframes.push({ run: run.name, key, day, batchDay: b.day, phase: b.phase, asEnding: b.ending === key, position: b.queue.indexOf(key) });
            }
        }
    }
    // anti-repeat: ending equal to the previous one, or to the one two back
    let repeatPrev = 0;
    let repeatTwoBack = 0;
    let pairsChecked = 0;
    let triplesChecked = 0;
    for (const run of runs) {
        const e = run.batches.map((b) => b.ending);
        for (let i = 1; i < e.length; i++) {
            pairsChecked++;
            if (e[i] === e[i - 1]) repeatPrev++;
        }
        for (let i = 2; i < e.length; i++) {
            triplesChecked++;
            if (e[i] === e[i - 2] && e[i] !== e[i - 1]) repeatTwoBack++;
        }
    }
    const visitor1 = batches.filter((b) => b.queue.includes('VISITOR#1'));
    const activity11 = batches.filter((b) => b.queue.includes('ACTIVITY#11'));
    return {
        batches: n,
        complete: batches.filter((b) => b.complete).length,
        runs: runs.length,
        meanLength: n ? Math.round((100 * batches.reduce((s, b) => s + b.queue.length, 0)) / n) / 100 : null,
        endings: endings.map(([k, v]) => ({ key: k, count: v, pct: pct(v, n) })),
        intermediates: intermediates.map(([k, v]) => ({ key: k, count: v })),
        perBatch: perBatch.map(([k, v]) => ({ key: k, count: v, pct: pct(v, n) })),
        layouts: layouts.map(([k, v]) => ({ key: k, count: v, pct: pct(v, n) })),
        lowTide: {
            all: { n: island.length, low: island.filter((b) => b.lowTide).length },
            dayPhase: { n: dayPhase.filter((b) => !b.offIsland).length, low: dayPhase.filter((b) => !b.offIsland && b.lowTide).length },
            nightPhase: { n: nightPhase.filter((b) => !b.offIsland).length, low: nightPhase.filter((b) => !b.offIsland && b.lowTide).length },
        },
        night: { n, night: batches.filter((b) => b.night).length, nightPhase: nightPhase.length, forced: batches.filter((b) => b.forcedNight).length },
        wavesOff: batches.filter((b) => b.wavesOff).length,
        offIsland: batches.filter((b) => b.offIsland).length,
        visitor1: {
            batches: visitor1.length,
            pct: pct(visitor1.length, n),
            layouts: sorted(count(visitor1.map((b) => `${b.layout} ${b.origin.x + 289}/${b.origin.y + 279}`))).map(([k, v]) => ({ key: k, count: v })),
        },
        // ACTIVITY#11 is flagsB 0x205: an ending that is also first-class, so it plays
        // as a batch of one (solo) when chosen as the ending
        activity11: {
            batches: activity11.length,
            asEnding: activity11.filter((b) => b.ending === 'ACTIVITY#11').length,
            solo: activity11.filter((b) => b.queue.length === 1).length,
            asIntermediate: activity11.filter((b) => b.queue.slice(0, -1).includes('ACTIVITY#11')).length,
        },
        keyframes,
        antiRepeat: { pairsChecked, repeatPrev, triplesChecked, repeatTwoBack },
        byDay: sorted(count(batches.map((b) => `day ${b.day} / phase ${b.phase}`))).map(([k, v]) => ({ key: k, count: v })),
    };
};

/** Markdown of the story mix, for the README/report. */
export const renderStoryMix = (mix, { top = 20 } = {}) => {
    const lines = [];
    const row = (cols) => `| ${cols.join(' | ')} |`;
    lines.push(`${mix.batches} planned batches (${mix.complete} played to their ending) over ${mix.runs} runs; mean queue length ${mix.meanLength}.`, '');
    lines.push('| Ending | Batches | Share |', '|---|---:|---:|');
    for (const e of mix.endings) lines.push(row([e.key, e.count, `${e.pct}%`]));
    lines.push('', `| Gag (any position) | Batches | Share |`, '|---|---:|---:|');
    for (const g of mix.perBatch.slice(0, top)) lines.push(row([g.key, g.count, `${g.pct}%`]));
    lines.push('', '| Island layout | Batches | Share |', '|---|---:|---:|');
    for (const l of mix.layouts) lines.push(row([l.key, l.count, `${l.pct}%`]));
    const lt = mix.lowTide;
    lines.push(
        '',
        `Low tide: ${lt.all.low}/${lt.all.n} island batches (${pct(lt.all.low, lt.all.n)}%); phases 0-11: ${lt.dayPhase.low}/${lt.dayPhase.n}; phases 12-15: ${lt.nightPhase.low}/${lt.nightPhase.n}.`,
        `Night sky: ${mix.night.night}/${mix.night.n} batches (${mix.night.nightPhase} at phase >= 12, ${mix.night.forced} forced by 0x800). Still waves: ${mix.wavesOff}. Off-island: ${mix.offIsland}.`,
        `VISITOR#1: ${mix.visitor1.batches}/${mix.batches} batches (${mix.visitor1.pct}%)${mix.visitor1.layouts.length ? `, island layer 0 at ${mix.visitor1.layouts.map((l) => `${l.key} (${l.count})`).join(', ')}` : ''}.`,
        `ACTIVITY#11: ${mix.activity11.batches} batches (${mix.activity11.asEnding} as the ending, ${mix.activity11.solo} of them solo; ${mix.activity11.asIntermediate} as an intermediate).`,
        `Anti-repeat: ${mix.antiRepeat.repeatPrev}/${mix.antiRepeat.pairsChecked} endings equal to the previous batch's; ${mix.antiRepeat.repeatTwoBack}/${mix.antiRepeat.triplesChecked} equal to the one two batches back (and not the previous).`,
    );
    if (mix.keyframes.length) {
        lines.push('', '| Day-locked gag | Its day | Batch day | Phase | Position | Run |', '|---|---:|---:|---:|---|---|');
        for (const k of mix.keyframes) lines.push(row([k.key, k.day, k.batchDay, k.phase, k.asEnding ? 'ending' : `#${k.position + 1}`, k.run]));
    }
    return lines.join('\n');
};

/** Host-canvas verdict thresholds (host-check.mjs results), in % of the class's pixels. */
export const HOST_THRESHOLDS = Object.freeze({ never: 0.5, waves: 90 });

/**
 * Verdict for one batch's host-canvas result: island layers and the ocean below the
 * horizon must have (almost) no pixel that never matches ours in any sampled frame,
 * and the wave regions must match a BACKGRND frame. The sky is reported, not judged
 * (host-check paints the clouds it finds in the original, so it shows rendering only).
 */
export const hostVerdict = (r) => {
    if (r.skipped) return 'skipped';
    const bad = [];
    if (r.neverIslandPct > HOST_THRESHOLDS.never) bad.push('island');
    if (r.neverOceanPct > HOST_THRESHOLDS.never) bad.push('ocean');
    if (r.waves.samples && r.waves.matchedPct < HOST_THRESHOLDS.waves) bad.push('waves');
    return bad.length ? `divergent: ${bad.join(', ')}` : 'faithful';
};

/** Markdown table of host-canvas results (one row per island batch). */
export const renderHostScores = (results) => {
    const rows = results.filter((r) => !r.skipped);
    const counts = new Map();
    for (const r of rows) counts.set(hostVerdict(r), (counts.get(hostVerdict(r)) ?? 0) + 1);
    const lines = [
        `${rows.length} island batches checked (${results.length - rows.length} skipped: off-island or no dump). ` +
            `Verdicts (island and ocean "never matched" <= ${HOST_THRESHOLDS.never}%, waves matched >= ${HOST_THRESHOLDS.waves}%): ` +
            [...counts].map(([k, v]) => `${k} ${v}`).join(' · ') +
            '.',
        '',
        '| Run | Batch | Ending | Layout | Layer 0 | Sky | Tide | Frames | Island never | Island persistent | Ocean never | Sky never / some | Waves matched | Verdict |',
        '|---|---:|---|---|---|---|---|---:|---:|---:|---:|---|---:|---|',
    ];
    for (const r of rows) {
        lines.push(
            `| ${r.run} | ${r.batch} | ${r.ending} | ${r.layout} | ${r.layer0.x}/${r.layer0.y} | ${r.night ? 'night' : `ocean ${r.oceanIndex}`} | ${r.lowTide ? 'low' : 'high'}${r.wavesOff ? ' (still)' : ''} | ${r.frames} | ${r.neverIslandPct}% | ${r.persistentIslandPct}% | ${r.neverOceanPct}% | ${r.neverSkyPct}% / ${r.someSkyPct}% | ${r.waves.samples ? `${r.waves.matchedPct}%` : '—'} | ${hostVerdict(r)} |`,
        );
    }
    return lines.join('\n');
};

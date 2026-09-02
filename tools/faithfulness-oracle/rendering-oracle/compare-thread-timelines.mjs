#!/usr/bin/env node
/**
 * Differential faithfulness diff: compare a gag's per-tick THREAD TIMELINE from
 * the ORIGINAL binary (dosbox DBX_THREADS trace -> threads-to-timeline.mjs)
 * against OUR engine (our-thread-timeline.mjs). Both sides emit the shared JSONL
 * contract, one line per director tick:
 *     {"t": <int>, "live": ["<slot>:<tag>", ...]}   // sorted live/drawing threads
 *
 * The two sides tick at DIFFERENT cadences (the emulator's WM_TIMER vs our
 * logical tick), so raw tick counts are NOT comparable. What IS comparable is
 * the SEQUENCE OF DISTINCT LIVE-SETS: a faithful gag visits the same ordered
 * series of "who is on screen" states. So we collapse each timeline to its
 * state sequence (merging consecutive identical live-sets), then align the two
 * sequences with an LCS over live-set equality and report the divergences.
 *
 * Usage:
 *   node compare-thread-timelines.mjs --orig <orig.jsonl> --ours <ours.jsonl> [--slotmap a=b,c=d] [--json]
 *
 * --slotmap remaps ORIGINAL slot numbers onto our sceneIdx numbering when the
 * binary's TTM resource-slot ids differ from our resource indices (reconcile
 * after inspecting a real dosbox trace; identity by default).
 *
 * Verdict: MATCH (state sequences align, same max-concurrency),
 * MINOR (small tail/duration-only differences), DIVERGENT (missing/extra states
 * or a higher max-concurrency on our side = a possible extra actor/body).
 */
import { readFileSync } from 'node:fs';

const arg = (flag, def) => {
    const i = process.argv.indexOf(flag);
    return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
};
const has = (flag) => process.argv.includes(flag);

const parseSlotMap = (spec) => {
    const m = new Map();
    if (!spec) return m;
    for (const pair of spec.split(',')) {
        const [a, b] = pair.split('=');
        if (a && b) m.set(a.trim(), b.trim());
    }
    return m;
};

// Read a shared-format timeline JSONL -> array of live-sets (one per tick).
const readTimeline = (path, slotMap) => {
    const remapKey = (k) => {
        const [slot, tag] = k.split(':');
        return `${slotMap.get(slot) ?? slot}:${tag}`;
    };
    return readFileSync(path, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const rec = JSON.parse(line);
            return (rec.live || []).map(remapKey).sort();
        });
};

const keyOf = (set) => set.join(',');

// Collapse consecutive identical live-sets into states {live, ticks}.
const collapse = (ticks) => {
    const states = [];
    for (const live of ticks) {
        const k = keyOf(live);
        const last = states[states.length - 1];
        if (last && last.key === k) last.ticks++;
        else states.push({ key: k, live, ticks: 1 });
    }
    return states;
};

// LCS over state.key equality -> matched index pairs.
const lcs = (a, b) => {
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
            dp[i][j] = a[i].key === b[j].key ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const pairs = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i].key === b[j].key) {
            pairs.push([i, j]);
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
    }
    return pairs;
};

const maxConcurrency = (ticks) => ticks.reduce((mx, live) => Math.max(mx, live.length), 0);

const main = () => {
    const origPath = arg('--orig');
    const oursPath = arg('--ours');
    if (!origPath || !oursPath) {
        console.error('usage: compare-thread-timelines.mjs --orig <orig.jsonl> --ours <ours.jsonl> [--slotmap a=b] [--json]');
        process.exit(2);
    }
    const slotMap = parseSlotMap(arg('--slotmap'));
    const origTicks = readTimeline(origPath, slotMap);
    const oursTicks = readTimeline(oursPath, new Map());
    const orig = collapse(origTicks);
    const ours = collapse(oursTicks);
    const pairs = lcs(orig, ours);

    const matchedOrig = new Set(pairs.map((p) => p[0]));
    const matchedOurs = new Set(pairs.map((p) => p[1]));
    const missing = orig.filter((_, i) => !matchedOrig.has(i)); // in ORIGINAL, absent from OURS
    const extra = ours.filter((_, i) => !matchedOurs.has(i)); // in OURS, absent from ORIGINAL

    const origMax = maxConcurrency(origTicks);
    const oursMax = maxConcurrency(oursTicks);
    const alignPct = orig.length ? Math.round((pairs.length / Math.max(orig.length, ours.length)) * 100) : 0;

    // RNG-TOLERANT metric (the primary verdict). Exact state-sequence match is
    // infeasible: the original capture runs the binary's own RNG stream (whose
    // mid-run state can't be replayed) while our engine runs its own seed, so
    // RANDOM opcodes (e.g. the fire-retry's {38,38,40} pick) legitimately take
    // different branches -> different state SEQUENCES for the SAME faithful gag.
    // What must match is the ACTOR VOCABULARY (the set of slot:tag that ever
    // draw), the max concurrency, and reaching drain. An actor OUR engine draws
    // that the original's vocabulary never contains is a real divergence
    // candidate (an extra body / wrong actor); the reverse is usually just an
    // RNG branch the capture didn't happen to hit (needs more captures to cover).
    const vocab = (ticks) => new Set(ticks.flat());
    const origVocab = vocab(origTicks);
    const oursVocab = vocab(oursTicks);
    const oursOnly = [...oursVocab].filter((k) => !origVocab.has(k)).sort(); // OURS draws, original never did (across this capture)
    const origOnly = [...origVocab].filter((k) => !oursVocab.has(k)).sort(); // original draws, ours never did

    // maxConcurrency tolerance: +1 absorbs our "agedOut" just-finished frame the
    // original's rs-in-{1,2,3} filter excludes; >= +2 is a real extra-body flag.
    const concFlag = oursMax >= origMax + 2;

    let verdict;
    if (oursOnly.length === 0 && !concFlag) verdict = 'FAITHFUL'; // ours never exceeds the original's actor vocabulary / concurrency
    else if (concFlag) verdict = 'DIVERGENT'; // draws >=2 more concurrent than the original -> extra body
    else verdict = 'REVIEW'; // ours draws actors this capture didn't show -- RNG branch OR real; needs a hand look / more captures

    const result = {
        verdict,
        oursOnlyActors: oursOnly, // KEY signal: actors ours draws that the original (this capture) never did
        origOnlyActors: origOnly, // actors the original drew that ours didn't (often RNG branches we didn't hit)
        origMaxConcurrency: origMax,
        oursMaxConcurrency: oursMax,
        concurrencyFlag: concFlag,
        seqAlignPct: alignPct, // secondary: exact-sequence alignment (RNG-sensitive, informational)
        origStates: orig.length,
        oursStates: ours.length,
        missingStates: missing.map((s) => s.live),
        extraStates: extra.map((s) => s.live),
    };

    if (has('--json')) {
        console.log(JSON.stringify(result));
        return;
    }
    console.log(`verdict: ${verdict}  (maxConcurrency orig=${origMax} ours=${oursMax}; seq-align ${alignPct}% [RNG-sensitive, informational])`);
    if (oursOnly.length) {
        console.log(`  actors OURS draws that the original (this capture) never did (${oursOnly.length}) -- REVIEW (RNG branch this capture missed, or a real extra actor):`);
        console.log(`    ${oursOnly.join('  ')}`);
    } else {
        console.log(`  actor vocabulary: ours ⊆ original ✓ (no actor we draw is absent from the original)`);
    }
    if (origOnly.length) {
        console.log(`  actors the ORIGINAL drew that ours didn't (${origOnly.length}) -- usually RNG branches our seed didn't hit:`);
        console.log(`    ${origOnly.join('  ')}`);
    }
    if (concFlag) {
        console.log(`  !! ours draws ${oursMax} concurrent vs original ${origMax} (>= +2) -- EXTRA BODY candidate`);
    }
};

main();

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

    let verdict = 'MATCH';
    if (oursMax > origMax) verdict = 'DIVERGENT'; // our engine draws more concurrent bodies than the original
    else if (missing.length + extra.length === 0) verdict = 'MATCH';
    else if (alignPct >= 85 && missing.length + extra.length <= 2) verdict = 'MINOR';
    else verdict = 'DIVERGENT';

    const result = {
        verdict,
        alignPct,
        origStates: orig.length,
        oursStates: ours.length,
        origMaxConcurrency: origMax,
        oursMaxConcurrency: oursMax,
        missingStates: missing.map((s) => s.live), // original visited, ours never did
        extraStates: extra.map((s) => s.live), // ours visited, original never did
    };

    if (has('--json')) {
        console.log(JSON.stringify(result));
        return;
    }
    console.log(`verdict: ${verdict}  (align ${alignPct}%; states orig=${orig.length} ours=${ours.length}; maxConcurrency orig=${origMax} ours=${oursMax})`);
    if (missing.length) {
        console.log(`  states in ORIGINAL but not OURS (${missing.length}):`);
        for (const s of missing.slice(0, 20)) console.log(`    - [${s.live.join(' ')}]`);
    }
    if (extra.length) {
        console.log(`  states in OURS but not ORIGINAL (${extra.length}):`);
        for (const s of extra.slice(0, 20)) console.log(`    + [${s.live.join(' ')}]`);
    }
    if (verdict === 'DIVERGENT' && oursMax > origMax) {
        console.log(`  !! ours draws ${oursMax} concurrent vs original ${origMax} -- possible extra actor/body`);
    }
};

main();

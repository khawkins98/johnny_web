// align.mjs -- line our tick stream up with the original's, using the live-thread
// sets both sides already record (timeline.jsonl / fingerprint.mjs liveKeys).
//
// The two clocks differ (one original sample is one ~55 ms PC timer tick; ours are
// 20 ms engine ticks), and random branches can differ between a capture and a seed,
// so frames are not matched by time. Instead:
//   1. Each stream is cut into spans of a constant, non-empty live set (`toSpans`).
//      Empty sets are gaps: our engine has one-tick gaps at handoffs the original
//      samples straight through.
//   2. The two span sequences are aligned with a longest-common-subsequence over the
//      set keys (`alignSpans`). Matched spans show the same scenes on both sides.
//   3. Keyframes are taken inside matched spans (`pickKeyframes`): the first sample
//      of a span (the live-set transition) plus mid-span samples, mapped to our tick
//      at the same fraction of our span. The comparator then searches a small
//      window around that tick to absorb jitter.
// All functions here are pure.

/**
 * @param {string[][]} live  one sorted key array per tick (index = tick)
 * @param {number} [from=0]  first tick to consider
 * @param {number} [to=live.length]  end (exclusive)
 * @returns {{key:string, start:number, end:number}[]}  end exclusive
 */
export const toSpans = (live, from = 0, to = live.length) => {
    const spans = [];
    let current = null;
    for (let t = from; t < to; t++) {
        const key = (live[t] ?? []).join(' ');
        if (current && current.key === key) {
            current.end = t + 1;
            continue;
        }
        current = key ? { key, start: t, end: t + 1 } : null;
        if (current) spans.push(current);
    }
    return spans;
};

/**
 * LCS alignment of two span sequences by key. Ties prefer longer matched spans.
 * @returns {{pairs: [number, number][], matchedOrig:number, totalOrig:number}}
 *   pairs of (orig span index, our span index); matchedOrig/totalOrig count samples.
 */
export const alignSpans = (orig, ours) => {
    const n = orig.length;
    const m = ours.length;
    // score = matched original samples (so long spans dominate short loaders)
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            let best = Math.max(dp[i + 1][j], dp[i][j + 1]);
            if (orig[i].key === ours[j].key) {
                best = Math.max(best, dp[i + 1][j + 1] + (orig[i].end - orig[i].start) + 1e-3);
            }
            dp[i][j] = best;
        }
    }
    const pairs = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (orig[i].key === ours[j].key && dp[i][j] === dp[i + 1][j + 1] + (orig[i].end - orig[i].start) + 1e-3) {
            pairs.push([i, j]);
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
    }
    const totalOrig = orig.reduce((s, sp) => s + sp.end - sp.start, 0);
    const matchedOrig = pairs.reduce((s, [a]) => s + orig[a].end - orig[a].start, 0);
    return { pairs, matchedOrig, totalOrig };
};

/**
 * Keyframes inside matched spans.
 * @param {object} o
 * @param {{key,start,end}[]} o.orig
 * @param {{key,start,end}[]} o.ours
 * @param {[number, number][]} o.pairs
 * @param {number} [o.midEvery=24] one extra mid-span sample per this many original samples
 * @param {number} [o.maxPerSpan=4]
 * @param {number} [o.max=48] overall cap (evenly thinned)
 * @returns {{origTick:number, ourTick:number, key:string, kind:'first-frame'|'transition'|'mid', span:number}[]}
 *   The gag's first frame (the transition into the first span, when both sides'
 *   first spans are the matched pair) is its own kind: the original passes a
 *   loading first frame at its next sample, ours holds it for the authored delay
 *   (README "Findings"), so `searchWindows` gives it a wider window and the report
 *   can tell it apart from a handoff.
 */
export const pickKeyframes = ({ orig, ours, pairs, midEvery = 24, maxPerSpan = 4, max = 48 }) => {
    const frames = [];
    const firstPairIsFirstSpans = pairs.length > 0 && pairs[0][0] === 0 && pairs[0][1] === 0;
    pairs.forEach(([a, b], span) => {
        const o = orig[a];
        const u = ours[b];
        const oLen = o.end - o.start;
        const uLen = u.end - u.start;
        const at = (f, kind) =>
            frames.push({
                origTick: o.start + Math.round(f * (oLen - 1)),
                ourTick: u.start + Math.round(f * (uLen - 1)),
                key: o.key,
                kind,
                span,
            });
        at(0, span === 0 && firstPairIsFirstSpans ? 'first-frame' : 'transition');
        const mids = Math.min(maxPerSpan - 1, Math.max(oLen >= 4 ? 1 : 0, Math.floor(oLen / midEvery)));
        for (let k = 1; k <= mids; k++) at(k / (mids + 1), 'mid');
    });
    if (frames.length <= max) return frames;
    // keep every transition first, then thin the mids evenly
    const transitions = frames.filter((f) => f.kind !== 'mid');
    const mids = frames.filter((f) => f.kind === 'mid');
    const keepTransitions = transitions.length > max ? thin(transitions, max) : transitions;
    const keepMids = thin(mids, Math.max(0, max - keepTransitions.length));
    return [...keepTransitions, ...keepMids].sort((x, y) => x.origTick - y.origTick);
};

const thin = (list, count) => {
    if (count <= 0) return [];
    if (list.length <= count) return list;
    const out = [];
    for (let k = 0; k < count; k++) out.push(list[Math.floor((k * list.length) / count)]);
    return out;
};

/** Our 20 ms ticks per original sample (METHODOLOGY "Trace sample cadence"). */
export const TICKS_PER_SAMPLE = 2.85;

/**
 * Where to look for a keyframe's best (original, ours) pair.
 *
 * Each original candidate (origTick + d, |d| <= origJitter, with a dump) gets its own
 * window of our ticks, centred d samples away from the mapped tick. A span's first
 * live tick often has no dump, so the candidate is the next sample, and our window
 * has to move with it.
 *
 * Mid-span keyframes get a window that grows with our span (midFraction of it,
 * between `window` and `maxWindow`). Mapping by span fraction assumes both sides
 * pace the span evenly, and steady motion (a sailing ship) drifts by more than the
 * base window when they do not. Pacing inside a span is a timing question for the
 * sequencing and lifespan oracles; this one compares what is drawn. Transitions and
 * bakes keep the base window, so handoff frames are still judged at the handoff.
 *
 * The gag's first frame (`kind: 'first-frame'`) keeps the base window behind the
 * mapped tick and extends it forward by `firstFrameHold`, the number of our ticks
 * the gag's first frame was held (measured on our render, compare.mjs), capped at
 * `maxWindow`. That is the accepted deviation and nothing more: the original's
 * clock jumps by the load's wall time at the gag's first sample, so its first frame
 * passes at the next sample whatever its delay, while ours holds the authored delay
 * (README "Findings"). The cap keeps a long-delay first frame (MARY:5 holds 100
 * ticks) from turning the window into a free search: the original's jump shortens
 * such a hold by the load time, it does not remove it.
 * @returns {{origTick:number, from:number, to:number}[]}  inclusive our-tick ranges
 */
export const searchWindows = ({
    kf,
    ourSpanLen,
    hasFrame,
    window = 6,
    origJitter = 1,
    midFraction = 0.2,
    maxWindow = 40,
    ticksPerSample = TICKS_PER_SAMPLE,
    firstFrameHold = 0,
}) => {
    const radius =
        kf.kind === 'mid' ? Math.min(maxWindow, Math.max(window, Math.round(midFraction * ourSpanLen))) : window;
    const ahead = kf.kind === 'first-frame' ? Math.min(maxWindow, Math.max(0, firstFrameHold)) : 0;
    const out = [];
    for (let d = -origJitter; d <= origJitter; d++) {
        const origTick = kf.origTick + d;
        if (!hasFrame(origTick)) continue;
        const centre = kf.ourTick + Math.round(d * ticksPerSample);
        out.push({ origTick, from: Math.max(1, centre - radius), to: centre + radius + ahead });
    }
    return out;
};

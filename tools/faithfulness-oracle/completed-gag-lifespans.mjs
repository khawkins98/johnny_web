// Derive per-gag actor lifespans from one forced original-binary capture.
// The forced director reloads the ADS on each loop. The trace's ads-loader lines
// delimit complete gag episodes; the final, unbounded episode is right-censored.
// A blank live tick cannot delimit an episode: many gags have gaps between actors.

/**
 * @param {string} traceText - DBX_TRACE contents.
 * @param {string} timelineText - threads-to-timeline JSONL contents.
 * @param {number} adsId - target ADS id, e.g. 0x65.
 * @returns {{occupancy: Record<string,{min:number,max:number}>,
 *   spanLifespans: Record<string,{min:number,max:number}>,
 *   occurrences: Record<string,{min:number,max:number}>, completedEpisodes:number,
 *   censoredEpisodes:number, loaderStarts:number[]}}
 */
export function completedGagLifespans(traceText, timelineText, adsId) {
    const timeline = timelineText.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const loaderStarts = [];
    let ticks = 0;
    for (const line of traceText.split('\n')) {
        if (/^\d+ tick /.test(line)) ticks++;
        const load = line.match(/^\d+ ads-loader id=([\da-fA-F]+)/);
        if (load && (Number.parseInt(load[1], 16) & 0xff) === adsId) {
            loaderStarts.push(ticks);
        }
    }
    if (ticks < timeline.length) throw new Error(`trace has ${ticks} ticks, timeline has ${timeline.length}`);
    if (loaderStarts.length === 0) throw new Error(`no target ADS loader for 0x${adsId.toString(16)}`);
    if (loaderStarts.some((start, i) => start < 0 || start > timeline.length ||
        (i > 0 && start <= loaderStarts[i - 1]))) {
        throw new Error('invalid ADS loader boundaries');
    }
    const occupancy = {};
    const spanLifespans = {};
    const occurrences = {};
    const addRange = (ranges, actor, value) => {
        const range = ranges[actor];
        ranges[actor] = range
            ? { min: Math.min(range.min, value), max: Math.max(range.max, value) }
            : { min: value, max: value };
    };
    for (let episode = 0; episode + 1 < loaderStarts.length; episode++) {
        const counts = new Map();
        const spanStarts = new Map();
        const episodeOccurrences = new Map();
        const closeSpan = (actor, end) => {
            addRange(spanLifespans, actor, end - spanStarts.get(actor));
            episodeOccurrences.set(actor, (episodeOccurrences.get(actor) ?? 0) + 1);
            spanStarts.delete(actor);
        };
        for (let t = loaderStarts[episode]; t < loaderStarts[episode + 1]; t++) {
            const row = timeline[t];
            if (row.t !== t) throw new Error(`timeline index mismatch at ${t}`);
            const live = new Set(row.live);
            for (const actor of spanStarts.keys()) if (!live.has(actor)) closeSpan(actor, t);
            for (const actor of live) {
                counts.set(actor, (counts.get(actor) ?? 0) + 1);
                if (!spanStarts.has(actor)) spanStarts.set(actor, t);
            }
        }
        for (const actor of [...spanStarts.keys()]) closeSpan(actor, loaderStarts[episode + 1]);
        for (const [actor, count] of counts) addRange(occupancy, actor, count);
        for (const [actor, count] of episodeOccurrences) addRange(occurrences, actor, count);
    }
    return {
        occupancy,
        spanLifespans,
        occurrences,
        completedEpisodes: loaderStarts.length - 1,
        censoredEpisodes: loaderStarts.at(-1) < timeline.length ? 1 : 0,
        loaderStarts,
    };
}

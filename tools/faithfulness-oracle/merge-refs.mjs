#!/usr/bin/env node
// Merge fresh original-binary captures into committed reference fingerprints.
// gen-refs.mjs writes a new batch independently; earlier raw timelines are
// deliberately discarded, so regenerating would lose their RNG coverage.
// Usage: node merge-refs.mjs <committed-ref.json> <new-batch-ref.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [targetPath, batchPath] = process.argv.slice(2);
if (!targetPath || !batchPath) {
    console.error('usage: node merge-refs.mjs <committed-ref.json> <new-batch-ref.json>');
    process.exit(2);
}

const previous = JSON.parse(readFileSync(targetPath, 'utf8'));
const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
if (previous.name !== batch.name || previous.tag !== batch.tag || previous.adsId !== batch.adsId) {
    throw new Error('reference identity mismatch');
}
if (!Number.isInteger(batch.runs) || batch.runs < 1) {
    throw new Error('new batch has no successful captures');
}
if (batch.lifespanBasis !== 'completed-gag-v2') {
    throw new Error('new batch must contain completed-gag-v2 lifespans');
}

const actorOrder = (a, b) => {
    const [aSlot, aTag] = a.split(':').map(Number);
    const [bSlot, bTag] = b.split(':').map(Number);
    return aSlot - bSlot || aTag - bTag;
};
// Legacy refs count every appearance over a whole repeated capture. They cannot
// be merged with per-gag durations, so the new batch replaces their duration
// range while the vocab/maxConc union below still preserves old observations.
const comparable = previous.lifespanBasis === batch.lifespanBasis;
const mergeRanges = (oldRanges, newRanges) => {
    const merged = comparable ? { ...oldRanges } : {};
    for (const [actor, range] of Object.entries(newRanges)) {
        const old = merged[actor];
        merged[actor] = old
            ? { min: Math.min(old.min, range.min), max: Math.max(old.max, range.max) }
            : range;
    }
    return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => actorOrder(a, b)));
};
const merged = {
    ...previous,
    slots: [...new Set([...previous.slots, ...batch.slots])].sort((a, b) => Number(a) - Number(b)),
    runs: previous.runs + batch.runs,
    vocab: [...new Set([...previous.vocab, ...batch.vocab])].sort(actorOrder),
    maxConc: Math.max(previous.maxConc, batch.maxConc),
    // An exact distinct-state union needs the old raw timelines, which were
    // discarded after the prior capture batch. No gate reads this field.
    states: null,
    lifespans: mergeRanges(previous.lifespans, batch.lifespans),
    occupancy: mergeRanges(previous.occupancy, batch.occupancy),
    occurrences: mergeRanges(previous.occurrences, batch.occurrences),
    lifespanBasis: batch.lifespanBasis,
    lifespanEpisodes: (comparable ? previous.lifespanEpisodes : 0) + batch.lifespanEpisodes,
};
writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`${merged.name}:${merged.tag}: ${previous.runs}+${batch.runs}=${merged.runs} captures; ` +
    `vocab ${previous.vocab.length}->${merged.vocab.length}; ` +
    `new keys [${merged.vocab.filter((key) => !previous.vocab.includes(key)).join(', ')}]`);

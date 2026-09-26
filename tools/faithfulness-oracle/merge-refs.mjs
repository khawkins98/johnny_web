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

const actorOrder = (a, b) => {
    const [aSlot, aTag] = a.split(':').map(Number);
    const [bSlot, bTag] = b.split(':').map(Number);
    return aSlot - bSlot || aTag - bTag;
};
const lifespans = { ...previous.lifespans };
for (const [actor, range] of Object.entries(batch.lifespans)) {
    const old = lifespans[actor];
    lifespans[actor] = old
        ? { min: Math.min(old.min, range.min), max: Math.max(old.max, range.max) }
        : range;
}
const merged = {
    ...previous,
    slots: [...new Set([...previous.slots, ...batch.slots])].sort((a, b) => Number(a) - Number(b)),
    runs: previous.runs + batch.runs,
    vocab: [...new Set([...previous.vocab, ...batch.vocab])].sort(actorOrder),
    maxConc: Math.max(previous.maxConc, batch.maxConc),
    // An exact distinct-state union needs the old raw timelines, which were
    // discarded after the prior capture batch. No gate reads this field.
    states: null,
    lifespans,
};
writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`${merged.name}:${merged.tag}: ${previous.runs}+${batch.runs}=${merged.runs} captures; ` +
    `vocab ${previous.vocab.length}->${merged.vocab.length}; ` +
    `new keys [${merged.vocab.filter((key) => !previous.vocab.includes(key)).join(', ')}]`);

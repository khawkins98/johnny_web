#!/usr/bin/env node
// Upgrade a generated batch fingerprint from preserved raw capture timelines.
// Usage: node attach-completed-gag-metrics.mjs <batch-ref-dir> <raw-capture-dir>
// Each raw subdirectory is NAME_tag and contains trace.log + timeline.jsonl.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { completedGagLifespans } from './completed-gag-lifespans.mjs';

const [batchDir, rawDir] = process.argv.slice(2);
if (!batchDir || !rawDir) {
    console.error('usage: node attach-completed-gag-metrics.mjs <batch-ref-dir> <raw-capture-dir>');
    process.exit(2);
}

const mergeRanges = (target, source) => {
    for (const [actor, range] of Object.entries(source)) {
        const old = target[actor];
        target[actor] = old
            ? { min: Math.min(old.min, range.min), max: Math.max(old.max, range.max) }
            : range;
    }
};

for (const name of readdirSync(rawDir).sort()) {
    const rawPath = path.join(rawDir, name);
    const refPath = path.join(batchDir, `${name}.json`);
    const ref = JSON.parse(readFileSync(refPath, 'utf8'));
    const observed = completedGagLifespans(
        readFileSync(path.join(rawPath, 'trace.log'), 'utf8'),
        readFileSync(path.join(rawPath, 'timeline.jsonl'), 'utf8'),
        Number.parseInt(ref.adsId, 16),
    );
    const lifespans = {};
    const occupancy = {};
    const occurrences = {};
    mergeRanges(lifespans, observed.spanLifespans);
    mergeRanges(occupancy, observed.occupancy);
    mergeRanges(occurrences, observed.occurrences);
    Object.assign(ref, {
        lifespans,
        occupancy,
        occurrences,
        lifespanBasis: 'completed-gag-v2',
        lifespanEpisodes: observed.completedEpisodes,
    });
    writeFileSync(refPath, `${JSON.stringify(ref, null, 2)}\n`);
    console.log(`${name}: ${observed.completedEpisodes} complete; ${Object.keys(lifespans).length} actor spans`);
}

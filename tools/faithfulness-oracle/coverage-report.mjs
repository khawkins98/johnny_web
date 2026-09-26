#!/usr/bin/env node
// coverage-report.mjs
//
// Regenerable per-gag alignment/fidelity report for the faithfulness oracle.
// Scans the committed reference fingerprints (test/faithfulness-refs), drives
// OUR engine against each one (same isolated single-gag path as
// test/faithfulness-diff.mjs), and writes docs/oracle-coverage.md summarizing,
// per gag: maxConc alignment, vocab overlap, and (where lifespan data exists)
// duration in-band coverage.
//
// NO EMULATOR: mirrors test/faithfulness-diff.mjs exactly (shares the same
// isDrawing predicate and seed-union fingerprint logic via ./fingerprint.mjs) so
// the numbers in this report match the CI gate. Data-only: gated on hasData;
// prints a clear message and exits 0 if the gitignored public/data game assets
// are absent.
//
// Usage: node tools/faithfulness-oracle/coverage-report.mjs

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasData } from '../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { compareLifespans } from './compare-lifespans.mjs';
import { fingerprintOursUnion } from './fingerprint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const refsDir = path.join(repoRoot, 'test/faithfulness-refs');
const outPath = path.join(repoRoot, 'docs/oracle-coverage.md');

if (!hasData) {
    console.log(
        '[coverage-report] SKIP: game data assets (public/data) are absent (gitignored, ' +
            'proprietary). Cannot drive the engine to compute the coverage report. ' +
            'Nothing written.',
    );
    process.exit(0);
}

const index = JSON.parse(readFileSync(path.join(refsDir, 'index.json'), 'utf8'));
const loadRef = (file) => JSON.parse(readFileSync(path.join(refsDir, file), 'utf8'));

// `isDrawing`/`fingerprintOursUnion` now live in ./fingerprint.mjs, shared with
// test/faithfulness-diff.mjs (the CI gate) and our-thread-timeline.mjs -- see that
// module for the full rationale/caveats (why frameOps is not checked, per tick or
// per scene).

const pct = (n, d) => (d === 0 ? 100 : Math.round((n / d) * 100));

/** Compute one catalogue row's alignment data for a real (drivable) ref gag. */
const computeRow = (entry) => {
    const ref = loadRef(entry.file);
    const runs = ref.runs || 3;
    const ours = fingerprintOursUnion(ref.name, ref.tag, runs);

    const refVocab = ref.vocab || [];
    const overlapCount = refVocab.filter((k) => ours.vocab.has(k)).length;
    const vocabOverlapPct = pct(overlapCount, refVocab.length);
    const vocabExtras = [...ours.vocab].filter((k) => !refVocab.includes(k)).length;

    const delta = ours.maxConc - ref.maxConc;
    let maxConcFlag;
    if (delta === 0) maxConcFlag = '=';
    else if (delta === 1) maxConcFlag = '+1';
    else if (delta >= 2) maxConcFlag = `FAIL(+${delta})`;
    else maxConcFlag = `${delta}`; // negative (under)

    const hasLifespans = ref.lifespanBasis === 'completed-gag-v2' &&
        Object.keys(ref.lifespans || {}).length > 0;
    const hasLegacyTotals = Boolean(ref.lifespans) && ref.lifespanBasis !== 'completed-gag-v2';
    const hasNoCompletedGag = ref.lifespanBasis === 'completed-gag-v2' && !hasLifespans;
    const durationActorCount = hasLifespans ? Object.keys(ref.lifespans).length : 0;
    let durationCell = '—'; // em dash
    let allWithin3x = true;
    let hardShort = 0;
    let hardLong = 0;
    let hardDetails = [];
    if (hasLifespans) {
        const refActors = Object.keys(ref.lifespans);
        const spans = Object.fromEntries(Object.entries(ours.actorSpanTicks)
            .map(([key, range]) => [key, range.max]));
        const bothActors = refActors.filter((a) => spans[a] !== undefined);
        const life = compareLifespans(spans, ref.lifespans, { samplePhasePadding: 1 });
        hardShort = life.hard.filter((e) => e.ourTicks < e.refMin).length;
        hardLong = life.hard.length - hardShort;
        hardDetails = life.hard.map((entry) => ({
            ...entry,
            direction: entry.ourTicks < entry.refMin ? 'short' : 'long',
        }));
        const inBand = bothActors.length - life.warnings.length - life.hard.length;
        const within3x = bothActors.length - life.hard.length;
        allWithin3x = bothActors.length === 0 || within3x === bothActors.length;
        durationCell =
            bothActors.length === 0
                ? '—'
                : `${inBand}/${bothActors.length} in-band (${within3x}/${bothActors.length} within 3x)`;
    }

    let status;
    if (delta >= 2) {
        status = 'FAIL';
    } else if (hasLegacyTotals) {
        status = 'Legacy duration';
    } else if (hasNoCompletedGag) {
        status = 'No completed gag';
    } else if (hasLifespans && !allWithin3x) {
        status = 'Review';
    } else if (vocabOverlapPct < 80) {
        status = 'Review';
    } else if (vocabExtras > 0) {
        status = 'Review';
    } else if ((delta === 0 || delta === 1) && (!hasLifespans || allWithin3x)) {
        status = hasLifespans ? 'Aligned' : 'No-duration-data';
    } else {
        status = 'Review';
    }

    return {
        gag: `${ref.name}:${ref.tag}`,
        adsName: ref.name,
        refData: hasLifespans ? '+completed-gag' : hasLegacyTotals ? 'legacy totals' :
            hasNoCompletedGag ? 'no completed gag' : 'maxConc-only',
        maxConc: `${ours.maxConc}/${ref.maxConc} ${maxConcFlag}`,
        vocabOverlap: `${vocabOverlapPct}%`,
        vocabExtras,
        durationSampling: hasLifespans
            ? `${ref.lifespanEpisodes} ${ref.lifespanEpisodes === 1 ? 'episode' : 'episodes'} / ${runs} seeds`
            : '—',
        durationActors: hasLifespans ? `${durationActorCount}/${refVocab.length}` : '—',
        durationActorCount,
        duration: durationCell,
        hardShort,
        hardLong,
        hardDetails,
        status,
    };
};

// The 2 unisolable gags, appended as explicit catalogue rows (cannot be driven
// in isolation by driveGag -- see docs caveats section for why).
const unisolableRows = [
    {
        gag: 'VISITOR:3',
        adsName: 'VISITOR',
        refData: '—',
        maxConc: '—',
        vocabOverlap: '—',
        vocabExtras: 0,
        durationSampling: '—',
        durationActors: '—',
        durationActorCount: 0,
        duration: '—',
        hardShort: 0,
        hardLong: 0,
        hardDetails: [],
        status: 'Unisolable (sibling-covered)',
    },
    {
        gag: 'STAND:14',
        adsName: 'STAND',
        refData: '—',
        maxConc: '—',
        vocabOverlap: '—',
        vocabExtras: 0,
        durationSampling: '—',
        durationActors: '—',
        durationActorCount: 0,
        duration: '—',
        hardShort: 0,
        hardLong: 0,
        hardDetails: [],
        status: 'Unisolable (init macro, transitively covered)',
    },
];

console.error(`[coverage-report] driving ${index.length} committed-ref gags against our engine...`);
const rows = [];
for (const entry of index) {
    const row = computeRow(entry);
    rows.push(row);
    console.error(`[coverage-report] ${row.gag} [${row.status}] maxConc=${row.maxConc} vocab=${row.vocabOverlap}`);
}
rows.push(...unisolableRows);

const total = rows.length;
const concurrencyCovered = rows.filter((r) => r.maxConc !== '—').length;
const durationCovered = rows.filter((r) => r.duration !== '—').length;
const durationActorsCovered = rows.reduce((n, r) => n + r.durationActorCount, 0);
const durationVocabActors = rows.filter((r) => r.durationActorCount > 0)
    .reduce((n, r) => n + Number(r.durationActors.split('/')[1]), 0);
const legacyDurationCount = rows.filter((r) => r.refData === 'legacy totals').length;
const hardDivergences = rows.filter((r) => r.status === 'FAIL').length;
const lifespanShort = rows.reduce((n, r) => n + r.hardShort, 0);
const lifespanLong = rows.reduce((n, r) => n + r.hardLong, 0);
const vocabExtras = rows.reduce((n, r) => n + r.vocabExtras, 0);
const unisolableCount = rows.filter((r) => r.status.startsWith('Unisolable')).length;

const summaryLine =
    `Catalogue: ${total} gags · concurrency-covered: ${concurrencyCovered}/${index.length} · ` +
    `duration-covered (completed gags): ${durationCovered}/${index.length} · ` +
    `duration actor coverage: ${durationActorsCovered}/${durationVocabActors} · ` +
    `legacy duration refs: ${legacyDurationCount} · ` +
    `hard concurrency divergences: ${hardDivergences} · ` +
    `lifespan reviews beyond 3x: ${lifespanShort + lifespanLong} (${lifespanShort} short, ${lifespanLong} long) · ` +
    `vocab extras: ${vocabExtras} · ` +
    `unisolable: ${unisolableCount} (explained).`;

// Sort by ADS file name, then gag tag numerically, for a stable/readable grouping.
const sorted = [...rows].sort((a, b) => {
    if (a.adsName !== b.adsName) return a.adsName.localeCompare(b.adsName);
    const tagA = Number(a.gag.split(':')[1]);
    const tagB = Number(b.gag.split(':')[1]);
    return tagA - tagB;
});

const today = new Date().toISOString().slice(0, 10);

const tableHeader = '| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Vocab extras | Duration sampling | Duration keys | Duration in-band | Status |\n' +
    '|-----|----------|---------------------|---------------|--------------|-------------------|---------------|-------------------|--------|\n';
const tableRows = sorted
    .map((r) => `| ${r.gag} | ${r.refData} | ${r.maxConc} | ${r.vocabOverlap} | ${r.vocabExtras || '—'} | ${r.durationSampling} | ${r.durationActors} | ${r.duration} | ${r.status} |`)
    .join('\n');
const reviewRows = sorted.flatMap((row) => row.hardDetails.map((entry) =>
    `| ${row.gag} | ${entry.actor} | ${entry.direction} | ${entry.ourTicks} | ` +
    `${entry.refSampleMin}–${entry.refSampleMax} | ${entry.factor.toFixed(2)}x | ` +
    `${row.durationSampling} |`)).join('\n');

const doc = `# Faithfulness coverage

This generated report compares each browser-engine gag with recordings from the
original program. \`maxConc\` is the largest number of actors drawn together;
vocabulary is the set of actor combinations seen; duration compares how long
matching actors remain visible. Original samples are converted to engine ticks
using the measured 2.85x cadence ratio before comparison.
Legacy full-capture totals are marked separately and excluded from duration
comparison because the original capture loops the gag repeatedly.

Regenerate with:

\`\`\`
node tools/faithfulness-oracle/coverage-report.mjs
\`\`\`

Generated from the current checkout on ${today}.

## Summary

${summaryLine}

## Gags

${tableHeader}${tableRows}

## Contiguous-span reviews beyond 3x

The factor uses a one-sample allowance at each observed span boundary to
account for start/end phase between original samples. The table shows the raw
sample range; the allowance is applied before the 2.85x cadence conversion.

| Gag | Actor | Direction | Engine ticks | Original samples | Factor | Sampling |
|-----|-------|-----------|--------------|------------------|--------|----------|
${reviewRows || '| — | — | — | — | — | — | — |'}

## Reading the report

- Peak concurrency is the hard check. A difference of one is allowed for capture variation; two or more fails.
- Vocabulary and duration are review aids. Random branches differ between runs, and the reference range comes from a small sample. The duration column compares engine ticks with reference samples scaled by 2.85 and allows one sample at each span boundary for unknown sample phase; the 3x band marks substantial differences for investigation.
- Only completed-gag-v2 contiguous actor spans are comparable. Legacy capture totals and captures without a complete gag are shown without a duration verdict.
- Duration sampling shows complete original gag episodes versus deterministic browser seeds. Each actor's longest browser span is compared with the original span range. Gag occupancy and repeat counts are stored separately for branch frequency review. Duration keys counts actors with measured complete-gag spans against the full reference vocabulary.
- Duration and vocabulary remain advisory. The original branch sample is small (some gags have only one complete episode), 29 vocabulary keys still lack completed-episode span evidence, and the three remaining long-span reviews need coordinated timing fixes. The fish branch appeared only after 24 earlier original captures, so an unobserved actor key alone cannot justify a failing assertion. Peak concurrency retains its failing check.
- \`VISITOR:3\` is orphaned content and \`STAND:14\` is a shared setup macro, so neither can be captured alone. Their callers cover them indirectly.
- The \`STAND:1-12\` vocabulary comparison is not meaningful. The browser test and original capture reach these idle poses through different paths; matching concurrency does not yet prove that the pose itself is correct.
`;

writeFileSync(outPath, doc, 'utf8');
console.error(`[coverage-report] wrote ${outPath}`);
console.log(summaryLine);

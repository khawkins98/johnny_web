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

import { execSync } from 'node:child_process';
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
// module for the full rationale/caveats (frameOps preload false-exclusion, etc.).

const pct = (n, d) => (d === 0 ? 100 : Math.round((n / d) * 100));

/** Compute one catalogue row's alignment data for a real (drivable) ref gag. */
const computeRow = (entry) => {
    const ref = loadRef(entry.file);
    const runs = ref.runs || 3;
    const ours = fingerprintOursUnion(ref.name, ref.tag, runs);

    const refVocab = ref.vocab || [];
    const overlapCount = refVocab.filter((k) => ours.vocab.has(k)).length;
    const vocabOverlapPct = pct(overlapCount, refVocab.length);

    const delta = ours.maxConc - ref.maxConc;
    let maxConcFlag;
    if (delta === 0) maxConcFlag = '=';
    else if (delta === 1) maxConcFlag = '+1';
    else if (delta >= 2) maxConcFlag = `FAIL(+${delta})`;
    else maxConcFlag = `${delta}`; // negative (under)

    const hasLifespans = Boolean(ref.lifespans);
    let durationCell = '—'; // em dash
    let allWithin3x = true;
    if (hasLifespans) {
        const refActors = Object.keys(ref.lifespans);
        const bothActors = refActors.filter((a) => ours.actorTicks[a] !== undefined);
        let inBand = 0;
        let within3x = 0;
        for (const actor of bothActors) {
            const { min, max } = ref.lifespans[actor];
            const t = ours.actorTicks[actor];
            if (t >= min && t <= max) inBand++;
            const lo = min / 3;
            const hi = max * 3;
            if (t >= lo && t <= hi) within3x++;
        }
        allWithin3x = bothActors.length === 0 || within3x === bothActors.length;
        durationCell =
            bothActors.length === 0
                ? '—'
                : `${inBand}/${bothActors.length} in-band (${within3x}/${bothActors.length} within 3x)`;
    }

    let status;
    if (delta >= 2) {
        status = 'FAIL';
    } else if (hasLifespans && !allWithin3x) {
        status = 'Review';
    } else if (vocabOverlapPct < 80) {
        status = 'Review';
    } else if ((delta === 0 || delta === 1) && (!hasLifespans || allWithin3x)) {
        status = hasLifespans ? 'Aligned' : 'No-duration-data';
    } else {
        status = 'Review';
    }

    return {
        gag: `${ref.name}:${ref.tag}`,
        adsName: ref.name,
        refData: hasLifespans ? '+lifespans' : 'maxConc-only',
        maxConc: `${ours.maxConc}/${ref.maxConc} ${maxConcFlag}`,
        vocabOverlap: `${vocabOverlapPct}%`,
        duration: durationCell,
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
        duration: '—',
        status: 'Unisolable (sibling-covered)',
    },
    {
        gag: 'STAND:14',
        adsName: 'STAND',
        refData: '—',
        maxConc: '—',
        vocabOverlap: '—',
        duration: '—',
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
const hardDivergences = rows.filter((r) => r.status === 'FAIL').length;
const unisolableCount = rows.filter((r) => r.status.startsWith('Unisolable')).length;

const summaryLine =
    `Catalogue: ${total} gags · concurrency-covered: ${concurrencyCovered}/${index.length} · ` +
    `duration-covered (lifespans): ${durationCovered}/${index.length} · hard divergences: ${hardDivergences} · ` +
    `unisolable: ${unisolableCount} (explained).`;

// Sort by ADS file name, then gag tag numerically, for a stable/readable grouping.
const sorted = [...rows].sort((a, b) => {
    if (a.adsName !== b.adsName) return a.adsName.localeCompare(b.adsName);
    const tagA = Number(a.gag.split(':')[1]);
    const tagB = Number(b.gag.split(':')[1]);
    return tagA - tagB;
});

let headSha = 'unknown';
try {
    headSha = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
} catch {
    // best-effort only
}
const today = new Date().toISOString().slice(0, 10);

const tableHeader = '| Gag | Ref data | maxConc (ours/ref) | Vocab overlap | Duration in-band | Status |\n' +
    '|-----|----------|---------------------|---------------|-------------------|--------|\n';
const tableRows = sorted
    .map((r) => `| ${r.gag} | ${r.refData} | ${r.maxConc} | ${r.vocabOverlap} | ${r.duration} | ${r.status} |`)
    .join('\n');

const doc = `# Faithfulness coverage

This generated report compares each browser-engine gag with recordings from the
original program. \`maxConc\` is the largest number of actors drawn together;
vocabulary is the set of actor combinations seen; duration compares how long
matching actors remain visible.

Regenerate with:

\`\`\`
node tools/faithfulness-oracle/coverage-report.mjs
\`\`\`

Reflects HEAD \`${headSha}\`, generated ${today}.

## Summary

${summaryLine}

## Gags

${tableHeader}${tableRows}

## Reading the report

- Peak concurrency is the hard check. A difference of one is allowed for capture variation; two or more fails.
- Vocabulary and duration are review aids. Random branches differ between runs, and DOSBox timing makes precise duration comparisons unreliable. The 3x band is intended to catch actors that vanish early or remain stuck on screen.
- \`VISITOR:3\` is orphaned content and \`STAND:14\` is a shared setup macro, so neither can be captured alone. Their callers cover them indirectly.
- The \`STAND:1-12\` vocabulary comparison is not meaningful. The browser test and original capture reach these idle poses through different paths; matching concurrency does not yet prove that the pose itself is correct.
`;

writeFileSync(outPath, doc, 'utf8');
console.error(`[coverage-report] wrote ${outPath}`);
console.log(summaryLine);

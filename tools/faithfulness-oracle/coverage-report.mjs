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
// NO EMULATOR: mirrors test/faithfulness-diff.mjs exactly (same isDrawing
// predicate, same driveGag helper, same seed-union approach) so the numbers in
// this report match the CI gate. Data-only: gated on hasData; prints a clear
// message and exits 0 if the gitignored public/data game assets are absent.
//
// Usage: node tools/faithfulness-oracle/coverage-report.mjs

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { driveGag, hasData } from '../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { isTtmFinished } from '../../src/dgds/scripting/ttm-run-state.mjs';
import { compareLifespans } from './compare-lifespans.mjs';

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

// Same "drawing" predicate as test/faithfulness-diff.mjs -- see that file for
// the full rationale/caveats (frameOps preload false-exclusion, etc.).
const isDrawing = (scene) => !isTtmFinished(scene) || scene.agedOut === false;

/** Drive one gag on our engine and compute its fingerprint (identical to faithfulness-diff.mjs). */
const fingerprintOurs = (adsName, tag, seed = 1) => {
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    driveGag({
        adsName: `${adsName}.ADS`,
        tag,
        seed,
        onTick: (runtime) => {
            const live = runtime.state.scenes.filter(isDrawing).map((s) => `${s.sceneIdx}:${s.tagId}`);
            if (live.length > 0) liveTicks++;
            maxConc = Math.max(maxConc, live.length);
            for (const key of live) {
                vocab.add(key);
                actorTicks[key] = (actorTicks[key] || 0) + 1;
            }
        },
    });
    return { vocab, maxConc, liveTicks, actorTicks };
};

/** Union our fingerprint over seeds 1..runs (identical approach to faithfulness-diff.mjs). */
const fingerprintOursUnion = (adsName, tag, runs) => {
    const vocab = new Set();
    const actorTicks = {};
    let maxConc = 0;
    let liveTicks = 0;
    for (let seed = 1; seed <= runs; seed++) {
        const run = fingerprintOurs(adsName, tag, seed);
        for (const key of run.vocab) vocab.add(key);
        maxConc = Math.max(maxConc, run.maxConc);
        liveTicks += run.liveTicks;
        for (const [key, ticks] of Object.entries(run.actorTicks)) {
            actorTicks[key] = Math.max(actorTicks[key] || 0, ticks);
        }
    }
    return { vocab, maxConc, liveTicks, actorTicks };
};

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

const doc = `# Oracle coverage report

This is a **generated** per-gag alignment/fidelity report for the differential
faithfulness oracle (\`test/faithfulness-diff.mjs\`). It drives OUR engine against
each of the committed original-binary reference fingerprints in
\`test/faithfulness-refs/\` and reports, per gag: maxConc alignment, vocabulary
overlap, and (where lifespan data exists) duration in-band coverage.

Regenerate with:

\`\`\`
node tools/faithfulness-oracle/coverage-report.mjs
\`\`\`

Reflects HEAD \`${headSha}\`, generated ${today}.

## Summary

${summaryLine}

## Per-gag table

${tableHeader}${tableRows}

## Caveats

- **Duration is a gross-divergence signal, not fine duration matching.**
  Absolute lifespan tick-counts carry roughly ±3x reference-capture noise: the
  original binary's capture sessions ran under \`cycles=max\` / \`GetTickCount\`
  pacing, where the DOSBox director's real invocation rate varies session to
  session (see \`scratchpad/findings/delay-calibration-rootcause.md\` and
  \`scratchpad/findings/global-timing-ratio.md\`). The "within 3x" duration band
  is deliberately loose so it only catches egregious divergences -- a stuck-on
  or dropped-early actor (e.g. the JOHNNY:2 0x2020 flash/stuck-hold bug this
  oracle caught) -- not subtle timing drift. Exact-duration ground truth would
  need a deterministic LFG-seeded capture of the original binary, which is
  tracked separately in \`tools/faithfulness-oracle/rng-port.md\`.
- **43 of the 64 committed refs lack lifespan data** (\`maxConc-only\`), which is
  a known duration-coverage gap, not a fidelity problem -- those refs predate
  the lifespans field. They are enrichable by regenerating with
  \`node tools/faithfulness-oracle/gen-refs.mjs --gags NAME:tag,... --runs 8\`.
- **Vocab overlap** is computed against the reference union (an RNG-tolerant
  lower bound over \`ref.runs\` original-binary runs), so it is the more
  reliable coverage metric here; a gag can show less than 100% overlap simply
  because our single seed-union run didn't happen to hit every RNG branch the
  binary's multi-run union did -- see \`test/faithfulness-diff.mjs\` for why
  vocab diffs are review-only, not a hard gate.
- **VISITOR:3** and **STAND:14** cannot be driven in isolation by \`driveGag\`
  (VISITOR:3 only ever runs as a sibling of another VISITOR gag; STAND:14 is an
  init-only macro tag with no independent draw path) -- they are covered
  transitively through the gags that invoke them, and are listed here as
  explicit catalogue rows rather than silently omitted.
`;

writeFileSync(outPath, doc, 'utf8');
console.error(`[coverage-report] wrote ${outPath}`);
console.log(summaryLine);

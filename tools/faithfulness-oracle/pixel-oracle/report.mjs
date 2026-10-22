// report.mjs -- the "Pixel oracle" section of docs/oracle-coverage.md, rendered from
// scores.json. Used by sweep.mjs and by coverage-report.mjs, so regenerating either
// report keeps the section.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
export const SCORES_PATH = path.join(here, 'scores.json');
const DOC_PATH = path.join(repoRoot, 'docs/oracle-coverage.md');
const BEGIN = '<!-- pixel-oracle:begin -->';
const END = '<!-- pixel-oracle:end -->';

/** Verdict thresholds on the offset-aligned keyframe score (% of masked pixels). */
export const THRESHOLDS = Object.freeze({ faithfulMedian: 2, faithfulMax: 8, closeMedian: 5, lowCoverage: 80 });

export const verdict = (r) => {
    if (r.error) return 'error';
    if (r.skipped) return 'skipped';
    if (!r.keyframes) return 'no keyframes';
    if (r.alignedMedian <= THRESHOLDS.faithfulMedian) return r.alignedMax <= THRESHOLDS.faithfulMax ? 'faithful' : 'faithful, outlier keyframe';
    if (r.alignedMedian <= THRESHOLDS.closeMedian) return 'close';
    return 'divergent';
};

const fmt = (x) => (x == null ? '—' : `${x}`);

export const renderPixelSection = (scores) => {
    const rows = scores.gags;
    const counts = {};
    for (const r of rows) counts[verdict(r)] = (counts[verdict(r)] ?? 0) + 1;
    const offsets = {};
    for (const r of rows) if (r.fgShift) offsets[r.fgShift.offset] = (offsets[r.fgShift.offset] ?? 0) + 1;
    const lines = [
        BEGIN,
        '## Pixel oracle',
        '',
        'Keyframe pixel comparison of the browser render with tick-aligned framebuffer',
        'captures of the original (forced, one episode per gag). Method, masks and',
        'limitations: [pixel-oracle/README.md](../tools/faithfulness-oracle/pixel-oracle/README.md).',
        'Scores are the percentage of masked pixels that differ, per keyframe; the gag',
        'figure is the median over keyframes (live-set transitions, mid-span samples,',
        'and the tick after each LOAD_SCREEN / STORE_AREA), best-aligned within a small',
        'tick window (wider for mid-span samples). `raw` is as rendered; `aligned`',
        "moves our foreground by the gag's dominant offset first (see the offset",
        'column). Palette substitutions (Windows static colours) are not counted as',
        'differences.',
        '',
        'Regenerate with (local only; needs the patched DOSBox-X and game data):',
        '',
        '```',
        'node tools/faithfulness-oracle/pixel-oracle/capture-gags.mjs',
        'node tools/faithfulness-oracle/pixel-oracle/sweep.mjs',
        '```',
        '',
        `Generated ${scores.generated}; comparator sweep ${scores.sweepSeconds}s.`,
        '',
        `Verdicts (aligned median <= ${THRESHOLDS.faithfulMedian}% = faithful, "outlier keyframe" when one keyframe exceeds ${THRESHOLDS.faithfulMax}%; median <= ${THRESHOLDS.closeMedian}% = close; else divergent): ` +
            Object.entries(counts)
                .map(([k, v]) => `${k} ${v}`)
                .join(' · ') +
            `. Foreground offset (ours -> original, dx,dy): ${Object.entries(offsets)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k} in ${v} gags`)
                .join(', ')}.`,
        '',
        '| Gag | Live-set coverage | Seed | Keyframes | Raw median | Aligned median | Aligned max | Offset | Palette subst. | Stale px | Black plate (top) | Verdict |',
        '|-----|------|------|------|------|------|------|------|------|------|------|------|',
    ];
    for (const r of rows) {
        if (r.error || r.skipped) {
            lines.push(`| ${r.gag} | — | — | — | — | — | — | — | — | — | — | ${verdict(r)}: ${r.error ?? r.skipped} |`);
            continue;
        }
        const low = r.coverage < THRESHOLDS.lowCoverage ? ' (low)' : '';
        lines.push(
            `| ${r.gag} | ${r.coverage}%${low} | ${r.seed} | ${r.keyframes} | ${fmt(r.diffMedian)}% | ${fmt(r.alignedMedian)}% | ${fmt(r.alignedMax)}% | ${r.fgShift.offset} (${r.fgShift.keyframes}/${r.fgShift.judged}) | ${fmt(r.remapMedian)}% | ${fmt(r.stale)} | ${fmt(r.eb0TopMax)}% | ${verdict(r)} |`,
        );
    }
    lines.push('', END);
    return lines.join('\n');
};

/** Replace (or append) the pixel section in docs/oracle-coverage.md. */
export const replacePixelSection = (scores) => {
    const doc = readFileSync(DOC_PATH, 'utf8');
    writeFileSync(DOC_PATH, withPixelSection(doc, scores));
};

/** Text of `doc` with the pixel section replaced/appended (scores.json if omitted). */
export const withPixelSection = (doc, scores = null) => {
    const data = scores ?? (existsSync(SCORES_PATH) ? JSON.parse(readFileSync(SCORES_PATH, 'utf8')) : null);
    if (!data) return doc;
    const section = renderPixelSection(data);
    const start = doc.indexOf(BEGIN);
    const end = doc.indexOf(END);
    if (start !== -1 && end !== -1) return doc.slice(0, start) + section + doc.slice(end + END.length);
    return `${doc.replace(/\s*$/, '')}\n\n${section}\n`;
};

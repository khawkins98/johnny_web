#!/usr/bin/env node
/**
 * Overnight differential faithfulness sweep workhorse. For a set of gags:
 *   1. capture the ORIGINAL binary in parallel (parallel-capture.mjs, isolated),
 *      optionally N captures/gag for RANDOM-branch coverage;
 *   2. build each gag's ORIGINAL vocab (threads-to-timeline --slot <sceneIdx> ->
 *      build-vocab over the capture(s));
 *   3. build each gag's OURS vocab (our-thread-timeline over M seeds -> build-vocab);
 *   4. compare-vocab -> per-gag verdict (FAITHFUL / REVIEW / DIVERGENT).
 * Ranks DIVERGENT (esp. extra-body concurrencyFlag) first -- those are the real
 * faithfulness bugs to fix.
 *
 * The gag's sceneIdx/slot is read from OUR timeline (our sceneIdx == the binary's
 * TTM slot, confirmed for BUILDING slot 3); the original trace is filtered to it.
 *
 * Usage:
 *   node run-diff-sweep.mjs --gags BUILDING:7,ACTIVITY:1 --out <dir> [--conc 4] [--orig-caps 3] [--our-seeds 12] [--secs 200]
 *   node run-diff-sweep.mjs --all-ambient --out <dir> ...     # every ambient (non-keyframe) catalogue gag
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : d; };
const has = (f) => process.argv.includes(f);
const REND = path.resolve(process.cwd(), 'tools/faithfulness-oracle/rendering-oracle');
const SP = process.env.SP_DOSBOX || '/private/tmp/claude-501/-Users-khawkins-Documents-git-johnny-web/636b3fbc-2323-4456-ae0c-481b8c5b84c4/scratchpad/dosbox';
const ADS_ID = { ACTIVITY: 0x65, BUILDING: 0x66, FISHING: 0x68, JOHNNY: 0x69, MARY: 0x6a, STAND: 0x6c, SUZY: 0x6d, VISITOR: 0x6e, WALKSTUF: 0x6f };
const ADS_FILE = { ACTIVITY: 'ACTIVITY.ADS', BUILDING: 'BUILDING.ADS', FISHING: 'FISHING.ADS', STAND: 'STAND.ADS', VISITOR: 'VISITOR.ADS', WALKSTUF: 'WALKSTUF.ADS' };

const out = arg('--out');
if (!out) { console.error('--out required'); process.exit(2); }
const conc = arg('--conc', '4');
const origCaps = Number(arg('--orig-caps', '3'));
const ourSeeds = Number(arg('--our-seeds', '12'));
const secs = arg('--secs', '200');
mkdirSync(out, { recursive: true });

// resolve the gag list
let gags;
if (has('--all-ambient')) {
    // enumerate ambient catalogue gags from the binary (reuse sweep-catalogue --list --json)
    const listJson = execFileSync('node', [path.join(REND, 'sweep-catalogue.mjs'), '--list', '--json', '--scr', path.join(SP, 'driveC', 'SCRANTIC.SCR')], { encoding: 'utf8' });
    gags = JSON.parse(listJson).filter((g) => ADS_FILE[g.name]); // ambient only (no SUZY/JOHNNY/MARY keyframes)
} else {
    gags = arg('--gags').split(',').map((s) => { const [name, tag] = s.split(':'); return { name: name.toUpperCase(), tag: Number(tag) }; });
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

// 1. OURS vocab per gag (fast, pure JS, M seeds) -- also gives us the sceneIdx/slot
console.error(`[sweep] building OURS vocab (${ourSeeds} seeds) for ${gags.length} gags...`);
for (const g of gags) {
    const adsFile = ADS_FILE[g.name];
    const dir = path.join(out, `${g.name}_${g.tag}`);
    mkdirSync(dir, { recursive: true });
    const files = [];
    let slot = null;
    for (let s = 1; s <= ourSeeds; s++) {
        const f = path.join(dir, `ours_${s}.jsonl`);
        try {
            const tl = sh('node', [path.join(REND, '..', 'our-thread-timeline.mjs'), adsFile, String(g.tag), String(s), '--out', f]);
        } catch { continue; }
        files.push(f);
        if (slot === null) {
            for (const line of readFileSync(f, 'utf8').split('\n')) { if (!line) continue; const live = JSON.parse(line).live; if (live && live.length) { slot = live[0].split(':')[0]; break; } }
        }
    }
    g.slot = slot;
    if (files.length) sh('bash', ['-c', `node ${JSON.stringify(path.join(REND, 'build-vocab.mjs'))} ${files.map((x) => JSON.stringify(x)).join(' ')} > ${JSON.stringify(path.join(dir, 'ours-vocab.json'))}`]);
}

// 2. ORIGINAL captures in parallel (origCaps per gag -> distinct workdirs)
const capSpecs = [];
for (const g of gags) for (let c = 0; c < origCaps; c++) capSpecs.push(`${g.name}:${g.tag}`);
console.error(`[sweep] capturing ORIGINAL: ${gags.length} gags x ${origCaps} caps = ${capSpecs.length} runs, conc=${conc}...`);
// parallel-capture writes <capOut>/<NAME>_<tag>/threads.log; to get N caps/gag, run N passes into numbered roots
for (let c = 0; c < origCaps; c++) {
    const capOut = path.join(out, `_orig_cap${c}`);
    try {
        sh('node', [path.join(REND, 'parallel-capture.mjs'), '--gags', gags.map((g) => `${g.name}:${g.tag}`).join(','), '--out', capOut, '--conc', conc, '--secs', secs], { stdio: ['ignore', 'ignore', 'inherit'] });
    } catch (e) { console.error(`[sweep] cap pass ${c} error (continuing): ${e.message}`); }
}

// 3. ORIGINAL vocab per gag: threads-to-timeline --slot over all caps -> build-vocab
console.error('[sweep] building ORIGINAL vocabs + comparing...');
const verdicts = [];
for (const g of gags) {
    const dir = path.join(out, `${g.name}_${g.tag}`);
    const tls = [];
    for (let c = 0; c < origCaps; c++) {
        const thr = path.join(out, `_orig_cap${c}`, `${g.name}_${g.tag}`, 'threads.log');
        if (!existsSync(thr) || g.slot === null) continue;
        const tl = path.join(dir, `orig_cap${c}.jsonl`);
        sh('bash', ['-c', `node ${JSON.stringify(path.join(REND, 'threads-to-timeline.mjs'))} ${JSON.stringify(thr)} --slot ${g.slot} > ${JSON.stringify(tl)}`]);
        tls.push(tl);
    }
    if (!tls.length || !existsSync(path.join(dir, 'ours-vocab.json'))) { verdicts.push({ name: `${g.name}#${g.tag}`, verdict: 'NO-DATA', slot: g.slot }); continue; }
    sh('bash', ['-c', `node ${JSON.stringify(path.join(REND, 'build-vocab.mjs'))} ${tls.map((x) => JSON.stringify(x)).join(' ')} > ${JSON.stringify(path.join(dir, 'orig-vocab.json'))}`]);
    let v;
    try {
        const j = sh('node', [path.join(REND, 'compare-vocab.mjs'), '--orig', path.join(dir, 'orig-vocab.json'), '--ours', path.join(dir, 'ours-vocab.json'), '--name', `${g.name}#${g.tag}`, '--json']);
        v = JSON.parse(j);
    } catch (e) {
        // compare-vocab exits 1 on DIVERGENT; capture its stdout
        v = e.stdout ? JSON.parse(e.stdout) : { name: `${g.name}#${g.tag}`, verdict: 'ERROR' };
    }
    verdicts.push(v);
}

// 4. rank + report
const rank = { DIVERGENT: 0, REVIEW: 1, 'NO-DATA': 2, ERROR: 2, FAITHFUL: 3 };
verdicts.sort((a, b) => (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9));
console.log(JSON.stringify(verdicts, null, 2));
console.error('\n=== SWEEP SUMMARY ===');
for (const v of verdicts) console.error(`  ${v.verdict.padEnd(9)} ${v.name}${v.concurrencyFlag ? '  !!EXTRA-BODY' : ''}${v.oursOnlyActors?.length ? `  ours-only:${v.oursOnlyActors.length}` : ''}`);

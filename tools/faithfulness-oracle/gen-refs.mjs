#!/usr/bin/env node
/**
 * gen-refs.mjs -- generate committed, RNG-TOLERANT reference fingerprints for the
 * original-binary faithfulness oracle.
 *
 * WHY a "reference" instead of a raw capture: capture-original-gag.mjs is
 * mechanically deterministic (same director-injection pin every run) but NOT
 * byte-identical across runs -- the GetTickCount-paced boot phase consumes a
 * variable number of pre-gag RNG draws, so each run enters the gag at a
 * different LFG stream offset (see METHODOLOGY.md / task1-isolation-report.md).
 * So instead of pinning one run's bytes, we capture a gag N times and UNION the
 * per-tick "slot:tag" live-actor sets into a coverage VOCABULARY (build-vocab.mjs)
 * that is stable once N runs have sampled the gag's RNG branches.
 *
 * Usage:
 *   node gen-refs.mjs --gags NAME:tag,NAME:tag,... --out test/faithfulness-refs \
 *       [--runs 3] [--conc 4] [--secs 90]
 *
 * Per gag:
 *   1. Run capture-original-gag.mjs N times into <out>/.work/<NAME>_<tag>_r<i>/
 *      (concurrency-limited across the WHOLE batch, not just per gag).
 *   2. Resolve the gag's TTM slot from the N (unfiltered) timeline.jsonl files
 *      capture-original-gag.mjs already produces: pick the slot with the most
 *      "slot:tag" live-entries summed over all N runs (the isolated gag's own
 *      actors dominate; stray/system slots are a small minority).
 *   3. Re-slice each run's threads.log to that slot (threads-to-timeline.mjs
 *      --slot) and union all N sliced timelines with build-vocab.mjs.
 *   4. Write test/faithfulness-refs/<NAME>_<tag>.json:
 *      { name, adsId, tag, slot, runs, vocab, maxConc, states, drainTick }
 *
 * Also writes/updates test/faithfulness-refs/index.json listing every ref.
 *
 * These are DERIVED behavioral fingerprints (slot:tag vocab + maxConc/states),
 * the same class of artifact as test/goldens/* -- safe to commit; NO raw
 * pixels/frames/threads.log are written under test/.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const CAPTURE = path.join(here, 'capture-original-gag.mjs');
const THREADS_TO_TIMELINE = path.join(here, 'rendering-oracle', 'threads-to-timeline.mjs');
const BUILD_VOCAB = path.join(here, 'rendering-oracle', 'build-vocab.mjs');

const ADS_NAME_TO_HEX = {
    ACTIVITY: '0x65', BUILDING: '0x66', FISHING: '0x68', JOHNNY: '0x69',
    MARY: '0x6a', STAND: '0x6c', SUZY: '0x6d', VISITOR: '0x6e', WALKSTUF: '0x6f',
};

// -- args --
const argv = process.argv.slice(2);
const flag = (f, d) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : d; };
const gagsRaw = flag('--gags', '');
const outDir = path.resolve(repoRoot, flag('--out', 'test/faithfulness-refs'));
const runs = Number(flag('--runs', '3'));
const conc = Number(flag('--conc', '4'));
const secs = Number(flag('--secs', '90'));

if (!gagsRaw) {
    console.error('usage: node gen-refs.mjs --gags NAME:tag,NAME:tag,... --out test/faithfulness-refs [--runs 3] [--conc 4] [--secs 90]');
    process.exit(2);
}

const gags = gagsRaw.split(',').filter(Boolean).map((spec) => {
    const [name, tagRaw] = spec.split(':');
    const tag = Number(tagRaw);
    const hex = ADS_NAME_TO_HEX[name.toUpperCase()];
    if (!hex) throw new Error(`unknown ADS name: ${name} (known: ${Object.keys(ADS_NAME_TO_HEX).join(',')})`);
    if (!Number.isFinite(tag)) throw new Error(`bad tag in spec: ${spec}`);
    return { name: name.toUpperCase(), tag, hex };
});

mkdirSync(outDir, { recursive: true });
const workDir = path.join(outDir, '.work');
mkdirSync(workDir, { recursive: true });

// -- simple concurrency-limited job runner --
function runJob(cmd, args, opts = {}) {
    return new Promise((resolve) => {
        const chunks = [];
        const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], ...opts });
        child.stdout.on('data', (d) => chunks.push(d));
        child.on('exit', (code) => resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') }));
        child.on('error', () => resolve({ code: -1, stdout: '' }));
    });
}

async function pool(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    async function lane() {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
    return results;
}

// -- step 1: capture N runs per gag (flattened, pooled across the whole batch) --
const captureJobs = [];
for (const g of gags) {
    for (let r = 1; r <= runs; r++) {
        captureJobs.push({ gag: g, run: r, dir: path.join(workDir, `${g.name}_${g.tag}_r${r}`) });
    }
}

console.error(`[gen-refs] capturing ${captureJobs.length} runs (${gags.length} gags x ${runs} runs), concurrency=${conc}, secs=${secs}`);
const captureResults = await pool(captureJobs, conc, async (job) => {
    const { code, stdout } = await runJob('node', [
        CAPTURE, job.gag.hex, String(job.gag.tag), job.dir, '--secs', String(secs), '--name', job.gag.name,
    ]);
    let summary = null;
    try { summary = JSON.parse(stdout); } catch { /* capture failed; summary stays null */ }
    const ok = code === 0 && summary && summary.forced && summary.isolatedToTarget;
    console.error(`[gen-refs] ${job.gag.name}:${job.gag.tag} run ${job.run}/${runs} -> ${ok ? 'ok' : 'FAIL'} (code=${code})`);
    return { ...job, ok, summary };
});

// -- step 2+3+4: per gag, resolve slot + build unioned vocab --
const refs = [];
for (const g of gags) {
    const gagRuns = captureResults.filter((c) => c.gag === g && c.gag.name === g.name && c.gag.tag === g.tag);
    const okRuns = gagRuns.filter((c) => c.ok);
    if (okRuns.length === 0) {
        console.error(`[gen-refs] SKIP ${g.name}:${g.tag} -- all ${gagRuns.length} capture runs failed`);
        continue;
    }
    if (okRuns.length < gagRuns.length) {
        console.error(`[gen-refs] WARN ${g.name}:${g.tag} -- only ${okRuns.length}/${gagRuns.length} runs succeeded`);
    }

    // resolve slot: sum live-entry counts per slot across all unfiltered timelines
    const slotCounts = new Map();
    for (const r of okRuns) {
        const timelinePath = path.join(r.dir, 'timeline.jsonl');
        if (!existsSync(timelinePath)) continue;
        const text = readFileSync(timelinePath, 'utf8');
        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            let rec;
            try { rec = JSON.parse(line); } catch { continue; }
            for (const a of rec.live || []) {
                const slot = a.split(':')[0];
                slotCounts.set(slot, (slotCounts.get(slot) || 0) + 1);
            }
        }
    }
    if (slotCounts.size === 0) {
        console.error(`[gen-refs] SKIP ${g.name}:${g.tag} -- no live entries in any run's timeline`);
        continue;
    }
    const slot = [...slotCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // re-slice each run's threads.log to the resolved slot
    const slicedTimelines = [];
    for (const r of okRuns) {
        const threadsLog = path.join(r.dir, 'threads.log');
        const slicedPath = path.join(r.dir, `timeline.slot${slot}.jsonl`);
        const { stdout } = await runJob('node', [THREADS_TO_TIMELINE, threadsLog, '--slot', slot]);
        writeFileSync(slicedPath, stdout);
        slicedTimelines.push(slicedPath);
    }

    const { stdout: vocabOut } = await runJob('node', [BUILD_VOCAB, ...slicedTimelines]);
    let vocab;
    try { vocab = JSON.parse(vocabOut); } catch {
        console.error(`[gen-refs] SKIP ${g.name}:${g.tag} -- build-vocab produced invalid JSON`);
        continue;
    }

    const ref = {
        name: g.name,
        adsId: g.hex,
        tag: g.tag,
        slot,
        runs: okRuns.length,
        vocab: vocab.actors,
        maxConc: vocab.maxConc,
        states: vocab.states,
        drainTick: null,
    };
    const refPath = path.join(outDir, `${g.name}_${g.tag}.json`);
    writeFileSync(refPath, JSON.stringify(ref, null, 2) + '\n');
    console.error(`[gen-refs] wrote ${refPath} (vocab=${ref.vocab.length}, maxConc=${ref.maxConc}, states=${ref.states}, runs=${ref.runs}/${gagRuns.length})`);
    refs.push({ name: g.name, tag: g.tag, file: `${g.name}_${g.tag}.json` });
}

// -- merge into index.json (preserve any existing entries not regenerated this run) --
const indexPath = path.join(outDir, 'index.json');
let existingIndex = [];
if (existsSync(indexPath)) {
    try { existingIndex = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { existingIndex = []; }
}
const merged = new Map(existingIndex.map((e) => [`${e.name}:${e.tag}`, e]));
for (const r of refs) merged.set(`${r.name}:${r.tag}`, r);
const finalIndex = [...merged.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.tag - b.tag));
writeFileSync(indexPath, JSON.stringify(finalIndex, null, 2) + '\n');
console.error(`[gen-refs] wrote ${indexPath} (${finalIndex.length} refs total)`);

// cleanup scratch capture dirs (driveC copies etc.) -- refs are self-contained JSON
rmSync(workDir, { recursive: true, force: true });

if (refs.length < gags.length) process.exit(1);

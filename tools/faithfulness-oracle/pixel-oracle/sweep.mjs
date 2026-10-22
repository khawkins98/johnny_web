#!/usr/bin/env node
// sweep.mjs -- run the pixel-oracle comparator over every captured gag, in parallel
// worker processes, and record the scores.
//
//   node sweep.mjs [--gags A:1,B:2] [--captures scratchpad/pixel-oracle/captures]
//                  [--conc 8] [--seeds 16] [--no-doc] [--dump dir]
//
// Writes tools/faithfulness-oracle/pixel-oracle/scores.json (derived numbers only,
// no pixels) and refreshes the "Pixel oracle" section of docs/oracle-coverage.md.
// Gags without a capture are listed as skipped. Exits 0 without game data.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CAPTURES, hasData, repoRoot } from './compare.mjs';
import { allGags } from './gags.mjs';
import { SCORES_PATH, replacePixelSection } from './report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const COMPARE = path.join(here, 'compare.mjs');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : argv[i + 1];
};
const gags = (flag('--gags', '') || allGags().join(',')).split(',').filter(Boolean);
const captures = path.resolve(flag('--captures', DEFAULT_CAPTURES));
const conc = Number(flag('--conc', '8'));
const seeds = flag('--seeds', '16');
const dump = flag('--dump', null);

if (!hasData) {
    console.log('# no game data (public/data) -- nothing to sweep');
    process.exit(0);
}

const runOne = (gag) =>
    new Promise((resolve) => {
        const dir = path.join(captures, gag.replace(':', '_'));
        if (!existsSync(path.join(dir, 'timeline.jsonl'))) return resolve({ gag, skipped: 'no capture' });
        const args = [COMPARE, gag, '--captures', captures, '--seeds', seeds, '--json'];
        if (dump) args.push('--dump', dump);
        const out = [];
        const err = [];
        const child = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', (d) => out.push(d));
        child.stderr.on('data', (d) => err.push(d));
        child.on('exit', (code) => {
            const text = Buffer.concat(out).toString('utf8').trim().split('\n').at(-1);
            try {
                resolve(JSON.parse(text));
            } catch {
                resolve({ gag, error: `exit ${code}: ${Buffer.concat(err).toString('utf8').trim().split('\n').at(-1)}` });
            }
        });
    });

const t0 = Date.now();
const queue = [...gags];
const results = [];
await Promise.all(
    Array.from({ length: Math.min(conc, queue.length) }, async () => {
        while (queue.length) {
            const gag = queue.shift();
            const r = await runOne(gag);
            results.push(r);
            console.log(
                r.error || r.skipped
                    ? `${gag.padEnd(12)} ${r.error ?? `skipped (${r.skipped})`}`
                    : `${gag.padEnd(12)} aligned ${r.alignedMedian}% (max ${r.alignedMax}%) raw ${r.diffMedian}% offset ${r.fgShift.offset} cover ${r.coverage}% ${r.seconds}s`,
            );
        }
    }),
);
const seconds = Math.round((Date.now() - t0) / 1000);
const order = new Map(gags.map((g, i) => [g, i]));
results.sort((a, b) => order.get(a.gag) - order.get(b.gag));
const previous = existsSync(SCORES_PATH) ? JSON.parse(readFileSync(SCORES_PATH, 'utf8')) : null;
const merged = new Map((previous?.gags ?? []).map((r) => [r.gag, r]));
for (const r of results) merged.set(r.gag, r);
const scores = {
    generated: new Date().toISOString().slice(0, 10),
    sweepSeconds: seconds,
    gags: allGags()
        .filter((g) => merged.has(g))
        .map((g) => merged.get(g)),
};
const { gags: rows, ...meta } = scores;
writeFileSync(SCORES_PATH, `{${JSON.stringify(meta).slice(1, -1)},"gags":[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]}\n`);
console.log(`# ${results.length} gags in ${seconds}s -> ${path.relative(repoRoot, SCORES_PATH)}`);
if (!argv.includes('--no-doc')) {
    replacePixelSection(scores);
    console.log('# docs/oracle-coverage.md pixel section refreshed');
}

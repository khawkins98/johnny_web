#!/usr/bin/env node
// capture-gags.mjs -- batch tick-aligned framebuffer captures of the original program
// for the pixel oracle. One forced capture per gag (capture-original-gag.mjs --fb),
// stopped automatically once the gag's first episode has finished.
//
// Usage:
//   node capture-gags.mjs [--gags SUZY:1,JOHNNY:6 | (default: every gag in
//       test/faithfulness-refs/index.json)] [--out scratchpad/pixel-oracle/captures]
//       [--conc 6] [--secs 240] [--force]
//
// Needs SP_DOSBOX (drives C/D) and DBX (a dosbox-x built with dosbox-x-oracle.patch);
// see ../METHODOLOGY.md. Exits 0 with a message when either is missing.
// Output per gag: <out>/<NAME>_<tag>/{timeline.jsonl,trace.log,fb/*.ppm.gz,summary.json}.
// Captures are proprietary-derived pixels: they stay in scratchpad/, never in git.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADS_HEX, allGags } from './gags.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const CAPTURE = path.join(here, '..', 'capture-original-gag.mjs');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = argv.indexOf(name);
    return i === -1 ? fallback : argv[i + 1];
};
const gags = (flag('--gags', '') || allGags().join(',')).split(',').filter(Boolean);
const out = path.resolve(flag('--out', path.join(repoRoot, 'scratchpad/pixel-oracle/captures')));
const conc = Number(flag('--conc', '6'));
const secs = Number(flag('--secs', '240'));
const force = argv.includes('--force');

const SP = process.env.SP_DOSBOX;
const DBX = process.env.DBX || (SP && path.resolve(SP, '../dosbox-x-src/src/dosbox-x'));
if (!SP || !existsSync(path.join(SP, 'driveC')) || !DBX || !existsSync(DBX)) {
    console.log('# SP_DOSBOX / DBX not set up (see METHODOLOGY.md) -- nothing to capture.');
    process.exit(0);
}

const captureOne = (gag) =>
    new Promise((resolve) => {
        const [name, tag] = gag.split(':');
        const dir = path.join(out, `${name}_${tag}`);
        const summaryFile = path.join(dir, 'summary.json');
        if (!force && existsSync(summaryFile)) {
            const summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
            if (summary.ok) return resolve({ gag, ...summary, cached: true });
        }
        const started = Date.now();
        const chunks = [];
        const child = spawn('node', [CAPTURE, ADS_HEX[name], tag, dir, '--fb', '--secs', String(secs), '--name', name], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
        });
        child.stdout.on('data', (d) => chunks.push(d));
        child.stderr.on('data', () => {});
        child.on('exit', (code) => {
            let summary = {};
            try {
                summary = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
                summary = { error: `capture exited ${code} without a summary` };
            }
            summary.ok = Boolean(summary.forced && summary.isolatedToTarget && summary.fbLoads >= 2);
            summary.seconds = Math.round((Date.now() - started) / 1000);
            // the per-run game copy is only needed while the emulator runs
            rmSync(path.join(dir, 'driveC'), { recursive: true, force: true });
            if (existsSync(dir)) writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
            resolve({ gag, ...summary });
        });
    });

const queue = [...gags];
const results = [];
const t0 = Date.now();
await Promise.all(
    Array.from({ length: Math.min(conc, queue.length) }, async () => {
        while (queue.length) {
            const gag = queue.shift();
            const r = await captureOne(gag);
            results.push(r);
            console.log(
                `${r.ok ? 'ok  ' : 'FAIL'} ${gag.padEnd(12)} ${r.cached ? 'cached' : `${r.seconds}s`} frames=${r.fbFrames ?? '-'} loads=${r.fbLoads ?? '-'}${r.error ? ` ${r.error}` : ''}`,
            );
        }
    }),
);
const failed = results.filter((r) => !r.ok).map((r) => r.gag);
console.log(`# ${results.length - failed.length}/${results.length} captured in ${Math.round((Date.now() - t0) / 1000)}s${failed.length ? `; failed: ${failed.join(',')}` : ''}`);

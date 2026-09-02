#!/usr/bin/env node
/**
 * Parallel-safe ORIGINAL-binary capture for the differential sweep. Each gag runs
 * in an ISOLATED workdir (its own driveC copy + dbx.conf), and dosbox-x instances
 * are managed BY CHILD PID -- never a global `pkill dosbox-x` (which would kill
 * sibling instances AND any other running capture). This lets N gags capture
 * concurrently, so a 62-gag sweep runs in ~(62/N) * captureSecs instead of serial.
 *
 * Per gag it force-patches its own driveC copy (force-gag.py for ambient gags;
 * force-scene-patches.py --day for day-locked keyframes SUZY/JOHNNY/MARY), runs
 * dosbox-x headless with DBX_THREADS, and leaves <out>/<name>_<tag>/threads.log.
 * The isolated workdir is disposable (no revert needed).
 *
 * Usage:
 *   node parallel-capture.mjs --gags BUILDING:7,ACTIVITY:1,... --out <dir> [--conc 4] [--secs 200]
 *   node parallel-capture.mjs --gags-json <file> --out <dir>        # [{adsId,tag,name,day?}]
 *
 * Env: SP_DOSBOX (default .../scratchpad/dosbox), DBX (default SP_DOSBOX/../dosbox-x-src/src/dosbox-x).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, cpSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const arg = (f, d) => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : d; };

const SP = process.env.SP_DOSBOX || '/private/tmp/claude-501/-Users-khawkins-Documents-git-johnny-web/636b3fbc-2323-4456-ae0c-481b8c5b84c4/scratchpad/dosbox';
const DBX = process.env.DBX || path.resolve(SP, '../dosbox-x-src/src/dosbox-x');
const REND = path.resolve(process.cwd(), 'tools/faithfulness-oracle/rendering-oracle');
const ADS_NAMES = { 0x65: 'ACTIVITY', 0x66: 'BUILDING', 0x68: 'FISHING', 0x69: 'JOHNNY', 0x6a: 'MARY', 0x6c: 'STAND', 0x6d: 'SUZY', 0x6e: 'VISITOR', 0x6f: 'WALKSTUF' };
const NAME_ADS = Object.fromEntries(Object.entries(ADS_NAMES).map(([k, v]) => [v, +k]));

const outRoot = arg('--out');
const conc = Number(arg('--conc', '4'));
const secs = Number(arg('--secs', '200'));
if (!outRoot) { console.error('--out required'); process.exit(2); }

let gags = [];
if (arg('--gags-json')) {
    gags = JSON.parse(readFileSync(arg('--gags-json'), 'utf8'));
} else if (arg('--gags')) {
    for (const spec of arg('--gags').split(',')) {
        const [name, tag] = spec.split(':');
        const adsId = NAME_ADS[name.toUpperCase()];
        if (adsId === undefined) { console.error(`unknown ADS name ${name}`); process.exit(2); }
        gags.push({ adsId, tag: Number(tag), name: name.toUpperCase() });
    }
}
if (gags.length === 0) { console.error('no gags (use --gags NAME:tag,... or --gags-json)'); process.exit(2); }

const run = (cmd, args, opts = {}) =>
    new Promise((resolve) => {
        const child = spawn(cmd, args, { stdio: 'ignore', ...opts });
        let done = false;
        const timer = opts.timeoutMs
            ? setTimeout(() => { if (!done) { try { process.kill(child.pid, 'SIGKILL'); } catch {} } }, opts.timeoutMs)
            : null;
        child.on('exit', (code) => { done = true; if (timer) clearTimeout(timer); resolve(code); });
        child.on('error', () => { done = true; if (timer) clearTimeout(timer); resolve(-1); });
    });

const captureOne = async (gag) => {
    const label = `${gag.name}_${gag.tag}`;
    const work = path.join(outRoot, label);
    const driveC = path.join(work, 'driveC');
    try {
        if (existsSync(work)) rmSync(work, { recursive: true, force: true });
        mkdirSync(work, { recursive: true });
        cpSync(path.join(SP, 'driveC'), driveC, { recursive: true });
        // Normalize the copy to the CLEAN unpatched baseline before forcing: the
        // source driveC may be mid-force from another capture, and stacking a
        // second force would make the picker see two dominant gags. .prepatch is
        // the original (pre-any-patch) SCRANTIC saved by force-scene-patches.py.
        for (const f of ['SCRANTIC.SCR', 'SCRANTIC.EXE']) {
            const pre = path.join(driveC, f + '.prepatch');
            if (existsSync(pre)) cpSync(pre, path.join(driveC, f));
        }
        // per-worker conf: isolated driveC, shared read-only driveD
        const conf = `[sdl]\nautolock=false\n[dosbox]\nmachine=svga_s3\n[cpu]\ncycles=max\n[autoexec]\nmount c "${driveC}"\nmount d "${path.join(SP, 'driveD')}"\nd:\ncall runapp.bat scrantic.exe /s\n`;
        const confPath = path.join(work, 'dbx.conf');
        writeFileSync(confPath, conf);
        // force the gag into THIS driveC copy (day-locked keyframe vs ambient)
        if (gag.day !== undefined) {
            await run('python3', [path.join(REND, 'force-scene-patches.py'), driveC, '--day', String(gag.day)]);
        } else {
            await run('python3', [path.join(REND, 'force-gag.py'), driveC, '--ads', '0x' + gag.adsId.toString(16), '--tag', String(gag.tag)]);
        }
        // run dosbox-x headless, isolated; kill only THIS child on timeout
        const code = await run(DBX, ['-conf', confPath, '-set', 'cpu core=normal', '-nogui'], {
            cwd: work,
            timeoutMs: secs * 1000,
            env: { ...process.env, SDL_VIDEODRIVER: 'dummy', SDL_AUDIODRIVER: 'dummy', DBX_THREADS: path.join(work, 'threads.log'), DBX_TRACE: path.join(work, 'trace.log') },
        });
        const ok = existsSync(path.join(work, 'threads.log'));
        return { label, ok, code, threads: path.join(work, 'threads.log') };
    } catch (e) {
        return { label, ok: false, error: String(e) };
    }
};

// simple concurrency pool
const results = [];
let idx = 0;
const worker = async () => {
    while (idx < gags.length) {
        const g = gags[idx++];
        const t0 = Date.now();
        const r = await captureOne(g);
        r.secs = Math.round((Date.now() - t0) / 1000);
        results.push(r);
        console.error(`[${results.length}/${gags.length}] ${r.label} ${r.ok ? 'ok' : 'FAIL'} (${r.secs}s)`);
    }
};
mkdirSync(outRoot, { recursive: true });
await Promise.all(Array.from({ length: Math.min(conc, gags.length) }, worker));
console.log(JSON.stringify(results, null, 2));

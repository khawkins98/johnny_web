#!/usr/bin/env node
/**
 * capture-original-gag.mjs -- DETERMINISTIC single-gag capture from the ORIGINAL
 * "Johnny Castaway" binary, for the differential-faithfulness oracle.
 *
 * MECHANISM (option A -- director injection). A patched dosbox-x hooks the scene
 * director (FUN_1018_06bf) and, when DBX_FORCE_ADS / DBX_FORCE_TAG are set, PINS
 * the director's scene queue (DAT_1068_30f4[]) to the single catalogue record
 * matching (adsId, tag): queue = { thatRecord, 0 }, index = 0, startSpot -> 0.
 * The binary then LOADS + RUNS + LOOPS exactly that one gag, forever, bypassing
 * the story / spot-continuity / tide / reachability selection entirely. So the
 * capture is that gag ALONE, on the ONE ADS context/slot the binary allocates
 * for it -- no whole-screensaver mixing, no dynamic slot noise, no force-gag.py
 * data patch and no need for the gag to be naturally reachable.
 *
 * The dosbox-x source change lives in <scratchpad>/dosbox-x-src (NOT committed to
 * johnny_web); see tools/faithfulness-oracle/METHODOLOGY.md and the task-1
 * isolation report for the exact diff + build command:
 *     cd <sp>/dosbox-x-src/src && make -C cpu && make dosbox-x
 *
 * Each run uses an ISOLATED driveC copy + its own dbx.conf, and the dosbox-x
 * child is managed BY PID (killed via its own pid on timeout) -- never a global
 * `pkill dosbox-x` -- so many captures can run concurrently without clobbering
 * each other.
 *
 * Usage:
 *   node capture-original-gag.mjs <adsIdHex> <tag> <outdir> [--secs 120] [--name NAME]
 * e.g.
 *   node capture-original-gag.mjs 0x66 7 /tmp/cap-b7
 *
 * Produces in <outdir>:
 *   driveC/       isolated game copy used for the run (disposable)
 *   dbx.conf      the per-run emulator config
 *   threads.log   per-tick live-thread list (DBX_THREADS) -- the target gag ALONE
 *   trace.log     director/tick/completion trace (DBX_TRACE); carries the #FORCE line
 *   timeline.jsonl  threads.log converted to the shared per-tick timeline format
 *   run.log       emulator stdout/stderr
 *
 * Env overrides:
 *   SP_DOSBOX  dir with driveC/driveD/dbx.conf (default: the session scratchpad/dosbox)
 *   DBX        path to the patched dosbox-x binary (default: SP_DOSBOX/../dosbox-x-src/src/dosbox-x)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, cpSync, writeFileSync, rmSync, existsSync, readFileSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const SP = process.env.SP_DOSBOX;
if (!SP) {
    console.error('SP_DOSBOX is required (directory containing driveC/ and driveD/)');
    process.exit(3);
}
const DBX = process.env.DBX || path.resolve(SP, '../dosbox-x-src/src/dosbox-x');
const THREADS_TO_TIMELINE = path.join(here, 'rendering-oracle', 'threads-to-timeline.mjs');

const ADS_NAMES = {
    0x65: 'ACTIVITY', 0x66: 'BUILDING', 0x68: 'FISHING', 0x69: 'JOHNNY',
    0x6a: 'MARY', 0x6c: 'STAND', 0x6d: 'SUZY', 0x6e: 'VISITOR', 0x6f: 'WALKSTUF',
};

// -- args --
const argv = process.argv.slice(2);
const flag = (f, d) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : d; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const [adsHex, tagRaw, outdir] = positional;
if (!adsHex || tagRaw === undefined || !outdir) {
    console.error('usage: node capture-original-gag.mjs <adsIdHex> <tag> <outdir> [--secs 120] [--name NAME]');
    process.exit(2);
}
const adsId = Number.parseInt(adsHex, 16) & 0xff;
const tag = Number(tagRaw);
const secs = Number(flag('--secs', '120'));
const name = flag('--name', ADS_NAMES[adsId] || `0x${adsId.toString(16)}`);
const out = path.resolve(outdir);

if (!existsSync(DBX)) { console.error(`patched dosbox-x not found: ${DBX} (set DBX or build it)`); process.exit(3); }
if (!existsSync(path.join(SP, 'driveC'))) { console.error(`driveC not found under ${SP} (set SP_DOSBOX)`); process.exit(3); }

// -- prepare isolated workdir --
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const driveC = path.join(out, 'driveC');
cpSync(path.join(SP, 'driveC'), driveC, { recursive: true });
// Reset SCRANTIC to the clean, un-forced baseline (.prepatch), and drop stray
// backups so the copy is pristine. Option A needs NO catalogue data patch -- the
// pin is done at runtime by the emulator -- so the pristine binary is exactly right.
for (const f of ['SCRANTIC.SCR', 'SCRANTIC.EXE']) {
    const pre = path.join(driveC, f + '.prepatch');
    if (existsSync(pre)) cpSync(pre, path.join(driveC, f));
}
for (const stray of ['SCRANTIC.SCR.force7', 'SCRANTIC.EXE.force7', 'SCRANTIC.SCR.forcegag', 'SCRANTIC.EXE.forcegag', 'SCRANTIC.SCR.prepatch', 'SCRANTIC.EXE.prepatch', 'SCRANTIC.INI.bak']) {
    const p = path.join(driveC, stray);
    if (existsSync(p)) rmSync(p, { force: true });
}

const conf = `[sdl]
autolock=false
[dosbox]
machine=svga_s3
[cpu]
cycles=max
[autoexec]
mount c "${driveC}"
mount d "${path.join(SP, 'driveD')}"
d:
call runapp.bat scrantic.exe /s
`;
const confPath = path.join(out, 'dbx.conf');
writeFileSync(confPath, conf);

const threadsLog = path.join(out, 'threads.log');
const traceLog = path.join(out, 'trace.log');
const runLog = path.join(out, 'run.log');

// -- run dosbox-x headless, isolated, killed by ITS OWN pid on timeout --
const runDosbox = () => new Promise((resolve) => {
    const logFd = openSync(runLog, 'w');
    const child = spawn(DBX, ['-conf', confPath, '-set', 'cpu core=normal', '-nogui'], {
        cwd: out,
        stdio: ['ignore', logFd, logFd],
        env: {
            ...process.env,
            SDL_VIDEODRIVER: 'dummy',
            SDL_AUDIODRIVER: 'dummy',
            DBX_FORCE_ADS: '0x' + adsId.toString(16),
            DBX_FORCE_TAG: String(tag),
            DBX_THREADS: threadsLog,
            DBX_TRACE: traceLog,
        },
    });
    let done = false;
    const finish = (code) => {
        if (!done) {
            done = true;
            clearTimeout(timer);
            closeSync(logFd);
            resolve(code);
        }
    };
    const timer = setTimeout(() => { try { process.kill(child.pid, 'SIGKILL'); } catch {} }, secs * 1000);
    child.on('exit', (code) => finish(code));
    child.on('error', () => finish(-1));
});

console.error(`[capture] ${name}:${tag} (ads=0x${adsId.toString(16)}) -> ${out}  (${secs}s)`);
await runDosbox();

// -- post: verify + convert to the shared timeline format --
if (!existsSync(threadsLog)) { console.error('FAIL: no threads.log produced'); process.exit(4); }

const trace = existsSync(traceLog) ? readFileSync(traceLog, 'utf8') : '';
const forceLine = (trace.match(/^#FORCE .*/m) || [null])[0];
const threadsText = readFileSync(threadsLog, 'utf8');
const tickLines = threadsText.split('\n').filter((l) => l.startsWith('THREADS'));

// convert threads.log -> timeline.jsonl (shared per-tick format)
const timelinePath = path.join(out, 'timeline.jsonl');
await new Promise((resolve) => {
    const w = spawn('node', [THREADS_TO_TIMELINE, threadsLog], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    w.stdout.on('data', (d) => chunks.push(d));
    w.on('exit', () => { writeFileSync(timelinePath, Buffer.concat(chunks)); resolve(); });
    w.on('error', () => resolve());
});

// completion-tag histogram from the trace: confirms only the target tag ran
const compTags = {};
for (const m of trace.matchAll(/ completion .*args=([0-9A-Fa-f]+),/g)) {
    const t = Number.parseInt(m[1], 16); compTags[t] = (compTags[t] || 0) + 1;
}
const adsLoads = new Set([...trace.matchAll(/ads-loader id=([0-9A-Fa-f]+)/g)].map((m) => Number.parseInt(m[1], 16) & 0xff));

const summary = {
    gag: `${name}:${tag}`, adsId: `0x${adsId.toString(16)}`, tag,
    forced: !!forceLine, forceLine,
    threadTicks: tickLines.length,
    completionTags: compTags,
    adsIdsLoaded: [...adsLoads].map((x) => '0x' + x.toString(16)),
    isolatedToTarget: adsLoads.size <= 1 && (adsLoads.size === 0 || adsLoads.has(adsId))
        && Object.keys(compTags).every((t) => Number(t) === tag),
    outdir: out, threadsLog, timeline: timelinePath,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.forced) { console.error('WARN: no #FORCE line in trace -- injection may not have armed'); process.exit(5); }

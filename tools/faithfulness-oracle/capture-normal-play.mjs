#!/usr/bin/env node
/**
 * capture-normal-play.mjs -- NORMAL-PLAY capture of the original "Johnny Castaway"
 * binary (no forced gag): the planner, the island bake and the walks all run as
 * shipped, so the capture shows what a player sees. Companion to
 * capture-original-gag.mjs (forced, one gag) for the pixel oracle's host-canvas
 * check and the story-mix check (pixel-oracle/README.md "Normal play").
 *
 * Needs the patched DOSBox-X (dosbox-x-oracle.patch) with the DBX_HOST and
 * DBX_FB_NORMAL hooks:
 *   DBX_HOST       one `HOST <tick> clk=<2e72> ph=<30ba> b4=<30b4> b2=<30b2> c0=<30c0>
 *                  c2=<30c2> c4=<30c4> c6=<30c6> off=<46e4>,<46e6> qi=<30f2> q=<adsId:tag,...>`
 *                  line whenever one of the host/planner globals changes (see
 *                  docs/scrantic-re-findings.md B.6): the planned queue, the queue
 *                  index (which gag is running), the tide coin, the island world
 *                  origin, the phase and the night/still-waves flags.
 *   DBX_FB_NORMAL  arms the tick-stamped framebuffer dumps (DBX_FB_TICKS) from the
 *                  first tick, without a forced ADS, and also bursts after every
 *                  HOST change (the ticks right after a bake show the bare island).
 *
 * Usage:
 *   node capture-normal-play.mjs <outdir> [--secs 600] [--start-time HHMM]
 *        [--time HH:MM] [--date MM-DD-YYYY] [--story-day N] [--fb-every 8] [--fb-after 2] [--no-fb]
 *        [--turbo]
 *
 *   --turbo       DOSBox-X turbo mode, for STORY-MIX runs only (use with --no-fb). The
 *                 16 ms game clock then advances about 8x per ~55 ms present, so every
 *                 frame hold passes at the next present and gags run far faster than
 *                 the original's pacing; the planner's choices (which do not depend on
 *                 pacing) come about 7x faster per wall second. Never use its frames or
 *                 tick timing as evidence.
 *   --story-day   writes the persisted story day (INI Introduction/NumDays = N, with
 *                 CurrentYear/Month/Day = the run's date so no calendar advance fires).
 *
 *   Without --turbo, game time runs at wall speed and the pacing is the original's.
 *   --start-time  writes SCRANTIC.INI [ScreenSaver.ScreenAntics] StartTime=HHMM into the run's
 *                 own copy of the Windows directory. Night is phase >= 12, i.e. 6-8 h
 *                 after StartTime (B.6.1), so StartTime = now - 6.5 h gives a night run.
 *   --time/--date set the DOS clock before Windows starts (the original reads the
 *                 time of day and the date from it): another way to reach night, and
 *                 the only way to reach a holiday (Oct 29-31, Dec 23-25, Dec 29-31,
 *                 Jan 1, Mar 15-17; FUN_1018_0540).
 *
 * Produces in <outdir>:
 *   driveC/ driveD/  isolated copies (disposable; driveD carries the INI)
 *   dbx.conf         per-run emulator config
 *   threads.log      per-tick live-thread list (DBX_THREADS)
 *   trace.log        director/tick/completion/ads-loader trace (DBX_TRACE)
 *   host.log         DBX_HOST lines
 *   timeline.jsonl   threads.log in the shared per-tick format
 *   fb/t<tick>.ppm.gz tick-stamped framebuffer dumps (every --fb-every ticks, plus
 *                    bursts after live-set and host changes)
 *   summary.json     ticks, dumps, batches seen, settings
 *
 * Env overrides: SP_DOSBOX (dir with driveC/ and driveD/), DBX (patched binary).
 */
import { spawn } from 'node:child_process';
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const SP = process.env.SP_DOSBOX;
if (!SP) {
    console.error('SP_DOSBOX is required (directory containing driveC/ and driveD/)');
    process.exit(3);
}
const DBX = process.env.DBX || path.resolve(SP, '../dosbox-x-src/src/dosbox-x');
const THREADS_TO_TIMELINE = path.join(here, 'rendering-oracle', 'threads-to-timeline.mjs');

const argv = process.argv.slice(2);
const flag = (f, d) => {
    const i = argv.indexOf(f);
    return i !== -1 ? argv[i + 1] : d;
};
const BOOL_FLAGS = new Set(['--no-fb', '--turbo']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !BOOL_FLAGS.has(argv[i - 1])));
const [outdir] = positional;
if (!outdir) {
    console.error('usage: capture-normal-play.mjs <outdir> [--secs 600] [--start-time HHMM] [--time HH:MM] [--date MM-DD-YYYY] [--story-day N] [--fb-every 8] [--fb-after 2] [--no-fb] [--turbo]');
    process.exit(2);
}
const secs = Number(flag('--secs', '600'));
const startTime = flag('--start-time', null);
const storyDay = flag('--story-day', null);
const dosTime = flag('--time', null);
const dosDate = flag('--date', null);
const fbEvery = Number(flag('--fb-every', '8'));
const fbAfter = Number(flag('--fb-after', '2'));
const withFb = !argv.includes('--no-fb');
const turbo = argv.includes('--turbo');
const out = path.resolve(outdir);

if (!existsSync(DBX)) {
    console.error(`patched dosbox-x not found: ${DBX} (set DBX or build it)`);
    process.exit(3);
}
if (!existsSync(path.join(SP, 'driveC')) || !existsSync(path.join(SP, 'driveD'))) {
    console.error(`driveC/driveD not found under ${SP} (set SP_DOSBOX)`);
    process.exit(3);
}

// -- isolated workdir: pristine game copy, own Windows directory (for the INI) --
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const driveC = path.join(out, 'driveC');
const driveD = path.join(out, 'driveD');
cpSync(path.join(SP, 'driveC'), driveC, { recursive: true });
cpSync(path.join(SP, 'driveD'), driveD, { recursive: true });
for (const f of ['SCRANTIC.SCR', 'SCRANTIC.EXE']) {
    const pre = path.join(driveC, f + '.prepatch');
    if (existsSync(pre)) cpSync(pre, path.join(driveC, f));
}
for (const f of readdirSync(driveC)) {
    if (/\.(prepatch|force\w*|bak)$/i.test(f)) rmSync(path.join(driveC, f), { force: true });
}
// runapp.bat copies d:\iniback\*.* over d:\windows\ at start, so the INI goes to both.
if (startTime != null || storyDay != null) {
    const today = new Date();
    const [mm, dd, yyyy] = dosDate ? dosDate.split('-').map(Number) : [today.getMonth() + 1, today.getDate(), today.getFullYear()];
    const keys = [];
    if (startTime != null) keys.push(`StartTime=${Number(startTime)}`);
    if (storyDay != null) {
        keys.push(`Introduction=${Number(storyDay)}`, `NumDays=${Number(storyDay)}`);
        keys.push(`CurrentYear=${yyyy}`, `CurrentMonth=${mm}`, `CurrentDay=${dd}`);
    }
    // FUN_1008_0c5c reads the settings with GetPrivateProfileInt from SCRANTIC.INI
    // (DS 0xa9) under the section at DS 0x90, "ScreenSaver.ScreenAntics" (the
    // "Screen Antics" string at DS 0x82 is the window title). Defaults (DS 0xb6..):
    // Background 1, Clouds 1, Waves 1, Sounds 1, StartTime 900. The story day is
    // persisted as Introduction (2d9b, the day selection uses) and NumDays (2d9c)
    // with CurrentYear/Month/Day (the last date seen; a change advances the day).
    const ini = `[ScreenSaver.ScreenAntics]\r\n${keys.join('\r\n')}\r\n`;
    for (const dir of ['WINDOWS', 'iniback']) {
        const d = path.join(driveD, dir);
        if (existsSync(d)) writeFileSync(path.join(d, 'SCRANTIC.INI'), ini);
    }
}

// DOSBox-X's TIME wants hh:mm:ss; DATE wants the country format (US: mm-dd-yyyy).
const hms = dosTime ? (dosTime.split(':').length === 2 ? `${dosTime}:00` : dosTime) : null;
const clock = [dosDate ? `date ${dosDate}` : null, hms ? `time ${hms}` : null].filter(Boolean).join('\n');
const conf = `[sdl]
autolock=false
[dosbox]
machine=svga_s3
[cpu]
cycles=max
${turbo ? 'turbo=true\n' : ''}[autoexec]
mount c "${driveC}"
mount d "${driveD}"
${clock}
d:
call runapp.bat scrantic.exe /s
`;
const confPath = path.join(out, 'dbx.conf');
writeFileSync(confPath, conf);

const threadsLog = path.join(out, 'threads.log');
const traceLog = path.join(out, 'trace.log');
const hostLog = path.join(out, 'host.log');
const runLog = path.join(out, 'run.log');
const fbDir = path.join(out, 'fb');
if (withFb) mkdirSync(fbDir, { recursive: true });
const fbEnv = withFb
    ? { DBX_FB_DIR: fbDir, DBX_FB_TICKS: '1', DBX_FB_NORMAL: '1', DBX_FB_TICK_EVERY: String(fbEvery), DBX_FB_TICK_AFTER: String(fbAfter) }
    : {};

// Compress finished PPM dumps while the run goes (a raw dump is 0.9 MB).
let fbFrames = 0;
const compressDumps = (final) => {
    if (!withFb || !existsSync(fbDir)) return;
    const raw = readdirSync(fbDir)
        .map((f) => ({ f, m: f.match(/^fb_(\d+)_(.+)\.ppm$/) }))
        .filter((x) => x.m)
        .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
    const ready = final ? raw : raw.slice(0, -1);
    for (const { f, m } of ready) {
        const src = path.join(fbDir, f);
        if (/^t\d+$/.test(m[2])) {
            writeFileSync(path.join(fbDir, `${m[2]}.ppm.gz`), gzipSync(readFileSync(src), { level: 6 }));
            fbFrames++;
        }
        rmSync(src, { force: true });
    }
};

const runDosbox = () =>
    new Promise((resolve) => {
        const logFd = openSync(runLog, 'w');
        const child = spawn(DBX, ['-conf', confPath, '-set', 'cpu core=normal', '-nogui'], {
            cwd: out,
            stdio: ['ignore', logFd, logFd],
            env: {
                ...process.env,
                SDL_VIDEODRIVER: 'dummy',
                SDL_AUDIODRIVER: 'dummy',
                DBX_THREADS: threadsLog,
                DBX_TRACE: traceLog,
                DBX_HOST: hostLog,
                ...fbEnv,
            },
        });
        const poll = setInterval(() => compressDumps(false), 1000);
        let done = false;
        const finish = (code) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            clearInterval(poll);
            closeSync(logFd);
            resolve(code);
        };
        const timer = setTimeout(() => {
            try {
                process.kill(child.pid, 'SIGKILL');
            } catch {
                /* already gone */
            }
        }, secs * 1000);
        child.on('exit', (code) => finish(code));
        child.on('error', () => finish(-1));
    });

console.error(`[normal-play] -> ${out} (${secs}s wall${startTime != null ? `, StartTime ${startTime}` : ''}${dosTime ? `, DOS time ${dosTime}` : ''}${dosDate ? `, DOS date ${dosDate}` : ''})`);
await runDosbox();
compressDumps(true);

if (!existsSync(threadsLog)) {
    console.error('FAIL: no threads.log produced');
    process.exit(4);
}
const timelinePath = path.join(out, 'timeline.jsonl');
await new Promise((resolve) => {
    const w = spawn('node', [THREADS_TO_TIMELINE, threadsLog], { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    w.stdout.on('data', (d) => chunks.push(d));
    w.on('exit', () => {
        writeFileSync(timelinePath, Buffer.concat(chunks));
        resolve();
    });
    w.on('error', () => resolve());
});

const threadTicks = (readFileSync(threadsLog, 'utf8').match(/^THREADS /gm) || []).length;
const host = existsSync(hostLog) ? readFileSync(hostLog, 'utf8') : '';
const hostLines = host.split('\n').filter((l) => l.startsWith('HOST '));
const batches = hostLines.filter((l) => / qi=0 /.test(l)).map((l) => l.match(/ q=(\S*)/)?.[1]).filter((q, i, a) => q && a.indexOf(q) === i);
const summary = {
    outdir: out,
    secs,
    turbo,
    startTime: startTime != null ? Number(startTime) : null,
    storyDay: storyDay != null ? Number(storyDay) : null,
    dosTime,
    dosDate,
    threadTicks,
    hostLines: hostLines.length,
    batchesSeen: batches.length,
    ...(withFb ? { fbFrames, fbEvery, fbAfter } : {}),
};
writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

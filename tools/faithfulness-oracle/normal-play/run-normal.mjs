// Capture the original in normal (unforced) play, with periodic framebuffer dumps.
//
// Unlike capture-original-gag.mjs, nothing is forced: the screensaver picks its own
// gags, island layout, tide and night, so this records what a viewer would see. Used
// for the island-offset (#53) and night/tide checks, where a forced gag would hide
// the host's own choices.
//
// usage: node run-normal.mjs <outDir> [secs=90] [fbEvery=70] [fbStart=0]
//
// Environment (same as capture-original-gag.mjs):
//   SP_DOSBOX  dir with driveC/ and driveD/ (required)
//   DBX        patched dosbox-x binary (default: SP_DOSBOX/../dosbox-x-src/src/dosbox-x)
//
// Writes <outDir>/fb/fb_NNNNNN_frame.ppm (every fbEvery-th present, at most 400),
// threads.log, trace.log, run.log, a copy of drive C and the generated dbx.conf. All
// of it is a capture of the original (drive C holds game data): keep it under
// scratchpad/ and never commit it.
import { spawn } from 'node:child_process';
import { mkdirSync, cpSync, writeFileSync, rmSync, existsSync, openSync } from 'node:fs';
import path from 'node:path';

const SP = process.env.SP_DOSBOX;
if (!SP || !existsSync(path.join(SP, 'driveC'))) {
    console.error('SP_DOSBOX must point at a directory containing driveC/ and driveD/');
    process.exit(2);
}
const DBX = process.env.DBX || path.resolve(SP, '../dosbox-x-src/src/dosbox-x');
if (!existsSync(DBX)) {
    console.error(`patched dosbox-x not found at ${DBX} (set DBX)`);
    process.exit(2);
}
if (!process.argv[2]) {
    console.error('usage: node run-normal.mjs <outDir> [secs=90] [fbEvery=70] [fbStart=0]');
    process.exit(2);
}
const out = path.resolve(process.argv[2]);
const secs = Number(process.argv[3] || 90);
const every = process.argv[4] || '70';
const start = process.argv[5] || '0';

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'fb'), { recursive: true });
// Each run gets its own drive C so the screensaver's INI writes don't leak between runs.
const driveC = path.join(out, 'driveC');
cpSync(path.join(SP, 'driveC'), driveC, { recursive: true });
const conf = `[sdl]\nautolock=false\n[dosbox]\nmachine=svga_s3\n[cpu]\ncycles=max\n[autoexec]\nmount c "${driveC}"\nmount d "${path.join(SP, 'driveD')}"\nd:\ncall runapp.bat scrantic.exe /s\n`;
writeFileSync(path.join(out, 'dbx.conf'), conf);
const fd = openSync(path.join(out, 'run.log'), 'w');
const child = spawn(DBX, ['-conf', path.join(out, 'dbx.conf'), '-set', 'cpu core=normal', '-nogui'], {
    cwd: out,
    stdio: ['ignore', fd, fd],
    env: {
        ...process.env,
        SDL_VIDEODRIVER: 'dummy',
        SDL_AUDIODRIVER: 'dummy',
        DBX_THREADS: path.join(out, 'threads.log'),
        DBX_TRACE: path.join(out, 'trace.log'),
        DBX_FB_DIR: path.join(out, 'fb'),
        DBX_FB_EVERY: every,
        DBX_FB_MAX: '400',
        DBX_FB_START: start,
    },
});
setTimeout(() => {
    try {
        process.kill(child.pid, 'SIGKILL');
    } catch {}
}, secs * 1000);
child.on('exit', () => console.log('done'));

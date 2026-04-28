#!/usr/bin/env node
/**
 * npm run extract -- "<path-to-zip>"
 *
 * Extracts the three game data files needed by johnny_web from the original
 * Johnny Castaway floppy disk ZIP image available on Archive.org:
 *
 *   https://archive.org/details/screen-antics-johnny-castaway-16-color-v1.01-int.-1.4.93-win3.1-1.44m
 *
 * Prerequisites (must be on PATH):
 *   - unzip   macOS: built-in  |  Linux: apt install unzip
 *   - mcopy   macOS: brew install mtools  |  Linux: apt install mtools
 *
 * Output written to: public/data/RESOURCE.MAP, RESOURCE.001, SCRANTIC.SCR
 */

import { execFileSync }                             from 'child_process';
import { mkdirSync, rmSync, existsSync,
         readFileSync, writeFileSync, copyFileSync } from 'fs';
import { Readable, Transform }                      from 'stream';
import path                                         from 'path';
import os                                           from 'os';
import { explode }                                  from 'node-pkware';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const root   = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'public', 'data');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireTool(cmd) {
    try {
        execFileSync('which', [cmd], { stdio: 'ignore' });
    } catch {
        const hints = {
            unzip:  'macOS: built-in  |  Linux: apt install unzip',
            mcopy:  'macOS: brew install mtools  |  Linux: apt install mtools',
        };
        console.error(`✗  Missing prerequisite: ${cmd}`);
        if (hints[cmd]) console.error('   ' + hints[cmd]);
        process.exit(1);
    }
}

function run(cmd, args, opts = {}) {
    return execFileSync(cmd, args, { stdio: 'pipe', ...opts });
}

/**
 * Decompress a TSComp-wrapped PKWARE-implode file.
 *
 * TSComp header (magic 65 5D 13 8C):
 *   0–3   magic
 *   4–7   version/flags
 *   8–11  file count (LE uint32)
 *   12–27 per-archive metadata (unused here)
 *   28    original filename length
 *   29…   filename (ASCII) + null terminator
 *   42    start of PKWARE implode compressed stream
 */
function decompressTSComp(buf) {
    const nameLen   = buf[28];
    const origName  = buf.slice(29, 29 + nameLen).toString('ascii');
    const dataStart = 29 + nameLen + 1;

    return new Promise((resolve, reject) => {
        const chunks = [];
        const xform  = new Transform();
        xform._transform = explode();
        xform._flush     = (cb) => cb();
        Readable.from(buf.slice(dataStart)).pipe(xform);
        xform.on('data',  (c) => chunks.push(c));
        xform.on('end',   ()  => resolve({ buf: Buffer.concat(chunks), origName }));
        xform.on('error', reject);
    });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const zipPath = process.argv[2];

if (!zipPath) {
    console.error('Usage: npm run extract -- "<path-to-zip>"');
    console.error('');
    console.error('Download the ZIP from Archive.org:');
    console.error('  https://archive.org/details/screen-antics-johnny-castaway-16-color-v1.01-int.-1.4.93-win3.1-1.44m');
    process.exit(1);
}

if (!existsSync(zipPath)) {
    console.error(`✗  File not found: ${zipPath}`);
    process.exit(1);
}

requireTool('unzip');
requireTool('mcopy');

const tmp = path.join(os.tmpdir(), `jc_extract_${Date.now()}`);
mkdirSync(tmp, { recursive: true });

try {
    // 1. Unzip to get the .ima floppy image
    console.log('→ Extracting floppy image from ZIP…');
    run('unzip', ['-j', zipPath, '-d', tmp]);

    const imaFiles = run('find', [tmp, '-name', '*.ima', '-o', '-name', '*.img'])
        .toString().trim().split('\n').filter(Boolean);

    if (!imaFiles.length) {
        console.error('✗  No .ima/.img floppy image found inside ZIP.');
        process.exit(1);
    }
    const ima = imaFiles[0];
    console.log(`   Floppy image: ${path.basename(ima)}`);

    // mtools needs a config file to know which image to treat as drive I:
    const mtoolsrc = path.join(tmp, 'mtoolsrc');
    writeFileSync(mtoolsrc, `drive i: file="${ima}"\n`);
    const env = { ...process.env, MTOOLSRC: mtoolsrc };

    // 2. List floppy contents
    console.log('→ Floppy directory:');
    const dir = run('mdir', ['i:'], { env }).toString();
    console.log(dir.split('\n').map(l => '   ' + l).join('\n'));

    // 3. Copy raw files off the floppy
    const tmpMap = path.join(tmp, 'RESOURCE.MAP');
    const tmpScr = path.join(tmp, 'SCRANTIC.SC$');
    const tmpRes = path.join(tmp, 'RESOURCE.00$');

    console.log('→ Copying files from floppy…');
    run('mcopy', ['i:RESOURCE.MAP',   tmpMap], { env });
    run('mcopy', ['i:SCRANTIC.SC$',   tmpScr], { env });
    run('mcopy', ['i:RESOURCE.00$',   tmpRes], { env });

    mkdirSync(outDir, { recursive: true });

    // 4. Decompress TSComp archives → final game files
    console.log('→ Decompressing SCRANTIC.SCR…');
    const { buf: scrBuf } = await decompressTSComp(readFileSync(tmpScr));
    writeFileSync(path.join(outDir, 'SCRANTIC.SCR'), scrBuf);
    console.log(`   ${(scrBuf.length / 1024).toFixed(0)} KB`);

    console.log('→ Decompressing RESOURCE.001…');
    const { buf: resBuf } = await decompressTSComp(readFileSync(tmpRes));
    writeFileSync(path.join(outDir, 'RESOURCE.001'), resBuf);
    console.log(`   ${(resBuf.length / 1024).toFixed(0)} KB`);

    console.log('→ Copying RESOURCE.MAP…');
    copyFileSync(tmpMap, path.join(outDir, 'RESOURCE.MAP'));
    const mapSize = readFileSync(tmpMap).length;
    console.log(`   ${(mapSize / 1024).toFixed(1)} KB`);

    console.log('');
    console.log('✓  Done! Files written to public/data/');
    console.log('   Run: npm run dev');

} finally {
    rmSync(tmp, { recursive: true, force: true });
}

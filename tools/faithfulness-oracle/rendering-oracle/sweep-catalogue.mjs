#!/usr/bin/env node
// Sweep-catalogue orchestration scaffold for the differential faithfulness
// sweep: enumerate every forceable ADS gag from the scene catalogue baked
// into SCRANTIC.SCR/.EXE, and for each one wire up the two commands that
// will produce an ORIGINAL thread timeline and an OURS thread timeline into
// a per-gag output directory. This tool does NOT diff anything -- the diff
// is a separate tool owned by the sweep coordinator. This tool only:
//   1. enumerates the distinct (adsId, tag) gags from the catalogue
//   2. for each, builds the two capture commands + an output dir
//   3. (optionally) actually runs them, tolerating missing sibling tools
//   4. writes a manifest.json per gag recording what would/did run
//
// Catalogue layout (see force-gag.py for the byte-level reverse engineering
// this was cross-checked against):
//   base 0x19556, 79 records, stride 0x11 (17) bytes, terminator = word@0==0.
//   Per record: adsId @+0x0f, adsTag @+0x10. Records with adsId==0xFF are
//   pure-pose records (no ADS gag attached) and are skipped.
//
// Usage:
//   node sweep-catalogue.mjs --list
//   node sweep-catalogue.mjs --gags BUILDING:7 --dry-run
//   node sweep-catalogue.mjs --gags BUILDING:7,SUZY:2 --out <dir>
//   node sweep-catalogue.mjs --limit 3 --out <dir>
//   node sweep-catalogue.mjs --out <dir>              # full sweep, all gags
//
// Env:
//   SP_DOSBOX   dir containing driveC/driveD (used to locate SCRANTIC.SCR
//               unless --scr is given, and passed through to capture-gag.sh)
//   DBX         patched dosbox-x binary (passed through to capture-gag.sh;
//               only needed for non-dry-run ORIGINAL captures)
//
// Exit: 0 on success (including a fully-dry-run or all-gags-skipped run).

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

const CATALOGUE_OFF = 0x19556;
const STRIDE = 0x11;
const NUM_RECORDS = 79;
const OFF_ADSID = 0x0f;
const OFF_ADSTAG = 0x10;

// Exactly the table from force-gag.py / the task brief -- do not add ids
// (e.g. 0x67 MISCGAG, 0x6b) that aren't in the sanctioned forceable set.
const ADS_NAMES = {
    0x65: 'ACTIVITY',
    0x66: 'BUILDING',
    0x68: 'FISHING',
    0x69: 'JOHNNY',
    0x6a: 'MARY',
    0x6c: 'STAND',
    0x6d: 'SUZY',
    0x6e: 'VISITOR',
    0x6f: 'WALKSTUF',
};

function resolveScrPath(argScr) {
    if (argScr) return argScr;
    const spDosbox = process.env.SP_DOSBOX;
    if (spDosbox) {
        const p = path.join(spDosbox, 'driveC', 'SCRANTIC.SCR');
        if (existsSync(p)) return p;
    }
    // Fallback: session scratchpad convention used throughout this effort.
    const guess = path.join(repoRoot, '..', 'scratchpad', 'dosbox', 'driveC', 'SCRANTIC.SCR');
    if (existsSync(guess)) return guess;
    return null;
}

/**
 * Parse the scene catalogue and return the DISTINCT (adsId, tag) gags,
 * skipping pure-pose records (adsId === 0xff) and any adsId not in the
 * sanctioned ADS_NAMES table.
 */
function enumerateGags(scrPath) {
    const data = readFileSync(scrPath);
    const seen = new Set();
    const gags = [];
    let recordsRead = 0;
    for (let idx = 0; idx < NUM_RECORDS; idx++) {
        const off = CATALOGUE_OFF + idx * STRIDE;
        if (off + STRIDE > data.length) break;
        const word0 = data.readUInt16LE(off);
        if (word0 === 0) break; // terminator
        recordsRead++;
        const adsId = data[off + OFF_ADSID];
        const tag = data[off + OFF_ADSTAG];
        if (adsId === 0xff) continue; // pure-pose record, no ADS gag
        const name = ADS_NAMES[adsId];
        if (!name) continue; // not a sanctioned forceable ADS id
        const key = `${adsId}:${tag}`;
        if (seen.has(key)) continue;
        seen.add(key);
        gags.push({ adsId, tag, name, recordIdx: idx });
    }
    gags.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.tag - b.tag));
    return { gags, recordsRead };
}

function gagLabel(g) {
    return `${g.name}:${g.tag}`;
}

function adsFileName(name) {
    return `${name}.ADS`;
}

function buildCommands(gag, outDir) {
    const adsHex = `0x${gag.adsId.toString(16).padStart(2, '0')}`;
    const origDir = path.join(outDir, 'orig');
    const oursOut = path.join(outDir, 'ours.jsonl');
    const captureGagSh = path.join(here, 'capture-gag.sh');
    const ourTimelineJs = path.join(repoRoot, 'tools', 'faithfulness-oracle', 'our-thread-timeline.mjs');
    return {
        original: {
            cmd: 'bash',
            args: [captureGagSh, adsHex, String(gag.tag), origDir],
            display: `bash ${path.relative(repoRoot, captureGagSh)} ${adsHex} ${gag.tag} ${origDir}`,
            tool: captureGagSh,
        },
        ours: {
            cmd: 'node',
            args: [ourTimelineJs, adsFileName(gag.name), String(gag.tag), '--out', oursOut],
            display: `node ${path.relative(repoRoot, ourTimelineJs)} ${adsFileName(gag.name)} ${gag.tag} --out ${oursOut}`,
            tool: ourTimelineJs,
        },
    };
}

function parseArgs(argv) {
    const opts = {
        list: false,
        dryRun: false,
        limit: null,
        gags: null, // array of "NAME:tag" strings
        out: null,
        scr: null,
        run: false, // actually execute (non-dry-run); default is dry-run unless --run given
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--list') opts.list = true;
        else if (a === '--dry-run') opts.dryRun = true;
        else if (a === '--run') opts.run = true;
        else if (a === '--limit') opts.limit = Number(argv[++i]);
        else if (a === '--gags') opts.gags = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
        else if (a === '--out') opts.out = argv[++i];
        else if (a === '--scr') opts.scr = argv[++i];
        else if (a === '--help' || a === '-h') opts.help = true;
        else {
            process.stderr.write(`unknown arg: ${a}\n`);
            process.exit(2);
        }
    }
    return opts;
}

function usage() {
    console.log(`Usage:
  node sweep-catalogue.mjs --list
  node sweep-catalogue.mjs --gags BUILDING:7 --dry-run
  node sweep-catalogue.mjs --gags BUILDING:7,SUZY:2 --out <dir> [--run]
  node sweep-catalogue.mjs --limit 3 --out <dir> [--run]
  node sweep-catalogue.mjs --out <dir> --run     # full sweep, executes both commands per gag

By default (no --run), this is a dry run: commands are printed/recorded into
manifest.json but not executed. Pass --run to actually spawn the capture
commands. The ORIGINAL capture (capture-gag.sh) requires DBX + SP_DOSBOX to
be set and drives a real dosbox-x run; the OURS command
(tools/faithfulness-oracle/our-thread-timeline.mjs) is being built by a
sibling effort and may not exist yet -- its absence is tolerated and recorded
as 'tool-missing' in the manifest, not a hard failure.`);
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
        usage();
        return;
    }

    const scrPath = resolveScrPath(opts.scr);
    if (!scrPath) {
        console.error('Could not locate SCRANTIC.SCR. Pass --scr <path> or set SP_DOSBOX.');
        process.exit(1);
    }

    const { gags, recordsRead } = enumerateGags(scrPath);

    if (opts.list) {
        console.log(`# ${gags.length} distinct forceable gags (from ${recordsRead} catalogue records read, ${scrPath})`);
        for (const g of gags) {
            console.log(`${g.name} #${g.tag}  (adsId=0x${g.adsId.toString(16).padStart(2, '0')} recordIdx=${g.recordIdx})`);
        }
        return;
    }

    let selected = gags;
    if (opts.gags) {
        const want = new Set(opts.gags.map((s) => s.toUpperCase()));
        selected = gags.filter((g) => want.has(gagLabel(g).toUpperCase()));
        const foundLabels = new Set(selected.map((g) => gagLabel(g).toUpperCase()));
        for (const w of want) {
            if (!foundLabels.has(w)) console.error(`warning: requested gag not found in catalogue: ${w}`);
        }
    }
    if (opts.limit != null && Number.isFinite(opts.limit)) {
        selected = selected.slice(0, opts.limit);
    }

    if (selected.length === 0) {
        console.error('No gags selected (check --gags / --limit filters). Nothing to do.');
        process.exit(1);
    }

    const outRoot = opts.out ?? path.join(repoRoot, 'sweep-catalogue-out');
    mkdirSync(outRoot, { recursive: true });

    const execute = opts.run && !opts.dryRun;

    console.log(`Enumerated ${gags.length} distinct gags total; sweeping ${selected.length} (execute=${execute}) -> ${outRoot}`);

    const summary = [];
    for (const gag of selected) {
        const gagOutDir = path.join(outRoot, `${gag.name}_${gag.tag}`);
        mkdirSync(gagOutDir, { recursive: true });
        const commands = buildCommands(gag, gagOutDir);

        const manifest = {
            adsId: gag.adsId,
            adsIdHex: `0x${gag.adsId.toString(16).padStart(2, '0')}`,
            tag: gag.tag,
            name: gag.name,
            recordIdx: gag.recordIdx,
            outDir: gagOutDir,
            commands: {
                original: commands.original.display,
                ours: commands.ours.display,
            },
            status: {},
        };

        console.log(`\n== ${gagLabel(gag)} ==`);
        console.log(`  ORIGINAL: ${commands.original.display}`);
        console.log(`  OURS:     ${commands.ours.display}`);

        if (!execute) {
            manifest.status.original = 'dry-run';
            manifest.status.ours = 'dry-run';
            manifest.status.note =
                'Dry run: commands printed, not executed. Pass --run to execute.';
        } else {
            // --- ORIGINAL capture ---
            if (!existsSync(commands.original.tool)) {
                manifest.status.original = 'tool-missing';
            } else {
                // TODO: threads-to-timeline once DBX_THREADS lands -- once the
                // per-tick thread-list trace + its extractor exist, this is
                // where we'd invoke `threads-to-timeline.mjs <origDir>/trace.log
                // --out <origDir>/timeline.jsonl` after capture-gag.sh runs, to
                // turn the raw trace into the same thread-timeline shape the
                // OURS extractor produces, ready for the coordinator's diff
                // tool. For now capture-gag.sh's trace.log is the raw artifact.
                const r = spawnSync(commands.original.cmd, commands.original.args, {
                    stdio: 'inherit',
                });
                manifest.status.original = r.status === 0 ? 'ok' : `exit-${r.status ?? r.signal ?? 'unknown'}`;
            }

            // --- OURS timeline ---
            if (!existsSync(commands.ours.tool)) {
                manifest.status.ours = 'tool-missing';
            } else {
                const r = spawnSync(commands.ours.cmd, commands.ours.args, {
                    stdio: 'inherit',
                });
                manifest.status.ours = r.status === 0 ? 'ok' : `exit-${r.status ?? r.signal ?? 'unknown'}`;
            }
        }

        writeFileSync(path.join(gagOutDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        summary.push(manifest);
    }

    const summaryPath = path.join(outRoot, 'sweep-summary.json');
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${summary.length} manifest(s) + summary -> ${summaryPath}`);
}

main();

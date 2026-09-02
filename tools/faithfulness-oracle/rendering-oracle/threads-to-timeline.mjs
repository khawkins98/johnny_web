#!/usr/bin/env node
// threads-to-timeline.mjs -- convert the patched-dosbox-x DBX_THREADS log into
// the shared per-tick timeline JSONL contract used by the faithfulness oracle.
//
// The emulator (src/cpu/core_normal.cpp, DBX_THREADS gate) emits, once per call
// of the ADS tick controller FUN_1048_1acb, one line:
//
//   THREADS <tick#> <slot>:<tag>:<runstate> <slot>:<tag>:<runstate> ...
//
// listing every live thread node in list order (slot@node+0, tag@node+2,
// runstate@node+0x2f). runstate: 1=run-once 2=count 3=timed 4=finished 5=?.
//
// Output: one JSON line per tick, 0-based index, matching the format the
// our-engine side emits so the two timelines can be diffed directly:
//
//   {"t":<0-based idx>,"live":["<slot>:<tag>",...]}
//
// "live"/DRAWING = the sorted "slot:tag" for every node whose runstate is
// ACTIVELY ANIMATING: rs in {1,2,3} (run-once/count/timed). The node pool is
// pre-allocated, so the vast majority of nodes sit at rs=0 (never-run/idle) and
// a handful at rs=4 (finished) -- both are NOT drawing and must be excluded (a
// raw rs!=4 filter wrongly counts the whole idle pool, ~110 nodes/tick). Pass a
// slot to isolate one gag's TTM resource (e.g. slot 3 = BUILDING.TTM); the raw
// trace is the WHOLE running screensaver across all slots.
//
// Usage:
//   node threads-to-timeline.mjs <threads.log> [--slot N]
//
//   gagTag  optional: if given, only ticks in which some live node has that tag
//           are emitted (0-based index still reflects position among ALL ticks
//           so it stays aligned with the raw log). Handy to trim boot/idle
//           ticks and focus on one forced gag.

import { readFileSync } from 'node:fs';

// tolerate a downstream reader (e.g. `head`) closing the pipe early
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });

const argv = process.argv.slice(2);
const logPath = argv.find((a) => !a.startsWith('--'));
const slotIdx = argv.indexOf('--slot');
const slotFilter = slotIdx !== -1 ? Number(argv[slotIdx + 1]) : null;
if (!logPath) {
  console.error('usage: threads-to-timeline.mjs <threads.log> [--slot N]');
  process.exit(2);
}
const gagTag = null;
const DRAWING = new Set([1, 2, 3]); // actively animating (run-once/count/timed); NOT 0=idle, NOT 4=finished

const lines = readFileSync(logPath, 'utf8').split('\n');

let idx = 0; // 0-based tick index over ALL THREADS lines (stable alignment)
for (const raw of lines) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const parts = line.split(/\s+/);
  if (parts[0] !== 'THREADS') continue;

  // parts[1] is the emulator's tick counter; we reindex 0-based ourselves.
  const nodes = parts.slice(2);
  const live = [];
  let hasGag = false;
  for (const n of nodes) {
    const [slotS, tagS, rsS] = n.split(':');
    const slot = Number(slotS), tag = Number(tagS), rs = Number(rsS);
    if (!DRAWING.has(rs)) continue; // only actively-animating nodes draw (exclude idle rs=0 + finished rs=4)
    if (slotFilter !== null && slot !== slotFilter) continue;
    live.push(`${slot}:${tag}`);
    if (gagTag !== null && tag === gagTag) hasGag = true;
  }
  live.sort((a, b) => {
    const [as, at] = a.split(':').map(Number);
    const [bs, bt] = b.split(':').map(Number);
    return as - bs || at - bt;
  });

  const t = idx++;
  if (gagTag !== null && !hasGag) continue;
  process.stdout.write(JSON.stringify({ t, live }) + '\n');
}

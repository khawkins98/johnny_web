// Characterise game-clock jumps in a DBX_DELAY log against the capture's timeline.
// A jump is a sample where the original's 16 ms game clock advanced by >= threshold
// ticks; each is listed with the threads that started or stopped there, which is how
// the load-time clock jumps in METHODOLOGY.md were attributed (#53).
// usage: node clock-jumps.mjs <delay.log> <timeline.jsonl> [threshold=7]
import { readFileSync } from 'node:fs';
const [file, tl, thr = '7'] = process.argv.slice(2);
if (!file || !tl) {
    console.error('usage: node clock-jumps.mjs <delay.log> <timeline.jsonl> [threshold=7]');
    process.exit(2);
}
const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('DELAY '));
const ticks = [];
for (const l of lines) {
    const m = l.match(/^DELAY (\d+) now=(\d+):(\d+) emu=([\d.]+) host=([\d.]+) \|(.*)$/);
    if (!m) continue;
    const now = Number(m[2]) + Number(m[3]) * 65536;
    const fields = {};
    for (const f of m[6].trim().split(/\s+/)) {
        const p = f.split(':');
        fields[`${p[0]}:${p[1]}`] = { rs: +p[2], delay: +p[3], dl: +p[4] + (+p[5]) * 65536 };
    }
    ticks.push({ t: +m[1], now, emu: +m[4], host: +m[5], fields });
}
const live = new Map();
for (const l of readFileSync(tl, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    const j = JSON.parse(l);
    live.set(j.t, j.live);
}
const demus = ticks.slice(1).map((x, i) => x.emu - ticks[i].emu);
const sorted = [...demus].sort((a, b) => a - b);
console.log(`samples=${ticks.length} emu-interval median=${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms mean=${(demus.reduce((a, b) => a + b, 0) / demus.length).toFixed(1)}`);
for (let i = 1; i < ticks.length; i++) {
    const d = ticks[i].now - ticks[i - 1].now;
    if (d < Number(thr)) continue;
    const prevLive = live.get(ticks[i - 1].t) ?? [];
    const curLive = live.get(ticks[i].t) ?? [];
    const added = curLive.filter((k) => !prevLive.includes(k));
    const removed = prevLive.filter((k) => !curLive.includes(k));
    // threads whose deadline changed at this sample
    const changed = Object.keys(ticks[i].fields).filter((k) => ticks[i].fields[k].rs >= 1 && ticks[i].fields[k].rs <= 3 && ticks[i].fields[k].dl !== ticks[i - 1].fields[k]?.dl);
    console.log(`tick=${ticks[i].t} prev-now=${ticks[i - 1].now} now=${ticks[i].now} dnow=${d} demu=${(ticks[i].emu - ticks[i - 1].emu).toFixed(1)}ms dhost=${(ticks[i].host - ticks[i - 1].host).toFixed(1)}ms live=${JSON.stringify(curLive)} added=${JSON.stringify(added)} removed=${JSON.stringify(removed)} dlChanged=${JSON.stringify(changed.map((k) => `${k} d${ticks[i].fields[k].delay} dl-now=${ticks[i].fields[k].dl - ticks[i].now}`))}`);
}

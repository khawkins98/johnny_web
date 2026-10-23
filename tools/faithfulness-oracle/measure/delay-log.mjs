// Analyse a DBX_DELAY log: now per tick, and per thread the deadline/delay fields
// sampled at tick entry, plus the frame holds (ticks between deadline changes) per
// authored delay. Input is the DBX_DELAY log the patched DOSBox-X writes (#53).
// usage: node delay-log.mjs <delay.log> <slot:tag> [maxEpisodes=3]
import { readFileSync } from 'node:fs';
const [file, key, maxShow = '3'] = process.argv.slice(2);
if (!file || !key) {
    console.error('usage: node delay-log.mjs <delay.log> <slot:tag> [maxEpisodes=3]');
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
    ticks.push({ t: +m[1], now, emu: +m[4], fields });
}
// now deltas
const deltas = ticks.slice(1).map((x, i) => x.now - ticks[i].now);
const hist = {};
for (const d of deltas) hist[d] = (hist[d] || 0) + 1;
console.log(`ticks=${ticks.length} now-delta hist=${JSON.stringify(hist)} mean=${(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2)}`);
const big = ticks.slice(1).map((x, i) => [x.t, x.now - ticks[i].now]).filter(([, d]) => d >= 8);
console.log(`jumps>=8: ${big.length} e.g. ${JSON.stringify(big.slice(0, 12))}`);
// thread episodes: contiguous rs in 1..3
let shown = 0;
let i = 0;
while (i < ticks.length && shown < Number(maxShow)) {
    const f = ticks[i].fields[key];
    if (!f || !(f.rs >= 1 && f.rs <= 3)) { i++; continue; }
    const start = i;
    while (i < ticks.length && ticks[i].fields[key] && ticks[i].fields[key].rs >= 1 && ticks[i].fields[key].rs <= 3) i++;
    const ep = ticks.slice(start, i);
    shown++;
    console.log(`\n== ${key} episode ${shown}: ticks ${ep[0].t}..${ep.at(-1).t} (${ep.length} samples) prev-tick now=${ticks[start - 1]?.now}`);
    // holds: group by deadline value
    let prevDl = null, prevDelay = null, holdStart = null, firstShown = 0;
    const holds = [];
    for (const x of ep) {
        const g = x.fields[key];
        if (g.dl !== prevDl) {
            if (prevDl !== null) holds.push({ delay: prevDelay, dl: prevDl, ticks: x.t - holdStart, setNow: ticks.find((y) => y.t === holdStart - 1)?.now });
            prevDl = g.dl; prevDelay = g.delay; holdStart = x.t;
        }
        if (firstShown++ < 8) console.log(`   t=${x.t} now=${x.now} rs=${g.rs} delay=${g.delay} dl=${g.dl} (dl-now=${g.dl - x.now})`);
    }
    const byDelay = {};
    for (const h of holds) { const k = `d${h.delay}`; (byDelay[k] ||= []).push(h.ticks); }
    console.log(`   holds (ticks between deadline changes): first ${JSON.stringify(holds.slice(0, 6).map((h) => `${h.delay}:${h.ticks}`))}`);
    for (const [k, v] of Object.entries(byDelay)) { const hh = {}; for (const t of v) hh[t] = (hh[t] || 0) + 1; console.log(`   ${k}: n=${v.length} hist=${JSON.stringify(hh)}`); }
}

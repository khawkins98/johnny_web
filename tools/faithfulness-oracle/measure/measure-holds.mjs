// Measure OUR engine's fine ticks per frame, per authored delay and scene key, for
// one gag driven headless. Compare with delay-log.mjs on a capture of the original.
// Needs the imported game data in public/data/.
// usage: node measure-holds.mjs BUILDING.ADS 2 [seed=1]
import { driveGag } from '../../../src/dgds/scripting/__tests__/support/drive-gag.mjs';

const [adsName, tagArg, seedArg] = process.argv.slice(2);
if (!adsName || tagArg === undefined) {
    console.error('usage: node measure-holds.mjs <ADS name> <tag> [seed=1]');
    process.exit(2);
}
const tag = Number(tagArg);
const seed = Number(seedArg ?? 1);
const last = new Map(); // key -> { tick, delay }
const holds = new Map(); // key|delay -> [ticks...]
driveGag({
    adsName,
    tag,
    seed,
    onEvent: (type, d) => {
        if (type !== 'frame-timing-map') return;
        const key = `${d.sceneIdx}:${d.tagId}`;
        const prev = last.get(key);
        if (prev) {
            const k = `${key} d=${prev.delay}`;
            if (!holds.has(k)) holds.set(k, []);
            holds.get(k).push(d.tick - prev.tick);
        }
        last.set(key, { tick: d.tick, delay: d.authoredDelayTicks });
    },
});
const rows = [...holds.entries()]
    .filter(([, v]) => v.length >= 4)
    .map(([k, v]) => {
        const mean = v.reduce((a, b) => a + b, 0) / v.length;
        const hist = {};
        for (const x of v) hist[x] = (hist[x] || 0) + 1;
        return `${k.padEnd(14)} n=${String(v.length).padStart(3)} mean=${mean.toFixed(2)} ticks (${(mean * 20).toFixed(0)} ms) hist=${JSON.stringify(hist)}`;
    });
console.log(rows.join('\n'));

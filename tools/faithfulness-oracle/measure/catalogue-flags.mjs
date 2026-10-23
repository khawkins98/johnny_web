// Print each scene-catalogue record's flagsB bits by name, its tide window and day.
// Reads SCRANTIC.SCR from public/data/ (or the path given), so needs imported data.
// usage: node catalogue-flags.mjs [path/to/SCRANTIC.SCR]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeJohnnyCatalogue } from '../../../src/games/johnny/__tests__/catalogue-decoder.mjs';

const scr = process.argv[2] || fileURLToPath(new URL('../../../public/data/SCRANTIC.SCR', import.meta.url));
const buf = readFileSync(scr);
const recs = decodeJohnnyCatalogue(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const FLAGS = [
    [0x200, 'HIGHTIDE'],
    [0x400, 'LEFTOFF'],
    [0x800, 'NIGHT(30b4=1)'],
    [0x1000, 'WAVESOFF'],
    [0x2000, 'BLACK'],
    [0x4000, 'NORAFT'],
    [0x10, 'NOHOLIDAY'],
];
for (const r of recs) {
    const bits = FLAGS.filter(([m]) => r.flagsB & m).map(([, n]) => n);
    console.log(
        `${(r.script || '').replace('.ADS', '')}#${r.adsTag}\tflagsB=0x${r.flagsB.toString(16).padStart(4, '0')}\ttide=[${r.tideMin},${r.tideMax})\tday=${r.day}\t${bits.join(',')}`,
    );
}

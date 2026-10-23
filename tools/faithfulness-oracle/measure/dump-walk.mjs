// Dump the walk table, the JOHNWALK.BMP sprites and island layer 0 (BACKGRND.BMP
// frame 0) as RGBA JSON for walkmatch.py. The output is extracted game data: write it
// under scratchpad/ and never commit it.
// usage: node dump-walk.mjs <out.json> [dataDir=public/data]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadResources } from '../../../src/dgds/resource.mjs';
import { decodeJohnnyWalkData } from '../../../src/games/johnny/walking.mjs';

const [outPath, dataArg] = process.argv.slice(2);
if (!outPath) {
    console.error('usage: node dump-walk.mjs <out.json> [dataDir]');
    process.exit(2);
}
const D = dataArg || fileURLToPath(new URL('../../../public/data', import.meta.url));
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const scr = ab(readFileSync(`${D}/SCRANTIC.SCR`));
const res = loadResources(ab(readFileSync(`${D}/RESOURCE.MAP`)), ab(readFileSync(`${D}/RESOURCE.001`)));
const arc = res.getResource('RESOURCE.001');
const bmp = arc.loadEntry('JOHNWALK.BMP');
const bg = arc.loadEntry('BACKGRND.BMP');
const img = (im) => ({ w: im.width, h: im.height, px: im.pixels.map((p) => [p.r, p.g, p.b, p.a]) });
writeFileSync(
    outPath,
    JSON.stringify({
        table: decodeJohnnyWalkData(scr),
        sprites: bmp.images.map(img),
        layer0: img(bg.images[0]),
    }),
);
console.log('ok', bmp.images.length);

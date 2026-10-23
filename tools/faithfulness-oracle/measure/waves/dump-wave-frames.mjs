// Extract the BACKGRND.BMP wave frames ident.py / offset.py match against: high-tide
// patches 3-11 and low-tide patches 30-41, as raw RGBA (f<i>.rgba) plus frames.json
// ({ "<i>": [w, h] }). The output is extracted game data: keep it under scratchpad/
// and never commit it.
// usage: node dump-wave-frames.mjs [outDir=scratchpad/maintainer/waves/frames] [dataDir=public/data]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadResources } from '../../../../src/dgds/resource.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const out = path.resolve(process.argv[2] || path.join(repo, 'scratchpad/maintainer/waves/frames'));
const D = process.argv[3] || path.join(repo, 'public/data');
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const res = loadResources(ab(readFileSync(`${D}/RESOURCE.MAP`)), ab(readFileSync(`${D}/RESOURCE.001`)));
const bg = res.getResource('RESOURCE.001').loadEntry('BACKGRND.BMP');
const ids = [3, 4, 5, 6, 7, 8, 9, 10, 11, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41];
mkdirSync(out, { recursive: true });
const meta = {};
for (const i of ids) {
    const im = bg.images[i];
    const buf = Buffer.alloc(im.width * im.height * 4);
    im.pixels.forEach((p, k) => buf.set([p.r, p.g, p.b, p.a], k * 4));
    writeFileSync(path.join(out, `f${i}.rgba`), buf);
    meta[i] = [im.width, im.height];
}
writeFileSync(path.join(out, 'frames.json'), JSON.stringify(meta));
console.log(`wrote ${ids.length} frames to ${out}`);

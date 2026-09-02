#!/usr/bin/env node
// Framebuffer diff for the rendering oracle. Compares two 640x480 PPM (P6)
// frames pixel-for-pixel (palette-normalized RGB), and emits:
//  - a divergence summary (differing-pixel count, fraction, bounding box, max channel delta)
//  - a divergence heat image (PPM): matching px dimmed grey, differing px in red,
//    so opaque-covers-where-it-should-be-transparent regions light up.
// Usage: node diff-frames.mjs A.ppm B.ppm out-diff.ppm [tol]
import { readFileSync, writeFileSync } from 'node:fs';

const [aPath, bPath, outPath, tolArg] = process.argv.slice(2);
const tol = Number(tolArg ?? 16); // per-channel tolerance (palette/rounding slack)

const readPPM = (p) => {
    const buf = readFileSync(p);
    // parse P6 header: "P6\n<w> <h>\n<max>\n"
    let o = 0;
    const token = () => {
        while (buf[o] === 0x20 || buf[o] === 0x0a || buf[o] === 0x09 || buf[o] === 0x0d) o++;
        let s = o;
        while (!(buf[o] === 0x20 || buf[o] === 0x0a || buf[o] === 0x09 || buf[o] === 0x0d)) o++;
        return buf.toString('ascii', s, o);
    };
    if (token() !== 'P6') throw new Error(`${p}: not P6`);
    const w = Number(token()), h = Number(token()), mx = Number(token());
    o++; // single whitespace after maxval
    return { w, h, mx, data: buf.subarray(o, o + w * h * 3) };
};

const A = readPPM(aPath), B = readPPM(bPath);
if (A.w !== B.w || A.h !== B.h) throw new Error(`size mismatch ${A.w}x${A.h} vs ${B.w}x${B.h}`);
const { w, h } = A;
const out = Buffer.allocUnsafe(w * h * 3);
let diff = 0, maxDelta = 0;
let minX = w, minY = h, maxX = -1, maxY = -1;
for (let i = 0; i < w * h; i++) {
    const dr = Math.abs(A.data[i * 3] - B.data[i * 3]);
    const dg = Math.abs(A.data[i * 3 + 1] - B.data[i * 3 + 1]);
    const db = Math.abs(A.data[i * 3 + 2] - B.data[i * 3 + 2]);
    const d = Math.max(dr, dg, db);
    const differs = d > tol;
    if (differs) {
        diff++;
        if (d > maxDelta) maxDelta = d;
        const x = i % w, y = (i / w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        out[i * 3] = 255; out[i * 3 + 1] = 0; out[i * 3 + 2] = 0; // red = divergence
    } else {
        // dim grey underlay of A so the divergence has context
        const g = (A.data[i * 3] * 0.3 + A.data[i * 3 + 1] * 0.59 + A.data[i * 3 + 2] * 0.11) * 0.35 | 0;
        out[i * 3] = g; out[i * 3 + 1] = g; out[i * 3 + 2] = g;
    }
}
if (outPath) writeFileSync(outPath, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), out]));
const total = w * h;
const bbox = maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
console.log(JSON.stringify({
    a: aPath.split('/').pop(), b: bPath.split('/').pop(),
    tol, differingPixels: diff, fraction: +(diff / total).toFixed(4),
    maxChannelDelta: maxDelta, divergenceBBox: bbox,
}, null, 0));

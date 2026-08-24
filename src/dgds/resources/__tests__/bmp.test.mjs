import { describe, it, expect } from 'vitest';
import { loadBMPResourceEntry } from '../bmp.mjs';
import { PALETTE } from '../../palette.mjs';

// KNOWN ISSUE: decompression type 0 (no compression) returns the DataView as-is from
// decompress(). The BMP/SCR pixel loop then does `data[dataIndex]` which array-indexes a
// DataView — always `undefined` — so all pixels come out as 0 (palette index 0).
// All fixtures below use RLE (compressionType=1) to avoid this bug.

// Fixture layout (38 bytes, 1 image 2×2, RLE-compressed):
//   0-3    "BMP\0"
//   4-5    outer width  u16 LE = 0  (header field, unused/"weird values")
//   6-7    outer height u16 LE = 0
//   8-11   "INF\0"
//   12-15  INF blockSize u32 LE = 0  (unused)
//   16-17  numImages u16 LE = 1
//   18-19  images[0] width  u16 LE = 2
//   20-21  images[0] height u16 LE = 2
//   22-25  "BIN\0"
//   26-29  BIN blockSize u32 LE = 8  (5-byte sub-header + 3-byte RLE payload)
//   30     compressionType u8 = 1 (RLE)
//   31-34  uncompressedSize u32 LE = 2
//   35     RLE control = 0x02 (2 literal bytes follow)
//   36     0xAB  → pixels 0xA (high nibble) and 0xB (low nibble)
//   37     0xCD  → pixels 0xC and 0xD
//
// Decoded pixel indices: [0xA, 0xB, 0xC, 0xD] = [10, 11, 12, 13]

function ws(arr, off, str) {
    for (let i = 0; i < str.length; i++) arr[off + i] = str.charCodeAt(i);
}
function u16(arr, off, val) {
    arr[off] = val & 0xff;
    arr[off + 1] = (val >> 8) & 0xff;
}
function u32(arr, off, val) {
    arr[off] = val & 0xff;
    arr[off + 1] = (val >> 8) & 0xff;
    arr[off + 2] = (val >> 16) & 0xff;
    arr[off + 3] = (val >> 24) & 0xff;
}

function makeBMPEntry() {
    const arr = new Uint8Array(38);
    ws(arr, 0, 'BMP');
    arr[3] = 0x00;
    u16(arr, 4, 0); // outer width (unused)
    u16(arr, 6, 0); // outer height (unused)
    ws(arr, 8, 'INF');
    arr[11] = 0x00;
    u32(arr, 12, 0); // INF blockSize (unused)
    u16(arr, 16, 1); // numImages = 1
    u16(arr, 18, 2); // images[0].width = 2
    u16(arr, 20, 2); // images[0].height = 2
    ws(arr, 22, 'BIN');
    arr[25] = 0x00;
    u32(arr, 26, 8); // BIN blockSize = 8 (5-byte sub-header + 3-byte payload)
    arr[30] = 1; // compressionType = 1 (RLE)
    u32(arr, 31, 2); // uncompressedSize = 2
    arr[35] = 0x02; // RLE: 2 literal bytes
    arr[36] = 0xab;
    arr[37] = 0xcd;
    return { name: 'TEST.BMP', type: 'BMP', data: new DataView(arr.buffer), buffer: arr.buffer };
}

describe('loadBMPResourceEntry', () => {
    it('returns the correct numImages count', () => {
        const result = loadBMPResourceEntry(makeBMPEntry());
        expect(result.numImages).toBe(1);
    });

    it('images array has the expected length', () => {
        const { images } = loadBMPResourceEntry(makeBMPEntry());
        expect(images).toHaveLength(1);
    });

    it('image 0 has the correct width and height', () => {
        const { images } = loadBMPResourceEntry(makeBMPEntry());
        expect(images[0].width).toBe(2);
        expect(images[0].height).toBe(2);
    });

    it('image 0 buffer has width×height entries', () => {
        const { images } = loadBMPResourceEntry(makeBMPEntry());
        expect(images[0].buffer).toHaveLength(4); // 2×2
    });

    it('first pixel index is the high nibble of the first data byte (0xA = 10)', () => {
        const { images } = loadBMPResourceEntry(makeBMPEntry());
        expect(images[0].buffer[0]).toBe(0xa);
    });

    it('all four pixel indices are decoded correctly from 4-bit packed bytes', () => {
        const { images } = loadBMPResourceEntry(makeBMPEntry());
        expect(images[0].buffer).toEqual([0xa, 0xb, 0xc, 0xd]);
    });

    it('pixel objects have index, a, r, g, b from PALETTE', () => {
        const { images } = loadBMPResourceEntry(makeBMPEntry());
        const p0 = images[0].pixels[0];
        expect(p0.index).toBe(0xa);
        expect(p0.a).toBe(PALETTE[0xa].a);
        expect(p0.r).toBe(PALETTE[0xa].r);
        expect(p0.g).toBe(PALETTE[0xa].g);
        expect(p0.b).toBe(PALETTE[0xa].b);
    });

    it('returns name and type from the entry', () => {
        const result = loadBMPResourceEntry(makeBMPEntry());
        expect(result.name).toBe('TEST.BMP');
        expect(result.type).toBe('BMP');
    });

    it('throws when the BMP header is wrong', () => {
        const entry = makeBMPEntry();
        const arr = new Uint8Array(entry.buffer);
        ws(arr, 0, 'XXX');
        const bad = { ...entry, data: new DataView(arr.buffer), buffer: arr.buffer };
        expect(() => loadBMPResourceEntry(bad)).toThrow();
    });
});

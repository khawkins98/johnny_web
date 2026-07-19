import { describe, it, expect } from 'vitest';
import { loadSCRResourceEntry } from '../scr.mjs';
import { PALETTE } from '../../palette.mjs';

// KNOWN ISSUE: decompression type 0 (no compression) returns the DataView as-is from
// decompress(). The SCR pixel loop then does `data[dataIndex]` which array-indexes a
// DataView — always `undefined` — so all pixels come out as 0 (palette index 0).
// All fixtures below use RLE (compressionType=1) to avoid this bug.

// Fixture layout (36 bytes, 2×2 image, RLE-compressed):
//   0-3    "SCR\0"
//   4-5    totalSize u16 LE = 0  (header field, unused/"weird values")
//   6-7    flags     u16 LE = 0
//   8-11   "DIM\0"
//   12-15  DIM blockSize u32 LE = 4  (just width + height)
//   16-17  width  u16 LE = 2
//   18-19  height u16 LE = 2
//   20-23  "BIN\0"
//   24-27  BIN blockSize u32 LE = 8  (5-byte sub-header + 3-byte RLE payload)
//   28     compressionType u8 = 1 (RLE)
//   29-32  uncompressedSize u32 LE = 2
//   33     RLE control = 0x02 (2 literal bytes)
//   34     0xAB  → pixels 0xA (high nibble) and 0xB (low nibble)
//   35     0xCD  → pixels 0xC and 0xD
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

function makeSCREntry() {
    const arr = new Uint8Array(36);
    ws(arr, 0, 'SCR');
    arr[3] = 0x00;
    u16(arr, 4, 0); // totalSize (unused)
    u16(arr, 6, 0); // flags (unused)
    ws(arr, 8, 'DIM');
    arr[11] = 0x00;
    u32(arr, 12, 4); // DIM blockSize = 4
    u16(arr, 16, 2); // width = 2
    u16(arr, 18, 2); // height = 2
    ws(arr, 20, 'BIN');
    arr[23] = 0x00;
    u32(arr, 24, 8); // BIN blockSize = 8 (5-byte sub-header + 3-byte payload)
    arr[28] = 1; // compressionType = 1 (RLE)
    u32(arr, 29, 2); // uncompressedSize = 2
    arr[33] = 0x02; // RLE: 2 literal bytes
    arr[34] = 0xab;
    arr[35] = 0xcd;
    return { name: 'TEST.SCR', type: 'SCR', data: new DataView(arr.buffer), buffer: arr.buffer };
}

describe('loadSCRResourceEntry', () => {
    it('returns correct shape with name and type', () => {
        const result = loadSCRResourceEntry(makeSCREntry());
        expect(result.name).toBe('TEST.SCR');
        expect(result.type).toBe('SCR');
    });

    it('returns width and height from the DIM block', () => {
        const result = loadSCRResourceEntry(makeSCREntry());
        expect(result.width).toBe(2);
        expect(result.height).toBe(2);
    });

    it('numImages is always 1 for SCR files', () => {
        const result = loadSCRResourceEntry(makeSCREntry());
        expect(result.numImages).toBe(1);
    });

    it('images array has exactly one entry', () => {
        const { images } = loadSCRResourceEntry(makeSCREntry());
        expect(images).toHaveLength(1);
    });

    it('images[0] has correct width, height, and buffer length', () => {
        const { images } = loadSCRResourceEntry(makeSCREntry());
        expect(images[0].width).toBe(2);
        expect(images[0].height).toBe(2);
        expect(images[0].buffer).toHaveLength(4); // 2×2
    });

    it('images[0].buffer[0] equals the high nibble of first pixel byte (0xA = 10)', () => {
        const { images } = loadSCRResourceEntry(makeSCREntry());
        expect(images[0].buffer[0]).toBe(0xa);
    });

    it('all pixel indices are correctly decoded from 4-bit packed bytes', () => {
        const { images } = loadSCRResourceEntry(makeSCREntry());
        expect(images[0].buffer).toEqual([0xa, 0xb, 0xc, 0xd]);
    });

    it('pixel objects at images[0].pixels have index, a, r, g, b from PALETTE', () => {
        const { images } = loadSCRResourceEntry(makeSCREntry());
        const p = images[0].pixels[0];
        expect(p.index).toBe(0xa);
        expect(p.a).toBe(PALETTE[0xa].a);
        expect(p.r).toBe(PALETTE[0xa].r);
        expect(p.g).toBe(PALETTE[0xa].g);
        expect(p.b).toBe(PALETTE[0xa].b);
    });

    it('throws when the SCR header is wrong', () => {
        const entry = makeSCREntry();
        const arr = new Uint8Array(entry.buffer);
        ws(arr, 0, 'XXX');
        const bad = { ...entry, data: new DataView(arr.buffer), buffer: arr.buffer };
        expect(() => loadSCRResourceEntry(bad)).toThrow();
    });

    it('throws when the DIM block tag is wrong', () => {
        const entry = makeSCREntry();
        const arr = new Uint8Array(entry.buffer);
        ws(arr, 8, 'XXX');
        const bad = { ...entry, data: new DataView(arr.buffer), buffer: arr.buffer };
        expect(() => loadSCRResourceEntry(bad)).toThrow();
    });
});

import { describe, it, expect } from 'vitest';
import { loadPALResourceEntry } from '../pal.mjs';

// Fixture layout (780 bytes):
//   0-3   "PAL\0"
//   4-7   unknown (4 bytes, skipped by parser)
//   8-11  "VGA\0"
//   12-779 256 × 3 bytes (R, G, B — each 0..63, scaled ×4 in output)

function ws(arr, off, str) {
    for (let i = 0; i < str.length; i++) arr[off + i] = str.charCodeAt(i);
}

function makePALEntry(paletteRGB = new Uint8Array(768)) {
    const arr = new Uint8Array(12 + 768);
    ws(arr, 0, 'PAL');  arr[3] = 0x00;
    // bytes 4-7: unknown, leave as zeros
    ws(arr, 8, 'VGA');  arr[11] = 0x00;
    arr.set(paletteRGB, 12);
    return { name: 'TEST.PAL', type: 'PAL', data: new DataView(arr.buffer), buffer: arr.buffer };
}

describe('loadPALResourceEntry', () => {
    it('returns an object with the correct shape', () => {
        const result = loadPALResourceEntry(makePALEntry());
        expect(result.name).toBe('TEST.PAL');
        expect(result.type).toBe('PAL');
        expect(Array.isArray(result.palette)).toBe(true);
    });

    it('palette has exactly 256 entries', () => {
        const { palette } = loadPALResourceEntry(makePALEntry());
        expect(palette).toHaveLength(256);
    });

    it('each entry has correct index, a=255, and non-negative r/g/b', () => {
        const { palette } = loadPALResourceEntry(makePALEntry());
        palette.forEach((c, i) => {
            expect(c.index).toBe(i);
            expect(c.a).toBe(255);
            expect(c.r).toBeGreaterThanOrEqual(0);
            expect(c.g).toBeGreaterThanOrEqual(0);
            expect(c.b).toBeGreaterThanOrEqual(0);
        });
    });

    it('first entry (index 0) has r=0, g=0, b=0 when raw bytes are all zero', () => {
        const { palette } = loadPALResourceEntry(makePALEntry());
        expect(palette[0]).toEqual({ index: 0, a: 255, r: 0, g: 0, b: 0 });
    });

    it('entry at index 1 with raw R=63 produces r=252 (63 × 4)', () => {
        const rgb = new Uint8Array(768);
        rgb[3] = 63; // index 1, R component (byte offset 3 inside the rgb block)
        const { palette } = loadPALResourceEntry(makePALEntry(rgb));
        expect(palette[1].r).toBe(252);
    });

    it('r/g/b values are raw byte × 4', () => {
        const rgb = new Uint8Array(768);
        // index 5: R=10, G=20, B=30
        rgb[15] = 10; rgb[16] = 20; rgb[17] = 30;
        const { palette } = loadPALResourceEntry(makePALEntry(rgb));
        expect(palette[5]).toEqual({ index: 5, a: 255, r: 40, g: 80, b: 120 });
    });

    it('throws when the PAL header is wrong', () => {
        const entry = makePALEntry();
        const arr = new Uint8Array(entry.buffer);
        ws(arr, 0, 'XXX'); // corrupt header
        const badEntry = { ...entry, data: new DataView(arr.buffer), buffer: arr.buffer };
        expect(() => loadPALResourceEntry(badEntry)).toThrow();
    });

    it('throws when the VGA block tag is wrong', () => {
        const entry = makePALEntry();
        const arr = new Uint8Array(entry.buffer);
        ws(arr, 8, 'XXX'); // corrupt VGA tag
        const badEntry = { ...entry, data: new DataView(arr.buffer), buffer: arr.buffer };
        expect(() => loadPALResourceEntry(badEntry)).toThrow();
    });
});

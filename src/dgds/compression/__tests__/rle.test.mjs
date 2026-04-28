import { describe, it, expect } from 'vitest';
import { decompressRLE } from '../rle.mjs';

const dv = (...bytes) => new DataView(new Uint8Array(bytes).buffer);

describe('decompressRLE', () => {
    it('returns empty array for empty input', () => {
        const data = dv();
        expect(decompressRLE(data, 0, 0)).toEqual([]);
    });

    it('handles a single literal run (control=3, 3 bytes)', () => {
        const data = dv(0x03, 0x0A, 0x0B, 0x0C);
        expect(decompressRLE(data, 0, 4)).toEqual([0x0A, 0x0B, 0x0C]);
    });

    it('handles a single repeat run (control=0x83 → 3 copies of next byte)', () => {
        const data = dv(0x83, 0xFF);
        expect(decompressRLE(data, 0, 2)).toEqual([0xFF, 0xFF, 0xFF]);
    });

    it('handles a literal run followed by a repeat run', () => {
        // literal: control=2, bytes [0x01, 0x02]; repeat: control=0x84, byte=0xAA → 4 copies
        const data = dv(0x02, 0x01, 0x02, 0x84, 0xAA);
        expect(decompressRLE(data, 0, 5)).toEqual([0x01, 0x02, 0xAA, 0xAA, 0xAA, 0xAA]);
    });

    it('handles max repeat run (control=0xFF → 127 copies)', () => {
        const data = dv(0xFF, 0x5A);
        const result = decompressRLE(data, 0, 2);
        expect(result).toHaveLength(127);
        expect(result.every(v => v === 0x5A)).toBe(true);
    });

    it('handles repeat of exactly 1 byte (control=0x81)', () => {
        const data = dv(0x81, 0x42);
        expect(decompressRLE(data, 0, 2)).toEqual([0x42]);
    });

    it('handles two consecutive repeat runs', () => {
        // 0x82 → repeat 2× 0x11; 0x83 → repeat 3× 0x22
        const data = dv(0x82, 0x11, 0x83, 0x22);
        expect(decompressRLE(data, 0, 4)).toEqual([0x11, 0x11, 0x22, 0x22, 0x22]);
    });

    it('handles two consecutive literal runs', () => {
        // literal 2 bytes, then literal 2 bytes
        const data = dv(0x02, 0xAA, 0xBB, 0x02, 0xCC, 0xDD);
        expect(decompressRLE(data, 0, 6)).toEqual([0xAA, 0xBB, 0xCC, 0xDD]);
    });

    it('handles edge case: control=1 (single literal byte)', () => {
        const data = dv(0x01, 0x7F);
        expect(decompressRLE(data, 0, 2)).toEqual([0x7F]);
    });

    it('handles edge case: control=0x81 (repeat 1 time)', () => {
        const data = dv(0x81, 0x00);
        expect(decompressRLE(data, 0, 2)).toEqual([0x00]);
    });
});

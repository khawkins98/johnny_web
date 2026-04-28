import { describe, it, expect } from 'vitest';
import { getString } from '../../utils/string.mjs';

const dv = (...bytes) => new DataView(new Uint8Array(bytes).buffer);

describe('getString', () => {
    it('reads a null-terminated string from the start of a buffer', () => {
        const data = dv(0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x00, 0xFF, 0xFF); // "Hello\0..."
        expect(getString(data, 0)).toBe('Hello');
    });

    it('stops at the first null byte even when more data follows', () => {
        const data = dv(0x41, 0x42, 0x00, 0x43, 0x44); // "AB\0CD"
        expect(getString(data, 0, 5)).toBe('AB');
    });

    it('returns empty string when first byte is null', () => {
        const data = dv(0x00, 0x41, 0x42);
        expect(getString(data, 0, 3)).toBe('');
    });

    it('reads from a non-zero offset', () => {
        // [0x58, 0x58, 0x41, 0x42, 0x43, 0x00] → offset 2 = "ABC"
        const data = dv(0x58, 0x58, 0x41, 0x42, 0x43, 0x00);
        expect(getString(data, 2, 4)).toBe('ABC');
    });

    it('uses default length of 100 when no length argument is given', () => {
        const bytes = [];
        for (let i = 0; i < 50; i++) bytes.push(0x41); // 50 × 'A'
        bytes.push(0x00);
        const data = new DataView(new Uint8Array(bytes).buffer);
        expect(getString(data, 0)).toBe('A'.repeat(50));
    });

    it('returns exactly `length` chars when there is no null byte within the limit', () => {
        const data = dv(0x41, 0x42, 0x43, 0x44, 0x45); // "ABCDE", no null
        expect(getString(data, 0, 3)).toBe('ABC');
    });

    it('handles a string that fills exactly `length` characters with no null', () => {
        const data = dv(0x58, 0x59, 0x5A, 0x00); // "XYZ\0"
        // length=3 → reads exactly 3 chars, never reaches null
        expect(getString(data, 0, 3)).toBe('XYZ');
    });
});

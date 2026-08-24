import { describe, it, expect } from 'vitest';
import { decompressLZW } from '../lzw.mjs';

const dv = (...bytes) => new DataView(new Uint8Array(bytes).buffer);

describe('decompressLZW', () => {
    /**
     * Minimal valid stream: single literal code 0x41 ('A') encoded as a 9-bit LSB-first code.
     *
     * decompressLZW reads `current = data.getUint8(offset++)`, then calls getBits with numBits=9.
     * For code 0x41 (binary 001000001) in 9 bits LSB-first:
     *   byte0 = 0x41 (bits 0–7 of the code), byte1 = 0x00 (bit 8 = 0).
     * offset starts at 0, so current = 0x41 (byte 0), getBits reads from byte 1 onward.
     * The first push is `pdata.push(oldCode)` = 0x41, then the while loop condition
     * `offset < length` (offset=1, length=1) is false, so we get exactly [0x41].
     */
    it('decompresses a single-byte literal stream to [0x41]', () => {
        const data = dv(0x41, 0x00);
        const result = decompressLZW(data, 0, 1);
        expect(result).toEqual([0x41]);
    });

    it('does not throw on an empty / all-zero stream (returns partial data)', () => {
        const data = dv(0x00, 0x00, 0x00, 0x00);
        expect(() => decompressLZW(data, 0, 4)).not.toThrow();
    });

    it('does not throw on a stream shorter than expected (malformed input)', () => {
        const data = dv(0x41);
        expect(() => decompressLZW(data, 0, 100)).not.toThrow();
    });

    it('returns an array for any input (never throws due to try/catch)', () => {
        // Garbage bytes — should not throw; result is a (possibly empty/partial) array
        const data = dv(0xde, 0xad, 0xbe, 0xef, 0xff, 0xff);
        let result;
        expect(() => {
            result = decompressLZW(data, 0, 6);
        }).not.toThrow();
        expect(Array.isArray(result)).toBe(true);
    });

    it('handles the clear-code (256) reset path without throwing', () => {
        // Build a stream that encodes: literal 'A' (0x41), then clear code (256).
        // 9-bit LSB-first encoding:
        //   code 0x41 = 0b001000001: byte0=0x41 (bits 0–7), bit8=0 bleeds into byte1 bit0
        //   code 256  = 0b100000000: bit0=0…bit7=0, bit8=1
        // Packing two 9-bit codes LSB-first into bytes:
        //   code0 bits[0..7] = 0x41 → byte0 = 0x41
        //   code0 bit[8]=0, code1 bits[0..6]=0b0000000 → byte1 = 0x00
        //   code1 bit[7]=1 → byte2 = 0x80
        const data = dv(0x41, 0x00, 0x80);
        expect(() => decompressLZW(data, 0, 3)).not.toThrow();
        const result = decompressLZW(data, 0, 3);
        // The first literal (0x41) is always pushed before the loop
        expect(result[0]).toBe(0x41);
    });
});

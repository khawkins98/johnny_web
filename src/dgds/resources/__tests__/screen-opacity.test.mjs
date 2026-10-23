import { describe, it, expect } from 'vitest';
import { loadBMPResourceEntry } from '../bmp.mjs';
import { loadSCRResourceEntry } from '../scr.mjs';
import { PALETTE } from '../../palette.mjs';

// Palette index 0 is the sprite colour key, not a "transparent colour" of the
// palette. The original blits sprites (BMP via DRAW_SPRITE) with a two-pass masked
// blit that drops index 0, but copies a full screen (SCR via LOAD_SCREEN or the
// host's ocean bake) opaque. The day OCEAN0x.SCR screens draw their dark cloud
// reflections in index 0 (about 9,000-10,000 px each), and the original shows them
// in that colour, not as holes.

function ws(arr, off, str) {
    for (let i = 0; i < str.length; i++) arr[off + i] = str.charCodeAt(i);
}
function u16(arr, off, val) {
    arr[off] = val & 0xff;
    arr[off + 1] = (val >> 8) & 0xff;
}
function u32(arr, off, val) {
    u16(arr, off, val & 0xffff);
    u16(arr, off + 2, val >>> 16);
}

// 2x2 image, RLE payload of two literal bytes -> indices [0, 5, 0, 15].
const PAYLOAD = [0x05, 0x0f];

function makeSCR() {
    const arr = new Uint8Array(36);
    ws(arr, 0, 'SCR');
    ws(arr, 8, 'DIM');
    u32(arr, 12, 4);
    u16(arr, 16, 2);
    u16(arr, 18, 2);
    ws(arr, 20, 'BIN');
    u32(arr, 24, 8);
    arr[28] = 1; // RLE
    u32(arr, 29, 2);
    arr[33] = 0x02;
    arr.set(PAYLOAD, 34);
    return { name: 'TEST.SCR', type: 'SCR', data: new DataView(arr.buffer), buffer: arr.buffer };
}

function makeBMP() {
    const arr = new Uint8Array(38);
    ws(arr, 0, 'BMP');
    ws(arr, 8, 'INF');
    u16(arr, 16, 1);
    u16(arr, 18, 2);
    u16(arr, 20, 2);
    ws(arr, 22, 'BIN');
    u32(arr, 26, 8);
    arr[30] = 1; // RLE
    u32(arr, 31, 2);
    arr[35] = 0x02;
    arr.set(PAYLOAD, 36);
    return { name: 'TEST.BMP', type: 'BMP', data: new DataView(arr.buffer), buffer: arr.buffer };
}

describe('palette index 0: opaque on screens, transparent on sprites', () => {
    it('an SCR draws index-0 pixels opaque in palette colour 0', () => {
        const [image] = loadSCRResourceEntry(makeSCR()).images;
        expect(image.buffer).toEqual([0, 5, 0, 15]);
        for (const p of [image.pixels[0], image.pixels[2]]) {
            expect(p).toMatchObject({ index: 0, a: 255, r: PALETTE[0].r, g: PALETTE[0].g, b: PALETTE[0].b });
        }
        expect(image.pixels[0]).toMatchObject({ r: 168, g: 0, b: 168 });
        expect(image.pixels.every((p) => p.a === 255)).toBe(true);
    });

    it('a BMP sprite keeps index 0 transparent', () => {
        const [image] = loadBMPResourceEntry(makeBMP()).images;
        expect(image.buffer).toEqual([0, 5, 0, 15]);
        expect(image.pixels[0].a).toBe(0);
        expect(image.pixels[2].a).toBe(0);
        expect(image.pixels[1].a).toBe(255);
        expect(image.pixels[3].a).toBe(255);
    });
});

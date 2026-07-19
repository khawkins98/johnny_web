import { describe, it, expect } from 'vitest';
import { loadTTMResourceEntry } from '../ttm.mjs';

// KNOWN ISSUE: decompress(0, data, ...) returns the DataView as-is. The line
//   data = new DataView(new Int8Array(data).buffer)
// then calls `new Int8Array(dataView)` which constructs an Int8Array from the DataView's
// length (not its contents), yielding wrong/empty results for uncompressed TT3 blocks.
// All fixtures below use RLE (compressionType=1) to avoid this bug.

// Fixture layout (69 bytes):
//
//  VER block (13 bytes, offsets 0-12)
//    0-3    "VER\0"
//    4-7    versionSize u32 LE = 5
//    8-12   "4.09\0"
//
//  PAG block (10 bytes, offsets 13-22)
//    13-16  "PAG\0"
//    17-20  numPages u32 LE = 1
//    21-22  pagUnknown02 u16 LE = 0
//
//  TT3 block (20 bytes, offsets 23-42)
//    23-26  "TT3\0"
//    27-30  blockSize u32 LE = 12  (5-byte sub-header + 7-byte RLE payload)
//    31     compressionType u8 = 1 (RLE)
//    32-35  uncompressedSize u32 LE = 6
//    36-42  RLE: [0x06, 0x11,0x11, 0x01,0x00, 0xF0,0x0F]
//             → decompressed: [0x11,0x11, 0x01,0x00, 0xF0,0x0F]
//             → opcodes: 0x1111 (SET_SCENE tagId=1), 0x0FF0 (UPDATE)
//
//  TTI block (8 bytes, offsets 43-50)
//    43-46  "TTI\0"
//    47-48  ttiUnknown01 u16 LE = 0
//    49-50  ttiUnknown02 u16 LE = 0
//
//  TAG block (18 bytes, offsets 51-68)
//    51-54  "TAG\0"
//    55-58  tagSize u32 LE = 0  (field unused by parser)
//    59-60  numTags u16 LE = 1
//    61-62  id u16 LE = 1
//    63-68  "scene\0"

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

function makeTTMEntry() {
    const arr = new Uint8Array(69);

    // VER block
    ws(arr, 0, 'VER');
    arr[3] = 0x00;
    u32(arr, 4, 5);
    ws(arr, 8, '4.09');
    arr[12] = 0x00;

    // PAG block
    ws(arr, 13, 'PAG');
    arr[16] = 0x00;
    u32(arr, 17, 1); // numPages = 1
    u16(arr, 21, 0); // pagUnknown02

    // TT3 block
    ws(arr, 23, 'TT3');
    arr[26] = 0x00;
    u32(arr, 27, 12); // blockSize = 12 (5 sub-header + 7 payload)
    arr[31] = 1; // compressionType = 1 (RLE)
    u32(arr, 32, 6); // uncompressedSize = 6
    // RLE-encoded opcodes: SET_SCENE(0x1111) + tagId(1) + UPDATE(0x0FF0)
    arr[36] = 0x06; // 6 literal bytes
    arr[37] = 0x11;
    arr[38] = 0x11; // raw opcode 0x1111 (LE) → SET_SCENE, size=1
    arr[39] = 0x01;
    arr[40] = 0x00; // tagId = 1 (LE)
    arr[41] = 0xf0;
    arr[42] = 0x0f; // raw opcode 0x0FF0 (LE) → UPDATE, size=0

    // TTI block
    ws(arr, 43, 'TTI');
    arr[46] = 0x00;
    u16(arr, 47, 0); // ttiUnknown01
    u16(arr, 49, 0); // ttiUnknown02

    // TAG block
    ws(arr, 51, 'TAG');
    arr[54] = 0x00;
    u32(arr, 55, 0); // tagSize (unused by parser)
    u16(arr, 59, 1); // numTags = 1
    u16(arr, 61, 1); // tag id = 1
    ws(arr, 63, 'scene');
    arr[68] = 0x00;

    return { name: 'TEST.TTM', type: 'TTM', data: new DataView(arr.buffer), buffer: arr.buffer };
}

describe('loadTTMResourceEntry', () => {
    it('returns an object with the expected top-level shape', () => {
        const result = loadTTMResourceEntry(makeTTMEntry());
        expect(result.name).toBe('TEST.TTM');
        expect(result.type).toBe('TTM');
        expect(typeof result.numPages).toBe('number');
        expect(Array.isArray(result.tags)).toBe(true);
        expect(Array.isArray(result.scripts)).toBe(true);
        expect(Array.isArray(result.scenes)).toBe(true);
    });

    it('parses numPages from the PAG block', () => {
        const result = loadTTMResourceEntry(makeTTMEntry());
        expect(result.numPages).toBe(1);
    });

    it('parses one tag from the TAG block', () => {
        const { tags } = loadTTMResourceEntry(makeTTMEntry());
        expect(tags).toHaveLength(1);
        expect(tags[0].id).toBe(1);
        expect(tags[0].description).toBe('scene');
    });

    it('scripts contains both the SET_SCENE and UPDATE commands', () => {
        const { scripts } = loadTTMResourceEntry(makeTTMEntry());
        expect(scripts).toHaveLength(2);
    });

    it('first script command is SET_SCENE (opcode 0x1110)', () => {
        const { scripts } = loadTTMResourceEntry(makeTTMEntry());
        expect(scripts[0].opcode).toBe(0x1110);
        expect(scripts[0].line).toContain('SET_SCENE');
    });

    it('SET_SCENE command tag references the correct tag object', () => {
        const { scripts, tags } = loadTTMResourceEntry(makeTTMEntry());
        expect(scripts[0].tag).toBe(tags[0]);
    });

    it('second script command is UPDATE (opcode 0x0FF0)', () => {
        const { scripts } = loadTTMResourceEntry(makeTTMEntry());
        expect(scripts[1].opcode).toBe(0x0ff0);
        expect(scripts[1].line).toContain('UPDATE');
        expect(scripts[1].params).toHaveLength(0);
    });

    it('first scene has tagId 0 (prologue before first SET_SCENE)', () => {
        // The parser pushes a scene for commands before the first SET_SCENE boundary.
        const { scenes } = loadTTMResourceEntry(makeTTMEntry());
        expect(scenes[0].tagId).toBe(0);
    });

    it('second scene has tagId 1 and contains the UPDATE command', () => {
        const { scenes, scripts } = loadTTMResourceEntry(makeTTMEntry());
        expect(scenes[1].tagId).toBe(1);
        expect(scenes[1].script).toContain(scripts[1]);
    });

    it('scenes array has exactly 2 entries (prologue + one tagged section)', () => {
        // ttm.mjs correctly pushes the final scene after the loop ends.
        // Compare with ads.mjs which has the final-push bug.
        const { scenes } = loadTTMResourceEntry(makeTTMEntry());
        expect(scenes).toHaveLength(2);
    });

    it('throws when the VER header is wrong', () => {
        const entry = makeTTMEntry();
        const arr = new Uint8Array(entry.buffer);
        ws(arr, 0, 'XXX');
        const bad = { ...entry, data: new DataView(arr.buffer), buffer: arr.buffer };
        expect(() => loadTTMResourceEntry(bad)).toThrow();
    });
});

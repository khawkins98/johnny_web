import { describe, it, expect } from 'vitest';
import { loadADSResourceEntry } from '../ads.mjs';

// KNOWN ISSUE: decompress(0, data, ...) returns the DataView as-is. The line
//   data = new DataView(new Int8Array(data).buffer)
// then calls `new Int8Array(dataView)`, which constructs an Int8Array from the DataView's
// length, not its contents — yielding wrong results for uncompressed SCR blocks.
// All fixtures below use RLE (compressionType=1) to avoid this bug.

// BUG: The last scene's commands accumulate in sceneScripts but are never pushed to
// scenes[] after the loop ends. scenes[] is therefore always missing its final entry.
// See the `// BUG:` comment in ads.mjs. Compare with ttm.mjs which correctly pushes
// after the loop. Tests below assert the current (buggy) behaviour.

// Fixture layout (78 bytes):
//
//  VER block (13 bytes, offsets 0-12)
//    0-3   "VER\0"
//    4-7   versionSize u32 LE = 5
//    8-12  "4.09\0"
//
//  ADS header (8 bytes, offsets 13-20)
//    13-16  "ADS\0"
//    17-18  adsUnknown01 u16 LE = 0
//    19-20  adsUnknown02 u16 LE = 0
//
//  RES block (21 bytes, offsets 21-41)
//    21-24  "RES\0"
//    25-28  resSize u32 LE = 0  (unused by parser)
//    29-30  numResources u16 LE = 1
//    31-32  id u16 LE = 1
//    33-41  "game.ttm\0"
//
//  SCR block (18 bytes, offsets 42-59)
//    42-45  "SCR\0"
//    46-49  blockSize u32 LE = 10  (5-byte sub-header + 5-byte RLE payload)
//    50     compressionType u8 = 1 (RLE)
//    51-54  uncompressedSize u32 LE = 4
//    55-59  RLE: [0x04, 0x01,0x00, 0xFF,0xFF]
//             → decompressed: [0x01,0x00, 0xFF,0xFF]
//             → opcodes: 0x0001 (tag reference id=1), 0xFFFF (END)
//
//  TAG block (18 bytes, offsets 60-77)
//    60-63  "TAG\0"
//    64-67  tagSize u32 LE = 0  (unused by parser)
//    68-69  numTags u16 LE = 1
//    70-71  id u16 LE = 1
//    72-77  "start\0"

function ws(arr, off, str) {
    for (let i = 0; i < str.length; i++) arr[off + i] = str.charCodeAt(i);
}
function u16(arr, off, val) {
    arr[off] = val & 0xff; arr[off + 1] = (val >> 8) & 0xff;
}
function u32(arr, off, val) {
    arr[off] = val & 0xff; arr[off + 1] = (val >> 8) & 0xff;
    arr[off + 2] = (val >> 16) & 0xff; arr[off + 3] = (val >> 24) & 0xff;
}

function makeADSEntry() {
    const arr = new Uint8Array(78);

    // VER block
    ws(arr, 0, 'VER');  arr[3] = 0x00;
    u32(arr, 4, 5);
    ws(arr, 8, '4.09'); arr[12] = 0x00;

    // ADS header
    ws(arr, 13, 'ADS'); arr[16] = 0x00;
    u16(arr, 17, 0);    // adsUnknown01
    u16(arr, 19, 0);    // adsUnknown02

    // RES block
    ws(arr, 21, 'RES'); arr[24] = 0x00;
    u32(arr, 25, 0);    // resSize (unused)
    u16(arr, 29, 1);    // numResources = 1
    u16(arr, 31, 1);    // resource id = 1
    ws(arr, 33, 'game.ttm'); arr[41] = 0x00;

    // SCR block
    ws(arr, 42, 'SCR'); arr[45] = 0x00;
    u32(arr, 46, 10);   // blockSize = 10 (5 sub-header + 5 payload)
    arr[50] = 1;        // compressionType = 1 (RLE)
    u32(arr, 51, 4);    // uncompressedSize = 4
    // RLE: 4 literal bytes → [0x01,0x00, 0xFF,0xFF]
    arr[55] = 0x04;
    arr[56] = 0x01; arr[57] = 0x00; // opcode 0x0001 (LE) → tag reference id=1
    arr[58] = 0xFF; arr[59] = 0xFF; // opcode 0xFFFF (LE) → END

    // TAG block
    ws(arr, 60, 'TAG'); arr[63] = 0x00;
    u32(arr, 64, 0);    // tagSize (unused)
    u16(arr, 68, 1);    // numTags = 1
    u16(arr, 70, 1);    // tag id = 1
    ws(arr, 72, 'start'); arr[77] = 0x00;

    return { name: 'TEST.ADS', type: 'ADS', data: new DataView(arr.buffer), buffer: arr.buffer };
}

describe('loadADSResourceEntry', () => {
    it('returns an object with the expected top-level shape', () => {
        const result = loadADSResourceEntry(makeADSEntry());
        expect(result.name).toBe('TEST.ADS');
        expect(result.type).toBe('ADS');
        expect(Array.isArray(result.resources)).toBe(true);
        expect(Array.isArray(result.tags)).toBe(true);
        expect(Array.isArray(result.scripts)).toBe(true);
        expect(Array.isArray(result.scenes)).toBe(true);
    });

    it('resources reflects the RES block', () => {
        const { resources } = loadADSResourceEntry(makeADSEntry());
        expect(resources).toHaveLength(1);
        expect(resources[0].id).toBe(1);
        expect(resources[0].name).toBe('game.ttm');
    });

    it('tags reflects the TAG block', () => {
        const { tags } = loadADSResourceEntry(makeADSEntry());
        expect(tags).toHaveLength(1);
        expect(tags[0].id).toBe(1);
        expect(tags[0].description).toBe('start');
    });

    it('scripts contains both the tag-reference and the END command', () => {
        const { scripts } = loadADSResourceEntry(makeADSEntry());
        expect(scripts).toHaveLength(2);
    });

    it('first script entry is the tag reference (opcode = tag id)', () => {
        const { scripts, tags } = loadADSResourceEntry(makeADSEntry());
        expect(scripts[0].opcode).toBe(1);
        expect(scripts[0].tag).toBe(tags[0]);
    });

    it('second script entry is the END command (opcode 0xFFFF)', () => {
        const { scripts } = loadADSResourceEntry(makeADSEntry());
        expect(scripts[1].opcode).toBe(0xFFFF);
        expect(scripts[1].line).toContain('END');
    });

    it('BUG: scenes.length === 0 — the final scene block is never pushed after the loop', () => {
        // With one TAG reference (id=1) then END: prevTagId is 0 when the first tag is
        // encountered, so the `if (prevTagId)` guard suppresses the push. After the loop
        // the pending sceneScripts (containing END) are never flushed. This is the
        // documented bug in ads.mjs — compare ttm.mjs which pushes after the loop.
        // BUG: last scene never pushed — see ads.mjs annotation.
        const { scenes } = loadADSResourceEntry(makeADSEntry());
        expect(scenes).toHaveLength(0);
    });

    it('throws when the VER header is wrong', () => {
        const entry = makeADSEntry();
        const arr = new Uint8Array(entry.buffer);
        ws(arr, 0, 'XXX');
        const bad = { ...entry, data: new DataView(arr.buffer), buffer: arr.buffer };
        expect(() => loadADSResourceEntry(bad)).toThrow();
    });

    it('throws when the ADS block tag is wrong', () => {
        const entry = makeADSEntry();
        const arr = new Uint8Array(entry.buffer);
        ws(arr, 13, 'XXX');
        const bad = { ...entry, data: new DataView(arr.buffer), buffer: arr.buffer };
        expect(() => loadADSResourceEntry(bad)).toThrow();
    });
});

// Bit-faithful port of the original 1993 DGDS "Johnny Castaway" binary RNG.
//
// The binary's random generator `FUN_1018_1e86` (NE seg 4, off 0x1e86) is a
// 56-word additive lagged-Fibonacci generator. Its state (two lag indices plus
// the 56 seed words) is BAKED into `SCRANTIC.SCR` at file offset 0x19ae2 — there
// is no srand()/clock seeding, so the word stream is identical on every boot.
//
// Decompiled core (Ghidra `FUN_1018_1e86`):
//   iVar2  = DAT_1068_1ce4 * 2;                       // i (updated/returned index)
//   piVar1 = table + i;
//   *piVar1 = *piVar1 + table[DAT_1068_1ce2];         // table[i] += table[j]
//   DAT_1068_1ce4 = (i + 1) % 56;                     // i advances, wraps at 56
//   DAT_1068_1ce2 = (j + 1) % 56;                     // j advances, wraps at 56
//   return table[i];                                  // the just-updated word
//
// Memory layout in DGROUP (== file offset 0x19ae2 for the shipped SCRANTIC.SCR):
//   0x1ce2  DAT_1068_1ce2  = j (addend index)         initial 24 (0x18)
//   0x1ce4  DAT_1068_1ce4  = i (updated/returned)     initial 55 (0x37)
//   0x1ce6  table[0..55]   = 56 non-zero 16-bit words (little-endian)
//
// The addition is a plain 16-bit wraparound (mod 2^16); the returned word is the
// raw, unsigned 16-bit result. Validated bit-for-bit against the running binary
// under a patched DOSBox-X over 20000 consecutive draws (0 divergences):
// see tools/faithfulness-oracle/rng-port.md.

// File offset of the baked RNG state inside SCRANTIC.SCR. DATA seg 1068:0000
// maps to file 0x17e00, so 1068:1ce2 == file 0x19ae2.
export const FAITHFUL_RNG_SEED_OFFSET = 0x19ae2;
export const FAITHFUL_RNG_TABLE_SIZE = 56;

/**
 * Extract the baked lagged-Fibonacci seed (lag indices + 56-word table) from a
 * SCRANTIC.SCR buffer.
 *
 * @param {Uint8Array|Buffer|ArrayBuffer} data  the raw SCRANTIC.SCR bytes
 * @param {number} [offset]  file offset of the state block (default 0x19ae2)
 * @returns {{ i: number, j: number, table: Uint16Array }}
 */
export function extractFaithfulSeed(data, offset = FAITHFUL_RNG_SEED_OFFSET) {
    const view = data instanceof ArrayBuffer
        ? new DataView(data)
        : new DataView(data.buffer, data.byteOffset, data.byteLength);
    const j = view.getUint16(offset, true); // DAT_1068_1ce2
    const i = view.getUint16(offset + 2, true); // DAT_1068_1ce4
    const table = new Uint16Array(FAITHFUL_RNG_TABLE_SIZE);
    for (let k = 0; k < FAITHFUL_RNG_TABLE_SIZE; k++) {
        table[k] = view.getUint16(offset + 4 + k * 2, true);
    }
    return { i, j, table };
}

/**
 * Create a bit-faithful reproduction of the binary's RNG.
 *
 * @param {{ i: number, j: number, table: ArrayLike<number> }} seed
 *   the lag indices and 56-word table (e.g. from {@link extractFaithfulSeed})
 * @returns {{
 *   nextWord: () => number,        // raw unsigned 16-bit draw (the ground-truth primitive)
 *   random: () => number,          // Math.random-compatible float in [0, 1)
 *   pick: (total: number) => number, // faithful weighted-index draw: 1..total (binary FUN_1048_0cda)
 *   getState: () => { i, j, table: Uint16Array },
 * }}
 */
export function createFaithfulRng(seed) {
    if (!seed || typeof seed.i !== 'number' || typeof seed.j !== 'number' || !seed.table) {
        throw new Error('createFaithfulRng: seed must be { i, j, table }');
    }
    if (seed.table.length !== FAITHFUL_RNG_TABLE_SIZE) {
        throw new Error(`createFaithfulRng: table must have ${FAITHFUL_RNG_TABLE_SIZE} words`);
    }
    const table = new Uint16Array(FAITHFUL_RNG_TABLE_SIZE);
    for (let k = 0; k < FAITHFUL_RNG_TABLE_SIZE; k++) table[k] = seed.table[k] & 0xffff;
    let i = seed.i % FAITHFUL_RNG_TABLE_SIZE;
    let j = seed.j % FAITHFUL_RNG_TABLE_SIZE;

    const nextWord = () => {
        // table[i] += table[j]  (16-bit wraparound); return the updated word.
        const value = (table[i] + table[j]) & 0xffff;
        table[i] = value;
        i = i + 1 === FAITHFUL_RNG_TABLE_SIZE ? 0 : i + 1;
        j = j + 1 === FAITHFUL_RNG_TABLE_SIZE ? 0 : j + 1;
        return value;
    };

    return {
        nextWord,
        // Drop-in for state.random: maps the raw word to [0, 1). NOTE: generic
        // float sites (SET_TIMER etc.) that do Math.floor(random()*N) will NOT
        // exactly match the binary's `word % N`; use pick() for weighted RANDOM.
        random: () => nextWord() / 0x10000,
        // Faithful weighted-index selection (binary FUN_1048_0cda):
        //   iVar3 = abs((int16)(raw % total)) + 1   -> a value in 1..total
        // Consumes exactly one raw word, matching the binary's draw accounting.
        pick: (total) => {
            const raw = nextWord();
            if (!(total > 0)) return 1;
            const signed = (raw << 16) >> 16; // interpret the word as int16
            const rem = signed % total; // C '%' truncates toward zero
            return Math.abs(rem) + 1;
        },
        getState: () => ({ i, j, table: table.slice() }),
    };
}

/**
 * Convenience: build a faithful RNG straight from a raw SCRANTIC.SCR archive
 * buffer (the same bytes the resource loader receives). One instance produces a
 * single continuous stream — reuse it across the whole session, mirroring the
 * binary's single shared generator (do NOT create a fresh one per gag).
 *
 * @param {Uint8Array|Buffer|ArrayBuffer} scrBytes  the raw SCRANTIC.SCR archive
 * @returns ReturnType<typeof createFaithfulRng>
 */
export function faithfulRandomFromArchive(scrBytes) {
    return createFaithfulRng(extractFaithfulSeed(scrBytes));
}

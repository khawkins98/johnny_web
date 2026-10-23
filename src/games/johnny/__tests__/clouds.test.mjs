import { describe, expect, it } from 'vitest';
import { bakeClouds, CLOUD_SLOTS, wordsFromRandom } from '../clouds.mjs';

// How the original lays out its clouds at each island bake (FUN_1010_0136).
//
// FUN_1010_0a38 (1010:0a38): size caps big 2 / medium 4 / small 8; the wind,
// FUN_1018_1f1b(50) -> bucket 1 = -1 (leftward) else +1 (rightward); then for
// each of 15 slots: 1f1b(30) (a 30% gate), 1f1b(5, 10, 15) -> 1 big (BACKGRND
// frame 17), 2 medium (16), 3 small (15), 0 none; a capped size falls through
// big -> medium -> small. A cloud draws x = rand % (640 - w),
// y = 1 + rand % (139 - h) (FUN_1010_14bf), speed = rand % 5 + 6, phase =
// rand % speed. The bake's single FUN_1010_0b67 pass moves a cloud whose phase is
// 0 by one pixel with the wind and draws it mirrored (flag 2) when the wind blows
// right. 0b67 runs nowhere else, so the clouds stand still for the batch.
//
// FUN_1018_1f1b buckets: each weight covers weight * 655 raw words, inclusive.
const PASS = 0; // bucket 1 of any table
const FAIL = 0xffff; // past every bucket: 0
const bucket = (weights, n) => weights.slice(0, n - 1).reduce((sum, w) => sum + w * 655, 0) + 1;
const script = (words) => {
    const queue = [...words];
    const word = () => {
        if (queue.length === 0) throw new Error('script exhausted');
        return queue.shift();
    };
    word.left = () => queue.length;
    return word;
};
const empty = (n) => new Array(n).fill(FAIL);

describe('bakeClouds (FUN_1010_0a38 + the bake pass of FUN_1010_0b67)', () => {
    it('has fifteen slots', () => {
        expect(CLOUD_SLOTS).toBe(15);
    });

    it('draws only the wind and fifteen slot gates when no slot opens', () => {
        const word = script([PASS, ...empty(CLOUD_SLOTS)]);
        expect(bakeClouds(word)).toEqual([]);
        expect(word.left()).toBe(0);
    });

    it('places a small cloud from x/y/speed/phase draws', () => {
        // wind leftward (bucket 1), slot 1 open, size small (bucket 3)
        const word = script([PASS, PASS, bucket([5, 10, 15], 3), 1000, 200, 3, 5, ...empty(14)]);
        expect(bakeClouds(word)).toEqual([
            { frame: 15, x: 1000 % (640 - 128), y: 1 + (200 % (139 - 36)), flipX: false },
        ]);
        expect(word.left()).toBe(0);
    });

    it('maps size buckets 1/2/3 to BACKGRND frames 17/16/15 and 0 to no cloud', () => {
        const words = [PASS];
        for (const n of [1, 2, 3]) words.push(PASS, bucket([5, 10, 15], n), 0, 0, 0, 1);
        words.push(PASS, FAIL, ...empty(CLOUD_SLOTS - 4));
        const word = script(words);
        expect(bakeClouds(word).map((c) => c.frame)).toEqual([17, 16, 15]);
        expect(word.left()).toBe(0);
    });

    it('caps big at 2 and medium at 4, falling through to smaller sizes', () => {
        const big = bucket([5, 10, 15], 1);
        const words = [PASS];
        for (let i = 0; i < 9; i++) words.push(PASS, big, 0, 0, 0, 1);
        words.push(...empty(CLOUD_SLOTS - 9));
        const clouds = bakeClouds(script(words));
        expect(clouds.map((c) => c.frame)).toEqual([17, 17, 16, 16, 16, 16, 15, 15, 15]);
    });

    it('stops at the small cap of 8 once every size is spent', () => {
        const small = bucket([5, 10, 15], 3);
        const words = [PASS];
        for (let i = 0; i < 8; i++) words.push(PASS, small, 0, 0, 0, 1);
        // the ninth small slot finds the cap empty: no placement draws
        words.push(PASS, small, ...empty(CLOUD_SLOTS - 9));
        const word = script(words);
        expect(bakeClouds(word)).toHaveLength(8);
        expect(word.left()).toBe(0);
    });

    it('mirrors every cloud when the wind blows right', () => {
        const word = script([FAIL, PASS, bucket([5, 10, 15], 2), 7, 9, 0, 1, ...empty(14)]);
        const [cloud] = bakeClouds(word);
        expect(cloud).toMatchObject({ frame: 16, x: 7, y: 1 + 9, flipX: true });
    });

    it('moves a cloud one pixel with the wind when its phase is 0 at the bake pass', () => {
        // speed = 0 % 5 + 6 = 6, phase = 6 % 6 = 0
        const left = bakeClouds(script([PASS, PASS, bucket([5, 10, 15], 3), 50, 0, 0, 6, ...empty(14)]));
        expect(left[0].x).toBe(49);
        const right = bakeClouds(script([FAIL, PASS, bucket([5, 10, 15], 3), 50, 0, 0, 6, ...empty(14)]));
        expect(right[0].x).toBe(51);
    });

    it('keeps every cloud inside the sky band and on screen', () => {
        let seed = 7;
        const random = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };
        const word = wordsFromRandom(random);
        const dims = { 15: [128, 36], 16: [192, 57], 17: [264, 76] };
        for (let i = 0; i < 500; i++) {
            const clouds = bakeClouds(word);
            expect(clouds.length).toBeLessThanOrEqual(14);
            for (const c of clouds) {
                const [w, h] = dims[c.frame];
                expect(c.y).toBeGreaterThanOrEqual(1);
                expect(c.y + h).toBeLessThanOrEqual(139);
                expect(c.x).toBeGreaterThanOrEqual(-1);
                expect(c.x + w).toBeLessThanOrEqual(641);
            }
            expect(new Set(clouds.map((c) => c.flipX)).size).toBeLessThanOrEqual(1);
        }
    });

    it('wordsFromRandom maps [0, 1) floats to 16-bit words', () => {
        const values = [0, 0.5, 0.999999];
        const word = wordsFromRandom(() => values.shift());
        expect([word(), word(), word()]).toEqual([0, 0x8000, 0xffff]);
    });
});

// Johnny's host clouds, as the original lays them out at each island bake.
//
// FUN_1010_0136 (the bake) calls FUN_1010_0a38 once per planned batch when the
// INI `Clouds` key is on (15 slots, DAT_1068_2f36), then FUN_1010_040e(1), whose
// one FUN_1010_0b67 pass draws them. 0b67 has no other caller, so the clouds stand
// still for the whole batch, by day and by night (NIGHT.SCR included). Off-island
// batches (30b4 == 2) skip 040e and show none.
//
// FUN_1010_0a38:
//   - size caps: big 2, medium 4, small 8 (DAT_1068_2e80/2e7e/2e7c);
//   - wind DAT_1068_0280: FUN_1018_1f1b(50) == 0 -> +1 (rightward) else -1;
//   - per slot: 1f1b(30) gate; 1f1b(5, 10, 15) -> 1 big (BACKGRND frame 17),
//     2 medium (16), 3 small (15), 0 none; a spent size falls through
//     big -> medium -> small;
//   - FUN_1010_14bf: x = rand % (640 - w), y = 1 + rand % (139 - h);
//     speed = rand % 5 + 6, phase = rand % speed.
// FUN_1010_0b67's bake pass then refills every empty slot with an off-screen cloud
// (x in [640, 1640 - w) or [-1000, -w)) that never moves, so never shows; it moves
// each visible cloud whose phase is 0 by one pixel with the wind; and it draws
// every cloud mirrored (FUN_1038_0ae4 flag 2) when the wind blows right.
//
// The respawn draws come after the shoreline-sparkle draws (FUN_1010_04a2), which
// the browser does not model, so this covers the visible clouds only. The caller
// chooses the word source; the story controller keeps clouds off the shared
// story stream (rng-port.md).

export const CLOUD_SLOTS = 15;

const SCREEN_W = 640;
const SKY_BOTTOM = 0x8b; // 139: FUN_1010_14bf's y extent
// BACKGRND.BMP frame -> [width, height]
const CLOUD_DIMENSIONS = Object.freeze({ 15: [128, 36], 16: [192, 57], 17: [264, 76] });

/** FUN_1018_1f1b: each weight covers weight * 655 raw words (inclusive); 0 past them all. */
const weightedBucket = (word, weights) => {
    let remaining = word();
    for (let index = 0; index < weights.length; index++) {
        const threshold = weights[index] * 655;
        if (remaining <= threshold) return index + 1;
        remaining -= threshold;
    }
    return 0;
};

/** A raw 16-bit word source from a Math.random-style float source. */
export const wordsFromRandom = (random) => () => Math.min(0xffff, Math.floor(random() * 0x10000));

/**
 * The clouds one bake shows: [{ frame, x, y, flipX }] in slot order.
 * @param {() => number} word raw unsigned 16-bit draws
 */
export const bakeClouds = (word) => {
    const caps = { 17: 2, 16: 4, 15: 8 };
    const wind = weightedBucket(word, [50]) === 0 ? 1 : -1;
    const clouds = [];
    for (let slot = 0; slot < CLOUD_SLOTS; slot++) {
        if (weightedBucket(word, [30]) === 0) continue;
        const size = weightedBucket(word, [5, 10, 15]);
        if (size === 0) continue;
        // bucket 1 tries big first, 2 medium, 3 small; a spent size falls through
        const frame = [17, 16, 15].slice(size - 1).find((f) => caps[f] > 0);
        if (frame === undefined) continue;
        caps[frame]--;
        const [width, height] = CLOUD_DIMENSIONS[frame];
        let x = word() % (SCREEN_W - width);
        const y = 1 + (word() % (SKY_BOTTOM - height));
        const speed = (word() % 5) + 6;
        const phase = word() % speed;
        if (phase === 0) x += wind;
        clouds.push({ frame, x, y, flipX: wind > 0 });
    }
    return clouds;
};

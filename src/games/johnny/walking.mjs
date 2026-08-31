import { buildSpriteCanvas } from '../../dgds/graphics.mjs';
import { DGDS_TICK_MS } from '../../dgds/scripting/timing.mjs';
import { verboseLog } from '../../dgds/scripting/log.mjs';

const DATA_OFFSET = 0x188ea;
// 488 rows: the walk table runs through spot G's standing poses at rows 480..487
// (the earlier 480 truncated them, so spot-G poses/walk destinations were missing);
// row 488 is the table's terminator.
const DATA_ROWS = 488;

// Palm-trunk occluder (BACKGRND sprite #13). The occluder is redrawn on the FOREGROUND
// over Johnny, so its position must match where the BACKGROUND paints the trunk -- not
// the binary's island-relative 443. The port's island layout draws the trunk at
// `layout[1].x (288) + sprite.x (154) = 442` (manifest.mjs), 1px left of the binary's
// 443 (the port's island base is 288 vs the binary's 289). Using 442 keeps the occluder
// exactly on the background trunk; a 1px error here doubles the tree as Johnny passes.
// The 22-wide TEST box vs the 24-wide trunk BITMAP is intentional (the bitmap is baked
// into the background; redrawing the full sprite paints identical pixels) -- don't
// "correct" width to 24.
const TREE_TRUNK = { index: 13, x: 442, y: 148, width: 22, height: 145, baseY: 293 };

/**
 * True when a sprite at island-relative (x,y) of size (width,height) is occluded by
 * the palm trunk this frame: its box overlaps the trunk AABB and its feet sit above
 * the trunk base. Position/depth based (like the original's FUN_1010_1551), so it
 * covers any walk route past the tree, not a specific spot pair. The binary's overlap
 * (FUN_1010_1a88) treats the MIN edges as inclusive (disjoint iff `x+w < x0`), so the
 * min-edge comparisons are `>=`; the base gate stays strict (`feetY < baseY`).
 */
export const occludedByTrunk = (x, y, width, height) => {
    const feetY = y + height;
    return (
        feetY < TREE_TRUNK.baseY &&
        x < TREE_TRUNK.x + TREE_TRUNK.width &&
        x + width >= TREE_TRUNK.x &&
        y < TREE_TRUNK.y + TREE_TRUNK.height &&
        feetY >= TREE_TRUNK.y
    );
};

/** Build the palm-trunk occluder sprite once (or null if the resource is absent). */
const buildTrunkSprite = (background) => {
    const trunk = background?.images?.[TREE_TRUNK.index];
    return trunk ? buildSpriteCanvas(trunk) : null;
};

/**
 * Redraw the palm trunk over a just-drawn sprite when it is behind the tree. The
 * original occludes EVERY engine-drawn sprite this way (FUN_1010_1551) -- walking and
 * standing/pose alike -- so both play paths share this.
 */
export const occludeBehindTrunk = (context, trunkSprite, frame, image, offsetX, offsetY) => {
    if (!trunkSprite || !occludedByTrunk(frame.x, frame.y, image.width, image.height)) return;
    context.drawImage(trunkSprite, TREE_TRUNK.x + offsetX, TREE_TRUNK.y + offsetY);
};

// Turn/standing sprite-row base per spot (0-based A,B,C,D,E,G). Each spot has 8 turn
// rows (one per heading) starting here; +9 gives the standing/waiting variant.
const TURNS = [91, 145, 260, 314, 405, 471];

// Precomputed walk route table, recovered from the original binary (SCRANTIC.SCR):
// the route matrix at file 0x18894 and the segment table at 0x180de. This REPLACES
// the port's hand-built BOOKMARKS adjacency graph + runtime path enumeration -- the
// original does not enumerate paths, it walks this table.
//
// WALK_ROUTES keys are "<from><to>" with 1-based spots (1=A..6=G). Each route maps the
// CURRENT 1-based spot -> a weighted list of [segmentId, weight%] choices (weights sum
// 100); the engine roulette-picks one segment per spot until it reaches the destination.
// WALK_SEGMENTS[id]: `sh`/`eh` = start/end heading (0=S,1=SW,2=W,3=NW,4=N,5=NE,6=E,7=SE),
// `es` = end spot (1-based; 0 = stand/no move), `row` = first row of the segment's walk
// frames in the decoded walk table.
const WALK_ROUTES = {
    '12': { 1: [[1, 13], [1, 12], [2, 25], [4, 25], [4, 25]], 2: [[0, 0]], 3: [[12, 50], [12, 50]], 4: [[18, 100]], 5: [[25, 25], [25, 25], [26, 50]], 6: [[30, 100]] },
    '13': { 1: [[4, 16], [4, 17], [3, 25], [1, 13], [1, 12], [2, 17]], 2: [[8, 50], [8, 50]], 3: [[0, 0]], 4: [[18, 100]], 5: [[25, 25], [25, 25], [26, 50]], 6: [[30, 100]] },
    '14': { 1: [[4, 12], [4, 13], [2, 25], [1, 25], [1, 25]], 2: [[8, 50], [8, 50]], 3: [[13, 100]], 4: [[0, 0]], 5: [[25, 50], [25, 50]], 6: [[30, 25], [31, 75]] },
    '15': { 1: [[4, 16], [4, 17], [3, 34], [2, 33], [1, 25], [1, 25]], 2: [[8, 50], [8, 50]], 3: [[13, 100]], 4: [[19, 100]], 5: [[0, 0]], 6: [[30, 100]] },
    '16': { 1: [[4, 8], [4, 8], [3, 17], [1, 8], [1, 9], [2, 50]], 2: [[8, 50], [8, 50]], 3: [[15, 100]], 4: [[18, 100]], 5: [[25, 15], [25, 15], [26, 70]], 6: [[0, 0]] },
    '21': { 1: [[0, 0]], 2: [[8, 50], [7, 25], [7, 25]], 3: [[13, 50], [15, 50]], 4: [[19, 100]], 5: [[23, 50], [23, 50]], 6: [[32, 50], [29, 50]] },
    '23': { 1: [[1, 50], [1, 50]], 2: [[7, 25], [7, 25], [8, 25], [8, 25]], 3: [[0, 0]], 4: [[18, 100]], 5: [[25, 25], [25, 25], [26, 50]], 6: [[30, 100]] },
    '24': { 1: [[1, 33], [1, 33], [2, 34]], 2: [[7, 25], [7, 25], [8, 25], [8, 25]], 3: [[13, 100]], 4: [[0, 0]], 5: [[25, 50], [25, 50]], 6: [[31, 100]] },
    '25': { 1: [[1, 50], [1, 50]], 2: [[7, 25], [7, 25], [8, 25], [8, 25]], 3: [[13, 50], [15, 50]], 4: [[19, 100]], 5: [[0, 0]], 6: [[32, 100]] },
    '26': { 1: [[1, 25], [1, 25], [2, 50]], 2: [[7, 25], [7, 25], [8, 25], [8, 25]], 3: [[14, 50], [13, 50]], 4: [[20, 100]], 5: [[26, 100]], 6: [[0, 0]] },
    '31': { 1: [[0, 0]], 2: [[7, 50], [7, 50]], 3: [[12, 12], [12, 13], [11, 25], [13, 25], [15, 25]], 4: [[19, 100]], 5: [[23, 50], [23, 50]], 6: [[32, 25], [29, 75]] },
    '32': { 1: [[4, 50], [4, 50]], 2: [[0, 0]], 3: [[13, 25], [15, 25], [12, 25], [12, 25]], 4: [[19, 100]], 5: [[23, 50], [23, 50]], 6: [[32, 100]] },
    '34': { 1: [[1, 50], [1, 50]], 2: [[7, 50], [7, 50]], 3: [[12, 25], [12, 25], [13, 50]], 4: [[0, 0]], 5: [[26, 50], [25, 25], [25, 25]], 6: [[31, 100]] },
    '35': { 1: [[1, 100]], 2: [[7, 50], [7, 50]], 3: [[11, 17], [12, 16], [12, 17], [13, 50]], 4: [[19, 50], [20, 50]], 5: [[0, 0]], 6: [[32, 100]] },
    '36': { 1: [[1, 25], [1, 25], [2, 50]], 2: [[7, 50], [7, 50]], 3: [[11, 13], [12, 6], [12, 6], [15, 50], [13, 25]], 4: [[20, 100]], 5: [[26, 100]], 6: [[0, 0]] },
    '41': { 1: [[0, 0]], 2: [[7, 50], [7, 50]], 3: [[12, 33], [12, 33], [15, 34]], 4: [[18, 20], [20, 40], [19, 40]], 5: [[23, 50], [23, 50]], 6: [[29, 100]] },
    '42': { 1: [[4, 50], [4, 50]], 2: [[0, 0]], 3: [[12, 50], [12, 50]], 4: [[19, 33], [20, 33], [18, 34]], 5: [[23, 50], [23, 50]], 6: [[29, 100]] },
    '43': { 1: [[4, 50], [4, 50]], 2: [[8, 50], [8, 50]], 3: [[0, 0]], 4: [[20, 25], [19, 25], [18, 50]], 5: [[23, 50], [23, 50]], 6: [[32, 100]] },
    '45': { 1: [[1, 50], [1, 50]], 2: [[7, 50], [7, 50]], 3: [[12, 50], [12, 50]], 4: [[18, 25], [19, 50], [20, 25]], 5: [[0, 0]], 6: [[32, 100]] },
    '46': { 1: [[2, 100]], 2: [[7, 50], [7, 50]], 3: [[12, 50], [12, 50]], 4: [[18, 25], [20, 50], [19, 25]], 5: [[23, 50], [26, 50]], 6: [[0, 0]] },
    '51': { 1: [[0, 0]], 2: [[7, 50], [7, 50]], 3: [[12, 17], [12, 16], [11, 34], [15, 33]], 4: [[18, 100]], 5: [[25, 25], [25, 25], [23, 25], [23, 25]], 6: [[29, 100]] },
    '52': { 1: [[4, 50], [4, 50]], 2: [[0, 0]], 3: [[12, 50], [12, 50]], 4: [[18, 100]], 5: [[23, 25], [23, 25], [25, 15], [25, 10], [26, 25]], 6: [[30, 100]] },
    '53': { 1: [[3, 34], [4, 33], [4, 33]], 2: [[8, 50], [8, 50]], 3: [[0, 0]], 4: [[18, 100]], 5: [[23, 50], [25, 15], [25, 10], [26, 25]], 6: [[31, 100]] },
    '54': { 1: [[4, 50], [4, 50]], 2: [[8, 50], [8, 50]], 3: [[13, 100]], 4: [[0, 0]], 5: [[23, 13], [23, 12], [25, 25], [25, 25], [26, 25]], 6: [[31, 100]] },
    '56': { 1: [[2, 100]], 2: [[0, 0]], 3: [[15, 100]], 4: [[19, 50], [18, 50]], 5: [[23, 13], [23, 12], [26, 50], [25, 15], [25, 10]], 6: [[0, 0]] },
    '61': { 1: [[0, 0]], 2: [[7, 50], [7, 50]], 3: [[12, 17], [12, 17], [11, 33], [13, 33]], 4: [[19, 100]], 5: [[23, 50], [23, 50]], 6: [[30, 25], [32, 25], [29, 50]] },
    '62': { 1: [[4, 50], [4, 50]], 2: [[0, 0]], 3: [[12, 50], [12, 50]], 4: [[18, 100]], 5: [[23, 50], [23, 50]], 6: [[32, 25], [29, 25], [30, 25], [31, 25]] },
    '63': { 1: [[3, 50], [4, 25], [4, 25]], 2: [[8, 50], [8, 50]], 3: [[0, 0]], 4: [[18, 100]], 5: [[23, 50], [23, 50]], 6: [[32, 12], [29, 13], [30, 50], [31, 25]] },
    '64': { 1: [[4, 25], [4, 25], [1, 50]], 2: [[8, 50], [8, 50]], 3: [[13, 100]], 4: [[0, 0]], 5: [[25, 100]], 6: [[29, 25], [31, 50], [32, 25]] },
    '65': { 1: [[1, 50], [1, 50]], 2: [[0, 0]], 3: [[13, 100]], 4: [[19, 100]], 5: [[0, 0]], 6: [[29, 25], [32, 50], [31, 13], [30, 12]] },
};
const WALK_SEGMENTS = {
    1: { sh: 5, eh: 5, es: 5, row: 0 }, 2: { sh: 6, eh: 5, es: 6, row: 17 }, 3: { sh: 6, eh: 5, es: 3, row: 38 },
    4: { sh: 6, eh: 7, es: 2, row: 68 }, 5: { sh: 0, eh: 0, es: 0, row: 91 }, 6: { sh: 0, eh: 0, es: 0, row: 100 },
    7: { sh: 3, eh: 3, es: 1, row: 109 }, 8: { sh: 5, eh: 5, es: 3, row: 133 }, 9: { sh: 0, eh: 0, es: 0, row: 145 },
    10: { sh: 0, eh: 0, es: 0, row: 154 }, 11: { sh: 2, eh: 2, es: 1, row: 163 }, 12: { sh: 1, eh: 1, es: 2, row: 196 },
    13: { sh: 3, eh: 4, es: 4, row: 211 }, 14: { sh: 2, eh: 3, es: 5, row: 224 }, 15: { sh: 2, eh: 3, es: 6, row: 245 },
    16: { sh: 0, eh: 0, es: 0, row: 260 }, 17: { sh: 0, eh: 0, es: 0, row: 269 }, 18: { sh: 7, eh: 7, es: 3, row: 278 },
    19: { sh: 2, eh: 2, es: 5, row: 289 }, 20: { sh: 1, eh: 1, es: 6, row: 302 }, 21: { sh: 0, eh: 0, es: 0, row: 314 },
    22: { sh: 0, eh: 0, es: 0, row: 323 }, 23: { sh: 1, eh: 1, es: 1, row: 332 }, 24: { sh: 7, eh: 6, es: 3, row: 356 },
    25: { sh: 6, eh: 6, es: 4, row: 381 }, 26: { sh: 7, eh: 7, es: 6, row: 394 }, 27: { sh: 0, eh: 0, es: 0, row: 405 },
    28: { sh: 0, eh: 0, es: 0, row: 414 }, 29: { sh: 2, eh: 2, es: 1, row: 423 }, 30: { sh: 6, eh: 6, es: 3, row: 443 },
    31: { sh: 5, eh: 5, es: 4, row: 457 }, 32: { sh: 3, eh: 3, es: 5, row: 463 }, 33: { sh: 0, eh: 0, es: 0, row: 471 },
    34: { sh: 0, eh: 0, es: 0, row: 480 },
};

/** Decode the original host's compact walking table without persisting a dump. */
export const decodeJohnnyWalkData = (archiveBuffer) => {
    if (!(archiveBuffer instanceof ArrayBuffer) || archiveBuffer.byteLength < DATA_OFFSET + DATA_ROWS * 6) {
        throw new TypeError('Johnny walking requires the original SCRANTIC.SCR archive');
    }
    const view = new DataView(archiveBuffer, DATA_OFFSET, DATA_ROWS * 6);
    return Array.from({ length: DATA_ROWS }, (_, index) => {
        const flagsAndFrame = view.getUint16(index * 6, true);
        return Object.freeze({
            flipX: Boolean(flagsAndFrame & 0x8000),
            frame: (flagsAndFrame & 0x7fff) - 1,
            x: view.getUint16(index * 6 + 2, true),
            y: view.getUint16(index * 6 + 4, true),
        });
    });
};

/**
 * Roulette-pick a segment id from a spot's weighted [segmentId, weight%] list, matching
 * the original's `rng() % 100` walk over the pairs. The binary loop
 * `while (r != w && w <= r) { r -= w; ... }` selects the current pair when `r <= w`, so
 * the boundary test is `<=`, not `<`. (Most lists sum to 100; a few sum higher -- e.g.
 * route 1->5 spot A sums 150 -- which is faithful to the binary; the overflow entries
 * are simply unreachable, in the original too.)
 */
export const pickWalkSegment = (choices, random = Math.random) => {
    let roll = Math.min(99, Math.max(0, Math.floor(random() * 100)));
    for (const [segmentId, weight] of choices) {
        if (roll <= weight) return segmentId;
        roll -= weight;
    }
    return choices[choices.length - 1]?.[0] ?? 0;
};

const appendTurn = (frames, data, spot, fromHeading, toHeading, waiting = false, random = Math.random) => {
    let heading = fromHeading;
    const difference = (toHeading - heading) & 7;
    // A difference of 4 is an opposite (180deg) facing: the original turns a RANDOM
    // shortest way ((rng()&1)?-1:+1). Otherwise take the short way (1..3 -> +1, 5..7 -> -1).
    const increment = difference === 0 ? 0 : difference === 4 ? (random() < 0.5 ? 1 : -1) : difference < 4 ? 1 : -1;
    while (heading !== toHeading) {
        heading = (heading + increment + 8) & 7;
        frames.push(data[TURNS[spot] + heading + (waiting ? 9 : 0)]);
    }
};

/**
 * Plan Johnny's walk frames by following the precomputed route table (WALK_ROUTES /
 * WALK_SEGMENTS), segment by segment, from `fromSpot` to `toSpot`. At each spot the
 * route's weighted list picks one segment; Johnny turns to face the segment's start
 * heading, plays its walk-frame rows, and lands at the segment's end spot/heading;
 * repeat until the destination. This is the original engine's mechanism, replacing the
 * port's runtime path enumeration over the hand-built BOOKMARKS graph.
 */
export const planJohnnyWalkFrames = (walk, data, random = Math.random) => {
    const { fromSpot, toSpot, fromHeading, toHeading } = walk;
    if (fromHeading == null || toHeading == null) return [];
    if (!Number.isInteger(fromSpot) || !Number.isInteger(toSpot)) return [];
    if (fromSpot < 0 || fromSpot > 5 || toSpot < 0 || toSpot > 5) return [];

    const frames = [];
    let heading = fromHeading;
    let spot = fromSpot; // 0-based

    if (spot !== toSpot) {
        const route = WALK_ROUTES[`${fromSpot + 1}${toSpot + 1}`];
        // guard bounds the walk in case of unexpected route data (the binary's table
        // always converges, but never spin).
        for (let guard = 0; route && spot !== toSpot && guard < 16; guard++) {
            const choices = route[spot + 1];
            if (!choices || choices.length === 0) break;
            const segment = WALK_SEGMENTS[pickWalkSegment(choices, random)];
            if (!segment || segment.es === 0) break;
            appendTurn(frames, data, spot, heading, segment.sh, false, random);
            for (let row = segment.row; data[row]?.frame >= 0; row++) frames.push(data[row]);
            heading = segment.eh;
            spot = segment.es - 1; // 1-based end spot -> 0-based
        }
        // The binary's route table always converges; if we ever exit the loop without
        // reaching the destination (guard tripped or missing route data), the code below
        // stamps the destination pose -- a visible teleport. Surface it as a gated
        // diagnostic rather than let it pass silently.
        if (spot !== toSpot) {
            verboseLog(`walk route ${fromSpot}->${toSpot} did not converge (stuck at spot ${spot})`);
        }
    }

    // Arrived at the destination. Seed the current-heading standing pose before the
    // final in-place turn so a turn to a W/E "hold-sentinel" facing (frame -1 -- the
    // pure W/E standing rows have no distinct sprite) still shows a real sprite to
    // hold, rather than an all-invisible sequence that leaves Johnny absent (the
    // standing-turn visibility fix). Only when an actual turn happens.
    if (heading !== toHeading) frames.push(data[TURNS[toSpot] + 9 + heading]);
    appendTurn(frames, data, toSpot, heading, toHeading, true, random);
    frames.push(data[TURNS[toSpot] + 9 + toHeading]);
    return frames.filter(Boolean);
};

const delay = (milliseconds, { signal } = {}) =>
    new Promise((resolve) => {
        if (signal?.aborted) return resolve(false);
        let timer;
        const finish = (completed) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            resolve(completed);
        };
        const onAbort = () => finish(false);
        timer = setTimeout(() => finish(true), milliseconds);
        signal?.addEventListener('abort', onAbort, { once: true });
    });

/** Play the executable-owned walk between two ADS scenes. */
export const runJohnnyWalk = async ({
    walk,
    titleState,
    archiveBuffer,
    resourceProvider,
    context,
    presentBackground = null,
    wait = delay,
    signal = null,
    random = Math.random,
    record = null,
}) => {
    if (!walk || signal?.aborted) return false;
    const frames = planJohnnyWalkFrames(walk, decodeJohnnyWalkData(archiveBuffer), random);
    const sprites = resourceProvider.resolve('JOHNWALK.BMP');
    const background = resourceProvider.resolve('BACKGRND.BMP');
    const offsetX = titleState?.x || 0;
    const offsetY = titleState?.y || 0;
    const trunkSprite = buildTrunkSprite(background);

    for (let index = 0; index < frames.length; index++) {
        const frame = frames[index];
        const image = sprites?.images?.[frame.frame];
        const hasVisiblePixels = Boolean(image?.pixels?.some((pixel) => pixel.a > 0));
        const sprite = hasVisiblePixels ? buildSpriteCanvas(image) : null;
        const visible = Boolean(sprite);
        record?.('walk-frame', {
            index,
            frame: frame.frame,
            x: frame.x + offsetX,
            y: frame.y + offsetY,
            flipX: frame.flipX,
            visible,
        });
        // Retain the preceding Johnny frame if the recovered table points at
        // an absent or fully transparent sprite. Clearing first would turn a
        // single bad authored/decode frame into a visible blink.
        if (visible) {
            context.clearRect(0, 0, 640, 480);
            presentBackground?.();
            context.save();
            if (frame.flipX) {
                context.translate(frame.x + offsetX + image.width, frame.y + offsetY);
                context.scale(-1, 1);
                context.drawImage(sprite, 0, 0);
            } else {
                context.drawImage(sprite, frame.x + offsetX, frame.y + offsetY);
            }
            context.restore();
        }
        // Palm-trunk occlusion (the original's generic per-frame foreground re-blit,
        // FUN_1010_1551): after drawing Johnny, redraw the trunk over him when he is
        // behind the tree. Position/depth based -- covers every route past the tree.
        if (visible) occludeBehindTrunk(context, trunkSprite, frame, image, offsetX, offsetY);
        const completed = await wait((index === frames.length - 1 ? 80 : 6) * DGDS_TICK_MS, { signal });
        if (signal?.aborted || completed === false) {
            context.clearRect(0, 0, 640, 480);
            return false;
        }
    }
    return true;
};

// Idle duration for a pure-pose scene (binary adsId 0xFF): Johnny just stands.
// The record carries no duration, so this is an authored idle -- tune as needed.
const POSE_IDLE_TICKS = 150; // ~3s at DGDS_TICK_MS

/** The standing sprite row for a pose at (spot, heading), from the walk sheet. */
export const johnnyPoseFrame = (data, spot, heading) => data[TURNS[spot] + 9 + heading];

/**
 * Play a pure-pose scene: Johnny stands at a spot facing a heading for a brief
 * idle, drawn from the walk sprite sheet with no ADS runtime. Pure engine pose
 * (binary adsId 0xFF). A pose is normally reached via a walk interlude that has
 * already left Johnny standing at the spot/heading; for the pure W/E facings
 * (heading 2/6) the standing row is the -1 "hold" sentinel, so -- exactly as the
 * walk interlude does -- an invisible frame RETAINS what is already on the canvas
 * rather than clearing to a blink.
 */
export const runJohnnyPose = async ({
    pose,
    titleState,
    archiveBuffer,
    resourceProvider,
    context,
    presentBackground = null,
    wait = delay,
    signal = null,
    record = null,
    idleTicks = POSE_IDLE_TICKS,
}) => {
    if (!pose || signal?.aborted) return false;
    const data = decodeJohnnyWalkData(archiveBuffer);
    const frame = johnnyPoseFrame(data, pose.spot, pose.heading);
    const sprites = resourceProvider.resolve('JOHNWALK.BMP');
    const background = resourceProvider.resolve('BACKGRND.BMP');
    const offsetX = titleState?.x || 0;
    const offsetY = titleState?.y || 0;
    const trunkSprite = buildTrunkSprite(background);
    const image = frame && frame.frame >= 0 ? sprites?.images?.[frame.frame] : null;
    const hasVisiblePixels = Boolean(image?.pixels?.some((pixel) => pixel.a > 0));
    const sprite = hasVisiblePixels ? buildSpriteCanvas(image) : null;
    const visible = Boolean(sprite);
    record?.('pose-frame', {
        spot: pose.spot,
        heading: pose.heading,
        frame: frame?.frame ?? -1,
        x: (frame?.x ?? 0) + offsetX,
        y: (frame?.y ?? 0) + offsetY,
        flipX: Boolean(frame?.flipX),
        visible,
    });
    if (visible) {
        context.clearRect(0, 0, 640, 480);
        presentBackground?.();
        context.save();
        if (frame.flipX) {
            context.translate(frame.x + offsetX + image.width, frame.y + offsetY);
            context.scale(-1, 1);
            context.drawImage(sprite, 0, 0);
        } else {
            context.drawImage(sprite, frame.x + offsetX, frame.y + offsetY);
        }
        context.restore();
        // The original occludes standing poses behind the trunk too, not just walks.
        occludeBehindTrunk(context, trunkSprite, frame, image, offsetX, offsetY);
    }
    const completed = await wait(idleTicks * DGDS_TICK_MS, { signal });
    if (signal?.aborted || completed === false) {
        context.clearRect(0, 0, 640, 480);
        return false;
    }
    return true;
};

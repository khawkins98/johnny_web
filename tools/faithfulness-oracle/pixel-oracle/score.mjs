// score.mjs -- masked per-keyframe pixel score of one of our frames against one
// original framebuffer dump. Pure; no I/O.
//
// Inputs (640x480):
//   orig      original dump at the keyframe, RGB
//   backdrop  original dump taken when the forced ADS was loaded (the screen the
//             gag starts on: in a forced capture, title-screen remnants), RGB
//   fg        our foreground canvas (composeTtmFrame), RGBA
//   bg        our main canvas (drawBackground), RGBA
//   bgKind    'gag' | 'host' | 'none' (render-ours.mjs)
//
// The comparison mask is every pixel that either side's gag owns:
//   - our foreground is opaque there, or
//   - our background is a non-black pixel of a screen the gag loaded itself
//     (bgKind 'gag'), or
//   - the original changed it since the backdrop dump,
// minus `ignore` (hostRemnantMask: host drawing that appears right after the load)
// minus `hostArea` where our side did not draw (the host's wave animation), and
// minus stale screen below row 350 that our side did not draw (`stale`).
// Pixels outside the mask belong to the host (island, ocean, title remnants) and
// are not scored. A forced capture skips the host's island setup, so the two sides
// do not share a host backdrop. Inside the mask our value is our foreground over
// our gag-loaded screen over black.
//
// Treating our host backdrop as black matches what the original does in a forced
// capture: its background plate (eb0) is still black there, so wherever a gag
// restores the plate (erasing an actor that moved) the original shows black. Those
// pixels are counted separately as `eb0` and do not count as differences. They are
// the plate-restore class from #52/#53: invisible in normal play when the plate
// holds the island, and visible when the plate and the screen disagree.
//
// The second score, `diffOnBackdrop`, composites ours over the original's backdrop
// instead of over black. It shows what the plate-restore class would look like over
// a non-black backdrop (MEANWHIL's 640x350 black area over the title remnants).
// Phase 0 (#53) found the off-island plate is black in the binary, so that view is
// diagnostic only; the forced capture's backdrop is not what normal play shows.
//
// Palette: the original runs under the Windows 3.1 palette manager, so some palette
// entries come out as other colours (static system colours). `learnRemap` finds
// clean one-to-one colour substitutions; pixels they explain count as `remapped`,
// not as differences. `rawDiffPct` is the score before that substitution.

export const WIDTH = 640;
export const HEIGHT = 480;
export const TOP_ROWS = 350;

/** Per-channel tolerance: 6-bit VGA DAC values scaled to 8 bits differ by <= 4. */
export const DEFAULT_TOLERANCE = 12;

const near = (a, ai, b, bi, tol) =>
    Math.abs(a[ai] - b[bi]) <= tol && Math.abs(a[ai + 1] - b[bi + 1]) <= tol && Math.abs(a[ai + 2] - b[bi + 2]) <= tol;

const isBlack = (a, i, tol) => a[i] <= tol && a[i + 1] <= tol && a[i + 2] <= tol;

/** Per-pixel categories written to `map` when one is passed. */
export const PIXEL = Object.freeze({ OUTSIDE: 0, MATCH: 1, OURS_ONLY: 2, ORIG_ONLY: 3, MISMATCH: 4, EB0: 5, REMAP: 6 });

const rgbKey = (a, i) => (a[i] << 16) | (a[i + 1] << 8) | a[i + 2];
const keyToRgb = (k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255];
const hex = (k) => `#${k.toString(16).padStart(6, '0')}`;

/**
 * Learn colour substitutions from one frame pair. `pairs` maps each colour of ours
 * (24-bit key) to a Map of original colour -> pixel count, over pixels ours drew.
 * A substitution is accepted when one original colour covers at least `dominance`
 * of at least `minPixels` pixels. Black is never substituted (it is the plate
 * colour). A shifted or wrong sprite gives a mixture, not a clean substitution.
 * @returns {Map<number, number>}
 */
export const learnRemap = (pairs, { dominance = 0.8, minPixels = 32, tolerance = DEFAULT_TOLERANCE } = {}) => {
    const remap = new Map();
    for (const [ourKey, counts] of pairs) {
        if (ourKey === 0) continue;
        let total = 0;
        let bestKey = -1;
        let best = 0;
        for (const [k, n] of counts) {
            total += n;
            if (n > best) {
                best = n;
                bestKey = k;
            }
        }
        if (total < minPixels || best / total < dominance || bestKey === 0) continue;
        if (near(keyToRgb(ourKey), 0, keyToRgb(bestKey), 0, tolerance)) continue;
        remap.set(ourKey, bestKey);
    }
    return remap;
};

/**
 * @returns {{mask:number, diff:number, diffPct:number, rawDiffPct:number,
 *   remapped:number, remapPct:number, remap:[string,string][], diffOnBackdrop:number,
 *   diffOnBackdropPct:number, oursOnly:number, origOnly:number, mismatch:number,
 *   eb0:number, eb0Top:number, backdropTop:number, eb0TopPct:number, diffTop:number,
 *   diffBottom:number}}
 */
export const scoreFrame = ({
    orig,
    backdrop,
    fg,
    bg,
    bgKind,
    tolerance = DEFAULT_TOLERANCE,
    map = null,
    remap = null,
    ignore = null,
    hostArea = null,
}) => {
    const gagBg = bgKind === 'gag';
    const N = WIDTH * HEIGHT;
    // pass 1: our composite (over black, over the original backdrop) and the mask
    const c = new Uint8Array(N * 3);
    const cb = new Uint8Array(N * 3);
    const flags = new Uint8Array(N); // 1 in mask, 2 ours drew, 4 orig changed, 8 backdrop black
    const pairs = new Map();
    for (let p = 0; p < N; p++) {
        const o3 = p * 3;
        const o4 = p * 4;
        const fa = fg[o4 + 3];
        // A gag screen's black pixels are left to the plate: the original's SCR
        // draw leaves earlier screen content visible there (SUZBEACH's border).
        const ourBg = gagBg && bg[o4 + 3] > 0 && !isBlack(bg, o4, tolerance);
        const origChanged = !near(orig, o3, backdrop, o3, tolerance);
        let f = isBlack(backdrop, o3, tolerance) ? 8 : 0;
        if ((!fa && !ourBg && !origChanged) || (ignore && ignore[p])) {
            flags[p] = f;
            continue;
        }
        // Below row 350, a pixel only the original changed is stale screen: the
        // binary presents dirty rectangles and nothing registered there (Phase 0,
        // #53). Accepted deviation; counted as `stale`, not scored.
        // Host-animated areas (the shoreline waves, which the forced binary keeps
        // animating) are scored only where our gag drew.
        if (!fa && !ourBg && hostArea && hostArea[p]) {
            flags[p] = f;
            continue;
        }
        if (!fa && !ourBg && p >= TOP_ROWS * WIDTH) {
            flags[p] = f | 16;
            continue;
        }
        f |= 1 | (fa || ourBg ? 2 : 0) | (origChanged ? 4 : 0);
        flags[p] = f;
        for (let k = 0; k < 3; k++) {
            const under = ourBg ? bg[o4 + k] : 0;
            const underB = ourBg ? bg[o4 + k] : backdrop[o3 + k];
            if (fa) {
                const a = fa / 255;
                c[o3 + k] = Math.round(fg[o4 + k] * a + under * (1 - a));
                cb[o3 + k] = Math.round(fg[o4 + k] * a + underB * (1 - a));
            } else {
                c[o3 + k] = under;
                cb[o3 + k] = underB;
            }
        }
        if (f & 2) {
            const ok = rgbKey(c, o3);
            let counts = pairs.get(ok);
            if (!counts) pairs.set(ok, (counts = new Map()));
            const tk = rgbKey(orig, o3);
            counts.set(tk, (counts.get(tk) ?? 0) + 1);
        }
    }
    const substitution = remap ?? learnRemap(pairs, { tolerance });
    // pass 2: classify
    let mask = 0;
    let diff = 0;
    let rawDiff = 0;
    let remapped = 0;
    let diffOnBackdrop = 0;
    let oursOnly = 0;
    let origOnly = 0;
    let mismatch = 0;
    let eb0 = 0;
    let eb0Top = 0;
    let backdropTop = 0;
    let diffTop = 0;
    let diffBottom = 0;
    let stale = 0;
    const sub = new Uint8Array(3);
    for (let p = 0; p < N; p++) {
        const y = (p / WIDTH) | 0;
        const f = flags[p];
        if (y < TOP_ROWS && !(f & 8)) backdropTop++;
        if (f & 16) stale++;
        if (!(f & 1)) {
            if (map) map[p] = PIXEL.OUTSIDE;
            continue;
        }
        mask++;
        const o3 = p * 3;
        const drew = f & 2;
        const origChanged = f & 4;
        let differs = !near(c, o3, orig, o3, tolerance);
        let kind = PIXEL.MATCH;
        let subbed = false;
        if (differs) {
            rawDiff++;
            const to = drew ? substitution.get(rgbKey(c, o3)) : undefined;
            if (to !== undefined) {
                sub.set(keyToRgb(to));
                if (near(sub, 0, orig, o3, tolerance)) {
                    differs = false;
                    subbed = true;
                    remapped++;
                    kind = PIXEL.REMAP;
                }
            }
        }
        // the backdrop view uses the same substitution for pixels ours drew
        if (!near(cb, o3, orig, o3, tolerance) && !subbed) diffOnBackdrop++;
        if (!drew && origChanged && !(f & 8) && isBlack(orig, o3, tolerance)) {
            eb0++;
            if (y < TOP_ROWS) eb0Top++;
            kind = PIXEL.EB0;
        }
        if (differs) {
            diff++;
            if (y < TOP_ROWS) diffTop++;
            else diffBottom++;
            if (drew && !origChanged) {
                oursOnly++;
                kind = PIXEL.OURS_ONLY;
            } else if (!drew) {
                origOnly++;
                kind = PIXEL.ORIG_ONLY;
            } else {
                mismatch++;
                kind = PIXEL.MISMATCH;
            }
        }
        if (map) map[p] = kind;
    }
    const pct = (n, d) => (d ? (100 * n) / d : 0);
    return {
        mask,
        diff,
        diffPct: pct(diff, mask),
        rawDiffPct: pct(rawDiff, mask),
        remapped,
        remapPct: pct(remapped, mask),
        remap: [...substitution].map(([a, b]) => [hex(a), hex(b)]),
        diffOnBackdrop,
        diffOnBackdropPct: pct(diffOnBackdrop, mask),
        oursOnly,
        origOnly,
        mismatch,
        eb0,
        eb0Top,
        backdropTop,
        eb0TopPct: pct(eb0Top, backdropTop),
        diffTop,
        diffBottom,
        stale,
    };
};

const MAP_COLORS = [
    [0, 0, 0], // outside the mask
    [60, 60, 60], // match
    [0, 160, 255], // ours only
    [255, 160, 0], // original only
    [255, 0, 0], // both drew, different colours
    [0, 200, 0], // original shows its (black) plate, ours the backdrop
    [200, 0, 200], // palette substitution
];

/** Category map as RGB: grey match, red mismatch, blue ours-only, orange orig-only, green eb0, magenta palette. */
export const mapToRgb = (map) => {
    const rgb = new Uint8Array(map.length * 3);
    for (let p = 0; p < map.length; p++) rgb.set(MAP_COLORS[map[p]], p * 3);
    return { width: WIDTH, height: HEIGHT, rgb };
};

/**
 * Where does our foreground best line up with the original? For every opaque
 * foreground pixel, test offsets in [-radius, radius]^2 and return the one with the
 * highest colour-match rate. A consistent non-zero offset across keyframes is a
 * placement difference (e.g. sprites one pixel left), not noise.
 * @returns {{dx:number, dy:number, rate:number, rate0:number, pixels:number}}
 */
export const foregroundShift = ({ orig, fg, radius = 2, tolerance = DEFAULT_TOLERANCE }) => {
    let best = { dx: 0, dy: 0, rate: -1 };
    let rate0 = 0;
    let pixels = 0;
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            let n = 0;
            let ok = 0;
            for (let y = radius; y < HEIGHT - radius; y++) {
                for (let x = radius; x < WIDTH - radius; x++) {
                    const p = y * WIDTH + x;
                    if (!fg[p * 4 + 3]) continue;
                    n++;
                    const q = ((y + dy) * WIDTH + x + dx) * 3;
                    if (near(fg, p * 4, orig, q, tolerance)) ok++;
                }
            }
            const rate = n ? ok / n : 0;
            if (dx === 0 && dy === 0) {
                rate0 = rate;
                pixels = n;
            }
            if (rate > best.rate + 1e-9) best = { dx, dy, rate };
        }
    }
    return { dx: best.dx, dy: best.dy, rate: best.rate, rate0, pixels };
};

/**
 * Host drawing that appears in the original right after the forced load and that
 * our first frame does not explain: in forced captures, a band of the host's
 * animated shoreline waves (y ~295-360) keeps being drawn over whatever the gag
 * shows. It is host-owned, like the island, so the comparator ignores it.
 * A pixel is "explained" when one of our drawn pixels within `radius` has its
 * colour (this tolerates the one-pixel placement offset).
 * @param {object} o
 * @param {Uint8Array} o.first     original dump at the episode's first live tick, RGB
 * @param {Uint8Array} o.backdrop  original dump at the load, RGB
 * @param {Uint8ClampedArray} o.fg our foreground at our first live tick, RGBA
 * @param {Uint8ClampedArray} o.bg our background at that tick, RGBA
 * @param {string} o.bgKind
 * @returns {Uint8Array} 1 = ignore
 */
export const hostRemnantMask = ({ first, backdrop, fg, bg, bgKind, radius = 2, tolerance = DEFAULT_TOLERANCE }) => {
    const N = WIDTH * HEIGHT;
    const ignore = new Uint8Array(N);
    const ourAt = (q) => {
        if (fg[q * 4 + 3]) return fg;
        if (bgKind === 'gag' && bg[q * 4 + 3] && !isBlack(bg, q * 4, tolerance)) return bg;
        return null;
    };
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            const p = y * WIDTH + x;
            const o3 = p * 3;
            if (isBlack(first, o3, tolerance) || near(first, o3, backdrop, o3, tolerance)) continue;
            let explained = false;
            for (let dy = -radius; dy <= radius && !explained; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= HEIGHT) continue;
                for (let dx = -radius; dx <= radius && !explained; dx++) {
                    const xx = x + dx;
                    if (xx < 0 || xx >= WIDTH) continue;
                    const q = yy * WIDTH + xx;
                    const src = ourAt(q);
                    if (src && near(src, q * 4, first, o3, tolerance)) explained = true;
                }
            }
            if (!explained) ignore[p] = 1;
        }
    }
    return ignore;
};

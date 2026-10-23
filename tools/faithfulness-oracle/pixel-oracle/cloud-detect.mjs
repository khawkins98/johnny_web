// cloud-detect.mjs -- find the host clouds (BACKGRND frames 15/16/17, plain or
// mirrored) in a 640x480 RGB dump of the original, so the host check can paint
// the same clouds on our side and score the sky, and so normal-play reports can
// compare the original's cloud mix with ours.
//
// The original lays clouds out once per bake (FUN_1010_0a38) and never moves them
// within the batch (src/games/johnny/clouds.mjs), so one clean frame per batch
// is enough. Clouds sit in rows 1..139. A mirrored cloud shows one pixel right of
// its slot x; `x` here is the slot x (what titleState.clouds holds).
//
// Matching: each sprite's opaque pixels against the dump; white must match white
// (within the DAC tolerance) and the grey shading may also show as Windows'
// static-colour substitute, so any light pixel counts. A placement is accepted
// when MIN_SCORE of its on-screen pixels match; overlapping hits keep the best.
import { buildSpriteCanvas } from '../../../src/dgds/graphics.mjs';
import { resolveEntry } from '../../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { SoftCanvas, installSoftDocument } from './soft-canvas.mjs';

const W = 640;
const SKY_ROWS = 140;
const TOLERANCE = 12;
const MIN_SCORE = 0.9;
const ANCHORS = 48;

let spriteCache = null;
const cloudSprites = () => {
    if (spriteCache) return spriteCache;
    installSoftDocument();
    const sheet = resolveEntry('BACKGRND.BMP');
    if (!sheet) return (spriteCache = []);
    spriteCache = [];
    for (const frame of [17, 16, 15]) {
        const image = sheet.images[frame];
        const canvas = new SoftCanvas(image.width, image.height);
        canvas.getContext('2d').drawImage(buildSpriteCanvas(image), 0, 0);
        for (const flipX of [false, true]) {
            const pixels = [];
            for (let y = 0; y < image.height; y++) {
                for (let x = 0; x < image.width; x++) {
                    const sx = flipX ? image.width - 1 - x : x;
                    const i = (y * image.width + sx) * 4;
                    if (canvas.data[i + 3] === 0) continue;
                    pixels.push([x, y, canvas.data[i], canvas.data[i + 1], canvas.data[i + 2]]);
                }
            }
            const step = Math.max(1, Math.floor(pixels.length / ANCHORS));
            const anchors = pixels.filter((_, i) => i % step === 0);
            spriteCache.push({ frame, flipX, width: image.width, height: image.height, pixels, anchors });
        }
    }
    return spriteCache;
};

const matches = (rgb, x, y, p) => {
    const o = (y * W + x) * 3;
    const white = p[2] === 255 && p[3] === 255 && p[4] === 255;
    if (
        Math.abs(rgb[o] - p[2]) <= TOLERANCE &&
        Math.abs(rgb[o + 1] - p[3]) <= TOLERANCE &&
        Math.abs(rgb[o + 2] - p[4]) <= TOLERANCE
    ) {
        return true;
    }
    return !white && rgb[o] >= 150 && rgb[o + 1] >= 150 && rgb[o + 2] >= 150;
};

const score = (rgb, sprite, x, y, points) => {
    let hit = 0;
    let total = 0;
    for (const p of points) {
        const px = x + p[0];
        const py = y + p[1];
        if (px < 0 || px >= W || py < 0 || py >= SKY_ROWS) continue;
        total++;
        if (matches(rgb, px, py, p)) hit++;
    }
    return { hit, total };
};

/**
 * Clouds in an RGB dump: [{ frame, x, y, flipX, score }], x the slot x.
 * @param {Uint8Array} rgb 640x480x3
 */
export const detectClouds = (rgb) => {
    const hits = [];
    for (const sprite of cloudSprites()) {
        for (let y = 0; y + sprite.height <= SKY_ROWS; y++) {
            for (let x = -1; x + sprite.width <= W + 1; x++) {
                const a = score(rgb, sprite, x, y, sprite.anchors);
                if (a.total < ANCHORS / 2 || a.hit < a.total * MIN_SCORE) continue;
                const full = score(rgb, sprite, x, y, sprite.pixels);
                if (full.hit < full.total * MIN_SCORE) continue;
                hits.push({ ...sprite, x, y, hit: full.hit, ratio: full.hit / full.total });
            }
        }
    }
    // Strongest first; a weaker hit overlapping a kept cloud by more than half its
    // own area is the same cloud seen through another sprite or offset.
    hits.sort((a, b) => b.hit - a.hit);
    const kept = [];
    for (const h of hits) {
        const overlaps = kept.some((k) => {
            const ox = Math.max(0, Math.min(h.x + h.width, k.x + k.width) - Math.max(h.x, k.x));
            const oy = Math.max(0, Math.min(h.y + h.height, k.y + k.height) - Math.max(h.y, k.y));
            return ox * oy > (h.width * h.height) / 2;
        });
        if (!overlaps) kept.push(h);
    }
    return kept
        .sort((a, b) => a.x - b.x || a.y - b.y)
        .map((h) => ({
            frame: h.frame,
            x: h.x - (h.flipX ? 1 : 0),
            y: h.y,
            flipX: h.flipX,
            score: Math.round(h.ratio * 1000) / 1000,
        }));
};

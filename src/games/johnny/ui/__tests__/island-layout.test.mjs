import { describe, expect, it } from 'vitest';
import { islandLayout, titleScale } from '../island-layout.mjs';

describe('island cabinet picture geometry', () => {
    it.each([
        [1940, 1200, 1042],
        [1440, 1000, 842],
        [1024, 768, 610],
        [390, 844, 562],
    ])('fits %i×%i above the shelf without changing the 4:3 source aperture', (width, height, shelfTop) => {
        const frame = islandLayout(width, height, shelfTop);
        expect(frame.left).toBeGreaterThanOrEqual(0);
        expect(frame.left + frame.width).toBeLessThanOrEqual(width);
        expect(frame.top + frame.height).toBeLessThanOrEqual(shelfTop);
        expect(frame.picture.width / frame.picture.height).toBeCloseTo(4 / 3, 8);
        // The anchored Log starts after the picture, over the coconut controls.
        expect(frame.left + frame.width * 0.71).toBeGreaterThan(frame.picture.left + frame.picture.width);
    });
});

it.each([
    [0.585, 0.5],
    [1, 1],
    [1.49, 1],
    [1.5, 1.5],
    [1.99, 1.5],
    [2, 2],
    [2.9, 2.5],
])('snaps title fit %s to %s× native source pixels', (fit, expected) => {
    expect(titleScale(400 * fit, 300 * fit, 400, 300)).toBe(expected);
});
it('makes room for the minimum title step on a phone without shrinking its source pixels', () => {
    const frame = islandLayout(390, 844, 558, { width: 397 * 0.5, height: 287 * 0.5 });
    expect(titleScale(frame.picture.width, frame.picture.height, 397, 287)).toBe(0.5);
    expect(frame.picture.width).toBeGreaterThanOrEqual(397 * 0.5);
});

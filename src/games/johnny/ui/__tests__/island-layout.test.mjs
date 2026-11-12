import { describe, expect, it } from 'vitest';
import { islandLayout, titleScale, deviceStepScale, isDeviceSharp, deviceSnapOffset, prefersDeviceStep } from '../island-layout.mjs';

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

// Same thresholds as the research lab's Auto policy (tools/presentation-lab/scaling.test.mjs).
it.each([
    [959, 720, 2, 1], [960, 719, 2, 1], [960, 720, 2, 1.5],
    [1000, 750, 1, 1], [1000, 750, 1.25, 0.8], [375, 667, 2, 0.5], [375, 667, 1, 375 / 640],
])('steps a %i×%i area at DPR %s to %s×', (width, height, dpr, expected) => {
    expect(deviceStepScale(width, height, dpr, 640, 480)).toBeCloseTo(expected, 10);
});
it('reports equal pixel blocks only at whole device multiples', () => {
    expect(isDeviceSharp(1.5, 2)).toBe(true);
    expect(isDeviceSharp(1.5, 1)).toBe(false);
    expect(isDeviceSharp(1.2, 2)).toBe(false);
    expect(isDeviceSharp(0.8, 1.25)).toBe(true);
    expect(isDeviceSharp(0.5, 1)).toBe(false);
});
it('snaps an edge to the nearest device pixel', () => {
    expect(deviceSnapOffset(20.5, 2)).toBe(0);
    expect(deviceSnapOffset(20.25, 2)).toBeCloseTo(0.25, 10);
    expect(deviceSnapOffset(180.5, 1)).toBeCloseTo(0.5, 10);
});
it.each([
    [1000, 750, 2, true],   // 1.5× of a 1.56× fit
    [768, 576, 1, true],    // 1× of a 1.2× fit (83%)
    [620, 465, 2, false],   // 0.5× of a 0.97× fit
    [900, 675, 1, false],   // 1× of a 1.41× fit
    [375, 667, 1, false],   // no clean step below one device pixel
])('Automatic at %i×%i, DPR %s takes the clean step: %s', (width, height, dpr, expected) => {
    expect(prefersDeviceStep(width, height, dpr, 640, 480)).toBe(expected);
});

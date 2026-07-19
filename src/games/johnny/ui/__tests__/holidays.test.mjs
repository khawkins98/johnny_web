import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHolidayOverlay, holidayForDate } from '../holidays.mjs';

describe('Johnny holiday overlays', () => {
    beforeEach(() => {
        vi.stubGlobal('document', {
            createElement: () => ({
                width: 0,
                height: 0,
                getContext: () => ({
                    createImageData: (width, height) => ({
                        data: new Uint8ClampedArray(width * height * 4),
                    }),
                    putImageData: vi.fn(),
                }),
            }),
        });
    });

    it.each([
        ['St Patrick\'s Day', new Date(2026, 2, 15), 1],
        ['Halloween', new Date(2026, 9, 31), 0],
        ['Christmas', new Date(2026, 11, 25), 2],
        ['New Year', new Date(2027, 0, 1), 3],
    ])('selects %s on its historical date range', (_name, date, sprite) => {
        expect(holidayForDate(date)?.sprite).toBe(sprite);
    });

    it('does not select a decoration on an ordinary day', () => {
        expect(holidayForDate(new Date(2026, 6, 19))).toBeNull();
    });

    it('stamps the decoded sprite at the island-relative historical coordinates', () => {
        const holiday = {
            images: Array.from({ length: 4 }, () => ({
                width: 1,
                height: 1,
                pixels: [{ r: 1, g: 2, b: 3, a: 255 }],
            })),
        };
        const resourceProvider = { resolve: vi.fn(() => holiday) };
        const context = { drawImage: vi.fn() };
        const overlay = createHolidayOverlay({
            resourceProvider,
            now: () => new Date(2026, 11, 25),
        });
        const state = {
            backgroundId: 2,
            game: { background: { layouts: { 2: { x: 16 } } } },
        };

        expect(overlay(state, context)).toBe(true);
        expect(resourceProvider.resolve).toHaveBeenCalledWith('HOLIDAY.BMP');
        expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 132, 267);
    });
});

import { describe, expect, it } from 'vitest';
import { presets, sanitizeSettings, readPresets, readStored, writeStored } from './presets.mjs';

describe('CRT preference boundaries', () => {
    it('bounds untrusted storage values and rejects coerced or nonfinite inputs', () => {
        expect(sanitizeSettings({ blur: 100, bleed: -1, bloom: '1', curvature: Infinity, bypass: 'true' }))
            .toEqual({ blur: 2, bleed: 0, bloom: 0, scanlines: 0, curvature: 0, vignette: 0, bypass: false });
        expect(sanitizeSettings(null)).toEqual(sanitizeSettings());
    });
    it('retains the screenshot values exactly', () => {
        expect(presets.balanced).toEqual({ blur: 1, bleed: 0.7, bloom: 0.08, scanlines: 0.1, curvature: 0.01, vignette: 0.05 });
    });
    it('recovers from corrupt, unavailable, or incompatible storage', () => {
        expect(readStored({ getItem: () => '{' }, 'key', 'fallback')).toBe('fallback');
        expect(readPresets({ getItem: () => '{"wrong":true}' })).toEqual([]);
        expect(readPresets(undefined)).toEqual([]);
        expect(writeStored({ setItem() { throw Error('Quota exceeded'); } }, 'key', {})).toBe(false);
    });
    it('bounds preset counts and names and sanitizes each preset', () => {
        const raw = Array.from({ length: 25 }, () => ({ name: ' x'.repeat(30), settings: { blur: 999 } }));
        const entries = readPresets({ getItem: () => JSON.stringify(raw) });
        expect(entries).toHaveLength(20);
        expect(entries[0].name.length).toBe(40);
        expect(entries[0].settings.blur).toBe(2);
    });
});

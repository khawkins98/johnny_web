import { describe, expect, it, vi } from 'vitest';
import { createEntryResourceProvider } from '../resource-provider.mjs';

describe('entry resource provider', () => {
    it('resolves an exact archive name through the injected decoder', () => {
        const entry = { name: 'SPRITES.BMP', buffer: new ArrayBuffer(0) };
        const decoded = { name: entry.name, images: [] };
        const decode = vi.fn(() => decoded);
        const provider = createEntryResourceProvider([entry], { decode });

        expect(provider.has('SPRITES.BMP')).toBe(true);
        expect(provider.resolve('SPRITES.BMP')).toBe(decoded);
        expect(decode).toHaveBeenCalledWith(entry);
    });

    it('returns undefined without invoking the decoder for a missing name', () => {
        const decode = vi.fn();
        const provider = createEntryResourceProvider([], { decode });

        expect(provider.resolve('MISSING.TTM')).toBeUndefined();
        expect(decode).not.toHaveBeenCalled();
    });
});


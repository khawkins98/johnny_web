import { describe, expect, it, vi } from 'vitest';
import { withHostBackground } from '../host-background.mjs';

describe('withHostBackground', () => {
    const context = {};

    it('redraws the host background when the runtime has no screen or ocean', () => {
        // WALKSTUF.ADS #1 (WOULDBEAS) never runs the WOULDBE tag that loads
        // ISLETEMP.SCR, so the runtime has nothing of its own to draw.
        const hostState = { name: 'host island' };
        const presentHost = vi.fn(() => hostState);
        const decorate = vi.fn();
        const decorator = withHostBackground({ presentHost, backgroundDecorator: decorate });

        decorator({ bkgScreen: null, bkgOcean: [] }, context);

        expect(presentHost).toHaveBeenCalledWith(context);
        expect(decorate).toHaveBeenCalledWith(hostState, context);
    });

    it('leaves a runtime-loaded screen alone', () => {
        const presentHost = vi.fn();
        const decorate = vi.fn();
        const decorator = withHostBackground({ presentHost, backgroundDecorator: decorate });
        const runtimeState = { bkgScreen: { name: 'OCEAN02.SCR' }, bkgOcean: [{}] };

        decorator(runtimeState, context);

        expect(presentHost).not.toHaveBeenCalled();
        expect(decorate).toHaveBeenCalledWith(runtimeState, context);
    });

    it('decorates the runtime state when the host has no background to offer', () => {
        const presentHost = vi.fn(() => null);
        const decorate = vi.fn();
        const decorator = withHostBackground({ presentHost, backgroundDecorator: decorate });
        const runtimeState = { bkgScreen: null, bkgOcean: [] };

        decorator(runtimeState, context);

        expect(decorate).toHaveBeenCalledWith(runtimeState, context);
    });

    it('works without a decorator', () => {
        const presentHost = vi.fn(() => ({}));
        const decorator = withHostBackground({ presentHost, backgroundDecorator: null });

        expect(() => decorator({ bkgScreen: null, bkgOcean: [] }, context)).not.toThrow();
        expect(presentHost).toHaveBeenCalledOnce();
    });
});

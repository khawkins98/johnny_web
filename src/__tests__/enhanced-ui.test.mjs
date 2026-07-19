import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../dgds/scripting/process.mjs', () => ({
    __DEBUG__: {
        getPresentation: vi.fn(() => ({ scene: 11, name: 'GULL 2 BATHING', playbackRate: 1 })),
        stepScene: vi.fn(),
        setPlaybackRate: vi.fn(),
    },
}));

import { setupEnhancedUI } from '../enhanced-ui.mjs';

describe('enhanced playback HUD', () => {
    beforeEach(() => {
        document.head.querySelectorAll('style').forEach(style => style.remove());
        document.body.innerHTML = '';
        vi.stubGlobal('requestAnimationFrame', vi.fn());
    });

    it('can be dismissed and restored with H', () => {
        setupEnhancedUI();
        const hud = document.getElementById('enhanced-hud');

        document.getElementById('enhanced-hud-dismiss').click();
        expect(hud.classList.contains('is-hidden')).toBe(true);
        expect(hud.getAttribute('aria-hidden')).toBe('true');

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
        expect(hud.classList.contains('is-hidden')).toBe(false);
        expect(hud.getAttribute('aria-hidden')).toBe('false');
    });
});

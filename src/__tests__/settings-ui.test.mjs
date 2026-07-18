import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupSettingsUI, SOUND_SETTING_KEY } from '../settings-ui.mjs';

describe('settings UI', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="root"><canvas></canvas></div>';
        localStorage.clear();
    });

    it('opens before playback and persists live sound changes', () => {
        const audioManager = { setEnabled: vi.fn() };
        const settings = setupSettingsUI({ getAudioManager: () => audioManager });
        const overlay = document.getElementById('settings-overlay');
        const sound = overlay.querySelector('[data-setting="sound"]');

        expect(sound.value).toBe('on');
        settings.open();
        expect(overlay.style.display).toBe('flex');
        expect(overlay.getAttribute('aria-hidden')).toBe('false');

        sound.value = 'off';
        sound.dispatchEvent(new Event('change'));
        expect(localStorage.getItem(SOUND_SETTING_KEY)).toBe('off');
        expect(audioManager.setEnabled).toHaveBeenCalledWith(false);

        settings.close();
        expect(overlay.style.display).toBe('none');
        expect(overlay.getAttribute('aria-hidden')).toBe('true');
    });
});


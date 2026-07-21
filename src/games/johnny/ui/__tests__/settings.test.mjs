import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPERIENCE_SETTING_KEY, setupSettingsUI, SOUND_SETTING_KEY } from '../settings.mjs';

describe('settings UI', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="root"><canvas></canvas></div>';
        localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
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

    it('applies coherent classic and enhanced profiles', () => {
        const settings = setupSettingsUI();
        const setting = (name) => document.querySelector(`[data-setting="${name}"]`);

        settings.applyExperience('enhanced');
        expect(localStorage.getItem(EXPERIENCE_SETTING_KEY)).toBe('enhanced');
        expect(setting('experience').value).toBe('enhanced');
        expect(setting('scale').value).toBe('freeform');
        expect(setting('clouds').value).toBe('on');
        expect(setting('waves').value).toBe('on');

        settings.applyExperience('classic');
        expect(setting('experience').value).toBe('classic');
        expect(setting('scale').value).toBe('native');
        expect(setting('clouds').value).toBe('off');
        expect(setting('waves').value).toBe('on');
    });

    it('offers full screen and a footer close action', () => {
        const settings = setupSettingsUI();
        settings.open();

        expect(document.querySelector('[data-setting="fullscreen"]')).not.toBeNull();
        const done = document.querySelector('.settings-done');
        done.click();
        expect(document.getElementById('settings-overlay').getAttribute('aria-hidden')).toBe('true');
    });

    it('reveals a temporary settings cog on mouse movement', () => {
        vi.useFakeTimers();
        setupSettingsUI();
        const cog = document.getElementById('settings-cog');

        window.dispatchEvent(new MouseEvent('mousemove'));
        expect(cog.classList.contains('is-visible')).toBe(true);
        expect(cog.getAttribute('aria-hidden')).toBe('false');

        vi.advanceTimersByTime(2400);
        expect(cog.classList.contains('is-visible')).toBe(false);
        expect(cog.getAttribute('aria-hidden')).toBe('true');
    });

    it('shows the key guide and can return to the title', () => {
        const onRestart = vi.fn();
        setupSettingsUI({ onRestart });

        expect([...document.querySelectorAll('.settings-shortcut kbd')].map((key) => key.innerText)).toEqual([
            '←',
            '→',
            '↑',
            '↓',
            'H',
            'S',
            'D',
            'F',
            'R',
            'Esc',
        ]);

        document.querySelector('[data-setting="restart"]').click();
        expect(onRestart).toHaveBeenCalledOnce();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
        expect(onRestart).toHaveBeenCalledTimes(2);
    });
});

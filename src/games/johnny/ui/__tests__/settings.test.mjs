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
        expect(document.querySelector('#jc-crt-enabled').checked).toBe(false);
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

    it('remembers picture models independently while keeping CRT off', () => {
        setupSettingsUI();
        const model=document.querySelector('#jc-crt-model');
        model.value='vga';model.dispatchEvent(new Event('change'));
        const beam=document.querySelector('#vga-beam');beam.value='0.45';beam.dispatchEvent(new Event('input'));
        let saved=JSON.parse(localStorage.getItem('jc-crt-v1'));
        expect(saved.model).toBe('vga');expect(saved.vga.beam).toBe(.45);expect(saved.settings.blur).toBe(1);
        model.value='lottes';model.dispatchEvent(new Event('change'));
        saved=JSON.parse(localStorage.getItem('jc-crt-v1'));
        expect(saved.lottes.maskType).toBe(3);expect(saved.vga.beam).toBe(.45);
        expect(document.querySelector('#jc-crt-enabled').checked).toBe(false);
        expect(document.querySelector('#johnny-crt-output')).toBeNull();
        document.body.innerHTML='<div id="root"><canvas></canvas></div>';
        setupSettingsUI();expect(document.querySelector('#jc-crt-model').value).toBe('lottes');
        expect(document.querySelector('[data-crt-panel="vga"]').hidden).toBe(true);
    });

    it('clears the Integer canvas filter when changing scaling modes', () => {
        setupSettingsUI();
        const scale = document.querySelector('[data-setting="scale"]');
        const canvas = document.querySelector('#root canvas');
        for (const mode of ['native', 'freeform', 'stretch']) {
            scale.value = 'integer'; scale.dispatchEvent(new Event('change'));
            expect(canvas.style.imageRendering).toBe('pixelated');
            scale.value = mode; scale.dispatchEvent(new Event('change'));
            expect(canvas.style.imageRendering).toBe('auto');
        }
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
            'T',
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

    it('shows the story day and restarts the story on request', () => {
        const storyController = {
            getStoryDay: vi.fn(() => 4),
            getStartTime: vi.fn(() => 1030),
            resetStory: vi.fn(() => 1),
        };
        setupSettingsUI({ storyController });

        const status = document.getElementById('settings-story-status');
        expect(status.innerText).toBe('Day 4 of 11');

        storyController.getStoryDay.mockReturnValue(1);
        document.querySelector('[data-setting="restart-story"]').click();
        expect(storyController.resetStory).toHaveBeenCalledOnce();
        expect(status.innerText).toBe('Day 1 of 11');
    });

    describe('Start Time', () => {
        const control = (name) => document.querySelector(`[data-setting="${name}"]`);

        it('shows 09:00 by default with one line of help', () => {
            setupSettingsUI();
            expect(control('start-time').textContent).toBe('09:00');
            const help = document.getElementById('settings-start-time-help');
            expect(help.textContent).toContain('Night falls 6 hours after this time, for 2 hours, every 8 hours.');
            expect(help.textContent).toContain('Live Local Clock');
            expect(control('start-time-earlier').getAttribute('aria-describedby')).toBe('settings-start-time-help');
        });

        it('steps by half an hour, wraps at midnight and persists HHMM', () => {
            setupSettingsUI();
            control('start-time-later').click();
            expect(control('start-time').textContent).toBe('09:30');
            expect(localStorage.getItem('jc-start-time-hhmm')).toBe('930');

            for (let i = 0; i < 3; i++) control('start-time-earlier').click();
            expect(control('start-time').textContent).toBe('08:00');
            expect(localStorage.getItem('jc-start-time-hhmm')).toBe('800');

            localStorage.setItem('jc-start-time-hhmm', '2330');
            document.body.innerHTML = '<div id="root"><canvas></canvas></div>';
            setupSettingsUI();
            expect(control('start-time').textContent).toBe('23:30');
            control('start-time-later').click();
            expect(control('start-time').textContent).toBe('00:00');
            expect(localStorage.getItem('jc-start-time-hhmm')).toBe('0');
            control('start-time-earlier').click();
            expect(control('start-time').textContent).toBe('23:30');
        });

        it('drops a legacy first-run date and shows 09:00', () => {
            localStorage.setItem('jc-start-time', '1022');
            setupSettingsUI();
            expect(control('start-time').textContent).toBe('09:00');
            expect(localStorage.getItem('jc-start-time')).toBeNull();
        });

        it('resets to 09:00 and clears the override', () => {
            localStorage.setItem('jc-start-time-hhmm', '1500');
            setupSettingsUI();
            expect(control('start-time').textContent).toBe('15:00');
            expect(control('start-time-reset').disabled).toBe(false);
            control('start-time-reset').click();
            expect(control('start-time').textContent).toBe('09:00');
            expect(localStorage.getItem('jc-start-time-hhmm')).toBeNull();
            expect(control('start-time-reset').disabled).toBe(true);
        });

        it('is reachable from the keyboard and announces the new time', () => {
            setupSettingsUI();
            const value = control('start-time');
            expect(value.getAttribute('aria-live')).toBe('polite');
            for (const name of ['start-time-earlier', 'start-time-later', 'start-time-reset']) {
                expect(control(name).tagName).toBe('BUTTON');
                expect(control(name).getAttribute('aria-label')).toMatch(/start time/i);
            }
        });
    });

    it('omits the story section entirely without a story controller', () => {
        setupSettingsUI();
        expect(document.querySelector('[data-setting="restart-story"]')).toBeNull();
    });

    it('degrades gracefully when the controller lacks the story-day API (does not throw)', () => {
        // Regression: browser-app once passed a limited sequence-tools object as
        // storyController (no getStoryDay), which hard-crashed settings init.
        const limited = { status: () => null, subscribeStatus: () => () => {} };
        expect(() => setupSettingsUI({ storyController: limited })).not.toThrow();
        const status = document.getElementById('settings-story-status');
        if (status) expect(status.innerText).toBe('');
    });
});

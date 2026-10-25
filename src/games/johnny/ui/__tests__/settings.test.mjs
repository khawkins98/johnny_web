import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupSettingsUI, SOUND_SETTING_KEY } from '../settings.mjs';

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

    it('starts with one set of good defaults and exposes tuning only on request', () => {
        setupSettingsUI();
        const setting = (name) => document.querySelector(`[data-setting="${name}"]`);
        expect(setting('experience')).toBeNull();
        expect(setting('scale').value).toBe('stretch');
        expect(setting('clouds').value).toBe('on');
        expect(setting('waves').value).toBe('on');
        expect(setting('time').value).toBe('original');
        expect(document.querySelector('#jc-crt-look').value).toBe('balanced');
        expect(document.querySelector('#jc-crt-enabled').checked).toBe(true);
        expect([...document.querySelectorAll('#settings-modal details')].every(d => !d.open)).toBe(true);
        expect(setting('scale').closest('details').id).toBe('settings-fine-tuning');
        expect(document.querySelector('#jc-crt-look').closest('details')).toBeNull();
    });

    it('preserves individual preferences from an old profile across launches', () => {
        localStorage.setItem('jc-experience', 'classic');
        localStorage.setItem('jc-scale-mode', 'integer');
        localStorage.setItem('jc-clouds', 'off');
        localStorage.setItem('jc-time', 'local');
        localStorage.setItem('jc-sound', 'off');
        localStorage.setItem('jc-crt-v1', JSON.stringify({ enabled: false }));
        setupSettingsUI();
        expect(document.querySelector('#jc-crt-look').value).toBe('original');
        expect(localStorage.getItem('jc-experience')).toBeNull();
        for (const [key, value] of [['scale', 'integer'], ['clouds', 'off'], ['time', 'local'], ['sound', 'off']]) {
            expect(document.querySelector(`[data-setting="${key}"]`).value).toBe(value);
        }
    });

    it('remembers picture models independently while keeping CRT off', () => {
        localStorage.setItem('jc-crt-v1', JSON.stringify({ enabled: false }));
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
            'Space',
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

it('fits the live picture into the cabinet and keeps its rectangle stable when Log opens', () => {
    document.body.innerHTML = '<div id="root"><canvas></canvas></div><section id="enhanced-hud"><div id="jc-cabinet"></div><nav id="jc-deck"></nav><aside id="jc-log" hidden></aside></section>';
    document.body.classList.add('jc-deck-visible');
    const deck = document.getElementById('jc-deck');
    vi.spyOn(deck, 'getBoundingClientRect').mockReturnValue({ top: 600 });
    try {
        const settings = setupSettingsUI();
        const root = document.getElementById('root');
        const rectStyles = [root.style.left,root.style.top,root.style.width,root.style.height];
        expect(parseFloat(root.style.width) / parseFloat(root.style.height)).toBeCloseTo(4 / 3, 8);
        document.getElementById('jc-log').hidden = false;
        settings.refreshLayout();
        expect([root.style.left,root.style.top,root.style.width,root.style.height]).toEqual(rectStyles);
        document.body.classList.remove('jc-deck-visible');
        document.getElementById('enhanced-hud').classList.add('is-hidden');
        settings.refreshLayout();
        expect(root.style.left).toBe('50%');
        expect(root.style.top).toBe('50%');
    } finally {
        document.body.classList.remove('jc-deck-visible');
    }
});

it('gives the core settings their visible associated labels and keeps the close button in the header', () => {
    document.body.innerHTML = '<div id="root"><canvas></canvas></div>';
    setupSettingsUI();
    for (const key of ['scale','sound','clouds','waves','time','diagnostics']) {
        const select = document.getElementById('jc-setting-'+key);
        expect(select.labels).toHaveLength(1);
        expect(select.labels[0].htmlFor).toBe(select.id);
    }
    expect(document.querySelector('.settings-header .close-btn')).not.toBeNull();
    expect(document.querySelector('.settings-header #settings-title')).not.toBeNull();
});

it('isolates Settings from launch/playback controls and preserves an already hidden HUD on close', () => {
    document.body.innerHTML = '<div id="root"><canvas></canvas></div><section id="enhanced-hud"></section><div id="start-overlay"><button>Launch</button></div>';
    const hud = document.getElementById('enhanced-hud');
    hud.inert = true;
    const settings = setupSettingsUI();
    settings.open();
    expect(document.getElementById('start-overlay').inert).toBe(true);
    expect(document.getElementById('root').inert).toBe(true);
    settings.open(); // Repeated opening must not overwrite the saved background state.
    settings.close();
    expect(document.getElementById('root').inert).toBe(false);
    expect(document.getElementById('start-overlay').inert).toBe(false);
    expect(hud.inert).toBe(true);
});

it('cycles the physical picture dial through actual CRT presets and models', () => {
 document.body.innerHTML='<div id="root"><canvas></canvas></div>';localStorage.clear();const settings=setupSettingsUI();
 expect(document.getElementById('jc-crt-look').value).toBe('balanced');
 expect(settings.cyclePicturePreset()).toBe('Soft CRT');expect(document.getElementById('jc-crt-enabled').checked).toBe(true);
 expect(settings.cyclePicturePreset()).toBe('VGA beam');expect(document.getElementById('jc-crt-model').value).toBe('vga');
 expect(settings.cyclePicturePreset()).toBe('CRT-Lottes');expect(document.getElementById('jc-crt-model').value).toBe('lottes');
 expect(settings.cyclePicturePreset()).toBe('Original picture');expect(document.getElementById('jc-crt-enabled').checked).toBe(false);
});

// TV-off fits the page at half steps without changing the saved cabinet preference.
it.each([
    [1940, 1200, 2.5], [1440, 1000, 2], [1024, 768, 1.5], [390, 844, 0.5],
])('fits TV-off playback at half steps in %i×%i', (width, height, scale) => {
    document.body.innerHTML = '<div id="root"><canvas width="640" height="480"></canvas></div><section id="enhanced-hud" class="is-hidden"><div id="jc-cabinet"></div><nav id="jc-deck"></nav></section>';
    document.body.classList.remove('jc-deck-visible', 'jc-full-view');
    localStorage.setItem('jc-scale-mode', 'native');
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);
    try {
        const settings = setupSettingsUI();
        const root = document.querySelector('#root');
        expect(root.style.transform).toBe(`scale(${scale})`);
        expect(root.style.imageRendering).toBe('pixelated');
        expect(root.querySelector('canvas').width).toBe(640);
        expect(root.querySelector('canvas').height).toBe(480);
        expect(localStorage.getItem('jc-scale-mode')).toBe('native');
        const hud = document.querySelector('#enhanced-hud');
        hud.classList.remove('is-hidden');
        document.body.classList.add('jc-deck-visible');
        vi.spyOn(document.querySelector('#jc-deck'), 'getBoundingClientRect').mockReturnValue({ top: height - 170 });
        settings.refreshLayout();
        // Native preference returns in the cabinet, instead of the TV-off auto zoom.
        expect(root.style.transform).not.toBe(`scale(${scale})`);
        expect(localStorage.getItem('jc-scale-mode')).toBe('native');
    } finally {
        document.body.classList.remove('jc-deck-visible', 'jc-full-view');
        vi.unstubAllGlobals();
    }
});

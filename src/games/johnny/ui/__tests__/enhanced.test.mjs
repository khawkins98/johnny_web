import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../dgds/scripting/process.mjs', () => ({
    __DEBUG__: {
        getPresentation: vi.fn(() => ({ scene: 11, name: 'GULL 2 BATHING', playbackRate: 1 })),
        stepScene: vi.fn(),
        setPlaybackRate: vi.fn(),
    },
}));

import { setupEnhancedUI, SHELF_SETTING_KEY } from '../enhanced.mjs';
import { browserPlayback } from '../../../../dgds/hosts/browser-playback.mjs';
import { __DEBUG__ } from '../../../../dgds/scripting/process.mjs';

describe('enhanced playback HUD', () => {
    beforeEach(() => {
        document.head.querySelectorAll('style').forEach((style) => style.remove());
        document.body.innerHTML = '';
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    it('can be dismissed and restored with H', () => {
        const enhanced = setupEnhancedUI();
        const hud = document.getElementById('enhanced-hud');

        document.getElementById('enhanced-hud-dismiss').click();
        expect(hud.classList.contains('is-hidden')).toBe(true);
        expect(hud.getAttribute('aria-hidden')).toBe('true');

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
        expect(hud.classList.contains('is-hidden')).toBe(false);
        expect(hud.getAttribute('aria-hidden')).toBe('false');

        enhanced.destroy();
        expect(document.getElementById('enhanced-hud')).toBeNull();
        expect(cancelAnimationFrame).toHaveBeenCalled();
    });
});

describe('playback toolbar and captain’s log', () => {
    beforeEach(() => {
        document.head.querySelectorAll('style').forEach((style) => style.remove());
        document.body.replaceChildren();
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });
    const change = (id, value) => {
        const control = document.getElementById(id);
        control.value = String(value);
        control.dispatchEvent(new Event('change'));
        return control;
    };
    const click = (id) => document.getElementById(id).click();
    const controller = () => {
        let notify;
        const unsubscribe = vi.fn();
        const tools = {
            getStoryDay: () => 1,
            setStoryDay: vi.fn(),
            startRun: vi.fn(),
            subscribeStatus: (fn) => {
                notify = fn;
                fn(null);
                return unsubscribe;
            },
        };
        return { tools, notify: (value) => notify(value), unsubscribe };
    };
    it('toggles the nonmodal log and hides/restores the whole deck without leaving hidden controls focusable', () => {
        const settings = { refreshLayout: vi.fn() },
            ui = setupEnhancedUI({ settings });
        click('jc-deck-log');
        expect(document.getElementById('jc-log').hidden).toBe(false);
        expect(document.getElementById('jc-deck-log').getAttribute('aria-expanded')).toBe('true');
        click('enhanced-hud-dismiss');
        expect(ui.hud.inert).toBe(true);
        expect(document.getElementById('jc-log').hidden).toBe(true);
        click('jc-deck-restore');
        expect(ui.hud.inert).toBe(false);
        expect(document.getElementById('jc-log').hidden).toBe(false);
        document.getElementById('jc-deck-log').focus();
        document.getElementById('jc-deck-log').dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
        expect(ui.hud.inert).toBe(true);
        document
            .getElementById('jc-deck-restore')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
        expect(ui.hud.inert).toBe(false);
        expect(document.activeElement.id).toBe('jc-deck-log');
        expect(settings.refreshLayout).toHaveBeenCalled();
        ui.destroy();
        expect(document.body.classList.contains('jc-deck-visible')).toBe(false);
    });
    it('routes day, gag and return-live actions through the existing run coordinator and preserves a pending gag choice', () => {
        const c = controller(),
            ui = setupEnhancedUI({ sequenceTools: c.tools });
        change('jc-jump-day', 3);
        change('jc-jump-band', 'night');
        click('jc-play-day');
        expect(c.tools.setStoryDay).toHaveBeenCalledWith(3);
        expect(c.tools.startRun).toHaveBeenLastCalledWith(
            expect.objectContaining({ mode: 'sequence', storyDay: 3, band: 'night' }),
        );
        change('jc-jump-gag', 2);
        const selected = document.getElementById('jc-jump-gag').selectedOptions[0].textContent;
        c.notify({ storyDay: 3, band: 'night', active: { script: 'POSE', tagId: 1 }, current: 0, total: 5 });
        expect(document.getElementById('jc-jump-gag').selectedOptions[0].textContent).toBe(selected);
        click('jc-play-gag');
        expect(c.tools.startRun).toHaveBeenLastCalledWith(
            expect.objectContaining({ mode: 'preview', storyDay: 3, band: 'night' }),
        );
        click('jc-return-live');
        expect(c.tools.startRun).toHaveBeenLastCalledWith({ mode: 'live' });
        ui.destroy();
        expect(c.unsubscribe).toHaveBeenCalledOnce();
    });
    it('counts unique catalogue gags rather than filler poses and labels previews separately from visits', () => {
        const c = controller(),
            ui = setupEnhancedUI({ sequenceTools: c.tools });
        const state = { storyDay: 2, band: 'early', active: { script: 'FISHING.ADS', tagId: 1 }, current: 2, total: 5 };
        c.notify(state);
        c.notify({ ...state, current: 3 });
        expect(document.getElementById('jc-gags-seen').textContent).toMatch(/^1 \/ /);
        expect(document.getElementById('jc-visit-count').textContent).toBe('4 / 5');
        c.notify({ ...state, active: { script: 'POSE', tagId: 0 }, current: 1, total: 1, preview: true });
        expect(document.getElementById('jc-gags-seen').textContent).toMatch(/^1 \/ /);
        expect(document.getElementById('jc-visit-label').textContent).toBe('Gag preview');
        expect(document.getElementById('jc-visit-count').textContent).toBe('1 / 1');
        ui.destroy();
    });
    it('closes the log with Escape from a form control, but leaves it alone while a modal is open', () => {
        const ui = setupEnhancedUI();
        click('jc-deck-log');
        document
            .getElementById('jc-jump-day')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('jc-log').hidden).toBe(true);
        click('jc-deck-log');
        const modal = document.createElement('div');
        modal.id = 'settings-overlay';
        modal.setAttribute('aria-hidden', 'false');
        document.body.append(modal);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.getElementById('jc-log').hidden).toBe(false);
        ui.destroy();
    });
});

it('excludes hidden-tab intervals from the session watch clock', () => {
    document.body.replaceChildren();
    let frame;
    vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((callback) => {
            frame = callback;
            return 1;
        }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const ui = setupEnhancedUI();
    try {
        frame(1000);
        frame(2000);
        expect(document.getElementById('jc-watch-time').textContent).toBe('00:01');
        hidden.mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
        hidden.mockReturnValue(false);
        document.dispatchEvent(new Event('visibilitychange'));
        frame(40000);
        frame(41000);
        expect(document.getElementById('jc-watch-time').textContent).toBe('00:02');
    } finally {
        ui.destroy();
        hidden.mockRestore();
    }
});

it('Full view fills the page without requesting browser fullscreen, and restores the previous Log', () => {
 document.body.replaceChildren();vi.stubGlobal('requestAnimationFrame',vi.fn());vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const request=vi.fn();document.documentElement.requestFullscreen=request;
 const ui=setupEnhancedUI();ui.setRailOpen(true);document.getElementById('jc-deck-fullscreen').click();
 expect(request).not.toHaveBeenCalled();expect(document.body.classList.contains('jc-full-view')).toBe(true);expect(ui.hud.inert).toBe(true);
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
 expect(document.body.classList.contains('jc-full-view')).toBe(false);expect(document.getElementById('jc-log').hidden).toBe(false);ui.destroy();
});
it('wires TV preset, speed and pause hardware with a resumable screen overlay', () => {
 document.body.replaceChildren();vi.stubGlobal('requestAnimationFrame',vi.fn());vi.stubGlobal('cancelAnimationFrame',vi.fn());browserPlayback.reset();
 const cyclePicturePreset=vi.fn(()=> 'Subtle CRT');const ui=setupEnhancedUI({settings:{cyclePicturePreset}});
 document.getElementById('jc-tv-picture').click();expect(cyclePicturePreset).toHaveBeenCalledOnce();
 document.getElementById('jc-tv-pause').click();expect(browserPlayback.paused).toBe(true);expect(document.getElementById('jc-pause-overlay').hidden).toBe(false);
 document.querySelector('#jc-pause-overlay button').click();expect(browserPlayback.paused).toBe(false);ui.destroy();
 expect(document.getElementById('jc-pause-overlay')).toBeNull();expect(browserPlayback.rate).toBe(1);
});

it('turns painted dial faces for picture changes and speed changes, including wraparound', () => {
 document.body.replaceChildren();vi.stubGlobal('requestAnimationFrame',vi.fn());vi.stubGlobal('cancelAnimationFrame',vi.fn());browserPlayback.reset();
 const previous=__DEBUG__.getPresentation.getMockImplementation();
 __DEBUG__.getPresentation.mockImplementation(()=>({scene:11,name:'Test',playbackRate:browserPlayback.rate}));
 const ui=setupEnhancedUI({settings:{cyclePicturePreset:()=> 'Balanced CRT'}});
 try {
  const picture=document.getElementById('jc-tv-picture-paint');const speed=document.getElementById('jc-tv-speed-paint');
  document.getElementById('jc-tv-picture').click();expect(picture.style.getPropertyValue('--dial-angle')).toBe('45deg');
  document.getElementById('jc-tv-picture').click();expect(picture.style.getPropertyValue('--dial-angle')).toBe('90deg');
  browserPlayback.setRate(2);expect(speed.style.getPropertyValue('--dial-angle')).toBe('90deg');
  browserPlayback.setRate(4);expect(speed.style.getPropertyValue('--dial-angle')).toBe('180deg');
  browserPlayback.setRate(.5);expect(speed.style.getPropertyValue('--dial-angle')).toBe('270deg');
  browserPlayback.setRate(4);expect(speed.style.getPropertyValue('--dial-angle')).toBe('180deg');
 } finally {ui.destroy();__DEBUG__.getPresentation.mockImplementation(previous)}
});

it('leaves Space on the TV restore button to native button activation', () => {
    document.body.replaceChildren();
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    browserPlayback.reset();
    const ui = setupEnhancedUI();
    try {
        document.getElementById('enhanced-hud-dismiss').focus();
        document.getElementById('enhanced-hud-dismiss').click();
        const restore = document.getElementById('jc-deck-restore');
        expect(document.activeElement).toBe(restore);
        const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
        restore.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(browserPlayback.paused).toBe(false);
        restore.click(); // jsdom does not synthesize native clicks from keyboard events.
        expect(ui.hud.classList.contains('is-hidden')).toBe(false);
    } finally { ui.destroy(); }
});

describe('receding shelf', () => {
    let ui, settings;
    const el = (id) => document.getElementById(id);
    const key = (value, target = window) =>
        target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    const pointer = (type, target, pointerType = 'mouse') => {
        const event = new Event(type, { bubbles: type === 'pointerdown' });
        event.pointerType = pointerType;
        target.dispatchEvent(event);
    };
    const start = () => {
        settings = { refreshLayout: vi.fn() };
        ui = setupEnhancedUI({ settings });
    };
    beforeEach(() => {
        document.head.querySelectorAll('style').forEach((style) => style.remove());
        document.body.replaceChildren();
        document.body.className = '';
        localStorage.clear();
        vi.stubGlobal('requestAnimationFrame', vi.fn());
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.useFakeTimers();
    });
    afterEach(() => {
        ui?.destroy();
        ui = null;
        vi.useRealTimers();
    });

    it('toggles from the labelled tab and B, persists, and restores on the next Play', () => {
        start();
        const recede = el('jc-deck-recede');
        expect(recede.getAttribute('aria-label')).toBe('Hide shelf');
        expect(recede.getAttribute('aria-pressed')).toBe('false');
        expect(el('jc-shelf-handle').hidden).toBe(true);
        expect(document.body.classList.contains('jc-shelf-receded')).toBe(false);

        recede.focus();
        recede.click();
        expect(document.body.classList.contains('jc-shelf-receded')).toBe(true);
        expect(recede.getAttribute('aria-pressed')).toBe('true');
        expect(localStorage.getItem(SHELF_SETTING_KEY)).toBe('receded');
        expect(el('jc-shelf-handle').hidden).toBe(false);
        expect(el('jc-shelf-handle').getAttribute('aria-expanded')).toBe('false');
        // Focus does not stay on a control that has slid off the page.
        expect(document.activeElement).toBe(el('jc-shelf-handle'));
        expect(settings.refreshLayout).toHaveBeenCalled();

        key('b');
        expect(document.body.classList.contains('jc-shelf-receded')).toBe(false);
        expect(localStorage.getItem(SHELF_SETTING_KEY)).toBe('shown');
        key('B', el('jc-deck-log')); // Works from a focused shelf button, like H.
        expect(localStorage.getItem(SHELF_SETTING_KEY)).toBe('receded');

        // Return to title, then Play again.
        ui.destroy();
        expect(document.body.classList.contains('jc-shelf-receded')).toBe(false);
        start();
        expect(document.body.classList.contains('jc-shelf-receded')).toBe(true);
        expect(el('jc-deck-recede').getAttribute('aria-pressed')).toBe('true');
        expect(el('jc-shelf-handle').hidden).toBe(false);
    });

    it('leaves B to text fields, modal dialogs and modified keys', () => {
        start();
        const input = document.body.appendChild(document.createElement('input'));
        key('b', input);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true }));
        const modal = document.body.appendChild(document.createElement('div'));
        modal.id = 'settings-overlay';
        modal.setAttribute('aria-hidden', 'false');
        key('b');
        expect(document.body.classList.contains('jc-shelf-receded')).toBe(false);
        expect(localStorage.getItem(SHELF_SETTING_KEY)).toBeNull();
    });

    it('peeks as an overlay for pointer, keyboard focus and the handle without asking for a new layout', () => {
        localStorage.setItem(SHELF_SETTING_KEY, 'receded');
        start();
        const handle = el('jc-shelf-handle'),
            hud = ui.hud;
        settings.refreshLayout.mockClear();
        const peeking = () => hud.classList.contains('is-shelf-peeking');

        // Pointer at the bottom edge, then onto the shelf, then away.
        pointer('pointerenter', el('jc-shelf-edge'));
        expect(peeking()).toBe(true);
        expect(handle.getAttribute('aria-expanded')).toBe('true');
        pointer('pointerleave', el('jc-shelf-edge'));
        pointer('pointerenter', el('jc-deck'));
        vi.advanceTimersByTime(5000);
        expect(peeking()).toBe(true);
        pointer('pointerleave', el('jc-deck'));
        vi.advanceTimersByTime(300);
        expect(peeking()).toBe(true); // Short linger, like the Dock.
        vi.advanceTimersByTime(400);
        expect(peeking()).toBe(false);
        expect(handle.getAttribute('aria-expanded')).toBe('false');

        // Keyboard focus on any shelf control reveals it; leaving tucks it away.
        key('Tab');
        el('jc-deck-speed').focus();
        expect(peeking()).toBe(true);
        vi.advanceTimersByTime(5000);
        expect(peeking()).toBe(true);
        el('jc-tv-pause').focus();
        vi.advanceTimersByTime(700);
        expect(peeking()).toBe(false);

        // The handle toggles a pinned peek (touch and keyboard); a tap elsewhere ends it.
        handle.click();
        expect(peeking()).toBe(true);
        vi.advanceTimersByTime(5000);
        expect(peeking()).toBe(true);
        pointer('pointerdown', el('jc-deck-sound'), 'touch');
        expect(peeking()).toBe(true);
        pointer('pointerdown', document.body, 'touch');
        expect(peeking()).toBe(false);
        handle.click();
        handle.click();
        expect(peeking()).toBe(false);

        // Focus that a click left on a shelf control does not hold the peek open.
        el('jc-deck-speed').focus();
        expect(peeking()).toBe(true);
        vi.advanceTimersByTime(700);
        expect(peeking()).toBe(false);
        expect(document.activeElement).toBe(handle);
        key('Tab');

        // Escape closes a peek that holds focus and returns to the handle.
        el('jc-deck-options').focus();
        expect(peeking()).toBe(true);
        key('Escape', el('jc-deck-options'));
        expect(peeking()).toBe(false);
        expect(document.activeElement).toBe(handle);

        expect(settings.refreshLayout).not.toHaveBeenCalled();
        expect(document.body.classList.contains('jc-shelf-receded')).toBe(true);
    });

    it('does not peek while the shelf is in its normal place', () => {
        start();
        pointer('pointerenter', el('jc-deck'));
        el('jc-deck-speed').focus();
        expect(ui.hud.classList.contains('is-shelf-peeking')).toBe(false);
    });

    it.each([false, true])('H and Full view return to the shelf state they left (receded: %s)', (receded) => {
        if (receded) localStorage.setItem(SHELF_SETTING_KEY, 'receded');
        start();
        const state = () => [
            document.body.classList.contains('jc-shelf-receded'),
            el('jc-shelf-handle').hidden,
            localStorage.getItem(SHELF_SETTING_KEY),
        ];
        const before = state();
        if (receded) el('jc-shelf-handle').click();

        key('h');
        expect(ui.hud.inert).toBe(true);
        expect(ui.hud.classList.contains('is-shelf-peeking')).toBe(false);
        key('b'); // Nothing to recede while the Island TV is hidden.
        expect(state()).toEqual(before);
        key('h');
        expect(ui.hud.inert).toBe(false);
        expect(state()).toEqual(before);

        key('f');
        expect(document.body.classList.contains('jc-full-view')).toBe(true);
        expect(ui.hud.inert).toBe(true);
        key('Escape');
        expect(document.body.classList.contains('jc-full-view')).toBe(false);
        expect(state()).toEqual(before);
        key('f');
        key('f');
        expect(ui.hud.inert).toBe(false);
        expect(state()).toEqual(before);
    });

    it('keeps the Log state and reachability across receding', () => {
        start();
        el('jc-deck-log').click();
        key('b');
        expect(el('jc-log').hidden).toBe(false);
        expect(el('jc-deck-log').getAttribute('aria-expanded')).toBe('true');
        key('Escape');
        expect(el('jc-log').hidden).toBe(true);
        // Focus returns to the Log button, which reveals the tucked shelf.
        expect(document.activeElement).toBe(el('jc-deck-log'));
        expect(ui.hud.classList.contains('is-shelf-peeking')).toBe(true);
    });
});

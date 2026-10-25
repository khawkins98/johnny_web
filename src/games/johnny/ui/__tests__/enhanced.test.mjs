import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../dgds/scripting/process.mjs', () => ({
    __DEBUG__: {
        getPresentation: vi.fn(() => ({ scene: 11, name: 'GULL 2 BATHING', playbackRate: 1 })),
        stepScene: vi.fn(),
        setPlaybackRate: vi.fn(),
    },
}));

import { setupEnhancedUI } from '../enhanced.mjs';
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

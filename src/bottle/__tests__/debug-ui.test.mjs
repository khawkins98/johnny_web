import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const processMocks = vi.hoisted(() => ({
    stopProcess: vi.fn(),
    debug: {
        getState: vi.fn(),
        jumpToScene: vi.fn(),
        setNightMode: vi.fn(),
        refreshBackground: vi.fn(),
        saveTrace: vi.fn(),
    },
}));

vi.mock('../../dgds/scripting/process.mjs', () => ({
    __DEBUG__: processMocks.debug,
    stopProcess: processMocks.stopProcess,
}));

import { setupDebugUI } from '../debug-ui.mjs';
import { diagnostics } from '../../dgds/scripting/diagnostics.mjs';

describe('developer sequence controls', () => {
    let originalConsole;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        document.body.innerHTML = '';
        localStorage.clear();
        window.__NEXT_SCRIPT_OVERRIDE__ = null;
        diagnostics.setMode('off');
        originalConsole = { log: console.log, warn: console.warn, error: console.error };
        processMocks.debug.getState.mockReturnValue({
            data: { name: 'ACTIVITY.ADS' },
            resourceProvider: {
                resolve: () => ({ scenes: [{ tagId: { id: 1, description: 'Test scene' } }] }),
            },
        });
    });

    afterEach(() => {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('separates one-scene preview from an anchored faithful sequence', () => {
        const preview = { script: 'ACTIVITY.ADS', tagId: 1, preview: true };
        const sequenceTools = {
            preview: vi.fn(() => preview),
            planFrom: vi.fn(),
            describe: vi.fn(() => ({ fixedDay: null, final: false, first: false, action: 'starting-event' })),
            status: vi.fn(() => ({
                storyDay: 4,
                current: 0,
                total: 7,
                remaining: 7,
                next: { script: 'ACTIVITY.ADS', tagId: 1 },
                final: { script: 'MARY.ADS', tagId: 3 },
                lowTide: false,
            })),
        };
        setupDebugUI({ sequenceTools });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

        const day = document.querySelector('[data-debug-control="story-day"]');
        day.value = '4';
        day.dispatchEvent(new Event('change'));
        const mode = document.querySelector('[data-debug-control="playback-mode"]');
        mode.value = 'preview';
        mode.dispatchEvent(new Event('change'));
        const buttons = [...document.querySelectorAll('#debug-menu button')];
        const start = buttons.find((button) => button.innerText === 'Start Debug Run');
        start.click();

        expect(sequenceTools.preview).toHaveBeenCalledWith('ACTIVITY.ADS', 1, { storyDay: 4 });
        expect(window.__NEXT_SCRIPT_OVERRIDE__).toBe(preview);
        expect(processMocks.stopProcess).toHaveBeenCalledWith('script_override');
        expect(document.querySelector('[data-debug-status="scene-context"]').innerText).toContain(
            'Play Test scene once, then resume the current chapter',
        );

        mode.value = 'sequence';
        mode.dispatchEvent(new Event('change'));
        start.click();
        expect(sequenceTools.planFrom).toHaveBeenCalledWith('ACTIVITY.ADS', 1, { storyDay: 4 });
        expect(window.__NEXT_SCRIPT_OVERRIDE__).toBeNull();
        expect(document.querySelector('[data-debug-status="action-feedback"]').innerText).toContain(
            'Complete-chapter run started',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Chapter 4 · 7 events queued',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'First: ACTIVITY.ADS #1',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').style.fontVariantNumeric).toBe('tabular-nums');
        expect(day.parentElement.querySelector('span').innerText).toBe('Story chapter to simulate');
    });

    it('shows the trace build identity and left-anchors native resizing', () => {
        setupDebugUI();
        const panel = document.querySelector('#debug-menu');
        vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
            left: 900,
            top: 10,
            right: 1338,
            bottom: 700,
            width: 438,
            height: 690,
            x: 900,
            y: 10,
            toJSON: () => ({}),
        });

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

        const build = document.querySelector('[data-debug-status="build"]');
        expect(build.innerText).toMatch(/^Build (?!undefined$).+/);
        expect(build.title).toContain(build.innerText.replace('Build ', ''));
        expect(panel.style.left).toBe('900px');
        expect(panel.style.right).toBe('auto');
        expect(panel.style.resize).toBe('both');
        expect(panel.style.minWidth).toBe('320px');
        expect(panel.style.overflow).toBe('auto');
        expect(panel.style.scrollbarGutter).toBe('stable');
        expect(panel.style.overscrollBehavior).toBe('contain');
    });

    it('restores standard and verbose console controls in the panel', () => {
        setupDebugUI();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
        const mode = document.querySelector('[data-debug-control="diagnostics-mode"]');

        expect([...mode.options].map((option) => [option.value, option.innerText])).toEqual([
            ['on', 'Standard logs'],
            ['verbose', 'Verbose logs'],
        ]);
        expect(mode.value).toBe('on');

        mode.value = 'verbose';
        mode.dispatchEvent(new Event('change'));
        expect(diagnostics.mode).toBe('verbose');

        diagnostics.setMode('on');
        expect(mode.value).toBe('on');
    });

    it('reflects and changes the active host-owned night state', () => {
        processMocks.debug.getState.mockReturnValue({
            titleState: { night: true },
            data: { name: 'ACTIVITY.ADS' },
            resourceProvider: {
                resolve: () => ({ scenes: [{ tagId: { id: 1, description: 'Test scene' } }] }),
            },
        });
        setupDebugUI();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

        const checkbox = document.querySelector('[data-debug-control="night-mode"]');
        expect(checkbox.checked).toBe(true);
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(processMocks.debug.setNightMode).toHaveBeenCalledWith(false);
    });

    it('delegates sequence interruption atomically when the browser host provides it', () => {
        const startRun = vi.fn();
        const sequenceTools = {
            startRun,
            describe: vi.fn(() => ({ fixedDay: null, action: 'starting-event' })),
            status: vi.fn(() => null),
        };
        setupDebugUI({ sequenceTools });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

        const day = document.querySelector('[data-debug-control="story-day"]');
        day.value = '3';
        const start = [...document.querySelectorAll('#debug-menu button')].find(
            (button) => button.innerText === 'Start Debug Run',
        );
        start.click();

        expect(startRun).toHaveBeenCalledWith({
            mode: 'sequence',
            script: 'ACTIVITY.ADS',
            tagId: 1,
            storyDay: 3,
        });
        expect(processMocks.stopProcess).not.toHaveBeenCalled();
        expect(window.__NEXT_SCRIPT_OVERRIDE__).toBeNull();
    });

    it('locks story-gated solo finales to their recovered day and explains the one-event plan', () => {
        const sequenceTools = {
            preview: vi.fn(),
            planFrom: vi.fn(),
            status: vi.fn(() => null),
            describe: vi.fn(() => ({ fixedDay: 11, final: true, first: true, action: 'solo-finale' })),
        };
        setupDebugUI({ sequenceTools });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

        const day = document.querySelector('[data-debug-control="story-day"]');
        expect(day.value).toBe('11');
        expect(day.disabled).toBe(true);
        expect(document.querySelector('[data-debug-row="story-day"]').style.display).toBe('none');
        expect(document.querySelector('[data-debug-status="scene-context"]').innerText).toContain(
            'Run plan: Chapter 11 — Test scene only',
        );
        expect(document.querySelector('[data-debug-status="fixed-chapter"]').innerText).toBe('Fixed by this scene.');
        expect([...document.querySelectorAll('#debug-menu button')].map((button) => button.innerText)).toContain('Start Debug Run');
    });

    it('labels selected controls separately from live playback', () => {
        let publishStatus;
        processMocks.debug.getState.mockReturnValue({
            data: { name: 'ACTIVITY.ADS' },
            resourceProvider: {
                resolve: (name) => ({
                    scenes: [
                        {
                            tagId: {
                                id: name === 'FISHING.ADS' ? 2 : 1,
                                description: 'Test scene',
                            },
                        },
                    ],
                }),
            },
        });
        const sequenceTools = {
            preview: vi.fn(),
            planFrom: vi.fn(),
            describe: vi.fn(() => ({ fixedDay: null, action: 'ending-finale' })),
            status: vi.fn(() => ({
                storyDay: 2,
                current: 3,
                total: 8,
                remaining: 5,
                active: { script: 'FISHING.ADS', tagId: 2 },
                next: { script: 'MARY.ADS', tagId: 1 },
                final: { script: 'JOHNNY.ADS', tagId: 4 },
                lowTide: true,
            })),
            subscribeStatus: vi.fn((listener) => {
                publishStatus = listener;
                listener();
                return vi.fn();
            }),
        };
        setupDebugUI({ sequenceTools });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

        expect(document.querySelector('[data-debug-section="target"]').innerText).toBe('Start a debug run');
        expect(document.querySelector('[data-debug-section="playback"]').innerText).toBe('Now playing — host event');
        expect(document.querySelector('[data-debug-status="scene-context"]').innerText).toContain(
            'compatible island events → Test scene finale',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Chapter 2 · Event 3 of 8',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Host event: FISHING.ADS #2',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Next: MARY.ADS #1 · 5 remaining',
        );
        expect(document.querySelector('[data-debug-control="follow-playback"]').checked).toBe(true);
        expect(document.querySelectorAll('select')[0].value).toBe('FISHING.ADS');
        expect(document.querySelectorAll('select')[1].value).toBe('2');
        expect(document.querySelector('[data-debug-control="story-day"]').value).toBe('2');

        sequenceTools.status.mockReturnValue({
            storyDay: 2,
            current: 4,
            total: 8,
            remaining: 4,
            active: { script: 'MARY.ADS', tagId: 1 },
            next: { script: 'VISITOR.ADS', tagId: 3 },
            final: { script: 'JOHNNY.ADS', tagId: 4 },
            lowTide: true,
        });
        publishStatus();
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Host event: MARY.ADS #1',
        );
        expect(document.querySelectorAll('select')[0].value).toBe('MARY.ADS');
        expect(document.querySelectorAll('select')[1].value).toBe('1');

        document.querySelectorAll('select')[0].dispatchEvent(new Event('pointerdown'));
        expect(document.querySelector('[data-debug-control="follow-playback"]').checked).toBe(false);
        sequenceTools.status.mockReturnValue({
            storyDay: 2,
            current: 5,
            total: 8,
            remaining: 3,
            active: { script: 'VISITOR.ADS', tagId: 1 },
            next: { script: 'JOHNNY.ADS', tagId: 4 },
            final: { script: 'JOHNNY.ADS', tagId: 4 },
            lowTide: true,
        });
        publishStatus();
        expect(document.querySelectorAll('select')[0].value).toBe('MARY.ADS');

        const follow = document.querySelector('[data-debug-control="follow-playback"]');
        follow.checked = true;
        follow.dispatchEvent(new Event('change'));
        expect(document.querySelectorAll('select')[0].value).toBe('VISITOR.ADS');

        sequenceTools.status.mockReturnValue({
            storyDay: 3,
            current: 6,
            total: 8,
            remaining: 2,
            active: { script: 'STAND.ADS', tagId: 1 },
            next: { script: 'JOHNNY.ADS', tagId: 4 },
            final: { script: 'JOHNNY.ADS', tagId: 4 },
            lowTide: false,
        });
        vi.advanceTimersByTime(250);
        expect(document.querySelectorAll('select')[0].value).toBe('STAND.ADS');
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Host event: STAND.ADS #1',
        );
    });

    it('identifies a selected-scene preview separately from the sequence it will resume', () => {
        const sequenceTools = {
            describe: vi.fn(() => ({ fixedDay: null, action: 'starting-event' })),
            status: vi.fn(() => ({
                storyDay: 4,
                current: 1,
                total: 1,
                remaining: 0,
                active: { script: 'VISITOR.ADS', tagId: 1 },
                next: null,
                final: { script: 'VISITOR.ADS', tagId: 1 },
                lowTide: false,
                preview: true,
                resume: {
                    storyDay: 4,
                    next: { script: 'COCONUT.ADS', tagId: 6 },
                },
            })),
        };

        setupDebugUI({ sequenceTools });
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toBe(
            'Selected-scene preview\nHost event: VISITOR.ADS #1\nResume: Chapter 4 · Next COCONUT.ADS #6',
        );
    });
});

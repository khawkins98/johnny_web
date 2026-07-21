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

describe('developer sequence controls', () => {
    let originalConsole;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
        localStorage.clear();
        window.__NEXT_SCRIPT_OVERRIDE__ = null;
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

        const checkbox = document.querySelector('input[type="checkbox"]');
        expect(checkbox.checked).toBe(true);
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(processMocks.debug.setNightMode).toHaveBeenCalledWith(false);
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
        expect(document.querySelector('[data-debug-status="scene-context"]').innerText).toContain(
            'Run plan: Chapter 11 — Test scene only',
        );
        expect(document.querySelector('[data-debug-status="fixed-chapter"]').innerText).toBe('Fixed by this scene.');
        expect([...document.querySelectorAll('#debug-menu button')].map((button) => button.innerText)).toContain('Start Debug Run');
    });

    it('labels selected controls separately from live playback', () => {
        let publishStatus;
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
        expect(document.querySelector('[data-debug-section="playback"]').innerText).toBe('Now playing');
        expect(document.querySelector('[data-debug-status="scene-context"]').innerText).toContain(
            'compatible island events → Test scene finale',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Chapter 2 · Event 3 of 8',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Current: FISHING.ADS #2',
        );
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain(
            'Next: MARY.ADS #1 · 5 remaining',
        );

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
            'Current: MARY.ADS #1',
        );
    });
});

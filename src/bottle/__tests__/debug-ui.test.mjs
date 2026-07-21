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
        const buttons = [...document.querySelectorAll('#debug-menu button')];
        buttons.find((button) => button.innerText === 'Preview Once').click();

        expect(sequenceTools.preview).toHaveBeenCalledWith('ACTIVITY.ADS', 1, { storyDay: 4 });
        expect(window.__NEXT_SCRIPT_OVERRIDE__).toBe(preview);
        expect(processMocks.stopProcess).toHaveBeenCalledWith('script_override');

        buttons.find((button) => button.innerText === 'Start Sequence With This Scene').click();
        expect(sequenceTools.planFrom).toHaveBeenCalledWith('ACTIVITY.ADS', 1, { storyDay: 4 });
        expect(window.__NEXT_SCRIPT_OVERRIDE__).toBeNull();
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain('Faithful sequence planned');
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain('Queued · 7 events');
        expect(document.querySelector('[data-debug-status="sequence"]').innerText).toContain('Next ACTIVITY.ADS #1');
        expect(document.querySelector('[data-debug-status="sequence"]').style.fontVariantNumeric).toBe('tabular-nums');
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
            'Fixed Day 11 · Start-immediately finale',
        );
        expect([...document.querySelectorAll('#debug-menu button')].map((button) => button.innerText)).toContain(
            'Run This Finale (1 Event)',
        );
    });
});

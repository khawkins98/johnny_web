import { describe, expect, it, vi } from 'vitest';
import { createDebugRunCoordinator } from '../debug-run-coordinator.mjs';

describe('debug run coordinator', () => {
    const create = () => {
        const preview = vi.fn((script, tagId) => ({ script, tagId, preview: true }));
        const planFrom = vi.fn();
        const status = vi.fn(() => ({
            storyDay: 4,
            next: { script: 'ACTIVITY.ADS', tagId: 2 },
        }));
        let publishStatus;
        const subscribeStatus = vi.fn((listener) => {
            publishStatus = listener;
            return vi.fn();
        });
        const stopRuntime = vi.fn();
        const stopAudio = vi.fn();
        const coordinator = createDebugRunCoordinator({
            sequenceTools: { preview, planFrom, status, subscribeStatus },
            stopRuntime,
            stopAudio,
        });
        return { coordinator, preview, planFrom, status, publishStatus, stopRuntime, stopAudio };
    };

    it('atomically interrupts the complete host attempt and queues a preview', () => {
        const { coordinator, preview, stopRuntime, stopAudio } = create();
        const attempt = coordinator.beginAttempt();

        coordinator.request({ mode: 'preview', script: 'BUILDING.ADS', tagId: 5, storyDay: 4 });

        expect(attempt.signal.aborted).toBe(true);
        expect(coordinator.interrupted(attempt)).toBe(true);
        expect(stopAudio).toHaveBeenCalledOnce();
        expect(stopRuntime).toHaveBeenCalledWith('script_override');
        expect(preview).toHaveBeenCalledWith('BUILDING.ADS', 5, { storyDay: 4 });
        expect(coordinator.takeOverride()).toEqual({ script: 'BUILDING.ADS', tagId: 5, preview: true });
        expect(coordinator.takeOverride()).toBeNull();
    });

    it('lets the latest repeated debug request win', () => {
        const { coordinator } = create();
        const firstAttempt = coordinator.beginAttempt();
        coordinator.request({ mode: 'preview', script: 'ACTIVITY.ADS', tagId: 1, storyDay: 1 });
        const secondAttempt = coordinator.beginAttempt();
        coordinator.request({ mode: 'preview', script: 'VISITOR.ADS', tagId: 6, storyDay: 10 });

        expect(coordinator.interrupted(firstAttempt)).toBe(true);
        expect(coordinator.interrupted(secondAttempt)).toBe(true);
        expect(coordinator.takeOverride()).toMatchObject({ script: 'VISITOR.ADS', tagId: 6 });
    });

    it('replaces the controller plan without retaining an older preview override', () => {
        const { coordinator, planFrom } = create();
        coordinator.request({ mode: 'preview', script: 'ACTIVITY.ADS', tagId: 1, storyDay: 1 });
        coordinator.request({ mode: 'sequence', script: 'FISHING.ADS', tagId: 3, storyDay: 4 });

        expect(planFrom).toHaveBeenCalledWith('FISHING.ADS', 3, { storyDay: 4 });
        expect(coordinator.takeOverride()).toBeNull();
    });

    it('reports an active preview instead of the paused story queue', () => {
        const { coordinator, publishStatus } = create();
        const listener = vi.fn();
        coordinator.subscribeStatus(listener);
        listener.mockClear();

        coordinator.activate({
            script: 'VISITOR.ADS',
            tagId: 3,
            preview: true,
            titleState: { storyDay: 7, lowTide: true },
        });

        expect(coordinator.status()).toMatchObject({
            storyDay: 7,
            active: { script: 'VISITOR.ADS', tagId: 3 },
            preview: true,
            lowTide: true,
            resume: { storyDay: 4, next: { script: 'ACTIVITY.ADS', tagId: 2 } },
        });
        expect(listener).toHaveBeenCalledOnce();

        publishStatus();
        expect(listener).toHaveBeenCalledTimes(2);

        coordinator.activate({ script: 'FISHING.ADS', tagId: 4 });
        expect(coordinator.status()).toEqual({
            storyDay: 4,
            next: { script: 'ACTIVITY.ADS', tagId: 2 },
        });
    });
});

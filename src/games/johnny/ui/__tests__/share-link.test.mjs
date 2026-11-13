// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupShareLink, shareHashFor } from '../share-link.mjs';

const tools = () => {
    const listeners = new Set();
    return {
        startRun: vi.fn(),
        subscribeStatus: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        publish: (status) => { for (const listener of listeners) listener(status); },
        count: () => listeners.size,
    };
};

describe('share link', () => {
    afterEach(() => { window.history.replaceState(null, '', window.location.pathname); });

    it('describes what is playing: gag, day and time of day', () => {
        expect(shareHashFor({ active: { script: 'FISHING.ADS', tagId: 3 }, storyDay: 2, tidePhase: 3 }))
            .toBe('#stage=FISHING.ADS:3&day=2&mode=preview&time=early');
        // A visit's chosen time wins over the clock's.
        expect(shareHashFor({ active: { script: 'MARY.ADS', tagId: 1 }, storyDay: 5, tidePhase: 3, band: 'night', preview: true }))
            .toBe('#stage=MARY.ADS:1&day=5&mode=preview&time=night');
        // A whole visit (from the Log, or a sequence link) keeps being one.
        expect(shareHashFor({ active: { script: 'FISHING.ADS', tagId: 3 }, storyDay: 4, band: 'late', preview: false }))
            .toBe('#stage=FISHING.ADS:3&day=4&mode=sequence&time=late');
        // Nothing playing, a pause between gags, or a gag the game does not have: no link.
        expect(shareHashFor(null)).toBeNull();
        expect(shareHashFor({ active: { script: 'POSE', tagId: 1 }, storyDay: 2 })).toBeNull();
        expect(shareHashFor({ active: { script: 'NOPE.ADS', tagId: 9 }, storyDay: 2 })).toBeNull();
    });

    it('rewrites the address as gags play, without adding history entries', () => {
        const sequenceTools = tools();
        const link = setupShareLink({ sequenceTools });
        const before = window.history.length;
        sequenceTools.publish({ active: { script: 'FISHING.ADS', tagId: 3 }, storyDay: 2, tidePhase: 3 });
        expect(window.location.hash).toBe('#stage=FISHING.ADS:3&day=2&mode=preview&time=early');
        // A pause keeps the last gag's link.
        sequenceTools.publish({ active: { script: 'POSE', tagId: 1 }, storyDay: 2, tidePhase: 3 });
        expect(window.location.hash).toBe('#stage=FISHING.ADS:3&day=2&mode=preview&time=early');
        sequenceTools.publish({ active: { script: 'BUILDING.ADS', tagId: 1 }, storyDay: 2, tidePhase: 13 });
        expect(window.location.hash).toBe('#stage=BUILDING.ADS:1&day=2&mode=preview&time=night');
        expect(window.history.length).toBe(before);
        expect(sequenceTools.startRun).not.toHaveBeenCalled(); // Writing the link plays nothing.
        link.destroy();
        expect(sequenceTools.count()).toBe(0);
    });

    it('plays a link pasted into an open page, and ignores junk', () => {
        const sequenceTools = tools();
        const link = setupShareLink({ sequenceTools });
        window.location.hash = '#stage=VISITOR.ADS:4&day=7&mode=preview&time=late';
        window.dispatchEvent(new Event('hashchange'));
        expect(sequenceTools.startRun).toHaveBeenCalledWith({ script: 'VISITOR.ADS', tagId: 4, storyDay: 7, mode: 'preview', band: 'late' });
        window.location.hash = '#stage=NOPE.ADS:4';
        window.dispatchEvent(new Event('hashchange'));
        window.location.hash = '#whatever';
        window.dispatchEvent(new Event('hashchange'));
        expect(sequenceTools.startRun).toHaveBeenCalledTimes(1);
        link.destroy();
        window.location.hash = '#stage=VISITOR.ADS:4&day=7';
        window.dispatchEvent(new Event('hashchange'));
        expect(sequenceTools.startRun).toHaveBeenCalledTimes(1);
    });
});

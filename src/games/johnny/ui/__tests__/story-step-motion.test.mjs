import { afterEach, describe, expect, it, vi } from 'vitest';
import { playStepEntrance, stepDirection } from '../story-step-motion.mjs';

describe('stepDirection', () => {
    it('is forward going deeper and back going up', () => {
        expect(stepDirection('day', 'tide')).toBe('forward');
        expect(stepDirection('gag', 'detail')).toBe('forward');
        expect(stepDirection('detail', 'day')).toBe('back');
        expect(stepDirection('gag', 'gag')).toBeNull();
        expect(stepDirection(undefined, 'day')).toBeNull();
    });
});

describe('playStepEntrance', () => {
    const grid = () => {
        const root = document.createElement('section');
        root.innerHTML = '<div class="story-steps-grid"><button></button><button></button><button></button></div>';
        root.animate = vi.fn();
        for (const el of root.querySelectorAll('button')) el.animate = vi.fn();
        return root;
    };

    afterEach(() => vi.unstubAllGlobals());

    it('deals the cards in, one after another', () => {
        const root = grid();
        playStepEntrance(root, { direction: 'forward' });
        const delays = [...root.querySelectorAll('button')].map((el) => el.animate.mock.calls[0][1].delay);
        expect(delays).toEqual([0, 28, 56]);
    });

    it('does nothing without a direction or when reduced motion is asked for', () => {
        const root = grid();
        playStepEntrance(root, { direction: null });
        vi.stubGlobal('matchMedia', () => ({ matches: true }));
        playStepEntrance(root, { direction: 'back' });
        for (const el of root.querySelectorAll('button')) expect(el.animate).not.toHaveBeenCalled();
    });

    it('flies the picked card into the gag view', () => {
        const root = document.createElement('section');
        root.innerHTML = '<div class="story-steps-hero"><div class="story-steps-card"></div><div class="info"></div></div>';
        root.animate = vi.fn();
        const card = root.querySelector('.story-steps-card');
        const info = root.querySelector('.info');
        card.animate = vi.fn();
        info.animate = vi.fn();
        card.getBoundingClientRect = () => ({ left: 10, top: 20, width: 150, height: 225 });
        playStepEntrance(root, { direction: 'forward', from: { left: 400, top: 300, width: 75, height: 112 } });
        const [frames] = card.animate.mock.calls[0];
        expect(frames[0].transform).toContain('translate(390px, 280px) scale(0.5)');
        expect(info.animate).toHaveBeenCalledOnce();
    });
});

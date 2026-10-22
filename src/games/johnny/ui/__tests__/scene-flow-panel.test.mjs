import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupSceneFlowPanel } from '../scene-flow-panel.mjs';

// Synthetic ADS bytecode ops, matching the shape scene-flow.test.mjs uses. Real
// ADS ops carry a numeric `opcode` (which the outline grouping in scene-flow.mjs reads
// to tell entry branches from fall-through arms), so map the mnemonic to it.
const OPCODES = {
    IF_NOT_PLAYED: 0x1330,
    IF_PLAYED: 0x1350,
    IF_NOT_RUNNING: 0x1360,
    IF_RUNNING: 0x1370,
    END_SCENE_BRANCH: 0x1510,
    ADD_SCENE: 0x2005,
    STOP_SCENE: 0x2010,
    RANDOM_START: 0x3010,
    RANDOM_END: 0x30ff,
    END_IF: 0xfff0,
    END: 0xffff,
};
const op = (line, params, indent = 0) => ({
    line,
    params,
    indent,
    opcode: OPCODES[line.trim().split(/\s+/)[0]] ?? 0,
});

const FISHY_ADS = {
    resources: [{ id: 2, name: 'FISHY.TTM' }],
    scenes: [
        {
            tagId: { id: 5, description: 'Johnny fishes' },
            script: [
                op('IF_NOT_PLAYED 2 1', [2, 1]),
                op('ADD_SCENE 2 1 0 1', [2, 1, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('IF_PLAYED 2 1', [2, 1]),
                op('RANDOM_START', []),
                op('ADD_SCENE 2 2 0 1', [2, 2, 0, 1], 1),
                op('ADD_SCENE 2 3 0 1', [2, 3, 0, 1], 1),
                op('RANDOM_END', []),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        },
        {
            tagId: { id: 7, description: 'Johnny writes' },
            script: [
                op('IF_NOT_PLAYED 2 1', [2, 1]),
                op('ADD_SCENE 2 5 0 1', [2, 5, 0, 1], 1),
                op('ADD_SCENE 2 1 0 1', [2, 1, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('IF_PLAYED 2 1', [2, 1]),
                op('ADD_SCENE 2 2 0 1', [2, 2, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('IF_PLAYED 2 1', [2, 1]),
                op('ADD_SCENE 2 3 0 1', [2, 3, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        },
        {
            tagId: { id: 6, description: 'Johnny naps' },
            script: [
                op('IF_NOT_PLAYED 2 4', [2, 4]),
                op('ADD_SCENE 2 4 0 1', [2, 4, 0, 1], 1),
                op('END_IF', []),
                op('END_SCENE_BRANCH', []),
                op('END', []),
            ],
        },
    ],
};

const FISHY_TTM = {
    tags: [
        { id: 1, description: 'rod snaps' },
        { id: 2, description: 'reels in a boot' },
        { id: 3, description: 'reels in a fish' },
        { id: 4, description: 'yawns' },
        { id: 5, description: 'LOAD MESSAGE' },
    ],
};

const entries = { 'FISHY.ADS': FISHY_ADS, 'FISHY.TTM': FISHY_TTM };
const resolveEntry = (name) => entries[name] ?? null;

// A minimal fake story controller: status()/subscribeStatus() only, matching
// story-controller.mjs's sequenceStatus.active = { script, tagId } shape.
const makeSequenceTools = (initialActive) => {
    let status = initialActive ? { active: initialActive } : null;
    const listeners = new Set();
    return {
        status: () => status,
        subscribeStatus: (listener) => {
            listeners.add(listener);
            listener(status);
            return () => listeners.delete(listener);
        },
        listenerCount: () => listeners.size,
        setActive: (active) => {
            status = active ? { active } : null;
            for (const listener of listeners) listener(status);
        },
    };
};

// The panel title is always "Story timeline"; the gag being inspected is named
// in the detail heading below the visit row (e.g. "Johnny fishes · LIVE GAG").
const detailName = () => document.querySelector('.scene-flow-matrix-detail-heading strong')?.textContent ?? '';

describe('scene-flow panel', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the current gag\'s outline, guards, and RANDOM pick on open', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });

        panel.open();

        const modal = document.getElementById('scene-flow-modal');
        expect(document.getElementById('scene-flow-title').textContent).toBe('Story timeline');
        expect(document.getElementById('scene-flow-subtitle').textContent).toMatch(/^STORY DAY \d+ OF 11/);
        expect(detailName()).toContain('Johnny fishes');

        const guards = Array.from(modal.querySelectorAll('.scene-flow-guard')).map((el) => el.textContent);
        // Shown tidied: sentence case, scene names bold instead of quoted.
        expect(guards).toEqual(['At the start', 'After rod snaps']);
        expect(modal.querySelector('.scene-flow-guard strong').textContent).toBe('rod snaps');

        // jsdom has no real `innerText` (it doesn't compute layout), so it only
        // reflects text assigned directly to that node -- read `.textContent`
        // (real DOM aggregation) for containers built from child elements.
        const targets = Array.from(modal.querySelectorAll('.scene-flow-targets'));
        expect(targets[0].textContent).toContain('rod snaps');
        expect(targets[1].textContent).toContain('picks one at random:');
        expect(targets[1].textContent).toContain('reels in a boot');
        expect(targets[1].textContent).toContain('reels in a fish');
    });

    it('links to the committed diagram doc, the extractor source, and the methodology writeup', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        const links = Array.from(document.querySelectorAll('.scene-flow-link'));
        const hrefs = links.map((a) => a.href);
        expect(hrefs.some((h) => h.includes('docs/scene-flows/FISHY.ADS.md'))).toBe(true);
        expect(hrefs.some((h) => h.includes('src/dgds/scripting/scene-flow.mjs'))).toBe(true);
        expect(hrefs.some((h) => h.includes('tools/faithfulness-oracle/METHODOLOGY.md'))).toBe(true);
    });

    it('opens and closes', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        const overlay = document.getElementById('scene-flow-overlay');

        panel.open();
        expect(overlay.style.display).toBe('flex');
        expect(overlay.getAttribute('aria-hidden')).toBe('false');

        panel.close();
        expect(overlay.style.display).toBe('none');
        expect(overlay.getAttribute('aria-hidden')).toBe('true');
    });

    it('shows a friendly empty state when no gag is active', () => {
        const sequenceTools = makeSequenceTools(null);
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });

        panel.open();

        expect(document.getElementById('scene-flow-title').textContent).toBe('How it works');
        expect(document.querySelector('.scene-flow-empty').textContent).toMatch(/hasn't started/i);
        expect(document.querySelectorAll('.scene-flow-link')).toHaveLength(0);
    });

    it('does not crash when resources are not loaded yet', () => {
        const sequenceTools = makeSequenceTools({ script: 'MISSING.ADS', tagId: 1 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });

        expect(() => panel.open()).not.toThrow();
        const notes = Array.from(document.querySelectorAll('.scene-flow-possibility-note'), (el) => el.textContent);
        expect(notes.some((text) => /isn't loaded yet/.test(text))).toBe(true);
    });

    it('updates live when the running gag changes while open', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();
        expect(detailName()).toContain('Johnny fishes');

        sequenceTools.setActive({ script: 'FISHY.ADS', tagId: 6 });

        expect(detailName()).toContain('Johnny naps');
    });

    it('destroy() unsubscribes, removes window listeners, and tears down its DOM', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const removeSpy = [];
        const origRemove = window.removeEventListener.bind(window);
        window.removeEventListener = (type, fn, opts) => {
            removeSpy.push(type);
            return origRemove(type, fn, opts);
        };
        try {
            const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
            expect(sequenceTools.listenerCount()).toBe(1);
            expect(document.getElementById('scene-flow-overlay')).not.toBeNull();

            panel.destroy();

            expect(sequenceTools.listenerCount()).toBe(0);
            expect(removeSpy).toContain('keydown');
            expect(removeSpy).toContain('mousemove');
            expect(document.getElementById('scene-flow-overlay')).toBeNull();
            expect(document.getElementById('scene-flow-cog')).toBeNull();
        } finally {
            window.removeEventListener = origRemove;
        }
    });

    it('does not re-render while closed, but reflects the latest gag on next open', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();
        panel.close();

        sequenceTools.setActive({ script: 'FISHY.ADS', tagId: 6 });
        panel.open();

        expect(detailName()).toContain('Johnny naps');
    });

    it('steps from where Johnny is to any day, tide, and gag, and can play them', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        sequenceTools.status = () => ({ active: { script: 'FISHY.ADS', tagId: 5 }, current: 1, total: 2, storyDay: 2, tidePhase: 3 });
        sequenceTools.snapshot = () => [{ script: 'FISHY.ADS', tagId: 6, sequence: { index: 2 } }];
        const startRun = vi.fn();
        const setStoryDay = vi.fn();
        Object.assign(sequenceTools, { startRun, setStoryDay, getStoryDay: () => 2 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        // Opens on Johnny's live gag, with the path to it as a breadcrumb.
        const crumbs = () => Array.from(document.querySelectorAll('.story-steps-crumbs button'), (b) => b.textContent);
        expect(crumbs()).toEqual(['Day 02', 'Early day', 'Johnny fishes']);
        expect(detailName()).toContain('Johnny fishes · LIVE GAG');

        // Back up to the day question: 11 day cards, today marked.
        document.querySelector('.story-steps-crumbs button').click();
        const days = Array.from(document.querySelectorAll('.story-steps-card'));
        expect(days).toHaveLength(11);
        expect(days[1].getAttribute('aria-label')).toMatch(/\(today\)/);
        expect(document.querySelector('.scene-flow-matrix-detail')).toBeNull();

        // Day 7 -> tide question, with Play day.
        days[6].click();
        expect(document.querySelector('.story-steps-head h3').textContent).toBe('Day 07 · what time of day?');
        const tides = Array.from(document.querySelectorAll('.story-steps-tide'));
        expect(tides).toHaveLength(3);
        expect(tides[0].getAttribute('aria-label')).toMatch(/the time now/);

        // Early high tide -> day 7's gags, key scene first; the live visit strip only shows on the live day.
        tides[0].click();
        expect(document.querySelector('.story-steps-visit')).toBeNull();
        const gags = Array.from(document.querySelectorAll('.story-steps-grid .story-steps-card'));
        expect(gags[0].getAttribute('aria-label')).toMatch(/key scene for day 7/);

        // Pick it -> its detail, then play it on day 7.
        gags[0].click();
        expect(crumbs()[0]).toBe('Day 07');
        expect(crumbs().at(-1)).toBe('↖ Johnny now');
        document.querySelector('.story-steps-play').click();
        expect(startRun).toHaveBeenCalledWith({ mode: 'preview', script: 'MARY.ADS', tagId: 4, storyDay: 7 });
        expect(document.getElementById('scene-flow-overlay').getAttribute('aria-hidden')).toBe('true');

        // Reopening returns to Johnny now.
        panel.open();
        expect(crumbs()).toEqual(['Day 02', 'Early day', 'Johnny fishes']);
        panel.destroy();
    });

    it('shows the live visit on its own day and tide, and plays a day from the tide step', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        sequenceTools.status = () => ({ active: { script: 'FISHY.ADS', tagId: 5 }, current: 1, total: 2, storyDay: 2, tidePhase: 3 });
        sequenceTools.snapshot = () => [{ script: 'FISHY.ADS', tagId: 6, sequence: { index: 2 } }];
        const startRun = vi.fn();
        const setStoryDay = vi.fn();
        Object.assign(sequenceTools, { startRun, setStoryDay, getStoryDay: () => 2 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        const crumbButtons = () => document.querySelectorAll('.story-steps-crumbs button');
        crumbButtons()[1].click();
        document.querySelectorAll('.story-steps-tide')[0].click();
        const chips = Array.from(document.querySelectorAll('.story-steps-visit button'));
        expect(chips.map((chip) => chip.dataset.role)).toEqual(['live', 'planned']);
        chips[1].click();
        expect(detailName()).toContain('Johnny naps · GAG 2 OF 2');

        crumbButtons()[1].click();
        document.querySelector('.story-steps-play').click();
        expect(setStoryDay).toHaveBeenCalledWith(2);
        expect(startRun).toHaveBeenCalledWith({ mode: 'sequence', script: 'JOHNNY.ADS', tagId: 2, storyDay: 2 });
        panel.destroy();
    });

    it('tidies the script outline: hides loaders and merges steps that wait on the same scene', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 7 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        const steps = Array.from(document.querySelectorAll('.scene-flow-step'));
        expect(steps.map((step) => step.querySelector('.scene-flow-guard').textContent))
            .toEqual(['At the start', 'After rod snaps']);
        expect(steps[0].textContent).not.toMatch(/load message/i);
        expect(Array.from(steps[1].querySelectorAll('.scene-flow-target'), (el) => el.textContent))
            .toEqual(['reels in a boot', 'reels in a fish']);
    });

    it('selects a scene from the step list and shows how to reach it', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const startRun = vi.fn();
        sequenceTools.startRun = startRun;
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        // The first animated scene starts selected, with its preview panel.
        const pressed = () => document.querySelector('.scene-flow-targets button[aria-pressed="true"]');
        expect(pressed().textContent).toBe('rod snaps');
        expect(document.querySelector('.scene-flow-inspector h3').textContent).toBe('rod snaps');

        // A later random pick: its step is selected and the route to it is marked.
        const fish = Array.from(document.querySelectorAll('.scene-flow-targets button'))
            .find((button) => button.textContent === 'reels in a fish');
        fish.click();
        expect(pressed()).toBe(fish);
        expect(fish.closest('.scene-flow-step').classList.contains('is-selected')).toBe(true);
        const rodSnaps = Array.from(document.querySelectorAll('.scene-flow-targets button'))
            .find((button) => button.textContent === 'rod snaps');
        expect(rodSnaps.classList.contains('is-route')).toBe(true);
        expect(document.querySelector('.scene-flow-inspector p').textContent).toBe('After rod snaps');

        document.querySelector('.scene-flow-play-button').click();
        expect(startRun).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'preview-child', script: 'FISHY.ADS', tagId: 5, slot: 2, childTag: 3,
        }));
        panel.destroy();
    });
});

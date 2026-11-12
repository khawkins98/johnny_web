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
// The panel opens on the scene list; the Now bar links to the gag Johnny is playing.
const openOnLiveGag = (panel) => {
    panel.open();
    document.querySelector('.story-steps-now .story-steps-link').click();
};
const cardNamed = (pattern) => Array.from(document.querySelectorAll('.story-steps-card'))
    .find((card) => pattern.test(card.getAttribute('aria-label')));
const timeChips = (scope) => Array.from(document.querySelectorAll(`${scope} .story-steps-chip[data-band]`));

describe('scene-flow panel', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the current gag\'s outline, guards, and RANDOM pick on open', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });

        openOnLiveGag(panel);

        const modal = document.getElementById('scene-flow-modal');
        expect(document.getElementById('scene-flow-title').textContent).toBe('Story timeline');
        expect(document.getElementById('scene-flow-subtitle').textContent).toMatch(/^Playing day \d+/);
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
        openOnLiveGag(panel);

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

        expect(() => openOnLiveGag(panel)).not.toThrow();
        const notes = Array.from(document.querySelectorAll('.scene-flow-possibility-note'), (el) => el.textContent);
        expect(notes.some((text) => /isn't loaded yet/.test(text))).toBe(true);
    });

    it('updates live when the running gag changes while open', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        openOnLiveGag(panel);
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
        openOnLiveGag(panel);

        expect(detailName()).toContain('Johnny naps');
    });

    it('opens on the scene list, and plays a picked story scene at a chosen time of day', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        sequenceTools.status = () => ({ active: { script: 'FISHY.ADS', tagId: 5 }, current: 1, total: 2, storyDay: 2, tidePhase: 3 });
        sequenceTools.snapshot = () => [{ script: 'FISHY.ADS', tagId: 6, sequence: { index: 2 } }];
        const startRun = vi.fn();
        const setStoryDay = vi.fn();
        Object.assign(sequenceTools, { startRun, setStoryDay, getStoryDay: () => 2 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        // Where Johnny is, without a ladder of steps to climb.
        expect(document.querySelector('.story-steps-now-where').textContent).toBe('Now: Day 2 · Early dayJohnny fishes');
        expect(document.querySelector('.story-steps-crumbs')).toBeNull();
        expect(document.querySelector('.scene-flow-matrix-detail')).toBeNull();

        // The story: 11 day scenes in order, today marked. Everyday gags: 40, grouped by kind.
        const days = Array.from(document.querySelectorAll('.story-steps-days .story-steps-card'));
        expect(days).toHaveLength(11);
        expect(days[1].getAttribute('aria-label')).toMatch(/^Day 2: .*\(today\)$/);
        expect(Array.from(document.querySelectorAll('.story-steps-family h4'), (h) => h.textContent))
            .toEqual(['Fishing', 'Around the island', 'Camp life', 'Visitors and coconuts', 'Out and about', 'Bottles', 'Odds and ends']);
        expect(document.querySelectorAll('.story-steps-family .story-steps-card')).toHaveLength(40);

        // Day 7's scene: one question, what time of day, defaulting to the time now.
        days[6].click();
        expect(document.querySelector('.story-steps-hero-name').textContent).toMatch(/^Day 7: /);
        const chips = () => timeChips('.story-steps-hero');
        expect(chips().map((chip) => [chip.dataset.band, chip.getAttribute('aria-pressed'), chip.disabled]))
            .toEqual([['early', 'true', false], ['late', 'false', false], ['night', 'false', false]]);
        expect(chips()[0].textContent).toBe('Early day · now');
        chips()[2].click();
        expect(chips()[2].getAttribute('aria-pressed')).toBe('true');
        expect(startRun).not.toHaveBeenCalled(); // Browsing changes nothing.

        document.querySelector('.story-steps .story-steps-play').click();
        expect(startRun).toHaveBeenCalledWith({ mode: 'preview', script: 'MARY.ADS', tagId: 4, storyDay: 7, band: 'night' });
        expect(document.getElementById('scene-flow-overlay').getAttribute('aria-hidden')).toBe('true');

        // Reopening returns to the scene list.
        panel.open();
        expect(document.querySelector('.story-steps-hero')).toBeNull();
        expect(document.querySelector('.story-steps-now')).not.toBeNull();
        panel.destroy();
    });

    it('offers only the times a gag can play, labelled with their local clock times', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        // Start Time 15:00, now phase 12: night is the time now.
        sequenceTools.status = () => ({
            active: { script: 'FISHY.ADS', tagId: 5 }, current: 1, total: 2, storyDay: 2, tidePhase: 12, startTime: 1500,
        });
        Object.assign(sequenceTools, { getStoryDay: () => 2 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        const home = timeChips('.story-steps-section');
        expect(home.map((chip) => chip.getAttribute('aria-label'))).toEqual([
            'Early day, 07:00–11:00, 15:00–19:00, 23:00–03:00',
            'Late day, 03:00–05:00, 11:00–13:00, 19:00–21:00',
            'Night (the time now), 05:00–07:00, 13:00–15:00, 21:00–23:00',
        ]);
        // The filter dims what cannot play then; it does not hide or reorder anything.
        const earlyOnly = cardNamed(/, early day only/);
        expect(earlyOnly.classList.contains('is-dim')).toBe(false);
        home[2].click();
        expect(cardNamed(/, early day only/).classList.contains('is-dim')).toBe(true);
        expect(cardNamed(/, night only/).classList.contains('is-dim')).toBe(false);
        expect(document.querySelectorAll('.story-steps-family .story-steps-card')).toHaveLength(40);

        // An early-day-only gag: the other times are crossed out, and night (now) is not chosen for it.
        cardNamed(/, early day only/).click();
        expect(timeChips('.story-steps-hero').map((chip) => [chip.getAttribute('aria-pressed'), chip.disabled]))
            .toEqual([['true', false], ['false', true], ['false', true]]);
        expect(document.querySelector('.story-steps-hint').textContent).toBe('This one only plays in the early day.');
        panel.destroy();
    });

    it('falls back to the stored Start Time, then 09:00, before a batch reports one', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        sequenceTools.status = () => ({ active: { script: 'FISHY.ADS', tagId: 5 }, current: 1, total: 2, storyDay: 2, tidePhase: 3 });
        Object.assign(sequenceTools, { getStoryDay: () => 2, getStartTime: () => null });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();
        expect(timeChips('.story-steps-section')[2].getAttribute('aria-label')).toBe('Night, 07:00–09:00, 15:00–17:00, 23:00–01:00');
        panel.destroy();
    });

    it('shows the live visit in the Now bar, and starts a day visit from its story scene', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        sequenceTools.status = () => ({ active: { script: 'FISHY.ADS', tagId: 5 }, current: 1, total: 2, storyDay: 2, tidePhase: 3 });
        sequenceTools.snapshot = () => [{ script: 'FISHY.ADS', tagId: 6, sequence: { index: 2 } }];
        const startRun = vi.fn();
        const setStoryDay = vi.fn();
        Object.assign(sequenceTools, { startRun, setStoryDay, getStoryDay: () => 2 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        const chips = Array.from(document.querySelectorAll('.story-steps-now .story-steps-visit button'));
        expect(chips.map((chip) => chip.dataset.role)).toEqual(['live', 'planned']);
        chips[1].click();
        expect(detailName()).toContain('Johnny naps · GAG 2 OF 2');
        // From a planned gag, one link each back to the list and to the running gag.
        expect(Array.from(document.querySelectorAll('.story-steps-backrow button'), (b) => b.textContent)).toEqual(['‹ All scenes', '↖ Johnny now']);
        document.querySelector('.story-steps-backrow .is-live').click();
        expect(detailName()).toContain('Johnny fishes · LIVE GAG');
        document.querySelector('.story-steps-backrow button').click();

        cardNamed(/^Day 2: /).click();
        document.querySelector('.story-steps-actions .story-steps-link').click();
        expect(setStoryDay).not.toHaveBeenCalled(); // A visit is temporary.
        expect(startRun).toHaveBeenCalledWith({ mode: 'sequence', script: 'JOHNNY.ADS', tagId: 2, storyDay: 2, band: 'early' });
        panel.destroy();
    });

    it('passes the chosen time of day to gag and scene actions, and offers Go back while visiting', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        let status = { active: { script: 'FISHY.ADS', tagId: 5 }, storyDay: 2, tidePhase: 3 };
        sequenceTools.status = () => status;
        sequenceTools.startRun = vi.fn();
        sequenceTools.setStoryDay = vi.fn();
        const nightAds = { ...FISHY_ADS, scenes: [{ ...FISHY_ADS.scenes[0], tagId: { id: 1, description: 'Night example' } }] };
        const panel = setupSceneFlowPanel({ resolveEntry: (name) => name === 'MISCGAG.ADS' ? nightAds : resolveEntry(name), sequenceTools });
        const pickAtNight = () => {
            panel.open();
            // A real ordinary gag that also has our synthetic outline.
            cardNamed(/Night example/).click();
            timeChips('.story-steps-hero')[2].click();
        };
        pickAtNight();
        expect(sequenceTools.startRun).not.toHaveBeenCalled();
        expect(sequenceTools.setStoryDay).not.toHaveBeenCalled();
        document.querySelector('.story-steps .story-steps-play').click();
        expect(sequenceTools.startRun).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'preview', storyDay: 2, band: 'night' }));
        pickAtNight();
        document.querySelector('.scene-flow-play-button').click();
        expect(sequenceTools.startRun).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'preview-child', storyDay: 2, band: 'night' }));

        // While visiting, the Now bar says so and offers the way back.
        status = { ...status, storyDay: 6, band: 'night', preview: false };
        panel.open();
        expect(document.querySelector('.story-steps-now-where strong').textContent).toBe('Visiting Day 6 · Night');
        document.querySelector('.story-steps-now .story-steps-play').click();
        expect(sequenceTools.startRun).toHaveBeenLastCalledWith({ mode: 'live' });
        panel.destroy();
    });

    it('shows temporary clock lifetime and scene exceptions, then hides it on live status', () => {
        const startRun = vi.fn();
        let publish;
        const sequenceTools = { startRun, subscribeStatus: (listener) => { publish = listener; return () => {}; } };
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        publish({ storyDay: 5, band: 'early', night: true, forceNight: true, forceHighTide: true, lowTide: false, preview: true });
        const notice = document.getElementById('timeline-clock-notice');
        expect(notice.hidden).toBe(false);
        // Short, plain lines; the tide (which nobody picks) is not mentioned.
        expect([...notice.querySelector('[role="status"]').children].map((line) => line.textContent)).toEqual([
            'Visiting Day 5 · Early day',
            'Just this gag, then back to where you were.',
            'This scene always plays at night.',
        ]);
        expect([...notice.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Go back', 'Stay here']);
        notice.querySelector('button').click();
        expect(startRun).toHaveBeenCalledWith({ mode: 'live' });
        publish({ storyDay: 5, band: null });
        expect(notice.hidden).toBe(true);
        publish({ storyDay: 5, band: 'night', night: true });
        expect(notice.hidden).toBe(false);
        publish(null); // Return to title clears playback without starting a visit.
        expect(notice.hidden).toBe(true);
        panel.destroy();
        expect(document.getElementById('timeline-clock-notice')).toBeNull();
    });

    it('keeps the visit as the saved position without starting another run, and says where you came from', () => {
        let publish;
        const startRun = vi.fn(), keepVisit = vi.fn();
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools: {
            startRun, keepVisit, getStoryDay: () => 1, subscribeStatus: (listener) => { publish = listener; return () => {}; },
        } });
        localStorage.setItem('jc-time', 'local');
        publish({ storyDay: 3, band: 'night', night: true, forceHighTide: true, preview: true });
        expect([...document.querySelector('#timeline-clock-notice [role="status"]').children].map((line) => line.textContent)).toEqual([
            'Visiting Day 3 · Night',
            'Just this gag, then back to where you were.',
        ]);
        document.querySelector('#timeline-save-clock').click();
        expect(localStorage.getItem('jc-time')).toBe('original');
        expect(keepVisit).toHaveBeenCalledOnce();
        // Staying must not cut to a different scene.
        expect(startRun).not.toHaveBeenCalled();
        publish({ band: null });
        expect(document.querySelector('#timeline-clock-notice').hidden).toBe(true);
        panel.destroy();
    });

    it('tidies the script outline: hides loaders and merges steps that wait on the same scene', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 7 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        openOnLiveGag(panel);

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
        openOnLiveGag(panel);

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

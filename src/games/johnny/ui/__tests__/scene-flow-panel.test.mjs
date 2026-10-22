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
        expect(guards).toEqual(['at the start', 'after "rod snaps"']);

        // jsdom has no real `innerText` (it doesn't compute layout), so it only
        // reflects text assigned directly to that node -- read `.textContent`
        // (real DOM aggregation) for containers built from child elements.
        const targets = Array.from(modal.querySelectorAll('.scene-flow-targets'));
        expect(targets[0].textContent).toContain('rod snaps');
        expect(targets[1].textContent).toContain('picks one of:');
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

    it('deals the visit as a card spread, falling back to a flat grid without WebGL', async () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        sequenceTools.status = () => ({ active: { script: 'FISHY.ADS', tagId: 5 }, current: 1, storyDay: 2, tidePhase: 3 });
        sequenceTools.snapshot = () => [{ script: 'FISHY.ADS', tagId: 6, sequence: { index: 2 } }];
        const startRun = vi.fn();
        sequenceTools.startRun = startRun;
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();

        await vi.waitFor(() => expect(document.querySelector('.story-doors')).not.toBeNull());
        const spread = document.querySelector('.story-doors');
        expect(spread.classList.contains('is-flat')).toBe(true);
        const roles = Array.from(spread.querySelectorAll('.story-doors-card'), (b) => b.dataset.role);
        expect(roles.slice(0, 2)).toEqual(['live', 'planned']);
        expect(roles.filter((role) => role === 'deck').length).toBeGreaterThan(0);
        expect(spread.querySelector('.story-doors-caption').textContent).toMatch(/Day 02 of 11 · tide phase 3 · high tide/);
        expect(spread.querySelector('.story-doors-info').textContent).toContain('Johnny fishes');

        // Selecting the planned card inspects it in the detail section, keeps
        // the same spread mounted, and offers to play it.
        spread.querySelector('.story-doors-card[data-role="planned"]').click();
        await vi.waitFor(() => expect(detailName()).toContain('Johnny naps'));
        expect(document.querySelector('.story-doors')).toBe(spread);
        expect(spread.querySelector('.story-doors-card[aria-pressed="true"]').dataset.role).toBe('planned');
        const play = Array.from(spread.querySelectorAll('.story-doors-actions button'))
            .find((button) => button.textContent.includes('Play this gag'));
        play.click();
        expect(startRun).toHaveBeenCalledWith({ mode: 'sequence', script: 'FISHY.ADS', tagId: 6, storyDay: 2 });
        expect(document.getElementById('scene-flow-overlay').getAttribute('aria-hidden')).toBe('true');

        panel.destroy();
        expect(document.querySelector('.story-doors')).toBeNull();
    });
});

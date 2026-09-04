import { beforeEach, describe, expect, it } from 'vitest';
import { setupSceneFlowPanel } from '../scene-flow-panel.mjs';

// Synthetic ADS bytecode ops, matching the shape scene-flow.test.mjs uses. Real
// ADS ops carry a numeric `opcode` (which the slot model in ads-slots.mjs reads
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

describe('scene-flow panel', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the current gag\'s outline, guards, and RANDOM pick on open', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });

        panel.open();

        const modal = document.getElementById('scene-flow-modal');
        expect(document.getElementById('scene-flow-title').textContent).toBe('Johnny fishes');
        expect(document.getElementById('scene-flow-subtitle').textContent).toBe('FISHY.ADS · tag 5');

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
        expect(document.querySelector('.scene-flow-empty')).not.toBeNull();
    });

    it('updates live when the running gag changes while open', () => {
        const sequenceTools = makeSequenceTools({ script: 'FISHY.ADS', tagId: 5 });
        const panel = setupSceneFlowPanel({ resolveEntry, sequenceTools });
        panel.open();
        expect(document.getElementById('scene-flow-title').textContent).toBe('Johnny fishes');

        sequenceTools.setActive({ script: 'FISHY.ADS', tagId: 6 });

        expect(document.getElementById('scene-flow-title').textContent).toBe('Johnny naps');
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

        expect(document.getElementById('scene-flow-title').textContent).toBe('Johnny naps');
    });
});

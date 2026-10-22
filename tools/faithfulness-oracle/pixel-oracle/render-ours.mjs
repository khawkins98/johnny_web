#!/usr/bin/env node
// render-ours.mjs -- headless "what the browser shows" for any gag x seed.
//
// Drives the gag on the sanctioned single-gag path (driveGag) and presents every
// tick through the browser's own frame presenter (createBrowserFramePresenter ->
// composeTtmFrame for the foreground, drawBackground for the background), backed by
// a software Canvas 2D (soft-canvas.mjs). Nothing about the background is
// reimplemented here: it is the browser code running on a fake canvas.
//
// Each tick yields two layers, the same two canvases the page stacks:
//   bg  main canvas (drawBackground + host decorator), RGBA
//   fg  foreground canvas (composeTtmFrame's surface), RGBA
// plus `bgKind`, which says whose background it is:
//   'gag'  a screen the gag's own TTM loaded and the original draws itself
//          (SUZBEACH, JOFFICE, THEEND, INTRO: background id 0 in the manifest)
//   'host' the island/ocean (ISLETEMP, ISLAND2, OCEANnn, NIGHT, or the host
//          island layers): owned by the host, not by the gag script
//   'none' nothing drawn
//
// Host modes (--host):
//   forced (default) what a forced capture of the original shows: no host island
//          is painted (the forced director skips the planner's island bake), the
//          island origin is (0, 0), and LEFT_ISLAND scenes keep their +272 x scene
//          offset, which the original applies even when forced.
//   none   no host selection at all (no titleState).
//   story  the story controller's preview selection for the gag (island layout,
//          ocean, raft, tide, clouds), painted by the Johnny island presenter, as the
//          story-timeline preview does. Deterministic (fixed date, seeded random).
//
// CLI (for eyeballing; writes PNGs of the composited frame):
//   node render-ours.mjs <ADS.NAME> <tag> [--seed 1] [--host forced|none|story]
//        [--ticks 10,50,200 | --every 50] [--out dir]
// Library: renderOurs({ adsName, tag, seed, host, onFrame }).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { driveGag, hasData, resolveEntry, seededRandom } from '../../../src/dgds/scripting/__tests__/support/drive-gag.mjs';
import { createBrowserFramePresenter } from '../../../src/dgds/hosts/browser-frame-presenter.mjs';
import { createBrowserPresentationPolicy } from '../../../src/dgds/hosts/browser-presentation-policy.mjs';
import { withHostBackground } from '../../../src/bottle/host-background.mjs';
import { createJohnnySelectionPresenter } from '../../../src/games/johnny/island-presenter.mjs';
import { JOHNNY_SCENES, SceneFlags, createJohnnyStoryController } from '../../../src/games/johnny/story-controller.mjs';
import { johnnyCastaway } from '../../../src/games/johnny/manifest.mjs';
import { isTtmFinished } from '../../../src/dgds/scripting/ttm-run-state.mjs';
import { DGDS_TICK_MS } from '../../../src/dgds/scripting/timing.mjs';
import { SoftCanvas, installSoftDocument } from './soft-canvas.mjs';
import { sideBySide, writePng } from './images.mjs';

export { hasData };

installSoftDocument();

const memoryStorage = (values = {}) => ({
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
        values[key] = String(value);
    },
});

/** Live set as the faithfulness oracle samples it (fingerprint.mjs isDrawing). */
export const liveKeys = (state) =>
    state.scenes
        .filter((scene) => !isTtmFinished(scene))
        .map((scene) => `${scene.sceneIdx}:${scene.tagId}`)
        .sort();

const backgroundSource = (state) => state.scenes.find((scene) => scene?.state?.bkgScreen)?.state ?? state;

const classifyBackground = (state, hostPainted) => {
    const source = backgroundSource(state);
    if (source.bkgScreen) return source.backgroundId === 0 ? 'gag' : 'host';
    if (hostPainted) return 'host';
    return 'none';
};

/** Host selection a forced capture corresponds to (see the header). */
export const forcedTitleState = (adsName, tag) => {
    const scene = JOHNNY_SCENES.find((s) => s.script === adsName && s.tagId === Number(tag));
    const left = scene && (scene.flags & SceneFlags.LEFT_ISLAND) !== 0;
    return Object.freeze({ island: false, x: 0, y: 0, sceneOffset: Object.freeze({ x: left ? 272 : 0, y: 0 }) });
};

/** Deterministic story selection for --host story (fixed noon date, seeded random). */
const storySelection = (adsName, tag, seed) => {
    const controller = createJohnnyStoryController({
        random: seededRandom(0x5eed0000 + seed),
        storage: memoryStorage(),
        now: () => new Date(2026, 0, 15, 12, 0, 0),
    });
    return controller.preview(adsName, tag);
};

/**
 * Render one gag headless, presenting every tick the way the browser does.
 * @param {object} o
 * @param {string} o.adsName  e.g. 'SUZY.ADS'
 * @param {number} o.tag
 * @param {number} [o.seed=1] driveGag seed
 * @param {'forced'|'none'|'story'} [o.host='forced']
 * @param {number} [o.maxTicks=6000]
 * @param {(frame: {tick:number, live:string[], fg:Uint8ClampedArray, bg:Uint8ClampedArray,
 *   bgKind:string, state:object}) => void|boolean} o.onFrame  called after every tick;
 *   the arrays are live views, copy them to keep. Return true to stop early.
 * @returns {{completed:boolean, ticks:number}}
 */
export const renderOurs = ({ adsName, tag, seed = 1, host = 'forced', maxTicks = 6000, onFrame }) => {
    const fgCanvas = new SoftCanvas(640, 480);
    const bgCanvas = new SoftCanvas(640, 480);
    let clock = 0;
    const policy = createBrowserPresentationPolicy({
        // Settings at their defaults (clouds off, waves on, original time-of-day).
        storage: memoryStorage(),
        now: () => clock,
        currentHour: () => 12,
        random: seededRandom(0x0b5e0000 + seed),
    });
    let titleState = null;
    let backgroundDecorator = null;
    let hostPainted = false;
    if (host === 'story') {
        const selection = storySelection(adsName, tag, seed);
        titleState = selection.titleState;
        const presenter = createJohnnySelectionPresenter({
            game: johnnyCastaway,
            resourceProvider: { resolve: resolveEntry },
            presentationPolicy: policy,
        });
        backgroundDecorator = withHostBackground({
            presentHost: (target) => {
                const painted = presenter(selection, target);
                hostPainted = Boolean(painted);
                return painted;
            },
            backgroundDecorator: null,
        });
    } else if (host === 'forced') {
        titleState = forcedTitleState(adsName, tag);
    } else if (host !== 'none') {
        throw new Error(`unknown host mode ${host}`);
    }
    const framePresenter = createBrowserFramePresenter({
        context: fgCanvas.getContext('2d'),
        mainContext: bgCanvas.getContext('2d'),
        presentationPolicy: policy,
        backgroundDecorator,
        preserveInitialForeground: true,
    });
    let stopped = false;
    const result = driveGag({
        adsName,
        tag,
        seed,
        maxTicks,
        titleState,
        onTick: (runtime, tickResult, tick) => {
            if (stopped) return;
            clock = tick * DGDS_TICK_MS;
            hostPainted = false;
            framePresenter.present(runtime.state, tickResult.presentation);
            const stop = onFrame?.({
                tick,
                live: liveKeys(runtime.state),
                fg: fgCanvas.data,
                bg: bgCanvas.data,
                bgKind: classifyBackground(runtime.state, hostPainted),
                state: runtime.state,
            });
            if (stop === true) stopped = true;
        },
    });
    return { completed: result.completed, ticks: result.ticks };
};

/** fg-over-bg-over-black composite, as the stacked page canvases show it. */
export const compositeRgb = (fg, bg, { bgFilter = null } = {}) => {
    const rgb = new Uint8Array(640 * 480 * 3);
    for (let p = 0, q = 0; p < fg.length; p += 4, q += 3) {
        const useBg = bg && bg[p + 3] > 0 && (!bgFilter || bgFilter(p));
        if (fg[p + 3] > 0) {
            const a = fg[p + 3] / 255;
            const br = useBg ? bg[p] : 0;
            const bgc = useBg ? bg[p + 1] : 0;
            const bb = useBg ? bg[p + 2] : 0;
            rgb[q] = Math.round(fg[p] * a + br * (1 - a));
            rgb[q + 1] = Math.round(fg[p + 1] * a + bgc * (1 - a));
            rgb[q + 2] = Math.round(fg[p + 2] * a + bb * (1 - a));
        } else if (useBg) {
            rgb[q] = bg[p];
            rgb[q + 1] = bg[p + 1];
            rgb[q + 2] = bg[p + 2];
        }
    }
    return { width: 640, height: 480, rgb };
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
    const argv = process.argv.slice(2);
    const flag = (name, fallback) => {
        const i = argv.indexOf(name);
        return i === -1 ? fallback : argv[i + 1];
    };
    const [adsArg, tagArg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
    if (!adsArg || tagArg === undefined) {
        console.error('usage: render-ours.mjs <ADS.NAME> <tag> [--seed 1] [--host forced|none|story] [--ticks a,b | --every N] [--out dir]');
        process.exit(2);
    }
    if (!hasData) {
        console.log('# no game data (public/data) -- nothing to render');
        process.exit(0);
    }
    const adsName = adsArg.endsWith('.ADS') ? adsArg : `${adsArg}.ADS`;
    const tag = Number(tagArg);
    const seed = Number(flag('--seed', '1'));
    const host = flag('--host', 'forced');
    const ticks = new Set((flag('--ticks', '') || '').split(',').filter(Boolean).map(Number));
    const every = Number(flag('--every', ticks.size ? '0' : '50'));
    const out = path.resolve(flag('--out', path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../scratchpad/render-ours')));
    mkdirSync(out, { recursive: true });
    let lastLive = '';
    const res = renderOurs({
        adsName,
        tag,
        seed,
        host,
        onFrame: ({ tick, live, fg, bg, bgKind }) => {
            const key = live.join(' ');
            if (key !== lastLive) console.log(`t=${tick} live=[${key}] bg=${bgKind}`);
            lastLive = key;
            if (ticks.has(tick) || (every && tick % every === 0)) {
                const file = path.join(out, `${adsName.replace('.ADS', '')}_${tag}_s${seed}_${host}_t${String(tick).padStart(5, '0')}.png`);
                writePng(file, sideBySide([compositeRgb(fg, bg), compositeRgb(fg, null), compositeRgb(new Uint8ClampedArray(fg.length), bg)]));
            }
        },
    });
    console.log(JSON.stringify(res));
}

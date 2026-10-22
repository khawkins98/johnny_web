/**
 * scene-flow-panel.mjs — the in-app "How it works" panel.
 *
 * Keeps story days, the current visit, and a selected gag's authored ADS steps
 * visible in one timeline matrix. The local and full-script graphs use Three.js;
 * HTML buttons expose every scene to pointer and keyboard navigation. The
 * original outline remains below the map. Both use the extractor that builds
 * docs/scene-flows/*.md (src/dgds/scripting/scene-flow.mjs).
 *
 * Dependencies are injected rather than imported directly so this stays
 * decoupled from how the host loads game data or tracks the running gag:
 *   - `resolveEntry(name)` decodes one named resource from the loaded archive
 *     (an ADS or TTM entry) -- see createEntryResourceProvider in
 *     src/dgds/resource-provider.mjs, or resource.loadEntry from loadResources.
 *   - `sequenceTools.status()` / `subscribeStatus(listener)` report the running
 *     gag as `{ active: { script, tagId } }` -- see story-controller.mjs.
 */
import {
    buildSceneFlowLabelResolver,
    extractSceneFlow,
    outlineSceneFlowSteps,
} from '../../../dgds/scripting/scene-flow.mjs';
import { bandForPhase, gagFacts, keySceneFor, visitSequence } from '../story-steps.mjs';
import { STEPPER_STYLE, renderStoryStepper } from './story-stepper.mjs';
import { createCardFaceQueue } from './story-card-faces.mjs';
import { buildSceneFlowMap } from './scene-flow-graph.mjs';
import { iconTooltipCss, labelIconShortcut } from './icon-tooltip.mjs';

const REPO_URL = 'https://github.com/khawkins98/johnny_web';
// The git ref the "see the source / docs" links point at. `main` is correct once
// this branch is merged; kept as a single named constant so it's a one-line
// change if we ever need to pin these deep links to a tag/commit instead.
const DOCS_REF = 'main';
const DOCS_BASE = `${REPO_URL}/blob/${DOCS_REF}/docs/scene-flows`;
const EXTRACTOR_URL = `${REPO_URL}/blob/${DOCS_REF}/src/dgds/scripting/scene-flow.mjs`;
const METHODOLOGY_URL = `${REPO_URL}/blob/${DOCS_REF}/tools/faithfulness-oracle/METHODOLOGY.md`;

export function setupSceneFlowPanel({ resolveEntry = () => null, sequenceTools = null } = {}) {
    const style = document.createElement('style');
    style.innerHTML = `
        #scene-flow-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 2000;
            background: rgba(0, 6, 12, 0.48);
            backdrop-filter: blur(1px);
            justify-content: center;
            align-items: center;
        }

        #scene-flow-modal {
            background: #d4c4a8;
            border: 3px solid #8b5a2b;
            border-radius: 2px;
            box-shadow: 0 18px 44px rgba(0,0,0,0.52), 0 3px 8px rgba(0,0,0,0.32), inset 2px 2px 0 #f0dfbc;
            width: calc(100vw - 24px);
            max-width: none;
            max-height: calc(100vh - 24px);
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 12px 14px 14px;
            font-family: 'Caveat', cursive;
            color: #4a3520;
            position: relative;
        }

        #scene-flow-title {
            font-size: 34px;
            margin: 0 0 2px 0;
            text-align: center;
            text-shadow: 1px 1px 0px rgba(255,255,255,0.5);
            text-wrap: balance;
        }

        #scene-flow-subtitle {
            text-align: center;
            font-family: 'VT323', monospace;
            font-size: 16px;
            margin: 0 0 7px 0;
            padding-bottom: 3px;
        }

        .scene-flow-map-shell {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 260px;
            gap: 8px;
            min-height: 0;
            align-items: start;
            font-family: 'VT323', monospace;
        }
        .scene-flow-map-main {
            min-width: 0;
            background: #071998;
            box-shadow: inset 0 0 0 2px #31b7e6;
            padding: 8px;
            color: #fff9ab;
        }
        .scene-flow-map-heading {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            padding: 1px 10px 4px;
            font-size: 19px;
            letter-spacing: .04em;
        }
        .scene-flow-map-tools { display: flex; align-items: center; gap: 5px; color: #80e7ec; }
        .scene-flow-map-tools button { min-width: 40px; min-height: 40px; border: 1px solid #3cb8e5; background: #123bb2; color: #fff8b5; font: 20px/1 'VT323', monospace; cursor: pointer; }
        .scene-flow-map-tools button:hover { background: #2762cd; }
        .scene-flow-map-tools button:active { scale: .96; }
        .scene-flow-map-tools .scene-flow-mode-button { min-width: 94px; padding: 0 6px; font-size: 17px; }
        .scene-flow-viewport {
            height: 224px;
            overflow: hidden;
            position: relative;
            cursor: grab;
            background: repeating-linear-gradient(0deg, transparent 0 15px, rgba(83,219,255,.12) 16px 17px), #071998;
            touch-action: none;
        }
        .scene-flow-viewport.is-dragging { cursor: grabbing; }
        .scene-flow-viewport[data-mode="focus"] { cursor: default; }
        .scene-flow-viewport canvas,
        .scene-flow-map-labels { position: absolute; inset: 0; width: 100%; height: 100%; }
        .scene-flow-map-labels { pointer-events: none; }
        .scene-map-node {
            position: absolute;
            transform: translate(-50%, -50%);
            width: 42px;
            min-height: 40px;
            padding: 3px 5px;
            border: 2px solid #00d9ec;
            border-radius: 0;
            background: #0a258e;
            box-shadow: 3px 3px 0 #020d5b;
            color: #fffbe2;
            font: 19px/0.95 'VT323', monospace;
            text-align: center;
            cursor: pointer;
            pointer-events: auto;
            overflow-wrap: anywhere;
            transition-property: background-color, color, border-color, scale;
            transition-duration: 130ms;
        }
        .scene-map-node:hover, .scene-map-node:focus-visible { background: #1d49b5; outline: 2px solid #fff; outline-offset: 2px; }
        .scene-map-node:active { scale: .96; }
        .scene-map-node:not(.is-start):hover::after,
        .scene-map-node:not(.is-start):focus-visible::after,
        .scene-map-node:not(.is-start).is-selected::after {
            content: attr(data-name);
            position: absolute;
            z-index: 5;
            bottom: calc(100% + 5px);
            left: 50%;
            transform: translateX(-50%);
            min-width: 90px;
            max-width: 150px;
            padding: 4px 5px;
            background: #fff4c7;
            color: #312515;
            border: 2px solid #e2a42f;
            font-size: 16px;
            line-height: 1;
            white-space: normal;
            box-shadow: 3px 3px 0 #020d5b;
        }
        .scene-map-node.is-route { border-color: #91e6ec; }
        .scene-map-node.is-selected { background: #2855b5; color: #fffbe2; border-color: #fff; outline: 2px solid #fff; outline-offset: 2px; z-index: 2; }
        .scene-map-node:hover, .scene-map-node:focus-visible { z-index: 20; }
        .scene-map-node.is-start { width: 110px; font-size: 18px; }
        .scene-map-node.is-focus-node { width: 132px; min-height: 50px; font-size: 18px; }
        .scene-map-node.is-focus-node.is-selected { width: 150px; }
        .scene-map-node.is-focus-node::after { display: none; }
        .scene-flow-map-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 5px 8px 0; font-size: 15px; color: #b9eaf0; }
        .scene-flow-map-legend { display: flex; flex-wrap: wrap; gap: 5px 12px; }
        .scene-flow-map-legend b { font-weight: normal; }
        .scene-flow-map-legend .route { color: #a7edf1; }
        .scene-flow-map-legend .random { color: #ffad65; }
        .scene-flow-map-aside {
            padding: 10px 12px;
            color: #3b2c1c;
            background: #f4e4c8;
            box-shadow: inset 0 0 0 2px #8b5a2b;
            font-size: 18px;
        }
        .scene-flow-inspector h3 { margin: 10px 0 0; font: 26px/1 'Caveat', cursive; }
        .scene-flow-inspector p { margin: 5px 0; line-height: 1.08; }
        .scene-flow-inspector .scene-flow-inspector-kicker { color: #795023; text-transform: uppercase; font-size: 15px; }
        .scene-flow-preview-stage { position: relative; width: 100%; aspect-ratio: 4 / 3; margin: 8px 0 4px; overflow: hidden; background: #071998; border: 2px solid #8b5a2b; box-sizing: border-box; }
        .scene-flow-preview-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
        .scene-flow-preview-caption { display: block; color: #795023; font-size: 15px; line-height: 1.05; }
        .scene-flow-play-button { width: 100%; min-height: 42px; margin-top: 8px; padding: 5px 8px; border: 2px solid #704a1e; background: #ffe02d; color: #302816; font: 20px/1 'VT323', monospace; cursor: pointer; }
        .scene-flow-play-button:hover { background: #fff177; }
        .scene-flow-play-button:active { scale: .96; }
        .scene-flow-preview-note { display: block; color: #795023; font-size: 15px; line-height: 1.05; }
        .scene-flow-route-controls { display: flex; gap: 5px; margin-top: 10px; }
        .scene-flow-route-controls button, .scene-flow-next button {
            border: 2px solid #8b5a2b; background: #ffefce; color: #4a3520;
            font: 18px/1 'VT323', monospace; cursor: pointer; min-height: 40px;
        }
        .scene-flow-route-controls button { flex: 1; }
        .scene-flow-route-controls button:disabled { opacity: .43; cursor: default; }
        .scene-flow-route-controls button:not(:disabled):hover, .scene-flow-next button:hover { background: #fff9e9; }
        .scene-flow-route-controls button:not(:disabled):active, .scene-flow-next button:active { scale: .96; }
        .scene-flow-next { margin-top: 12px; max-height: 198px; overflow-y: auto; }
        .scene-flow-next-title { display: block; color: #795023; border-bottom: 1px dashed #ad8051; margin-bottom: 4px; }
        .scene-flow-next button { width: 100%; text-align: left; padding: 4px 6px; margin: 3px 0; }
        .scene-flow-next small { display: block; color: #855a35; font-size: 15px; }
        .scene-flow-decision-lane { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; max-height: none; overflow: visible; border-top: 1px dashed #65c8e2; padding-top: 8px; margin-top: 9px; }
        .scene-flow-decision-lane .scene-flow-next-title { grid-column: 1 / -1; color: #b9eaf0; border: 0; margin: 0; font-size: 17px; }
        .scene-flow-decision-lane button { min-height: 48px; margin: 0; padding: 6px 8px; border-color: #65c8e2; background: #173ba6; color: #fffbe2; }
        .scene-flow-decision-lane button:hover { background: #2857bc; }
        .scene-flow-decision-lane small { color: #bbdfed; }
        .scene-flow-story-shell { padding: 13px 15px; background: #071998; box-shadow: inset 0 0 0 2px #31b7e6; color: #fff9c5; font: 19px/1.1 'VT323', monospace; }
        .scene-flow-story-intro { display: flex; justify-content: space-between; gap: 12px; align-items: end; border-bottom: 1px dashed #54bfeb; padding-bottom: 10px; }
        .scene-flow-story-intro h3 { margin: 0 0 3px; font: 24px/1 'Caveat', cursive; color: #fff2a1; }
        .scene-flow-story-intro p { margin: 0; color: #c3e6ec; font-size: 17px; }
        .scene-flow-story-intro button { min-height: 42px; padding: 4px 12px; border: 2px solid #68d5e7; background: #1642b1; color: #fffbdc; font: 18px/1 'VT323', monospace; cursor: pointer; }
        .scene-flow-story-intro button:hover { background: #2860c7; }
        .scene-flow-story-intro button:disabled { opacity: .55; cursor: default; }
        .scene-flow-possibility-note { margin: 0 0 10px; color: #c3e6ec; font-size: 17px; }
        .scene-flow-matrix-detail { margin-top: 9px; border-top: 1px dashed #65c8e2; padding-top: 9px; }
        .scene-flow-matrix-detail-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: #b9eaf0; font-size: 17px; letter-spacing: .04em; }
        .scene-flow-matrix-detail-heading strong { color: #fff6c7; font-weight: normal; font-size: 20px; }
        .scene-flow-next-story { background: #ffe02d !important; color: #302816 !important; border-color: #704a1e !important; }
        .scene-flow-script-details { margin-top: 12px; color: #3b2c1c; font-family: 'VT323', monospace; font-size: 18px; }
        .scene-flow-script-details summary { cursor: pointer; min-height: 40px; padding: 8px; background: #ead7b8; }
        .scene-flow-outline { margin-top: 8px; }
        @media (max-width: 730px) {
            .scene-flow-map-shell { grid-template-columns: 1fr; }
            .scene-flow-viewport { height: min(30vh, 230px); }
            .scene-flow-map-aside { min-height: 160px; }
            #scene-flow-modal { padding: 14px 12px; }
            .scene-flow-map-hint { display: none; }
            .scene-map-node.is-focus-node { width: 88px; font-size: 15px; }
            .scene-map-node.is-focus-node.is-selected { width: 98px; }
            .scene-flow-map-tools .scene-flow-mode-button { min-width: 84px; }
            .scene-flow-story-shell { padding: 14px 12px; }
            .scene-flow-story-intro { align-items: start; flex-direction: column; }
            .scene-flow-decision-lane { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }

        .scene-flow-close {
            position: absolute;
            top: 12px;
            right: 14px;
            background: rgba(244, 228, 200, 0.72);
            color: #4a3520;
            border: 2px solid #8b5a2b;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            font-family: 'VT323', monospace;
            display: flex;
            justify-content: center;
            align-items: center;
            box-shadow: 0 3px 7px rgba(0,0,0,0.22), inset 0 1px rgba(255,255,255,0.5);
        }

        .scene-flow-close:hover {
            background: #fff4dc;
        }

        .scene-flow-empty {
            font-family: 'VT323', monospace;
            font-size: 18px;
            text-align: center;
            padding: 18px 6px;
        }

        .scene-flow-outline { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; counter-reset: step; }
        .scene-flow-step { display: grid; grid-template-columns: minmax(150px, 260px) 1fr; gap: 4px 14px; align-items: baseline;
            padding: 8px 12px 8px 40px; position: relative; background: #f4e4c8; border: 2px solid #8b5a2b; counter-increment: step; }
        .scene-flow-step::before { content: counter(step); position: absolute; left: 10px; top: 8px; font: 20px/1 'VT323', monospace; color: #8b5a2b; }
        .scene-flow-guard { font: 18px/1.15 'VT323', monospace; color: #6b4a24; }
        .scene-flow-guard strong { font-weight: normal; color: #302816; }
        .scene-flow-targets { display: flex; flex-wrap: wrap; gap: 4px 14px; font: 21px/1.15 'VT323', monospace; color: #302816; }
        .scene-flow-target strong, .scene-flow-pick strong { font-weight: normal; }
        .scene-flow-target::before { content: '→ '; color: #8b5a2b; }
        .scene-flow-target.is-stop { color: #9a3412; }
        .scene-flow-target.is-stop::before { content: '■ '; }
        .scene-flow-pick-lead { flex-basis: 100%; color: #6b4a24; font-size: 18px; }
        .scene-flow-pick::before { content: '◆ '; color: #c2410c; }
        @media (max-width: 640px) { .scene-flow-step { grid-template-columns: 1fr; } }

        .scene-flow-links {
            margin-top: 18px;
            padding-top: 14px;
            border-top: 2px dashed rgba(139, 90, 43, 0.72);
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .scene-flow-link {
            font-size: 19px;
            color: #2c5e8b;
            text-decoration: underline;
            text-decoration-style: wavy;
        }

        .scene-flow-link:hover {
            color: #1a3c5c;
        }

        #scene-flow-cog {
            position: fixed;
            top: 14px;
            left: 66px;
            z-index: 1800;
            width: 44px;
            height: 44px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: #d4c4a8;
            color: #4a3520;
            box-shadow:
                0 0 0 2px rgba(139, 90, 43, 0.72),
                0 5px 14px rgba(0, 0, 0, 0.34),
                inset 0 1px rgba(255, 255, 255, 0.48);
            cursor: pointer;
            font-family: sans-serif;
            font-size: 20px;
            line-height: 44px;
            opacity: 0;
            scale: 0.25;
            filter: blur(4px);
            pointer-events: none;
            transition-property: opacity, scale, filter, background-color;
            transition-duration: 180ms;
            transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
        }

        #scene-flow-cog.is-visible {
            opacity: 1;
            scale: 1;
            filter: blur(0);
            pointer-events: auto;
        }

        #scene-flow-cog:hover {
            background: #f4e4c8;
        }
        #scene-flow-cog.is-visible:active { scale: .96; }
        #scene-flow-cog:focus-visible { outline: 3px solid rgba(244, 228, 200, 0.86); outline-offset: 3px; }
        .scene-flow-day-strip { margin: 6px 0 4px; }
        .scene-flow-day-buttons { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); border: 2px solid #65c8e2; }
        .scene-flow-day-buttons button { min-height: 52px; padding: 5px 4px; border: 0; border-right: 1px solid #527bbb; background: #102d8f; color: #bde9e9; cursor: pointer; text-align: center; overflow: hidden; }
        .scene-flow-day-buttons button:last-child { border-right: 0; }
        .scene-flow-day-buttons button strong { display: block; font: 22px/1 'VT323', monospace; font-variant-numeric: tabular-nums; }
        .scene-flow-day-buttons button small { display: block; margin-top: 2px; font: 15px/1 'VT323', monospace; color: #a4e5de; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .scene-flow-day-buttons button[aria-current="date"] { background: #ffe02d; color: #302816; }
        .scene-flow-day-buttons button[aria-current="date"] small { color: #5b4a1c; }
        .scene-flow-day-buttons button[aria-pressed="true"] { box-shadow: inset 0 0 0 3px #fffbe2; }
        .scene-flow-day-buttons button:hover { background: #1642b1; }
        .scene-flow-day-buttons button[aria-current="date"]:hover { background: #ffe86a; }
        .scene-flow-day-buttons button:focus-visible { outline: 3px solid #ffe02d; outline-offset: -3px; }
        .scene-flow-day-pick { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 10px; border: 2px solid #65c8e2; border-top: 0; background: #0b2384; color: #fffbdc; }
        .scene-flow-day-pick[hidden] { display: none; }
        .scene-flow-day-pick button { min-height: 40px; padding: 4px 14px; border: 2px solid #704a1e; background: #ffe02d; color: #302816; font: 20px/1 'VT323', monospace; cursor: pointer; }
        .scene-flow-day-pick button:disabled { opacity: .5; cursor: default; }
        @media (max-width: 720px) {
            .scene-flow-day-buttons { grid-template-columns: repeat(6, minmax(0, 1fr)); }
            .scene-flow-day-buttons button small { display: none; }
        }
        ${iconTooltipCss}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'scene-flow-overlay';

    const modal = document.createElement('div');
    modal.id = 'scene-flow-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'scene-flow-title');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'scene-flow-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close story timeline');
    let previousFocus = null;
    let isOpen = false;
    const close = () => {
        isOpen = false;
        mapGeneration++;
        previewGeneration++;
        mountedMap?.destroy();
        mountedMap = null;
        mountedPreview?.destroy();
        mountedPreview = null;
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        previousFocus?.focus?.();
    };
    closeBtn.onclick = close;
    modal.appendChild(closeBtn);

    const title = document.createElement('h2');
    title.id = 'scene-flow-title';
    modal.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.id = 'scene-flow-subtitle';
    modal.appendChild(subtitle);

    const body = document.createElement('div');
    modal.appendChild(body);
    let mountedMap = null;
    let selectedKey = null;
    let trail = [];
    let trailIndex = -1;
    let seenGags = [];
    let mapGeneration = 0;
    let mountedPreview = null;
    let previewGeneration = 0;
    let renderedGagId = null;
    // Story steps (issue #47): which day, then which tide, then which gag.
    // `step` is where the viewer is; while `followLive` holds it tracks Johnny.
    let step = null;
    let faceQueue = null;
    const stepperStyle = document.createElement('style');
    stepperStyle.textContent = STEPPER_STYLE;
    document.head.appendChild(stepperStyle);
    const liveSpot = (status) => ({
        day: status?.storyDay || sequenceTools?.getStoryDay?.() || 1,
        band: bandForPhase(status?.tidePhase)?.id ?? null,
        gag: status?.active ? gagFacts({ ...status.active, index: status.current }) : null,
    });
    const followLive = (status) => {
        const live = liveSpot(status);
        step = { level: 'detail', day: live.day, band: live.band ?? 'early', gag: live.gag, followLive: true };
    };
    const playGag = (gag, day) => {
        if (typeof sequenceTools?.startRun !== 'function') return false;
        try {
            sequenceTools.startRun({
                mode: 'sequence', script: gag.script, tagId: gag.tagId, storyDay: gag.keyDay || day,
            });
            close();
            return true;
        } catch {
            return false;
        }
    };

    const playScriptScene = ({ script, gagTag, day, key, route, onError }) => {
        const [slot, childTag] = key.split(':').map(Number);
        if (typeof sequenceTools?.startRun !== 'function' || !Number.isInteger(slot) ||
            !Number.isInteger(childTag)) {
            onError?.();
            return;
        }
        try {
            sequenceTools.startRun({ mode: 'preview-child', script, tagId: gagTag,
                storyDay: day, slot, childTag, route });
            close();
        } catch {
            onError?.();
        }
    };

    const links = document.createElement('div');
    links.className = 'scene-flow-links';
    modal.appendChild(links);

    overlay.appendChild(modal);
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
    // Named so destroy() can remove it (window listeners outlive the modal DOM).
    const onKeydown = (e) => {
        if (e.key === 'Escape' && overlay.style.display === 'flex') close();
        if (e.key !== 't' && e.key !== 'T') return;
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target?.matches?.('input, select, textarea, [contenteditable="true"]')) return;
        if (document.getElementById('settings-overlay')?.getAttribute('aria-hidden') === 'false') return;
        e.preventDefault();
        if (isOpen) close();
        else open();
    };
    window.addEventListener('keydown', onKeydown);

    // Floating reveal button, matching the settings cog's mousemove reveal.
    const cog = document.createElement('button');
    cog.id = 'scene-flow-cog';
    cog.type = 'button';
    cog.textContent = '🧭';
    cog.tabIndex = -1;
    labelIconShortcut(cog, 'Story Timeline', 'T');
    cog.setAttribute('aria-hidden', 'true');
    let cogTimer = null;
    const hideCog = () => {
        if (cogTimer !== null) window.clearTimeout(cogTimer);
        cogTimer = null;
        cog.classList.remove('is-visible');
        cog.tabIndex = -1;
        cog.setAttribute('aria-hidden', 'true');
    };
    const scheduleCogHide = () => {
        if (cogTimer !== null) window.clearTimeout(cogTimer);
        cogTimer = window.setTimeout(() => {
            if (document.activeElement === cog || cog.matches(':hover')) scheduleCogHide();
            else hideCog();
        }, 2400);
    };
    const showCog = () => {
        if (overlay.getAttribute('aria-hidden') === 'false') return;
        cog.classList.add('is-visible');
        cog.tabIndex = 0;
        cog.setAttribute('aria-hidden', 'false');
        scheduleCogHide();
    };
    cog.addEventListener('click', open);
    cog.addEventListener('focus', showCog);
    cog.addEventListener('blur', scheduleCogHide);
    window.addEventListener('mousemove', showCog, { passive: true });
    document.body.appendChild(cog);

    // Label lookups are cached per resource name across renders/gags, since
    // the same sub-scene TTMs get referenced repeatedly.
    const labelCache = new Map();

    const clear = (el) => {
        while (el.firstChild) el.removeChild(el.firstChild);
    };


    const renderEmpty = (message) => {
        mapGeneration++;
        previewGeneration++;
        renderedGagId = null;
        selectedKey = null;
        mountedPreview?.destroy();
        mountedPreview = null;
        mountedMap?.destroy();
        mountedMap = null;
        title.textContent = 'How it works';
        subtitle.textContent = '';
        clear(body);
        clear(links);
        const p = document.createElement('div');
        p.className = 'scene-flow-empty';
        p.textContent = message;
        body.appendChild(p);
    };

    const findScene = (ads, tagId) => (ads.scenes || []).find((s) => s.tagId?.id === tagId);
    const gagName = ({ script, tagId }) => {
        if (script === 'POSE') return 'Johnny pauses';
        try {
            return findScene(resolveEntry(script), tagId)?.tagId?.description || `${script} #${tagId}`;
        } catch {
            return `${script} #${tagId}`;
        }
    };

    const canJumpDay = () => typeof sequenceTools?.setStoryDay === 'function' &&
        typeof sequenceTools?.startRun === 'function';
    const playDay = (day) => {
        const keyScene = keySceneFor(day);
        if (!keyScene || !canJumpDay()) return false;
        const savedDay = sequenceTools.getStoryDay?.();
        try {
            sequenceTools.setStoryDay(day);
            sequenceTools.startRun({ mode: 'sequence', script: keyScene.script, tagId: keyScene.tagId, storyDay: day });
            close();
            return true;
        } catch {
            if (savedDay != null) sequenceTools.setStoryDay(savedDay);
            return false;
        }
    };

    const renderStoryTimeline = (status) => {
        const live = liveSpot(status);
        if (!step || step.followLive) followLive(status);
        title.textContent = 'Story timeline';
        subtitle.textContent = `STORY DAY ${live.day} OF 11 · PICK A DAY, A TIDE, THEN A GAG`;

        const shell = document.createElement('div');
        shell.className = 'scene-flow-story-shell';
        faceQueue ??= createCardFaceQueue({ resolveEntry, sequenceTools });
        renderStoryStepper(shell, {
            step,
            live,
            visit: visitSequence({
                seen: seenGags,
                active: status.active,
                current: status.current,
                planned: status.preview ? [] : (sequenceTools?.snapshot?.() || []),
            }),
            gagName,
            faces: faceQueue,
            onStep: (patch) => {
                step = { ...step, ...patch, followLive: false };
                if (patch.gag) step.gag = gagFacts(patch.gag);
                renderCurrent();
                modal.scrollTop = 0;
            },
            onLive: () => {
                followLive(sequenceTools?.status?.() ?? status);
                renderCurrent();
            },
            onPlayDay: canJumpDay() ? playDay : null,
            onPlayGag: typeof sequenceTools?.startRun === 'function' ? playGag : null,
        });
        body.appendChild(shell);
        if (step.level !== 'detail' || !step.gag) return null;

        const detail = document.createElement('section');
        detail.className = 'scene-flow-matrix-detail';
        const detailHeading = document.createElement('div');
        detailHeading.className = 'scene-flow-matrix-detail-heading';
        const detailLabel = document.createElement('span');
        detailLabel.textContent = 'HOW THIS GAG UNFOLDS';
        const isLive = live.gag && step.gag.script === live.gag.script && step.gag.tagId === live.gag.tagId;
        const detailName = document.createElement('strong');
        const detailRole = isLive ? 'LIVE GAG'
            : step.gag.index ? `GAG ${step.gag.index} OF ${status.total}` : 'POSSIBLE GAG';
        detailName.textContent = `${gagName(step.gag)} · ${detailRole}`;
        detailHeading.append(detailLabel, detailName);
        detail.appendChild(detailHeading);
        shell.appendChild(detail);
        return detail;
    };

    const renderLinks = (adsName) => {
        clear(links);
        const docLink = document.createElement('a');
        docLink.className = 'scene-flow-link';
        docLink.href = `${DOCS_BASE}/${adsName}.md`;
        docLink.target = '_blank';
        docLink.rel = 'noopener';
        docLink.textContent = `See every gag's full flow for ${adsName} (diagram)`;
        links.appendChild(docLink);

        const codeLink = document.createElement('a');
        codeLink.className = 'scene-flow-link';
        codeLink.href = EXTRACTOR_URL;
        codeLink.target = '_blank';
        codeLink.rel = 'noopener';
        codeLink.textContent = 'See the code that reads this straight from the original data';
        links.appendChild(codeLink);

        const methodLink = document.createElement('a');
        methodLink.className = 'scene-flow-link';
        methodLink.href = METHODOLOGY_URL;
        methodLink.target = '_blank';
        methodLink.rel = 'noopener';
        methodLink.textContent = 'How our reverse-engineering works';
        links.appendChild(methodLink);
    };

    // Display tidy-ups for the script outline. The extractor's text is left
    // as-is because the generated docs/scene-flows pages use it too.
    const isLoaderTarget = (text) => /^"?load\b/i.test(text);
    const tidyOutline = (outline) => {
        const steps = [];
        for (const step of outline) {
            // Resource loaders ("LOAD MESSAGE") are setup, not something Johnny does.
            const targets = step.targets.filter((text) => !isLoaderTarget(text));
            if (!targets.length) continue;
            const previous = steps.at(-1);
            if (previous && !previous.random && !step.random && previous.guardText === step.guardText) {
                previous.targets.push(...targets);
                continue;
            }
            steps.push({ ...step, targets: [...targets] });
        }
        return steps;
    };
    // Quoted scene names become bold text; ALL-CAPS names are lowered to match the rest.
    const appendNames = (element, text) => {
        text.split(/"([^"]*)"/).forEach((part, index) => {
            if (index % 2) {
                const name = document.createElement('strong');
                name.textContent = /[a-z]/.test(part) ? part : part.toLowerCase();
                element.appendChild(name);
            } else if (part) {
                element.appendChild(document.createTextNode(part));
            }
        });
    };

    const renderFlow = (adsName, ads, scene, host, restoreKey = null) => {
        const label = buildSceneFlowLabelResolver(ads, resolveEntry, labelCache);
        const flow = extractSceneFlow(scene, { label });
        const outline = outlineSceneFlowSteps(flow);
        const graph = buildSceneFlowMap(flow);
        const generation = ++mapGeneration;
        previewGeneration++;
        mountedPreview?.destroy();
        mountedPreview = null;
        mountedMap?.destroy();
        mountedMap = null;
        const firstAnimatedScene = graph.nodes.find((node) => node.kind === 'scene' &&
            !/\b(load|loader|init|setup|clear|copy|quarky watch)\b/i.test(node.name || ''));
        const firstScene = firstAnimatedScene || graph.nodes.find((node) => node.kind === 'scene');
        selectedKey = graph.nodes.some((node) => node.key === restoreKey)
            ? restoreKey : firstScene?.key || graph.start;
        trail = [selectedKey];
        trailIndex = 0;
        const shell = document.createElement('div');
        shell.className = 'scene-flow-map-shell';
        const main = document.createElement('div');
        main.className = 'scene-flow-map-main';
        const heading = document.createElement('div');
        heading.className = 'scene-flow-map-heading';
        const headingTitle = document.createElement('span');
        headingTitle.textContent = 'GAG STEPS · NEAR SELECTED SCENE';
        const tools = document.createElement('div');
        tools.className = 'scene-flow-map-tools';
        const headingHint = document.createElement('span');
        headingHint.className = 'scene-flow-map-hint';
        headingHint.textContent = 'possible script steps';
        tools.append(headingHint);
        heading.append(headingTitle, tools);
        main.appendChild(heading);
        const viewport = document.createElement('div');
        viewport.className = 'scene-flow-viewport';
        viewport.setAttribute('aria-label', 'Interactive scene flow map');
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        const labels = document.createElement('div');
        labels.className = 'scene-flow-map-labels';
        viewport.append(canvas, labels);
        main.appendChild(viewport);
        const footer = document.createElement('div');
        footer.className = 'scene-flow-map-footer';
        footer.innerHTML = '<span class="scene-flow-map-legend"><b class="route">◇ exploring a possible route</b><b>● other script paths</b><b class="random">◆ random decision</b></span><span>Scene order is not elapsed time</span>';
        main.appendChild(footer);
        const aside = document.createElement('aside');
        aside.className = 'scene-flow-map-aside';
        const storyDay = sequenceTools?.status?.()?.storyDay ?? sequenceTools?.getStoryDay?.();
        const inspector = document.createElement('div');
        inspector.className = 'scene-flow-inspector';
        aside.appendChild(inspector);
        const controls = document.createElement('div');
        controls.className = 'scene-flow-route-controls';
        const previous = document.createElement('button');
        previous.type = 'button';
        previous.textContent = '← Back';
        previous.setAttribute('aria-label', 'Go back through traced route');
        const next = document.createElement('button');
        next.type = 'button';
        next.textContent = 'Forward →';
        next.setAttribute('aria-label', 'Go forward through traced route');
        controls.append(previous, next);
        aside.appendChild(controls);
        const choices = document.createElement('div');
        choices.className = 'scene-flow-next scene-flow-decision-lane';
        shell.append(main, aside);
        host.append(shell, choices);

        const routeTo = (key) => {
            const parents = new Map([[graph.start, null]]);
            const queue = [graph.start];
            while (queue.length && !parents.has(key)) {
                const from = queue.shift();
                for (const edge of graph.edges) {
                    if (edge.from === from && !parents.has(edge.to)) {
                        parents.set(edge.to, from);
                        queue.push(edge.to);
                    }
                }
            }
            if (!parents.has(key)) return [key];
            const path = [];
            for (let at = key; at !== null; at = parents.get(at)) path.unshift(at);
            return path;
        };
        const previewRouteTo = (key) => {
            // Some ADS gags start a resource loader alongside their first
            // animated child. It is a sibling in the graph, so a shortest
            // path to a later scene alone would omit its image setup.
            const loaders = graph.edges.filter((edge) => edge.from === graph.start &&
                /^load\b/i.test(graph.nodes.find((node) => node.key === edge.to)?.name || ''))
                .map((edge) => edge.to);
            const steps = [...new Set([...loaders, ...routeTo(key).filter((step) => step !== graph.start)])];
            return steps.map((step) => {
                const [slot, tag] = step.split(':').map(Number);
                return { slot, tag };
            });
        };
        const select = (key, record = true) => {
            selectedKey = key;
            const previewRequest = ++previewGeneration;
            mountedPreview?.destroy();
            mountedPreview = null;
            if (record && trail[trailIndex] !== key) {
                trail = trail.slice(0, trailIndex + 1);
                trail.push(key);
                trailIndex = trail.length - 1;
            }
            mountedMap?.select(key, routeTo(key));
            const node = graph.nodes.find((item) => item.key === key);
            const incoming = graph.edges.filter((edge) => edge.to === key);
            const outgoing = graph.edges.filter((edge) => edge.from === key);
            inspector.replaceChildren();
            const kicker = document.createElement('div');
            kicker.className = 'scene-flow-inspector-kicker';
            kicker.textContent = key === graph.start ? 'START OF THIS GAG · SCRIPT VIEW' : 'A SCENE FROM THIS GAG';
            const name = document.createElement('h3');
            name.textContent = node?.name || key;
            inspector.append(kicker, name);
            if (incoming.length) {
                const explanation = document.createElement('p');
                const guards = [...new Set(incoming.map((edge) => edge.guard))];
                explanation.textContent = guards.join(' / ');
                inspector.appendChild(explanation);
            } else {
                const explanation = document.createElement('p');
                explanation.textContent = 'Choose a scene or a choice below to explore how this gag can unfold.';
                inspector.appendChild(explanation);
            }
            if (key !== graph.start) {
                const [slot, childTag] = key.split(':').map(Number);
                const route = previewRouteTo(key);
                const stage = document.createElement('div');
                stage.className = 'scene-flow-preview-stage';
                stage.setAttribute('aria-label', `Preview of ${node?.name || key}`);
                const caption = document.createElement('small');
                caption.className = 'scene-flow-preview-caption';
                caption.textContent = 'Preparing an original game animation…';
                inspector.append(stage, caption);
                import('./scene-flow-preview.mjs').then(({ mountSceneFlowPreview }) => {
                    if (previewRequest !== previewGeneration || !isOpen || !stage.isConnected) return;
                    mountedPreview = mountSceneFlowPreview({
                        host: stage, resolveEntry, sequenceTools, script: adsName,
                        gagTag: flow.gag.tag, slot, tag: childTag, route, storyDay: storyDay || 1,
                        onError: () => { caption.textContent = 'Preview unavailable for this scene.'; },
                    });
                    caption.textContent = 'Original game animation · script example, not the live playhead';
                }).catch(() => {
                    if (previewRequest === previewGeneration) caption.textContent = 'Preview unavailable for this scene.';
                });
            }
            if (key !== graph.start && typeof sequenceTools?.startRun === 'function') {
                const route = previewRouteTo(key);
                const play = document.createElement('button');
                play.type = 'button';
                play.className = 'scene-flow-play-button';
                play.textContent = '▶ Play this scene now';
                const note = document.createElement('small');
                note.className = 'scene-flow-preview-note';
                note.textContent = 'Continues this gag from here, then resumes the planned sequence.';
                play.addEventListener('click', () => {
                    playScriptScene({ script: adsName, gagTag: flow.gag.tag,
                        day: storyDay || 1, key, route,
                        onError: () => { note.textContent = 'This scene could not be started. Try another one.'; } });
                });
                inspector.append(play, note);
            }
            previous.disabled = trailIndex <= 0;
            next.disabled = trailIndex >= trail.length - 1 && !outgoing.length;
            choices.replaceChildren();
            const choiceTitle = document.createElement('span');
            choiceTitle.className = 'scene-flow-next-title';
            const randomPick = outgoing.some((edge) => edge.random);
            const parallel = outgoing.length > 1 && !randomPick && outgoing.every((edge) => edge.guard === outgoing[0].guard);
            choiceTitle.textContent = !outgoing.length ? 'END OF THIS POSSIBLE GAG ROUTE'
                : randomPick ? '◆ RANDOM PICK · ONE OUTCOME'
                    : parallel ? 'PARALLEL SCRIPT ACTIONS · RUN TOGETHER'
                        : outgoing.length > 1 ? 'CONDITIONAL PATHS · FOLLOW A CONDITION'
                            : 'NEXT SCRIPT ACTION';
            choices.appendChild(choiceTitle);
            if (!outgoing.length) {
                const continueStory = document.createElement('button');
                continueStory.type = 'button';
                continueStory.className = 'scene-flow-next-story';
                continueStory.textContent = '↖ Return to live gag';
                continueStory.addEventListener('click', () => {
                    followLive(sequenceTools?.status?.());
                    renderCurrent();
                });
                choices.appendChild(continueStory);
            }
            for (const edge of outgoing) {
                const target = graph.nodes.find((item) => item.key === edge.to);
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = edge.action === 'stop'
                    ? `× stop ${target?.name || edge.to}`
                    : `${edge.random ? '◆ ' : parallel ? '+ ' : '→ '}${target?.name || edge.to}`;
                const condition = document.createElement('small');
                condition.textContent = `${edge.random ? 'random pick · ' : parallel ? 'runs together · ' : ''}${edge.guard}`;
                button.appendChild(condition);
                button.addEventListener('click', () => select(edge.to));
                choices.appendChild(button);
            }
        };
        previous.addEventListener('click', () => {
            if (trailIndex > 0) select(trail[--trailIndex], false);
        });
        next.addEventListener('click', () => {
            if (trailIndex < trail.length - 1) select(trail[++trailIndex], false);
            else {
                const outgoing = graph.edges.filter((edge) => edge.from === selectedKey);
                if (outgoing.length) select(outgoing[0].to);
            }
        });
        select(selectedKey, false);
        import('./scene-flow-map.mjs').then(({ mountSceneFlowMap }) => {
            if (generation !== mapGeneration || !isOpen || !viewport.isConnected) return;
            mountedMap = mountSceneFlowMap({ viewport, canvas, labels, graph, onSelect: select });
            mountedMap.select(selectedKey, routeTo(selectedKey));
            mountedMap.fit();
        }).catch(() => {
            if (generation === mapGeneration) headingHint.textContent = 'Map unavailable';
        });

        const steps = tidyOutline(outline);
        const details = document.createElement('details');
        details.className = 'scene-flow-script-details';
        details.open = true;
        const summary = document.createElement('summary');
        summary.textContent = steps.length
            ? `This gag as a script · ${steps.length} step${steps.length === 1 ? '' : 's'}`
            : 'This gag as a script';
        details.appendChild(summary);
        const container = document.createElement('ol');
        container.className = 'scene-flow-outline';

        if (!steps.length) {
            const empty = document.createElement('li');
            empty.className = 'scene-flow-empty';
            empty.textContent = '(no scripted steps for this gag)';
            container.appendChild(empty);
        } else {
            for (const step of steps) {
                const card = document.createElement('li');
                card.className = 'scene-flow-step';
                const guard = document.createElement('div');
                guard.className = 'scene-flow-guard';
                appendNames(guard, step.guardText.charAt(0).toUpperCase() + step.guardText.slice(1));
                card.appendChild(guard);
                const targets = document.createElement('div');
                targets.className = 'scene-flow-targets';
                if (step.random) {
                    const lead = document.createElement('span');
                    lead.className = 'scene-flow-pick-lead';
                    lead.textContent = 'picks one of:';
                    targets.appendChild(lead);
                }
                for (const text of step.targets) {
                    const target = document.createElement('span');
                    target.className = step.random ? 'scene-flow-pick' : 'scene-flow-target';
                    if (/^stop\b/i.test(text)) target.classList.add('is-stop');
                    appendNames(target, text);
                    targets.appendChild(target);
                }
                card.appendChild(targets);
                container.appendChild(card);
            }
        }
        details.appendChild(container);
        host.appendChild(details);
        renderLinks(adsName);
    };

    const renderCurrent = () => {
        const status = sequenceTools?.status?.() ?? null;
        const active = status?.active ?? null;
        if (!active) {
            renderEmpty("Johnny hasn't started a gag yet -- check back once he's up to something.");
            return;
        }
        const oldScrollTop = modal.scrollTop;
        const previousGagId = renderedGagId;
        const previousSceneKey = selectedKey;
        mapGeneration++;
        previewGeneration++;
        mountedPreview?.destroy();
        mountedPreview = null;
        mountedMap?.destroy();
        mountedMap = null;
        clear(body);
        clear(links);
        const detail = renderStoryTimeline(status);
        if (!detail) {
            renderedGagId = null;
            return;
        }
        const target = step.gag;
        renderedGagId = `${target.script}:${target.tagId}`;
        if (target.script === 'POSE') {
            const pause = document.createElement('p');
            pause.className = 'scene-flow-possibility-note';
            pause.textContent = 'Johnny pauses here between gags. Pick a gag above to see its scenes.';
            detail.appendChild(pause);
            modal.scrollTop = oldScrollTop;
            return;
        }

        let ads;
        try {
            ads = resolveEntry(target.script);
        } catch {
            ads = null;
        }
        if (!ads || !Array.isArray(ads.scenes)) {
            const missing = document.createElement('p');
            missing.className = 'scene-flow-possibility-note';
            missing.textContent = "The island's data isn't loaded yet, so this gag cannot be inspected.";
            detail.appendChild(missing);
            return;
        }

        const scene = findScene(ads, target.tagId);
        if (!scene) {
            const missing = document.createElement('p');
            missing.className = 'scene-flow-possibility-note';
            missing.textContent = `Couldn't find gag ${target.tagId} in ${target.script}.`;
            detail.appendChild(missing);
            return;
        }

        renderFlow(target.script, ads, scene, detail,
            previousGagId === renderedGagId ? previousSceneKey : null);
        modal.scrollTop = oldScrollTop;
    };

    function open() {
        isOpen = true;
        step = null;
        renderedGagId = null;
        previousFocus = document.activeElement === cog ? null : document.activeElement;
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        renderCurrent();
        mountedMap?.fit();
        hideCog();
        closeBtn.focus();
    }

    // Live update: re-render whenever the running gag changes, but only while
    // the panel is actually open (no point building DOM nobody can see). Capture
    // the unsubscribe handle (if the controller returns one) so destroy() can
    // detach it.
    const unsubscribeStatus = sequenceTools?.subscribeStatus?.((status) => {
        if (status?.current === 0 && !status.active) seenGags = [];
        if (status?.active) {
            const previous = seenGags.at(-1);
            if (previous?.script !== status.active.script || previous?.tagId !== status.active.tagId || previous?.index !== status.current) {
                seenGags.push({ ...status.active, index: status.current });
            }
        }
        if (isOpen) renderCurrent();
    });

    // Tear down every global hook this panel installed: the window listeners
    // (keydown/mousemove), the status subscription, the pending cog-hide timer,
    // and the DOM nodes appended to <head>/<body>. It's a singleton today, so
    // this is hygiene — but it keeps the panel safe to re-create (e.g. in tests
    // or a future multi-instance host) without leaking listeners.
    const destroy = () => {
        faceQueue?.destroy();
        faceQueue = null;
        stepperStyle.remove();
        mapGeneration++;
        previewGeneration++;
        mountedPreview?.destroy();
        mountedPreview = null;
        mountedMap?.destroy();
        mountedMap = null;
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('mousemove', showCog);
        if (cogTimer !== null) window.clearTimeout(cogTimer);
        cogTimer = null;
        if (typeof unsubscribeStatus === 'function') unsubscribeStatus();
        style.remove();
        overlay.remove();
        cog.remove();
    };

    return { open, close, destroy };
}

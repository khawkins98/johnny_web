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
import { JOHNNY_SCENES } from '../story-controller.mjs';
import { buildSceneFlowMap } from './scene-flow-graph.mjs';
import { mountStoryTimelineAtlas } from './story-timeline-atlas.mjs';
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
            width: 1080px;
            max-width: calc(100vw - 24px);
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
        .scene-flow-map-main:not(.is-overview) .scene-flow-zoom-control { display: none; }
        .scene-flow-map-main.is-overview .scene-flow-viewport { height: 390px; }
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
        .scene-flow-matrix-context { background: #071998; border-bottom: 1px dashed #65c8e2; padding: 5px 0 10px; }
        .scene-flow-story-intro { display: flex; justify-content: space-between; gap: 12px; align-items: end; border-bottom: 1px dashed #54bfeb; padding-bottom: 10px; }
        .scene-flow-story-intro h3 { margin: 0 0 3px; font: 24px/1 'Caveat', cursive; color: #fff2a1; }
        .scene-flow-story-intro p { margin: 0; color: #c3e6ec; font-size: 17px; }
        .scene-flow-story-intro button { min-height: 42px; padding: 4px 12px; border: 2px solid #68d5e7; background: #1642b1; color: #fffbdc; font: 18px/1 'VT323', monospace; cursor: pointer; }
        .scene-flow-story-intro button:hover { background: #2860c7; }
        .scene-flow-story-intro button:disabled { opacity: .55; cursor: default; }
        .scene-flow-atlas { margin: 8px 0 5px; border: 2px solid #65c8e2; background: #071998; }
        .scene-flow-atlas-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 42px; padding: 3px 7px; border-bottom: 1px dashed #65c8e2; color: #fff5bd; font-size: 18px; }
        .scene-flow-atlas-controls { display: flex; flex-wrap: wrap; gap: 4px; }
        .scene-flow-atlas-controls button { width: 40px; min-height: 40px; border: 1px solid #65c8e2; background: #1642b1; color: #fffbdc; font: 24px/1 'VT323', monospace; cursor: pointer; }
        .scene-flow-atlas-controls button.is-wide { width: auto; padding: 3px 8px; font-size: 17px; }
        .scene-flow-atlas-controls button:hover:not(:disabled) { background: #2860c7; }
        .scene-flow-atlas-controls button:disabled { opacity: .4; cursor: default; }
        .scene-flow-atlas-viewport { position: relative; height: clamp(420px, 55vh, 560px); overflow: hidden; touch-action: none; cursor: grab; background: repeating-linear-gradient(0deg, transparent 0 15px, rgba(83,219,255,.12) 16px 17px), #071998; }
        .scene-flow-atlas-viewport.is-dragging { cursor: grabbing; }
        .scene-flow-atlas-stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
        .scene-flow-atlas-stage svg, .scene-flow-atlas-buttons { position: absolute; inset: 0; width: 100%; height: 100%; }
        .scene-flow-atlas-buttons { pointer-events: none; }
        .scene-flow-atlas-line { fill: none; stroke-linecap: round; opacity: .78; }
        .scene-flow-atlas-line.is-possible { stroke: #70dce9; }
        .scene-flow-atlas-line.is-visited { stroke: #eadca7; }
        .scene-flow-atlas-line.is-planned { stroke: #70dce9; stroke-dasharray: 7 5; }
        .scene-flow-atlas-line.is-script { stroke: #70dce9; }
        .scene-flow-atlas-line.is-return { stroke: #eaa55d; }
        .scene-flow-atlas-line.is-random { stroke: #eaa55d; stroke-dasharray: 3 5; }
        .scene-flow-atlas-day-band { fill: rgba(9,34,137,.55); stroke: rgba(123,218,232,.56); stroke-width: 2; stroke-dasharray: 7 6; }
        .scene-flow-atlas-day-band.is-live { fill: rgba(19,52,159,.82); stroke: #ffe45b; }
        .scene-flow-atlas-script-lens { fill: #06146c; stroke: #e6b45c; stroke-width: 2; stroke-dasharray: 7 5; }
        .scene-flow-atlas-day-caption, .scene-flow-atlas-lane-label { position: absolute; color: #bbdfed; font: 18px/1 'VT323', monospace; white-space: nowrap; pointer-events: none; }
        .scene-flow-atlas-lane-label { color: #fff2a1; font-size: 16px; }
        .scene-flow-atlas-overview-label { display: none; position: absolute; color: #fff2a1; font: 96px/1 'VT323', monospace; pointer-events: none; }
        .scene-flow-atlas.is-overview .scene-flow-atlas-overview-label { display: block; }
        .scene-flow-atlas.is-overview .scene-flow-atlas-day-caption,
        .scene-flow-atlas.is-overview .scene-flow-atlas-lane-label { display: none; }
        .scene-flow-atlas-node { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; padding: 3px 5px; border: 2px solid #66d8e8; border-radius: 0; background: #12339c; color: #fffbe2; box-shadow: 3px 3px 0 #020d5b; font: 18px/1 'VT323', monospace; text-align: center; cursor: pointer; pointer-events: auto; overflow: hidden; }
        .scene-flow-atlas-node.is-day { width: 69px; height: 44px; }
        .scene-flow-atlas-node.is-gag { width: 106px; height: 52px; font-size: 16px; }
        .scene-flow-atlas-node.is-scene { width: 118px; height: 48px; font-size: 16px; }
        .scene-flow-atlas-node.is-current { background: #ffe02d; border-color: #fff5ac; color: #302816; }
        .scene-flow-atlas-node.is-selected { outline: 2px solid #fff; outline-offset: 2px; z-index: 2; }
        .scene-flow-atlas-node:hover, .scene-flow-atlas-node:focus-visible { background: #2860c7; border-color: #fff5ac; color: #fff; z-index: 10; outline: 2px solid #fff; outline-offset: 2px; }
        .scene-flow-atlas-node:active { scale: .97; }
        .scene-flow-atlas-footer { min-height: 34px; padding: 5px 8px; border-top: 1px dashed #65c8e2; color: #b9eaf0; font-size: 15px; }
        .scene-flow-atlas.is-overview .scene-flow-atlas-node.is-gag, .scene-flow-atlas.is-overview .scene-flow-atlas-node.is-scene { color: transparent; }
        .scene-flow-atlas-tooltip { position: fixed; z-index: 2500; width: 206px; box-sizing: border-box; padding: 6px; border: 2px solid #e2a42f; background: #f4e4c8; color: #342717; box-shadow: 4px 4px 0 #020d5b; pointer-events: none; font: 17px/1 'VT323', monospace; }
        .scene-flow-atlas-tooltip[hidden] { display: none; }
        .scene-flow-atlas-tooltip small, .scene-flow-atlas-tooltip strong { display: block; }
        .scene-flow-atlas-tooltip small { font-size: 14px; color: #795023; }
        .scene-flow-atlas-tooltip strong { margin: 3px 0; font-size: 20px; font-weight: normal; }
        .scene-flow-atlas-preview { position: relative; width: 100%; aspect-ratio: 4 / 3; margin: 4px 0; overflow: hidden; background: #071998; }
        .scene-flow-atlas-preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
        .scene-flow-visit-list { margin-top: 9px; border-top: 1px dashed #65c8e2; color: #fff2a1; }
        .scene-flow-visit-list > summary { padding: 9px 0; cursor: pointer; font-size: 18px; }
        .scene-flow-day-preview { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px 15px; margin: 9px 0 3px; padding: 10px; border: 2px solid #e6b45c; background: #17318d; }
        .scene-flow-day-preview-copy { min-width: 0; flex: 1 1 260px; }
        .scene-flow-day-preview-copy small { display: block; color: #a6e6ea; font-size: 16px; }
        .scene-flow-day-preview-copy strong { display: block; color: #fff5bd; font: 23px/1.1 'Caveat', cursive; }
        .scene-flow-day-preview-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .scene-flow-day-preview-actions button { min-height: 42px; padding: 5px 10px; border: 2px solid #65c8e2; background: #1642b1; color: #fffbdc; font: 18px/1 'VT323', monospace; cursor: pointer; }
        .scene-flow-day-preview-actions button:hover { background: #2860c7; }
        .scene-flow-day-preview-actions button:disabled { opacity: .5; cursor: default; }
        .scene-flow-day-preview-actions .is-play { border-color: #704a1e; background: #ffe02d; color: #302816; }
        .scene-flow-day-preview-actions .is-play:hover:not(:disabled) { background: #fff177; }
        .scene-flow-story-section { margin: 14px 0 7px; font-size: 17px; color: #a6e6ea; letter-spacing: .05em; }
        .scene-flow-visit-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .scene-flow-visit-heading .scene-flow-story-section { margin-right: auto; }
        .scene-flow-track-controls { display: flex; gap: 4px; }
        .scene-flow-track-controls button { width: 40px; min-height: 40px; border: 1px solid #65c8e2; background: #1642b1; color: #fffbdc; font: 22px/1 'VT323', monospace; cursor: pointer; }
        .scene-flow-track-controls button:hover:not(:disabled) { background: #2860c7; }
        .scene-flow-track-controls button:disabled { opacity: .45; cursor: default; }
        .scene-flow-prime-track { display: flex; align-items: stretch; gap: 0; overflow-x: auto; padding: 3px 2px 9px; scrollbar-color: #65c8e2 #0b258d; }
        .scene-flow-prime-arrow { flex: none; align-self: center; width: 32px; color: #ffe02d; text-align: center; font-size: 24px; }
        .scene-flow-gag-card { flex: 0 0 154px; min-height: 74px; padding: 7px 8px; border: 2px solid #64d3e7; background: #12339c; color: #fffbe2; font: 18px/1.05 'VT323', monospace; text-align: left; cursor: pointer; }
        .scene-flow-gag-card:hover { background: #2153bb; border-color: #fff5ac; }
        .scene-flow-gag-card:active { scale: .98; }
        .scene-flow-gag-card small { display: block; color: #ace1ec; font-size: 14px; margin-bottom: 5px; }
        .scene-flow-gag-card strong { display: block; font-weight: normal; font-size: 20px; }
        .scene-flow-gag-card[data-state="current"] { border-color: #fff5ac; background: #ffe02d; color: #302816; }
        .scene-flow-gag-card[data-state="current"] small { color: #694b21; }
        .scene-flow-gag-card[data-inspected="true"] { outline: 2px solid #fff; outline-offset: 2px; }
        .scene-flow-gag-card[data-state="seen"] { opacity: .76; }
        .scene-flow-gag-card[data-state="possible"] { border-color: #64d3e7; border-style: dashed; }
        .scene-flow-gag-card:disabled { cursor: default; opacity: .7; }
        .scene-flow-story-end { flex: 0 0 154px; min-height: 74px; box-sizing: border-box; padding: 8px; border: 2px dashed #eab06b; background: #182d83; color: #fff1c5; }
        .scene-flow-story-end strong, .scene-flow-story-end small { display: block; font-weight: normal; }
        .scene-flow-story-end small { color: #b9d5df; margin-top: 5px; }
        .scene-flow-possibility-note { margin: 0 0 10px; color: #c3e6ec; font-size: 17px; }
        .scene-flow-possible-track { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 9px 0; }
        .scene-flow-possible-pool.is-day-exploration .scene-flow-possible-track { grid-template-columns: repeat(6, minmax(0, 1fr)); }
        .scene-flow-possible-track .scene-flow-gag-card { width: 100%; min-height: 92px; }
        .scene-flow-matrix-detail { margin-top: 9px; border-top: 1px dashed #65c8e2; padding-top: 9px; }
        .scene-flow-matrix-detail-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: #b9eaf0; font-size: 17px; letter-spacing: .04em; }
        .scene-flow-matrix-detail-heading strong { color: #fff6c7; font-weight: normal; font-size: 20px; }
        .scene-flow-possible-pool { border-top: 1px dashed #65c8e2; margin-top: 13px; padding-top: 7px; }
        .scene-flow-possible-pool summary { cursor: pointer; min-height: 40px; color: #b9eaf0; font-size: 18px; }
        .scene-flow-possible-pool summary:hover { color: #fff; }
        .scene-flow-possible-pool summary:focus-visible { outline: 2px solid #fff; }
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
            .scene-flow-visit-heading .scene-flow-story-section { font-size: 16px; }
            .scene-flow-gag-card, .scene-flow-story-end { flex-basis: 134px; }
            .scene-flow-possible-track { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .scene-flow-possible-pool.is-day-exploration .scene-flow-possible-track { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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

        .scene-flow-outline {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 0;
        }

        .scene-flow-step {
            background: #f4e4c8;
            border: 2px solid #8b5a2b;
            border-radius: 6px;
            padding: 10px 14px;
            box-shadow: 0 2px 4px rgba(74,53,32,0.16), inset 0 1px rgba(255,255,255,0.5);
        }

        .scene-flow-guard {
            font-family: 'VT323', monospace;
            font-size: 15px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            color: #6b4a24;
            margin-bottom: 4px;
        }

        .scene-flow-targets {
            font-size: 22px;
            line-height: 1.25;
        }

        .scene-flow-targets .scene-flow-pick {
            display: block;
            margin-left: 8px;
        }

        .scene-flow-pick::before {
            content: '· ';
        }

        .scene-flow-connector {
            text-align: center;
            font-family: 'VT323', monospace;
            font-size: 22px;
            color: #8b5a2b;
            line-height: 1;
            padding: 2px 0;
        }

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
        mountedAtlas?.destroy();
        mountedAtlas = null;
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
    let viewedGag = null;
    let exploredDay = null;
    let poolOpen = false;
    let mapGeneration = 0;
    let mountedPreview = null;
    let mountedAtlas = null;
    let atlasCamera = null;
    let cameraOverride = false;
    let previewGeneration = 0;
    let renderedGagId = null;
    let timelineTracks = null;
    let resizeFrame = null;

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

    const centerCard = (track, card) => {
        if (!track || !card || !track.clientWidth) return;
        const left = card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
        track.scrollLeft = Math.max(0, left - (track.clientWidth - card.clientWidth) / 2);
    };
    const centerTimeline = () => {
        if (!isOpen || !timelineTracks) return;
        const { prime } = timelineTracks;
        centerCard(prime, prime.querySelector('[data-inspected="true"]') || prime.querySelector('[data-state="current"]'));
    };
    const onTimelineResize = () => {
        if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
            resizeFrame = null;
            centerTimeline();
        });
    };
    window.addEventListener('resize', onTimelineResize);

    const renderEmpty = (message) => {
        mapGeneration++;
        previewGeneration++;
        renderedGagId = null;
        selectedKey = null;
        mountedPreview?.destroy();
        mountedPreview = null;
        mountedAtlas?.destroy();
        mountedAtlas = null;
        mountedMap?.destroy();
        mountedMap = null;
        timelineTracks = null;
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

    const possibleLaterGags = (storyDay, shown) => {
        const byScript = new Map();
        for (const candidate of JOHNNY_SCENES) {
            if (!candidate.script.endsWith('.ADS') || candidate.script === 'STAND.ADS') continue;
            if (candidate.day !== 0 && candidate.day !== storyDay) continue;
            // Tide-gated scenes need the host's exact phase, which is not known
            // for a future visit. Keep this set to day-eligible, all-tide examples.
            if (candidate.tideMin !== 0 || candidate.tideMax !== 16) continue;
            const key = `${candidate.script}:${candidate.tagId}`;
            if (shown.has(key)) continue;
            if (!byScript.has(candidate.script) || candidate.day === storyDay) {
                byScript.set(candidate.script, { script: candidate.script, tagId: candidate.tagId });
            }
        }
        const order = ['FISHING.ADS', 'WALKSTUF.ADS', 'VISITOR.ADS', 'BUILDING.ADS',
            'ACTIVITY.ADS', 'JOHNNY.ADS', 'SUZY.ADS', 'MARY.ADS', 'MISCGAG.ADS'];
        return order.map((script) => byScript.get(script)).filter(Boolean).slice(0, 8);
    };

    const renderStoryTimeline = (status) => {
        const storyDay = status.storyDay || sequenceTools?.getStoryDay?.() || 1;
        title.textContent = 'Story timeline';
        subtitle.textContent = `STORY DAY ${storyDay} OF 11 · THIS VISIT AND ITS POSSIBLE PATHS`;

        const shell = document.createElement('div');
        shell.className = 'scene-flow-story-shell';
        const intro = document.createElement('div');
        intro.className = 'scene-flow-story-intro';
        const introCopy = document.createElement('div');
        const introTitle = document.createElement('h3');
        introTitle.textContent = 'You are here in Johnny’s story';
        const introNote = document.createElement('p');
        introNote.textContent = 'Yellow marks Johnny now. White outline marks what you are exploring. Days are landmarks, not branching events.';
        introCopy.append(introTitle, introNote);
        const inspectCurrent = document.createElement('button');
        inspectCurrent.type = 'button';
        inspectCurrent.textContent = '↖ Return to live';
        inspectCurrent.addEventListener('click', () => {
            viewedGag = null;
            exploredDay = null;
            poolOpen = false;
            atlasCamera = null;
            cameraOverride = true;
            renderCurrent();
        });
        intro.appendChild(introCopy);
        if (viewedGag || exploredDay !== null) intro.appendChild(inspectCurrent);
        shell.appendChild(intro);

        const atlasHost = document.createElement('div');
        const canJumpDay = typeof sequenceTools?.setStoryDay === 'function' &&
            typeof sequenceTools?.startRun === 'function';
        const playDay = (day) => {
            const keyScene = JOHNNY_SCENES.find((candidate) => candidate.day === day);
            if (!keyScene || !canJumpDay) return;
            const savedDay = sequenceTools.getStoryDay?.();
            try {
                sequenceTools.setStoryDay(day);
                sequenceTools.startRun({
                    mode: 'sequence', script: keyScene.script, tagId: keyScene.tagId, storyDay: day,
                });
                close();
            } catch {
                if (savedDay != null) sequenceTools.setStoryDay(savedDay);
                dayNote.textContent = `Could not start day ${day}. Johnny is still playing the current visit.`;
            }
        };
        const exploreDay = (day) => {
            const keyScene = JOHNNY_SCENES.find((candidate) => candidate.day === day);
            if (!keyScene) return;
            atlasCamera = mountedAtlas?.cameraForDay(day) ?? atlasCamera;
            cameraOverride = true;
            exploredDay = day;
            viewedGag = { script: keyScene.script, tagId: keyScene.tagId, index: null };
            poolOpen = true;
            renderCurrent();
        };
        const dayNote = document.createElement('p');
        dayNote.className = 'scene-flow-possibility-note';
        dayNote.textContent = 'Drag the map to pan; wheel or use +/− to zoom. Follow live recenters the map on Johnny. Selecting a node only explores it; Play changes playback.';
        const context = document.createElement('div');
        context.className = 'scene-flow-matrix-context';
        const daysTitle = document.createElement('div');
        daysTitle.className = 'scene-flow-story-section';
        daysTitle.textContent = `STORY TIMELINE · LIVE DAY ${String(storyDay).padStart(2, '0')}`;
        context.appendChild(daysTitle);
        context.appendChild(atlasHost);
        context.appendChild(dayNote);
        if (exploredDay !== null) {
            const keyScene = JOHNNY_SCENES.find((candidate) => candidate.day === exploredDay);
            const preview = document.createElement('section');
            preview.className = 'scene-flow-day-preview';
            const copy = document.createElement('div');
            copy.className = 'scene-flow-day-preview-copy';
            const kicker = document.createElement('small');
            kicker.textContent = `EXPLORING DAY ${String(exploredDay).padStart(2, '0')} · LIVE PLAYBACK STAYS ON DAY ${String(storyDay).padStart(2, '0')}`;
            const name = document.createElement('strong');
            name.textContent = `Key scene: ${gagName(keyScene)}`;
            copy.append(kicker, name);
            const actions = document.createElement('div');
            actions.className = 'scene-flow-day-preview-actions';
            const inspectKey = document.createElement('button');
            inspectKey.type = 'button';
            inspectKey.textContent = 'Inspect key scene';
            inspectKey.addEventListener('click', () => {
                viewedGag = { script: keyScene.script, tagId: keyScene.tagId, index: null };
                renderCurrent();
            });
            const play = document.createElement('button');
            play.type = 'button';
            play.className = 'is-play';
            play.textContent = `▶ Play day ${String(exploredDay).padStart(2, '0')}`;
            play.title = `Save day ${exploredDay} and restart the visit from ${gagName(keyScene)}`;
            play.disabled = !canJumpDay;
            play.addEventListener('click', () => playDay(exploredDay));
            actions.append(inspectKey, play);
            preview.append(copy, actions);
            context.appendChild(preview);
        }
        shell.appendChild(context);

        const visitHeading = document.createElement('div');
        visitHeading.className = 'scene-flow-visit-heading';
        const primeTitle = document.createElement('div');
        primeTitle.className = 'scene-flow-story-section';
        primeTitle.textContent = `THIS VISIT · LIVE GAG ${status.current || 1} OF ${status.total || 1}`;
        visitHeading.appendChild(primeTitle);
        const trackControls = document.createElement('div');
        trackControls.className = 'scene-flow-track-controls';
        const scrollEarlier = document.createElement('button');
        scrollEarlier.type = 'button';
        scrollEarlier.textContent = '←';
        scrollEarlier.setAttribute('aria-label', 'See earlier gags in this visit');
        const scrollLater = document.createElement('button');
        scrollLater.type = 'button';
        scrollLater.textContent = '→';
        scrollLater.setAttribute('aria-label', 'See later gags in this visit');
        trackControls.append(scrollEarlier, scrollLater);
        visitHeading.appendChild(trackControls);
        const visitList = document.createElement('details');
        visitList.className = 'scene-flow-visit-list';
        const visitSummary = document.createElement('summary');
        visitSummary.textContent = 'Visit list · all planned gags';
        visitList.append(visitSummary, visitHeading);
        const prime = document.createElement('div');
        prime.className = 'scene-flow-prime-track';
        prime.setAttribute('aria-label', 'Planned gag sequence for this visit');
        const prior = seenGags.filter((gag) => gag.index < status.current);
        const allQueued = status.preview ? [] : (sequenceTools?.snapshot?.() || []);
        const items = [
            ...prior.map((gag) => ({ gag, state: 'seen', label: 'ALREADY SEEN' })),
            { gag: { ...status.active, index: status.current }, state: 'current', label: '▲ LIVE' },
            ...allQueued.map((gag, index) => ({ gag, state: 'planned', label: index === 0 ? 'PLANNED NEXT' : 'LATER THIS VISIT' })),
        ];
        const shown = new Set();
        for (const gag of allQueued) shown.add(`${gag.script}:${gag.tagId}`);
        const makeCard = (gag, state, label, fromDayOptions = false) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'scene-flow-gag-card';
            card.dataset.state = state;
            const gagIndex = gag.index ?? gag.sequence?.index ?? null;
            card.dataset.inspected = String(viewedGag
                ? viewedGag.index === gagIndex && viewedGag.script === gag.script && viewedGag.tagId === gag.tagId
                : state === 'current');
            const kicker = document.createElement('small');
            kicker.textContent = gagIndex ? `${String(gagIndex).padStart(2, '0')} · ${label}` : label;
            const name = document.createElement('strong');
            name.textContent = gagName(gag);
            card.append(kicker, name);
            if (gag.script === 'POSE') card.disabled = true;
            else card.addEventListener('click', () => showGag(gag, fromDayOptions));
            return card;
        };
        items.forEach(({ gag, state, label }, index) => {
            if (!gag) return;
            if (index > 0) {
                const arrow = document.createElement('span');
                arrow.className = 'scene-flow-prime-arrow';
                arrow.setAttribute('aria-hidden', 'true');
                arrow.textContent = '→';
                prime.appendChild(arrow);
            }
            prime.appendChild(makeCard(gag, state, label));
            shown.add(`${gag.script}:${gag.tagId}`);
        });
        const arrow = document.createElement('span');
        arrow.className = 'scene-flow-prime-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        const end = document.createElement('div');
        end.className = 'scene-flow-story-end';
        const label = document.createElement('strong');
        label.textContent = 'This visit ends';
        const explanation = document.createElement('small');
        explanation.textContent = 'The next visit has not been chosen yet.';
        end.append(label, explanation);
        prime.append(arrow, end);
        const updateTrackControls = () => {
            scrollEarlier.disabled = prime.scrollLeft <= 1;
            scrollLater.disabled = prime.scrollLeft >= prime.scrollWidth - prime.clientWidth - 1;
        };
        scrollEarlier.addEventListener('click', () => prime.scrollBy({ left: -Math.max(150, prime.clientWidth * .7), behavior: 'smooth' }));
        scrollLater.addEventListener('click', () => prime.scrollBy({ left: Math.max(150, prime.clientWidth * .7), behavior: 'smooth' }));
        prime.addEventListener('scroll', updateTrackControls, { passive: true });
        visitList.appendChild(prime);
        context.appendChild(visitList);
        visitList.addEventListener('toggle', () => {
            if (visitList.open) {
                centerTimeline();
                updateTrackControls();
            }
        });

        const detail = document.createElement('section');
        detail.className = 'scene-flow-matrix-detail';
        const detailHeading = document.createElement('div');
        detailHeading.className = 'scene-flow-matrix-detail-heading';
        const detailLabel = document.createElement('span');
        detailLabel.textContent = exploredDay !== null
            ? `DAY ${String(exploredDay).padStart(2, '0')} · POSSIBLE SCRIPT STEPS`
            : 'GAG STEPS · EXPANDED FROM THE VISIT ABOVE';
        const target = viewedGag || { ...status.active, index: status.current };
        const detailName = document.createElement('strong');
        const exploredKey = exploredDay !== null && JOHNNY_SCENES.find((candidate) => candidate.day === exploredDay);
        const detailRole = exploredDay !== null
            ? (target.script === exploredKey?.script && target.tagId === exploredKey?.tagId ? 'DAY KEY SCENE' : 'DAY POSSIBILITY')
            : viewedGag?.index ? `GAG ${viewedGag.index} OF ${status.total}` : viewedGag ? 'POSSIBLE GAG' : 'LIVE GAG';
        detailName.textContent = `${gagName(target)} · ${detailRole}`;
        detailHeading.append(detailLabel, detailName);
        detail.appendChild(detailHeading);

        const pool = document.createElement('details');
        pool.className = 'scene-flow-possible-pool';
        pool.classList.toggle('is-day-exploration', exploredDay !== null);
        pool.open = poolOpen;
        pool.addEventListener('toggle', () => { if (pool.isConnected) poolOpen = pool.open; });
        const possibleTitle = document.createElement('summary');
        const optionDay = exploredDay ?? storyDay;
        const optionShown = exploredDay === null ? shown : new Set([`${exploredKey.script}:${exploredKey.tagId}`]);
        const laterGags = possibleLaterGags(optionDay, optionShown);
        const examples = laterGags.slice(0, 2).map(gagName).join(' · ');
        possibleTitle.textContent = exploredDay === null
            ? `AFTER THIS VISIT · ${examples || 'Other gags'} could appear · explore possibilities`
            : `DAY ${String(exploredDay).padStart(2, '0')} OPTIONS · ${examples || 'Other gags'} · explore`;
        pool.appendChild(possibleTitle);
        const possibleNote = document.createElement('p');
        possibleNote.className = 'scene-flow-possibility-note';
        possibleNote.textContent = exploredDay === null
            ? 'These are day-eligible examples, not predictions for the next visit.'
            : 'These all-tide examples are not a planned visit. The map also shows tide-gated possibilities.';
        const possibilities = document.createElement('div');
        possibilities.className = 'scene-flow-possible-track';
        for (const gag of laterGags) {
            possibilities.appendChild(makeCard(gag, 'possible', 'POSSIBLE · NOT PLANNED', exploredDay !== null));
        }
        pool.append(possibleNote, possibilities);
        shell.appendChild(pool);
        shell.appendChild(detail);
        body.appendChild(shell);
        timelineTracks = { prime };
        mountedAtlas = mountStoryTimelineAtlas({
            host: atlasHost, resolveEntry, sequenceTools, storyDay, exploredDay,
            inspectedGag: target, selectedSceneKey: selectedKey,
            visitItems: items, camera: atlasCamera,
            onDay: exploreDay,
            onGag: (gag, day) => {
                if (day !== storyDay) exploredDay = day;
                else if (exploredDay !== null && exploredDay !== day) exploredDay = null;
                showGag(gag, day !== storyDay);
            },
            onScene: (key) => { selectedKey = key; renderCurrent(); },
        });
        centerTimeline();
        updateTrackControls();
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
        mountedAtlas?.selectScene(selectedKey);
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
        const modeButton = document.createElement('button');
        modeButton.type = 'button';
        modeButton.className = 'scene-flow-mode-button';
        modeButton.textContent = 'Full script map';
        modeButton.setAttribute('aria-label', 'Show full script map for this gag');
        modeButton.setAttribute('aria-pressed', 'false');
        let overview = false;
        modeButton.addEventListener('click', () => {
            overview = !overview;
            modeButton.setAttribute('aria-pressed', String(overview));
            main.classList.toggle('is-overview', overview);
            headingTitle.textContent = overview ? 'SCRIPT MAP' : 'GAG STEPS · NEAR SELECTED SCENE';
            headingHint.textContent = overview ? 'drag · zoom' : 'possible script steps';
            modeButton.textContent = overview ? 'Near scene' : 'Full script map';
            modeButton.setAttribute('aria-label', overview ? 'Focus on selected scene' : 'Show full script map for this gag');
            mountedMap?.setOverview(overview);
        });
        const zoomOut = document.createElement('button');
        zoomOut.type = 'button';
        zoomOut.className = 'scene-flow-zoom-control';
        zoomOut.textContent = '−';
        zoomOut.setAttribute('aria-label', 'Zoom out of map');
        const zoomIn = document.createElement('button');
        zoomIn.type = 'button';
        zoomIn.className = 'scene-flow-zoom-control';
        zoomIn.textContent = '+';
        zoomIn.setAttribute('aria-label', 'Zoom into map');
        const resetView = document.createElement('button');
        resetView.type = 'button';
        resetView.className = 'scene-flow-zoom-control';
        resetView.textContent = '⌖';
        resetView.setAttribute('aria-label', 'Fit map to view');
        zoomOut.addEventListener('click', () => mountedMap?.zoom(-1));
        zoomIn.addEventListener('click', () => mountedMap?.zoom(1));
        resetView.addEventListener('click', () => mountedMap?.fit());
        tools.append(headingHint, modeButton, zoomOut, zoomIn, resetView);
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
        const storyDay = exploredDay ?? sequenceTools?.status?.()?.storyDay ?? sequenceTools?.getStoryDay?.();
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
                const [slot, childTag] = key.split(':').map(Number);
                const route = previewRouteTo(key);
                const play = document.createElement('button');
                play.type = 'button';
                play.className = 'scene-flow-play-button';
                play.textContent = exploredDay === null ? '▶ Play this scene now' : '▶ Play only this scene';
                const note = document.createElement('small');
                note.className = 'scene-flow-preview-note';
                note.textContent = exploredDay === null
                    ? 'Continues this gag from here, then resumes the planned sequence.'
                    : `Previews this scene, then resumes the live visit. Use Play day ${String(exploredDay).padStart(2, '0')} to switch days.`;
                play.addEventListener('click', () => {
                    try {
                        sequenceTools.startRun({
                            mode: 'preview-child', script: adsName, tagId: flow.gag.tag,
                            storyDay: storyDay || 1, slot, childTag, route,
                        });
                        close();
                    } catch {
                        note.textContent = 'This scene could not be started. Try another one.';
                    }
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
                    viewedGag = null;
                    exploredDay = null;
                    poolOpen = false;
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
            mountedMap.setOverview(overview);
            mountedMap.select(selectedKey, routeTo(selectedKey));
            mountedMap.fit();
        }).catch(() => {
            if (generation === mapGeneration) headingHint.textContent = 'Map unavailable';
        });

        const details = document.createElement('details');
        details.className = 'scene-flow-script-details';
        const summary = document.createElement('summary');
        summary.textContent = 'Read the original script steps';
        details.appendChild(summary);
        const container = document.createElement('div');
        container.className = 'scene-flow-outline';

        if (!outline.length) {
            const empty = document.createElement('div');
            empty.className = 'scene-flow-empty';
            empty.textContent = '(no scripted steps for this gag)';
            container.appendChild(empty);
        } else {
            outline.forEach((step, index) => {
                if (index > 0) {
                    const connector = document.createElement('div');
                    connector.className = 'scene-flow-connector';
                    connector.textContent = '↓';
                    container.appendChild(connector);
                }
                const card = document.createElement('div');
                card.className = 'scene-flow-step';
                const guard = document.createElement('div');
                guard.className = 'scene-flow-guard';
                guard.textContent = step.guardText;
                card.appendChild(guard);
                const targets = document.createElement('div');
                targets.className = 'scene-flow-targets';
                if (step.random) {
                    const lead = document.createElement('div');
                    lead.textContent = 'picks one of:';
                    targets.appendChild(lead);
                    step.targets.forEach((t) => {
                        const pick = document.createElement('span');
                        pick.className = 'scene-flow-pick';
                        pick.textContent = t;
                        targets.appendChild(pick);
                    });
                } else {
                    targets.textContent = `→ ${step.targets.join(', ')}`;
                }
                card.appendChild(targets);
                container.appendChild(card);
            });
        }
        details.appendChild(container);
        host.appendChild(details);
        renderLinks(adsName);
    };

    function showGag(gag, fromDayOptions = false) {
        if (!gag) return;
        const index = gag.index ?? gag.sequence?.index ?? null;
        if (!fromDayOptions && exploredDay !== null) {
            exploredDay = null;
            poolOpen = false;
        }
        if (index === null) poolOpen = true;
        viewedGag = {
            ...gag,
            index,
        };
        renderCurrent();
    }

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
        if (!cameraOverride) atlasCamera = mountedAtlas?.getCamera() ?? atlasCamera;
        cameraOverride = false;
        mountedAtlas?.destroy();
        mountedAtlas = null;
        mountedMap?.destroy();
        mountedMap = null;
        clear(body);
        clear(links);
        const detail = renderStoryTimeline(status);
        const target = viewedGag || active;
        renderedGagId = `${target.script}:${target.tagId}`;
        if (target.script === 'POSE') {
            const pause = document.createElement('p');
            pause.className = 'scene-flow-possibility-note';
            pause.textContent = 'Johnny pauses here. Select another gag in the visit row to inspect its scenes.';
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
        viewedGag = null;
        exploredDay = null;
        atlasCamera = null;
        poolOpen = false;
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
        mapGeneration++;
        previewGeneration++;
        mountedPreview?.destroy();
        mountedPreview = null;
        mountedAtlas?.destroy();
        mountedAtlas = null;
        mountedMap?.destroy();
        mountedMap = null;
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('resize', onTimelineResize);
        if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
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

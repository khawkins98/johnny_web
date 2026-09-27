/**
 * scene-flow-panel.mjs — the in-app "How it works" panel.
 *
 * Shows the currently running gag's authored ADS guards, branches and RANDOM
 * picks as an interactive route map. The graph is drawn with Three.js, while
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
import { buildSceneFlowMap } from './scene-flow-graph.mjs';

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
            background-image: url('data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noise)" opacity="0.1"/></svg>');
            border: 3px solid #8b5a2b;
            border-radius: 8px;
            box-shadow: 0 18px 44px rgba(0,0,0,0.52), 0 3px 8px rgba(0,0,0,0.32), inset 0 0 20px rgba(139, 90, 43, 0.25);
            width: 1080px;
            max-width: calc(100vw - 24px);
            max-height: calc(100vh - 24px);
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 20px 22px 18px;
            font-family: 'Caveat', cursive;
            color: #4a3520;
            position: relative;
            transform: rotate(0.15deg);
        }

        #scene-flow-title {
            font-size: 34px;
            margin: 0 0 4px 0;
            text-align: center;
            text-shadow: 1px 1px 0px rgba(255,255,255,0.5);
            text-wrap: balance;
        }

        #scene-flow-subtitle {
            text-align: center;
            font-family: 'VT323', monospace;
            font-size: 16px;
            margin: 0 0 12px 0;
            border-bottom: 2px dashed #8b5a2b;
            padding-bottom: 8px;
        }

        .scene-flow-map-shell {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 242px;
            gap: 10px;
            min-height: 475px;
            font-family: 'VT323', monospace;
        }
        .scene-flow-map-main {
            min-width: 0;
            background: #071998;
            box-shadow: inset 0 0 0 4px #11116b, inset 0 0 0 6px #31b7e6, 0 3px 8px rgba(43,26,19,.3);
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
        .scene-flow-viewport {
            height: 390px;
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
        .scene-map-node.is-route { border-color: #ffe32d; }
        .scene-map-node.is-selected { background: #ffdf28; color: #2c2514; border-color: #fff6a9; z-index: 2; }
        .scene-map-node:hover, .scene-map-node:focus-visible { z-index: 20; }
        .scene-map-node.is-start { width: 110px; font-size: 18px; }
        .scene-map-node.is-focus-node { width: 132px; min-height: 50px; font-size: 18px; }
        .scene-map-node.is-focus-node.is-selected { width: 150px; }
        .scene-map-node.is-focus-node::after { display: none; }
        .scene-flow-map-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 5px 8px 0; font-size: 15px; color: #b9eaf0; }
        .scene-flow-map-legend { display: flex; flex-wrap: wrap; gap: 5px 12px; }
        .scene-flow-map-legend b { font-weight: normal; }
        .scene-flow-map-legend .route { color: #ffdf28; }
        .scene-flow-map-legend .random { color: #ffad65; }
        .scene-flow-map-aside {
            padding: 10px 12px;
            color: #3b2c1c;
            background: #f4e4c8;
            box-shadow: inset 0 0 0 2px #8b5a2b;
            font-size: 18px;
        }
        .scene-flow-story-day { padding-bottom: 8px; border-bottom: 2px dashed #ad8051; color: #795023; }
        .scene-flow-story-day strong { color: #332918; font-weight: normal; }
        .scene-flow-host-route { padding: 7px 0; border-bottom: 2px dashed #ad8051; line-height: 1.04; }
        .scene-flow-host-route span { display: block; color: #795023; font-size: 15px; }
        .scene-flow-host-route strong { display: block; font-weight: normal; color: #37281b; }
        .scene-flow-host-route .host-next { margin-top: 5px; }
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
        .scene-flow-script-details { margin-top: 12px; font-family: 'VT323', monospace; font-size: 18px; }
        .scene-flow-script-details summary { cursor: pointer; min-height: 40px; padding: 8px; background: #ead7b8; }
        .scene-flow-outline { margin-top: 8px; }
        @media (max-width: 730px) {
            .scene-flow-map-shell { grid-template-columns: 1fr; }
            .scene-flow-viewport { height: min(48vh, 390px); }
            .scene-flow-map-aside { min-height: 160px; }
            #scene-flow-modal { padding: 14px 12px; }
            .scene-flow-map-hint { display: none; }
            .scene-map-node.is-focus-node { width: 88px; font-size: 15px; }
            .scene-map-node.is-focus-node.is-selected { width: 98px; }
            .scene-flow-map-tools .scene-flow-mode-button { min-width: 84px; }
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
    closeBtn.setAttribute('aria-label', 'Close how it works');
    let previousFocus = null;
    let isOpen = false;
    const close = () => {
        isOpen = false;
        previewGeneration++;
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
    };
    window.addEventListener('keydown', onKeydown);

    // Floating reveal button, matching the settings cog's mousemove reveal.
    const cog = document.createElement('button');
    cog.id = 'scene-flow-cog';
    cog.type = 'button';
    cog.textContent = '🧭';
    cog.tabIndex = -1;
    cog.setAttribute('aria-label', 'How this gag works');
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
            if (document.activeElement === cog) scheduleCogHide();
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
        try {
            return findScene(resolveEntry(script), tagId)?.tagId?.description || `${script} #${tagId}`;
        } catch {
            return `${script} #${tagId}`;
        }
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

    const renderFlow = (adsName, ads, scene) => {
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
        selectedKey = graph.start;
        trail = [graph.start];
        trailIndex = 0;

        title.textContent = flow.gag.name || `Gag ${flow.gag.tag}`;
        subtitle.textContent = `${adsName} · tag ${flow.gag.tag}`;

        clear(body);
        const shell = document.createElement('div');
        shell.className = 'scene-flow-map-shell';
        const main = document.createElement('div');
        main.className = 'scene-flow-map-main';
        const heading = document.createElement('div');
        heading.className = 'scene-flow-map-heading';
        const headingTitle = document.createElement('span');
        headingTitle.textContent = 'CURRENT ROUTE';
        const tools = document.createElement('div');
        tools.className = 'scene-flow-map-tools';
        const headingHint = document.createElement('span');
        headingHint.className = 'scene-flow-map-hint';
        headingHint.textContent = 'left: before · right: possible next';
        const modeButton = document.createElement('button');
        modeButton.type = 'button';
        modeButton.className = 'scene-flow-mode-button';
        modeButton.textContent = 'All routes';
        modeButton.setAttribute('aria-label', 'Show all routes');
        let overview = false;
        modeButton.addEventListener('click', () => {
            overview = !overview;
            main.classList.toggle('is-overview', overview);
            headingTitle.textContent = overview ? 'ALL ROUTES' : 'CURRENT ROUTE';
            headingHint.textContent = overview ? 'drag to pan · wheel to zoom' : 'left: before · right: possible next';
            modeButton.textContent = overview ? 'Focus route' : 'All routes';
            modeButton.setAttribute('aria-label', overview ? 'Focus on selected scene' : 'Show all routes');
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
        footer.innerHTML = '<span class="scene-flow-map-legend"><b class="route">● selected route</b><b>● possible</b><b class="random">● random pick</b></span><span>Select a scene to see its choices</span>';
        main.appendChild(footer);
        const aside = document.createElement('aside');
        aside.className = 'scene-flow-map-aside';
        const day = document.createElement('div');
        day.className = 'scene-flow-story-day';
        const storyDay = sequenceTools?.status?.()?.storyDay ?? sequenceTools?.getStoryDay?.();
        day.innerHTML = storyDay ? `STORY DAY <strong>${storyDay} / 11</strong>` : 'STORY DAY <strong>— / 11</strong>';
        aside.appendChild(day);
        const status = sequenceTools?.status?.();
        if (status?.active) {
            const hostRoute = document.createElement('div');
            hostRoute.className = 'scene-flow-host-route';
            const seenLabel = document.createElement('span');
            seenLabel.textContent = 'SEEN THIS SEQUENCE';
            const seen = document.createElement('strong');
            seen.textContent = seenGags.length ? seenGags.slice(-3).map(gagName).join(' → ') : gagName(status.active);
            hostRoute.append(seenLabel, seen);
            if (status.next) {
                const nextLabel = document.createElement('span');
                nextLabel.className = 'host-next';
                nextLabel.textContent = 'PLANNED NEXT GAG';
                const nextGag = document.createElement('strong');
                nextGag.textContent = gagName(status.next);
                hostRoute.append(nextLabel, nextGag);
            }
            aside.appendChild(hostRoute);
        }
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
        choices.className = 'scene-flow-next';
        aside.appendChild(choices);
        shell.append(main, aside);
        body.appendChild(shell);

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
            kicker.textContent = key === graph.start ? 'YOU ARE HERE · RUNNING GAG' : 'ROUTE YOU ARE TRACING';
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
                explanation.textContent = 'The current gag starts here. Choose a scene on the right to follow a route.';
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
                caption.textContent = 'Preparing silent scene preview…';
                inspector.append(stage, caption);
                import('./scene-flow-preview.mjs').then(({ mountSceneFlowPreview }) => {
                    if (previewRequest !== previewGeneration || !isOpen || !stage.isConnected) return;
                    mountedPreview = mountSceneFlowPreview({
                        host: stage, resolveEntry, sequenceTools, script: adsName,
                        gagTag: flow.gag.tag, slot, tag: childTag, route, storyDay: storyDay || 1,
                        onError: () => { caption.textContent = 'Preview unavailable for this scene.'; },
                    });
                    caption.textContent = 'Silent preview of this animation';
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
                play.textContent = '▶ Play this scene now';
                const note = document.createElement('small');
                note.className = 'scene-flow-preview-note';
                note.textContent = 'Previews this animation, then resumes the planned sequence.';
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
            choiceTitle.textContent = outgoing.length ? 'POSSIBLE NEXT EVENTS' : 'END OF THIS BRANCH';
            choices.appendChild(choiceTitle);
            for (const edge of outgoing) {
                const target = graph.nodes.find((item) => item.key === edge.to);
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = edge.action === 'stop'
                    ? `× stop ${target?.name || edge.to}`
                    : `${edge.random ? '◇ ' : '→ '}${target?.name || edge.to}`;
                const condition = document.createElement('small');
                condition.textContent = `${edge.random ? 'random pick · ' : ''}${edge.guard}`;
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
        select(graph.start, false);
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
        body.appendChild(details);
        renderLinks(adsName);
    };

    const renderCurrent = () => {
        const status = sequenceTools?.status?.() ?? null;
        const active = status?.active ?? null;
        if (!active) {
            renderEmpty("Johnny hasn't started a gag yet -- check back once he's up to something.");
            return;
        }

        let ads;
        try {
            ads = resolveEntry(active.script);
        } catch {
            ads = null;
        }
        if (!ads || !Array.isArray(ads.scenes)) {
            renderEmpty("The island's data isn't loaded yet, so there's nothing to show.");
            return;
        }

        const scene = findScene(ads, active.tagId);
        if (!scene) {
            renderEmpty(`Couldn't find gag ${active.tagId} in ${active.script}.`);
            return;
        }

        renderFlow(active.script, ads, scene);
    };

    function open() {
        isOpen = true;
        previousFocus = document.activeElement === cog ? null : document.activeElement;
        renderCurrent();
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
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

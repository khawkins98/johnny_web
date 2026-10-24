import { isolateDialog } from './dialog-background.mjs';
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
    describeSceneFlowGuard,
    extractSceneFlow,
} from '../../../dgds/scripting/scene-flow.mjs';
import { bandById, bandForPhase, gagFacts, keySceneFor, visitSequence } from '../story-steps.mjs';
import { DEFAULT_START_TIME, formatStartTime, startTimeForPhase, writeStartTime } from '../start-time.mjs';
import { STEPPER_STYLE, renderStoryStepper } from './story-stepper.mjs';
import { playStepEntrance, stepDirection } from './story-step-motion.mjs';
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
            background: #fff9dc;
            border: 3px solid #53736a;
            border-radius: 2px;
            box-shadow: 0 18px 44px rgba(0,0,0,0.52), 0 3px 8px rgba(0,0,0,0.32), inset 2px 2px 0 #f0dfbc;
            width: calc(100vw - 24px);
            max-width: none;
            max-height: calc(100vh - 24px);
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 12px 14px 14px;
            font-family: 'Trebuchet MS', Arial, sans-serif;
            color: #234e52;
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
            font-family: 'Trebuchet MS', Arial, sans-serif;
            font-size: 13px;
            margin: 0 0 7px 0;
            padding-bottom: 3px;
        }

        .scene-flow-inspector h3 { margin: 10px 0 0; font: 26px/1 'Caveat', cursive; }
        .scene-flow-inspector p { margin: 5px 0; line-height: 1.45; }
        .scene-flow-inspector .scene-flow-inspector-kicker { color: #53736a; text-transform: uppercase; font-size: 12px; }
        .scene-flow-preview-stage { position: relative; width: 100%; aspect-ratio: 4 / 3; margin: 8px 0 4px; overflow: hidden; background: #071998; border: 2px solid #53736a; box-sizing: border-box; }
        /* Shown smaller than 640x480: smooth downscaling averages the game's dithering instead of breaking it into moire. */
        .scene-flow-preview-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
        .scene-flow-preview-caption { display: block; color: #53736a; font-size: 12px; line-height: 1.4; }
        .scene-flow-play-button { width: 100%; min-height: 42px; margin-top: 8px; padding: 5px 8px; border: 2px solid #22553b; background: #f2cc91; color: #234e52; font: 700 14px/1.35 'Trebuchet MS', Arial, sans-serif; cursor: pointer; }
        .scene-flow-play-button:hover { background: #f6e2ae; }
        .scene-flow-play-button:active { scale: .96; }
        .scene-flow-preview-note { display: block; color: #53736a; font-size: 12px; line-height: 1.4; }
        .scene-flow-story-shell { padding: 16px; border-radius: 9px 5px; background: #c7e4df; box-shadow: inset 0 0 0 2px #a9c9b7; color: #234e52; font: 14px/1.45 'Trebuchet MS', Arial, sans-serif; }
        .scene-flow-possibility-note { margin: 0 0 10px; color: #234e52; font-size: 13px; }
        .scene-flow-matrix-detail { margin-top: 9px; border-top: 1px dashed #8bb9a8; padding-top: 9px; }
        .scene-flow-matrix-detail-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: #53736a; font-size: 13px; letter-spacing: .04em; }
        .scene-flow-matrix-detail-heading strong { color: #22553b; font-weight: normal; font-size: 20px; }
        .scene-flow-outline { margin-top: 8px; }
        @media (max-width: 730px) {
            #scene-flow-modal { padding: 14px 12px; }
            .scene-flow-story-shell { padding: 14px 12px; }
        }

        .scene-flow-close {
            position: absolute;
            top: 12px;
            right: 14px;
            background: rgba(244, 228, 200, 0.72);
            color: #234e52;
            border: 2px solid #53736a;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            font-family: 'Trebuchet MS', Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            box-shadow: 0 3px 7px rgba(0,0,0,0.22), inset 0 1px rgba(255,255,255,0.5);
        }

        .scene-flow-close:hover {
            background: #fff4dc;
        }

        .scene-flow-empty {
            font-family: 'Trebuchet MS', Arial, sans-serif;
            font-size: 18px;
            text-align: center;
            padding: 18px 6px;
        }

        .scene-flow-outline { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; counter-reset: step; }
        .scene-flow-step { border-radius: 6px 4px; display: grid; grid-template-columns: minmax(150px, 260px) 1fr; gap: 4px 14px; align-items: baseline;
            padding: 8px 12px 8px 40px; position: relative; background: #fff9dc; border: 2px solid #53736a; counter-increment: step; }
        .scene-flow-step::before { content: counter(step); position: absolute; left: 10px; top: 8px; font: 700 14px/1.35 'Trebuchet MS', Arial, sans-serif; color: #53736a; }
        .scene-flow-guard { font: 13px/1.45 'Trebuchet MS', Arial, sans-serif; color: #53736a; }
        .scene-flow-guard strong { font-weight: normal; color: #234e52; }
        .scene-flow-targets { display: flex; flex-wrap: wrap; gap: 4px 14px; font: 14px/1.4 'Trebuchet MS', Arial, sans-serif; color: #234e52; }
        .scene-flow-target strong, .scene-flow-pick strong { font-weight: normal; }
        .scene-flow-target::before { content: '→ '; color: #53736a; }
        .scene-flow-target.is-stop { color: #9a3412; }
        .scene-flow-target.is-stop::before { content: '■ '; }
        .scene-flow-pick-lead { flex-basis: 100%; color: #53736a; font-size: 18px; }
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
            font-size: 14px;
            color: #22553b;
            text-decoration: underline;
            text-decoration-style: wavy;
        }

        .scene-flow-link:hover {
            color: #234e52;
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
            background: #fff9dc;
            color: #234e52;
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
            background: #fff9dc;
        }
        #scene-flow-cog.is-visible:active { scale: .96; }
        #scene-flow-cog:focus-visible { outline: 3px solid rgba(244, 228, 200, 0.86); outline-offset: 3px; }
        .scene-flow-day-strip { margin: 6px 0 4px; }
        .scene-flow-day-buttons { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); border: 2px solid #8bb9a8; }
        .scene-flow-day-buttons button { min-height: 52px; padding: 5px 4px; border: 0; border-right: 1px solid #8bb9a8; background: #c7e4df; color: #234e52; cursor: pointer; text-align: center; overflow: hidden; }
        .scene-flow-day-buttons button:last-child { border-right: 0; }
        .scene-flow-day-buttons button strong { display: block; font: 700 18px/1.2 Georgia, serif; font-variant-numeric: tabular-nums; }
        .scene-flow-day-buttons button small { display: block; margin-top: 2px; font: 12px/1.3 'Trebuchet MS', Arial, sans-serif; color: #53736a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .scene-flow-day-buttons button[aria-current="date"] { background: #f2cc91; color: #234e52; }
        .scene-flow-day-buttons button[aria-current="date"] small { color: #234e52; }
        .scene-flow-day-buttons button[aria-pressed="true"] { box-shadow: inset 0 0 0 3px #fffbe2; }
        .scene-flow-day-buttons button:hover { background: #b4d9ce; }
        .scene-flow-day-buttons button[aria-current="date"]:hover { background: #f6e2ae; }
        .scene-flow-day-buttons button:focus-visible { outline: 3px solid #f2cc91; outline-offset: -3px; }
        .scene-flow-day-pick { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 10px; border: 2px solid #8bb9a8; border-top: 0; background: #c7e4df; color: #234e52; }
        .scene-flow-day-pick[hidden] { display: none; }
        .scene-flow-day-pick button { min-height: 40px; padding: 4px 14px; border: 2px solid #22553b; background: #f2cc91; color: #234e52; font: 700 14px/1.35 'Trebuchet MS', Arial, sans-serif; cursor: pointer; }
        .scene-flow-day-pick button:disabled { opacity: .5; cursor: default; }
        @media (max-width: 720px) {
            .scene-flow-day-buttons { grid-template-columns: repeat(6, minmax(0, 1fr)); }
            .scene-flow-day-buttons button small { display: none; }
        }
        .scene-flow-gag { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; align-items: start; margin-top: 8px; }
        .scene-flow-gag-aside { border-radius: 7px 4px; position: sticky; top: 0; padding: 10px 12px; color: #234e52; background: #fff9dc;
            box-shadow: inset 0 0 0 2px #53736a; font: 14px/1.45 'Trebuchet MS', Arial, sans-serif; }
        .scene-flow-targets button { min-height: 40px; padding: 5px 8px; border-radius: 5px; border: 1px solid transparent; background: none; color: inherit;
            font: inherit; text-align: left; cursor: pointer; text-decoration: underline dotted #53736a; text-underline-offset: 3px; }
        .scene-flow-targets button:hover { background: #f6e2ae; border-color: #53736a; }
        .scene-flow-targets button:focus-visible { outline: 3px solid #e99a32; outline-offset: 1px; }
        .scene-flow-targets button.is-route { background: #f6e2ae; }
        .scene-flow-targets button[aria-pressed="true"] { background: #f2cc91; border-color: #22553b; text-decoration: none; }
        .scene-flow-step.is-route { border-color: #8bb9a8; }
        .scene-flow-step.is-selected { border-color: #22553b; box-shadow: 0 0 0 2px #e99a32; }
        @media (max-width: 760px) {
            .scene-flow-gag { grid-template-columns: 1fr; }
            .scene-flow-gag-aside { border-radius: 7px 4px; position: static; }
        }
        /* Paper actions retain a consistent ink outline and a distinct keyboard ring. */
        #scene-flow-modal button:focus-visible { outline: 3px solid #e99a32; outline-offset: 2px; }
        .scene-flow-play-button, .scene-flow-day-pick button { border-radius: 7px 4px; }
        .scene-flow-matrix-detail-heading { flex-wrap: wrap; }
        .scene-flow-matrix-detail-heading strong { font: 700 16px/1.4 Georgia, serif; color: #22553b; }
        #scene-flow-modal .scene-flow-inspector-kicker { letter-spacing: .07em; }
        @media (prefers-reduced-motion: reduce) {
            #scene-flow-modal button { transition: none; }
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
    let releaseBackground = null;
    let isOpen = false;
    const close = () => {
        isOpen = false;
        mapGeneration++;
        previewGeneration++;
        mountedPreview?.destroy();
        mountedPreview = null;
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        releaseBackground?.();
        releaseBackground = null;
        previousFocus?.focus?.();
    };
    closeBtn.onclick = close;
    const header = document.createElement('header');
    header.className = 'scene-flow-header';
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const title = document.createElement('h2');
    title.id = 'scene-flow-title';
    header.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.id = 'scene-flow-subtitle';
    modal.appendChild(subtitle);

    const body = document.createElement('div');
    modal.appendChild(body);
    let selectedKey = null;
    let seenGags = [];
    let mapGeneration = 0;
    let mountedPreview = null;
    let previewGeneration = 0;
    let renderedGagId = null;
    // Story steps (issue #47): which day, then what time of day, then which gag.
    // `step` is where the viewer is; while `followLive` holds it tracks Johnny.
    let step = null;
    let stepperRoot = null;
    let faceQueue = null;
    const stepperStyle = document.createElement('style');
    stepperStyle.textContent = STEPPER_STYLE;
    document.head.appendChild(stepperStyle);
    const clockNotice = document.createElement('aside');
    clockNotice.id = 'timeline-clock-notice';
    clockNotice.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:1001;max-width:min(560px,calc(100vw - 32px));padding:10px;background:#102d8f;color:#fffbdc;border:2px solid #ffe02d;font:20px/1.2 VT323,monospace';
    clockNotice.hidden = true;
    const clockMessage = document.createElement('span');
    clockMessage.setAttribute('role', 'status');
    clockMessage.style.display = 'block';
    const returnLive = document.createElement('button');
    returnLive.type = 'button';
    returnLive.className = 'story-steps-play';
    returnLive.textContent = 'Use saved clock';
    returnLive.onclick = () => sequenceTools?.startRun?.({ mode: 'live' });
    let temporaryStatus = null;
    const saveClock = document.createElement('button');
    saveClock.type = 'button';
    saveClock.id = 'timeline-save-clock';
    saveClock.className = 'story-steps-play';
    saveClock.textContent = 'Save as current time';
    saveClock.title = 'Set the story clock to this time now; it will keep advancing. Scene-only sky and tide changes are not saved.';
    saveClock.onclick = () => {
        const band = bandById(temporaryStatus?.band);
        if (!band) return;
        writeStartTime(localStorage, startTimeForPhase(new Date(), band.min));
        localStorage.setItem('jc-time', 'original');
        localStorage.setItem('jc-experience', 'custom');
        sequenceTools?.startRun?.({ mode: 'live' });
    };
    clockNotice.append(clockMessage, returnLive, saveClock);
    document.body.appendChild(clockNotice);
    const clockDescription = (status) => {
        const local = localStorage.getItem('jc-time') === 'local';
        const night = (status?.forceNight || status?.band) ? status?.night
            : local ? new Date().getHours() < 6 || new Date().getHours() >= 18 : status?.night;
        const sky = status?.island === false ? 'off-island scene (no island sky)'
            : `${night ? 'night' : 'day'} sky`;
        const exception = (status?.forceNight && status?.band !== 'night' ? ' · Scene requires night' : '') +
            (status?.forceHighTide ? ' · Scene requires high tide' : '');
        return `Playing day ${status?.storyDay ?? 1} · ${sky}${exception} · Beach: ${status?.lowTide ? 'low' : 'high'} tide${status?.island === false ? ' (when on island)' : ''}`;
    };
    const liveSpot = (status) => ({
        day: status?.storyDay || sequenceTools?.getStoryDay?.() || 1,
        band: bandForPhase(status?.tidePhase)?.id ?? null,
        gag: status?.active ? gagFacts({ ...status.active, index: status.current }) : null,
        // The Start Time the live batch counted its phase from (so the NOW band and
        // the bands' clock times agree), else the stored setting, else 09:00.
        startTime: status?.startTime ?? sequenceTools?.getStartTime?.() ?? DEFAULT_START_TIME,
    });
    const followLive = (status) => {
        const live = liveSpot(status);
        step = { level: 'detail', day: live.day, band: live.band ?? 'early', gag: live.gag, followLive: true };
    };
    const playGag = (gag, day, band) => {
        if (typeof sequenceTools?.startRun !== 'function') return false;
        try {
            // 'preview' plays exactly this gag now, then the story carries on.
            // ('sequence' would plan a whole visit around it: a gag that ends a
            // visit would then play last, after other gags.)
            sequenceTools.startRun({
                mode: 'preview', script: gag.script, tagId: gag.tagId, storyDay: gag.keyDay || day, band,
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
                storyDay: day, band: step?.band, slot, childTag, route });
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
    const playDay = (day, band) => {
        const keyScene = keySceneFor(day);
        if (!keyScene || !canJumpDay()) return false;
        const savedDay = sequenceTools.getStoryDay?.();
        try {
            sequenceTools.setStoryDay(day);
            sequenceTools.startRun({ mode: 'sequence', script: keyScene.script, tagId: keyScene.tagId, storyDay: day, band });
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
        subtitle.textContent = clockDescription(status);
        const context = document.createElement('p');
        context.className = 'scene-flow-clock-context';
        context.style.cssText = 'margin:8px 0 12px;color:#234e52;font:14px/1.45 Trebuchet MS,Arial,sans-serif';
        context.textContent = `Browsing day ${step.day} · ${bandById(step.band)?.label ?? 'Early day'}. Browsing does not change playback. ` +
            `Visit story-clock offset: ${formatStartTime(live.startTime)}. Configured sky: ${localStorage.getItem('jc-time') === 'local' ? 'Live Local Clock (night before 06:00 / from 18:00)' : 'Sequence Clock (Original)'}. ` +
            (status?.band ? `Temporary ${bandById(status.band)?.label} override: ${status.preview ? 'this gag/scene, then the interrupted visit resumes' : 'this visit, then the configured clock resumes'}. ` : '');
        if (status?.band) {
            const backToClock = document.createElement('button');
            backToClock.type = 'button';
            backToClock.className = 'story-steps-play';
            backToClock.textContent = 'Return to live clock';
            backToClock.onclick = () => sequenceTools?.startRun?.({ mode: 'live' });
            context.appendChild(backToClock);
        }
        body.appendChild(context);

        const shell = document.createElement('div');
        shell.className = 'scene-flow-story-shell';
        faceQueue ??= createCardFaceQueue({ resolveEntry, sequenceTools });
        stepperRoot = renderStoryStepper(shell, {
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
            onStep: (patch, from = null) => {
                const direction = stepDirection(step.level, patch.level ?? step.level);
                step = { ...step, ...patch, followLive: false };
                if (patch.gag) step.gag = gagFacts(patch.gag);
                renderCurrent();
                modal.scrollTop = 0;
                playStepEntrance(stepperRoot, { direction, from });
            },
            onLive: () => {
                const before = step.level;
                followLive(sequenceTools?.status?.() ?? status);
                renderCurrent();
                playStepEntrance(stepperRoot, { direction: stepDirection(before, step.level) });
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

    // The gag view: one numbered step per condition ("after walk to bottle"),
    // each listing the scenes it starts or stops. Scenes are buttons; the side
    // panel previews the selected one and can play it. Built from the same
    // extractor as docs/scene-flows, with display tidy-ups only.
    const isLoaderName = (name) => /^load\b/i.test(name || '');
    const gagSteps = (flow) => {
        const steps = [];
        for (const step of flow.steps) {
            for (const branch of [step, ...(step.arms || [])]) {
                // Resource loaders ("LOAD MESSAGE") are setup, not something Johnny does.
                const adds = branch.adds.filter((item) => !isLoaderName(item.name))
                    .map((item) => ({ key: `${item.slot}:${item.tag}`, name: item.name }));
                const stops = branch.stops.filter((item) => !isLoaderName(item.name))
                    .map((item) => ({ key: `${item.slot}:${item.tag}`, name: item.name }));
                if (!adds.length && !stops.length) continue;
                const guardText = describeSceneFlowGuard(branch.guard, { fallThrough: Boolean(branch.fallThrough) });
                const random = Boolean(branch.random);
                const previous = steps.at(-1);
                // Steps that wait on the same thing read as one.
                if (previous && !previous.random && !random && previous.guardText === guardText) {
                    previous.adds.push(...adds);
                    previous.stops.push(...stops);
                    continue;
                }
                steps.push({ guardText, random, adds, stops });
            }
        }
        return steps;
    };
    // Quoted scene names become bold text; ALL-CAPS names are lowered to match the rest.
    const plainName = (name) => (/[a-z]/.test(name) ? name : name.toLowerCase());
    const appendNames = (element, text) => {
        text.split(/"([^"]*)"/).forEach((part, index) => {
            if (index % 2) {
                const name = document.createElement('strong');
                name.textContent = plainName(part);
                element.appendChild(name);
            } else if (part) {
                element.appendChild(document.createTextNode(part));
            }
        });
    };
    const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1);

    const renderFlow = (adsName, ads, scene, host, restoreKey = null) => {
        const label = buildSceneFlowLabelResolver(ads, resolveEntry, labelCache);
        const flow = extractSceneFlow(scene, { label });
        const graph = buildSceneFlowMap(flow);
        const steps = gagSteps(flow);
        previewGeneration++;
        mountedPreview?.destroy();
        mountedPreview = null;
        const storyDay = step?.day ?? sequenceTools?.status?.()?.storyDay ?? sequenceTools?.getStoryDay?.();

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
            const route = [...new Set([...loaders, ...routeTo(key).filter((item) => item !== graph.start)])];
            return route.map((item) => {
                const [slot, tag] = item.split(':').map(Number);
                return { slot, tag };
            });
        };

        const sceneKeys = steps.flatMap((item) => item.adds.map((add) => add.key));
        const firstAnimated = sceneKeys.find((key) => !/\b(init|setup|clear|copy|quarky watch)\b/i
            .test(graph.nodes.find((node) => node.key === key)?.name || ''));
        selectedKey = sceneKeys.includes(restoreKey) ? restoreKey : firstAnimated ?? sceneKeys[0] ?? null;

        const layout = document.createElement('div');
        layout.className = 'scene-flow-gag';
        const list = document.createElement('ol');
        list.className = 'scene-flow-outline';
        list.setAttribute('aria-label', 'This gag as a script');
        const aside = document.createElement('aside');
        aside.className = 'scene-flow-gag-aside';
        const inspector = document.createElement('div');
        inspector.className = 'scene-flow-inspector';
        aside.appendChild(inspector);
        layout.append(list, aside);
        host.appendChild(layout);

        const sceneButtons = [];
        if (!steps.length) {
            const empty = document.createElement('li');
            empty.className = 'scene-flow-empty';
            empty.textContent = '(no scripted steps for this gag)';
            list.appendChild(empty);
        }
        steps.forEach((item) => {
            const row = document.createElement('li');
            row.className = 'scene-flow-step';
            const guard = document.createElement('div');
            guard.className = 'scene-flow-guard';
            appendNames(guard, sentence(item.guardText));
            const targets = document.createElement('div');
            targets.className = 'scene-flow-targets';
            if (item.random) {
                const lead = document.createElement('span');
                lead.className = 'scene-flow-pick-lead';
                lead.textContent = 'picks one at random:';
                targets.appendChild(lead);
            }
            for (const add of item.adds) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = item.random ? 'scene-flow-pick' : 'scene-flow-target';
                button.dataset.key = add.key;
                button.textContent = plainName(add.name);
                button.addEventListener('click', () => select(add.key));
                targets.appendChild(button);
                sceneButtons.push({ button, row, key: add.key });
            }
            for (const stop of item.stops) {
                const span = document.createElement('span');
                span.className = 'scene-flow-target is-stop';
                span.textContent = `stop ${plainName(stop.name)}`;
                targets.appendChild(span);
            }
            row.append(guard, targets);
            list.appendChild(row);
        });

        function select(key) {
            if (!key) return;
            selectedKey = key;
            const route = new Set(routeTo(key));
            for (const { button, row } of sceneButtons) {
                row.classList.remove('is-route', 'is-selected');
                button.classList.remove('is-route');
                button.setAttribute('aria-pressed', 'false');
            }
            for (const { button, row, key: buttonKey } of sceneButtons) {
                if (buttonKey === key) {
                    button.setAttribute('aria-pressed', 'true');
                    row.classList.add('is-selected');
                } else if (route.has(buttonKey)) {
                    button.classList.add('is-route');
                    row.classList.add('is-route');
                }
            }
            const previewRequest = ++previewGeneration;
            mountedPreview?.destroy();
            mountedPreview = null;
            const node = graph.nodes.find((item) => item.key === key);
            const incoming = graph.edges.filter((edge) => edge.to === key && edge.action !== 'stop');
            inspector.replaceChildren();
            const kicker = document.createElement('div');
            kicker.className = 'scene-flow-inspector-kicker';
            kicker.textContent = 'A scene from this gag';
            const name = document.createElement('h3');
            name.textContent = plainName(node?.name || key);
            inspector.append(kicker, name);
            if (incoming.length) {
                const when = document.createElement('p');
                appendNames(when, sentence([...new Set(incoming.map((edge) => edge.guard))].join(' / ')));
                inspector.appendChild(when);
            }
            const [slot, childTag] = key.split(':').map(Number);
            const previewRoute = previewRouteTo(key);
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
                    gagTag: flow.gag.tag, slot, tag: childTag, route: previewRoute, storyDay: storyDay || 1, band: step?.band,
                    onError: () => { caption.textContent = 'Preview unavailable for this scene.'; },
                });
                caption.textContent = 'Silent preview from the original game';
            }).catch(() => {
                if (previewRequest === previewGeneration) caption.textContent = 'Preview unavailable for this scene.';
            });
            if (typeof sequenceTools?.startRun === 'function') {
                const play = document.createElement('button');
                play.type = 'button';
                play.className = 'scene-flow-play-button';
                play.textContent = '▶ Play this scene now';
                const note = document.createElement('small');
                note.className = 'scene-flow-preview-note';
                note.textContent = 'Runs this gag from here, then the visit carries on.';
                play.addEventListener('click', () => {
                    playScriptScene({ script: adsName, gagTag: flow.gag.tag,
                        day: storyDay || 1, key, route: previewRoute,
                        onError: () => { note.textContent = 'This scene could not be started. Try another one.'; } });
                });
                inspector.append(play, note);
            }
        }
        select(selectedKey);
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
        if (isOpen || document.querySelector('#settings-overlay[aria-hidden="false"]')) return;
        isOpen = true;
        step = null;
        renderedGagId = null;
        previousFocus = document.activeElement === cog ? null : document.activeElement;
        releaseBackground = isolateDialog(overlay);
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        renderCurrent();
        hideCog();
        closeBtn.focus();
    }

    // Live update: re-render whenever the running gag changes, but only while
    // the panel is actually open (no point building DOM nobody can see). Capture
    // the unsubscribe handle (if the controller returns one) so destroy() can
    // detach it.
    const unsubscribeStatus = sequenceTools?.subscribeStatus?.((status) => {
        temporaryStatus = status;
        clockNotice.hidden = !status?.band;
        const band = bandById(status?.band);
        const exceptions = [status?.forceNight && status?.band !== 'night' ? 'Scene requires night' : '',
            status?.forceHighTide ? 'Scene requires high tide' : ''].filter(Boolean);
        clockMessage.textContent = band
            ? `Day ${status.storyDay ?? 1} · ${band.label} preview. ${status.preview ? 'Ends after this gag/scene.' : 'Ends after this visit.'} Your saved clock is unchanged.${exceptions.length ? ' ' + exceptions.join('. ') + '.' : ''}` : '';
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
        releaseBackground?.();
        releaseBackground = null;
        faceQueue?.destroy();
        faceQueue = null;
        stepperStyle.remove();
        mapGeneration++;
        previewGeneration++;
        mountedPreview?.destroy();
        mountedPreview = null;
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('mousemove', showCog);
        if (cogTimer !== null) window.clearTimeout(cogTimer);
        cogTimer = null;
        if (typeof unsubscribeStatus === 'function') unsubscribeStatus();
        style.remove();
        overlay.remove();
        cog.remove();
        clockNotice.remove();
    };

    return { open, close, destroy };
}

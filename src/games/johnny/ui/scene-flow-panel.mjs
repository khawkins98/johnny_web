/**
 * scene-flow-panel.mjs — the in-app "How it works" panel.
 *
 * Shows the CURRENTLY RUNNING gag's authored ADS flow (guards, branches, RANDOM
 * picks) as a readable flowchart, live, using the same pure extractor that
 * generates the committed docs/scene-flows/*.md pages
 * (src/dgds/scripting/scene-flow.mjs). No mermaid / diagram library: the
 * flowchart is plain styled HTML, matching the retro paper aesthetic of
 * ui/settings.mjs.
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

const REPO_URL = 'https://github.com/khawkins98/johnny_web';
const DOCS_BASE = `${REPO_URL}/blob/main/docs/scene-flows`;
const EXTRACTOR_URL = `${REPO_URL}/blob/main/src/dgds/scripting/scene-flow.mjs`;
const METHODOLOGY_URL = `${REPO_URL}/blob/main/tools/faithfulness-oracle/METHODOLOGY.md`;

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
            width: 560px;
            max-width: calc(100vw - 40px);
            max-height: calc(100vh - 40px);
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 30px 34px 26px;
            font-family: 'Caveat', cursive;
            color: #4a3520;
            position: relative;
            transform: rotate(0.3deg);
        }

        #scene-flow-title {
            font-size: 36px;
            margin: 0 0 4px 0;
            text-align: center;
            text-shadow: 1px 1px 0px rgba(255,255,255,0.5);
            text-wrap: balance;
        }

        #scene-flow-subtitle {
            text-align: center;
            font-family: 'VT323', monospace;
            font-size: 16px;
            margin: 0 0 16px 0;
            border-bottom: 2px dashed #8b5a2b;
            padding-bottom: 12px;
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

    const links = document.createElement('div');
    links.className = 'scene-flow-links';
    modal.appendChild(links);

    overlay.appendChild(modal);
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display === 'flex') close();
    });

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

        title.textContent = flow.gag.name || `Gag ${flow.gag.tag}`;
        subtitle.textContent = `${adsName} · tag ${flow.gag.tag}`;

        clear(body);
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
        body.appendChild(container);
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
        hideCog();
        closeBtn.focus();
    }

    // Live update: re-render whenever the running gag changes, but only while
    // the panel is actually open (no point building DOM nobody can see).
    sequenceTools?.subscribeStatus?.(() => {
        if (isOpen) renderCurrent();
    });

    return { open, close };
}

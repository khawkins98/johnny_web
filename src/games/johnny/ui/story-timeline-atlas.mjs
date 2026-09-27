import { buildSceneFlowLabelResolver, extractSceneFlow } from '../../../dgds/scripting/scene-flow.mjs';
import { JOHNNY_SCENES, SceneFlags } from '../story-controller.mjs';
import { buildSceneFlowMap } from './scene-flow-graph.mjs';

const svgNs = 'http://www.w3.org/2000/svg';
const HEIGHT = 230;
const dayKey = (day) => JOHNNY_SCENES.find((scene) => scene.day === day);
const sceneId = (scene) => `${scene.script}:${scene.tagId}`;
const padDay = (day) => String(day).padStart(2, '0');

/** A small, deliberately representative set. Widths use the catalogue's source weights. */
function dayCandidates(day) {
    const key = dayKey(day);
    const byScript = new Map();
    for (const candidate of JOHNNY_SCENES) {
        if (!candidate.script.endsWith('.ADS') || candidate.script === 'STAND.ADS') continue;
        if (candidate.day !== 0 && candidate.day !== day) continue;
        if (sceneId(candidate) === sceneId(key)) continue;
        if (candidate.flags & SceneFlags.FINAL) continue;
        const previous = byScript.get(candidate.script);
        if (!previous || candidate.weight > previous.weight) byScript.set(candidate.script, candidate);
    }
    return [key, ...[...byScript.values()].sort((a, b) => b.weight - a.weight).slice(0, 7)];
}

function routeTo(graph, key) {
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
}

function previewRoute(graph, key) {
    const loaders = graph.edges.filter((edge) => edge.from === graph.start &&
        /\bload\b/i.test(graph.nodes.find((node) => node.key === edge.to)?.name || ''))
        .map((edge) => edge.to);
    return [...new Set([...loaders, ...routeTo(graph, key).filter((step) => step !== graph.start)])]
        .map((step) => {
            const [slot, tag] = step.split(':').map(Number);
            return { slot, tag };
        });
}

function graphForGag(gag, resolveEntry, cache) {
    const id = sceneId(gag);
    if (cache.has(id)) return cache.get(id);
    try {
        const ads = resolveEntry(gag.script);
        const scene = ads?.scenes?.find((item) => item.tagId?.id === gag.tagId);
        if (!scene) return null;
        const label = buildSceneFlowLabelResolver(ads, resolveEntry, new Map());
        const graph = buildSceneFlowMap(extractSceneFlow(scene, { label }));
        cache.set(id, graph);
        return graph;
    } catch {
        return null;
    }
}

const firstPreviewKey = (graph) => graph?.nodes.find((node) => node.kind === 'scene' &&
    !/\b(load|loader|init|setup|clear|copy|quarky watch)\b/i.test(node.name || ''))?.key ||
    graph?.nodes.find((node) => node.kind === 'scene')?.key;

function scriptNeighborhood(graph, selectedKey) {
    const selected = graph.nodes.some((node) => node.key === selectedKey) ? selectedKey : firstPreviewKey(graph) || graph.start;
    const wanted = new Set([graph.start, selected]);
    const queue = [{ key: selected, depth: 0 }];
    while (queue.length && wanted.size < 12) {
        const { key, depth } = queue.shift();
        if (depth >= 2) continue;
        for (const edge of graph.edges) {
            const neighbor = edge.from === key ? edge.to : edge.to === key ? edge.from : null;
            if (neighbor && !wanted.has(neighbor)) {
                wanted.add(neighbor);
                queue.push({ key: neighbor, depth: depth + 1 });
                if (wanted.size >= 12) break;
            }
        }
    }
    const positions = new Map();
    const distance = new Map([[graph.start, 0]]);
    const bfs = [graph.start];
    while (bfs.length) {
        const from = bfs.shift();
        for (const edge of graph.edges) {
            if (edge.from === from && !distance.has(edge.to)) {
                distance.set(edge.to, distance.get(from) + 1);
                bfs.push(edge.to);
            }
        }
    }
    const columns = new Map();
    for (const node of graph.nodes.filter((item) => wanted.has(item.key))) {
        const depth = Math.min(4, distance.get(node.key) ?? 4);
        if (!columns.has(depth)) columns.set(depth, []);
        columns.get(depth).push(node.key);
    }
    const maxDepth = Math.max(1, ...columns.keys());
    for (const [depth, keys] of columns) {
        keys.forEach((key, index) => {
            positions.set(key, { x: 85 + depth * 190, y: 116 + (index - (keys.length - 1) / 2) * 56 });
        });
    }
    return { selected, positions, width: Math.max(820, 180 + maxDepth * 190) };
}

/** Semantic story → day → gag atlas. Buttons remain HTML for touch and keyboard access. */
export function mountStoryTimelineAtlas({ host, resolveEntry, sequenceTools, storyDay, exploredDay,
    activeGag, inspectedGag, selectedSceneKey, initialLevel = 0, onLevel, onDay, onGag, onScene }) {
    const graphCache = new Map();
    const root = document.createElement('div');
    root.className = 'scene-flow-atlas';
    const toolbar = document.createElement('div');
    toolbar.className = 'scene-flow-atlas-toolbar';
    const title = document.createElement('span');
    const controls = document.createElement('div');
    controls.className = 'scene-flow-atlas-controls';
    const zoomOut = document.createElement('button');
    zoomOut.type = 'button';
    zoomOut.textContent = '−';
    zoomOut.setAttribute('aria-label', 'Zoom out to a wider story view');
    const zoomIn = document.createElement('button');
    zoomIn.type = 'button';
    zoomIn.textContent = '+';
    zoomIn.setAttribute('aria-label', 'Zoom in to a more detailed story view');
    controls.append(zoomOut, zoomIn);
    toolbar.append(title, controls);
    const viewport = document.createElement('div');
    viewport.className = 'scene-flow-atlas-viewport';
    viewport.setAttribute('aria-label', 'Story timeline; use the mouse wheel or zoom buttons to change detail');
    const stage = document.createElement('div');
    stage.className = 'scene-flow-atlas-stage';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const buttons = document.createElement('div');
    buttons.className = 'scene-flow-atlas-buttons';
    const tooltip = document.createElement('div');
    tooltip.className = 'scene-flow-atlas-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    stage.append(svg, buttons);
    viewport.appendChild(stage);
    const footer = document.createElement('div');
    footer.className = 'scene-flow-atlas-footer';
    root.append(toolbar, viewport, footer);
    host.appendChild(root);
    document.body.appendChild(tooltip);

    let level = Math.max(0, Math.min(2, initialLevel));
    let selectedScene = selectedSceneKey;
    let preview = null;
    let tooltipRequest = 0;
    let wheelAt = 0;
    let destroyed = false;
    let width = 0;

    const nameOf = (gag) => {
        try {
            return resolveEntry(gag.script)?.scenes?.find((scene) => scene.tagId?.id === gag.tagId)?.tagId?.description ||
                `${gag.script} #${gag.tagId}`;
        } catch {
            return `${gag.script} #${gag.tagId}`;
        }
    };
    const hideTooltip = () => {
        tooltipRequest++;
        preview?.destroy();
        preview = null;
        tooltip.hidden = true;
        tooltip.replaceChildren();
    };
    const showTooltip = (info, anchor) => {
        hideTooltip();
        const request = tooltipRequest;
        tooltip.hidden = false;
        const rect = anchor.getBoundingClientRect();
        const narrow = window.innerWidth <= 640;
        const left = narrow ? rect.left + (rect.width - 206) / 2
            : rect.right + 218 < window.innerWidth ? rect.right + 12 : rect.left - 218;
        const below = rect.bottom + 10;
        const top = narrow
            ? (below + 225 < window.innerHeight ? below : rect.top - 235)
            : rect.top - 20;
        tooltip.style.left = `${Math.max(6, Math.min(window.innerWidth - 212, left))}px`;
        tooltip.style.top = `${Math.max(6, Math.min(window.innerHeight - 230, top))}px`;
        const kicker = document.createElement('small');
        kicker.textContent = info.kicker;
        const label = document.createElement('strong');
        label.textContent = info.name;
        const stage = document.createElement('div');
        stage.className = 'scene-flow-atlas-preview';
        const note = document.createElement('small');
        note.textContent = info.note || 'Preparing original game preview…';
        tooltip.append(kicker, label, stage, note);
        if (!info.gag) return;
        const graph = graphForGag(info.gag, resolveEntry, graphCache);
        const key = info.sceneKey && graph?.nodes.some((node) => node.key === info.sceneKey)
            ? info.sceneKey : firstPreviewKey(graph);
        if (!graph || !key) {
            note.textContent = 'No scene preview for this node.';
            return;
        }
        const [slot, tag] = key.split(':').map(Number);
        const route = previewRoute(graph, key);
        import('./scene-flow-preview.mjs').then(({ mountSceneFlowPreview }) => {
            if (destroyed || request !== tooltipRequest || !stage.isConnected) return;
            try {
                preview = mountSceneFlowPreview({ host: stage, resolveEntry, sequenceTools,
                    script: info.gag.script, gagTag: info.gag.tagId, slot, tag, route,
                    storyDay: info.day, onError: () => { note.textContent = 'Preview unavailable for this scene.'; } });
                if (!info.note) note.textContent = 'Silent original game preview';
            } catch {
                note.textContent = 'Preview unavailable for this scene.';
            }
        }).catch(() => { if (request === tooltipRequest) note.textContent = 'Preview unavailable for this scene.'; });
    };
    const addPath = (d, kind = 'possible', strokeWidth = 2) => {
        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', `scene-flow-atlas-line is-${kind}`);
        path.setAttribute('stroke-width', String(strokeWidth));
        path.setAttribute('marker-end', `url(#atlas-arrow-${kind})`);
        svg.appendChild(path);
    };
    const addNode = ({ x, y, text, kind, current = false, selected = false, label, info, onClick }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `scene-flow-atlas-node is-${kind}`;
        button.classList.toggle('is-current', current);
        button.classList.toggle('is-selected', selected);
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
        button.textContent = text;
        button.setAttribute('aria-label', label);
        button.addEventListener('mouseenter', () => showTooltip(info, button));
        button.addEventListener('mouseleave', hideTooltip);
        button.addEventListener('focus', () => showTooltip(info, button));
        button.addEventListener('blur', hideTooltip);
        button.addEventListener('click', onClick);
        buttons.appendChild(button);
    };
    const defs = () => {
        const markup = '<defs><marker id="atlas-arrow-possible" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="#70dce9"/></marker><marker id="atlas-arrow-current" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="#ffe45b"/></marker><marker id="atlas-arrow-loop" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="#ffad65"/></marker></defs>';
        svg.innerHTML = markup;
    };
    const dayInfo = (day) => ({ kicker: `STORY DAY ${padDay(day)}`, name: nameOf(dayKey(day)), gag: dayKey(day), day,
        note: 'Key scene · select day to inspect before playing' });
    const drawDays = () => {
        const gap = (width - 100) / 10;
        const y = 128;
        for (let index = 0; index < 10; index++) {
            const from = 50 + index * gap;
            const to = from + gap;
            addPath(`M${from + 34} ${y} L${to - 37} ${y}`, 'possible', 2);
        }
        addPath(`M${width - 50} ${y - 17} C${width - 90} 7 90 7 50 ${y - 17}`, 'loop', 2.4);
        for (let day = 1; day <= 11; day++) {
            const x = 50 + (day - 1) * gap;
            if (day === storyDay || day === exploredDay) {
                addPath(`M${x - 18} ${y - 12} C${x - 44} ${y - 86} ${x + 44} ${y - 86} ${x + 18} ${y - 12}`, 'loop', 1.8);
            }
            addNode({ x, y, text: padDay(day), kind: 'day', current: day === storyDay,
                selected: day === exploredDay, label: `Explore story day ${day}${day === storyDay ? ', live day' : ''}`,
                info: dayInfo(day), onClick: () => { onLevel(1); onDay(day); } });
        }
        footer.textContent = 'Day path: next unlocked calendar day · arches: another visit or day 11 → 1. Wheel in to see possible gags.';
    };
    const drawDayChoices = () => {
        const day = exploredDay ?? storyDay;
        const previous = day === 1 ? 11 : day - 1;
        const next = day === 11 ? 1 : day + 1;
        const center = width / 2;
        const y = 52;
        addPath(`M${center - 300} ${y} L${center + 300} ${y}`, 'possible', 2);
        addPath(`M${center - 20} ${y - 15} C${center - 75} -20 ${center + 75} -20 ${center + 20} ${y - 15}`, 'loop', 2.2);
        for (const [which, x] of [[previous, center - 300], [day, center], [next, center + 300]]) {
            addNode({ x, y, text: `DAY ${padDay(which)}`, kind: 'day', current: which === storyDay,
                selected: which === day, label: `Explore story day ${which}`, info: dayInfo(which),
                onClick: () => onDay(which) });
        }
        const candidates = dayCandidates(day);
        const gap = (width - 150) / Math.max(1, candidates.length - 1);
        const maxWeight = Math.max(1, ...candidates.slice(1).map((candidate) => candidate.weight));
        candidates.forEach((gag, index) => {
            const x = candidates.length === 1 ? center : 75 + index * gap;
            const key = index === 0;
            const gated = gag.tideMin !== 0 || gag.tideMax !== 16;
            const thickness = key ? 2.5 : 1.5 + 4 * Math.sqrt(gag.weight / maxWeight);
            addPath(`M${center} 76 C${center} 115 ${x} 115 ${x} 151`, key ? 'current' : 'possible', thickness);
            addNode({ x, y: 174, text: nameOf(gag), kind: 'gag', current: sceneId(gag) === sceneId(activeGag),
                selected: sceneId(gag) === sceneId(inspectedGag),
                label: `${nameOf(gag)}; ${key ? 'day key scene' : `catalogue weight ${gag.weight}`}${gated ? '; tide gated' : ''}`,
                info: { kicker: key ? `DAY ${padDay(day)} KEY SCENE` : `POSSIBLE GAG · SOURCE WEIGHT ${gag.weight}`,
                    name: nameOf(gag), gag, day,
                    note: key ? 'Key scene · Play day starts here' :
                        `Relative source weight ${gag.weight}${gated ? ' · tide gated' : ''}; actual odds also depend on budget and history` },
                onClick: () => { onLevel(2); onGag(gag); } });
        });
        footer.textContent = 'Line width = relative catalogue weight for eligible gags; tide, visit budget and history change the actual odds. Wheel in for script paths.';
    };
    const drawGagScenes = () => {
        const gag = inspectedGag || activeGag;
        const graph = gag && graphForGag(gag, resolveEntry, graphCache);
        if (!graph) {
            footer.textContent = 'Script graph unavailable for this gag. Wheel out to see day choices.';
            return;
        }
        const neighborhood = scriptNeighborhood(graph, selectedScene);
        width = neighborhood.width;
        stage.style.width = `${width}px`;
        svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);
        const { positions, selected } = neighborhood;
        for (const edge of graph.edges) {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) continue;
            const backwards = to.x <= from.x;
            const d = backwards
                ? `M${from.x} ${from.y - 19} Q${(from.x + to.x) / 2} 9 ${to.x} ${to.y - 19}`
                : `M${from.x + 38} ${from.y} C${from.x + 88} ${from.y} ${to.x - 88} ${to.y} ${to.x - 38} ${to.y}`;
            addPath(d, backwards || edge.random ? 'loop' : 'possible', 2.2);
        }
        for (const node of graph.nodes.filter((item) => positions.has(item.key))) {
            const { x, y } = positions.get(node.key);
            addNode({ x, y, text: node.name, kind: 'scene', current: node.key === graph.start,
                selected: node.key === selected, label: `Inspect ${node.name} in ${nameOf(gag)}`,
                info: { kicker: `SCRIPT SCENE · ${nameOf(gag)}`, name: node.name, gag,
                    sceneKey: node.key, day: exploredDay ?? storyDay,
                    note: 'Script path, not an exact live playback trace' },
                onClick: () => onScene(node.key) });
        }
        footer.textContent = 'Arches show loops or back edges · orange marks random paths. Exact branch odds are unknown; Full script map below shows every step.';
    };
    const draw = () => {
        hideTooltip();
        width = Math.max(level === 2 ? 820 : 1000, viewport.clientWidth);
        stage.style.width = `${width}px`;
        svg.setAttribute('viewBox', `0 0 ${width} ${HEIGHT}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        buttons.replaceChildren();
        defs();
        title.textContent = ['STORY DAYS · 11-DAY ARC', `DAY ${padDay(exploredDay ?? storyDay)} · POSSIBLE GAGS`,
            `${nameOf(inspectedGag || activeGag)} · SCRIPT PATHS`][level];
        zoomOut.disabled = level === 0;
        zoomIn.disabled = level === 2;
        if (level === 0) drawDays();
        else if (level === 1) drawDayChoices();
        else drawGagScenes();
        const focusX = level === 0 ? 50 + ((exploredDay ?? storyDay) - 1) * (width - 100) / 10 : width / 2;
        viewport.scrollLeft = Math.max(0, focusX - viewport.clientWidth / 2);
    };
    const setLevel = (next) => {
        const clamped = Math.max(0, Math.min(2, next));
        if (clamped === level) return;
        level = clamped;
        onLevel(level);
        draw();
    };
    const onWheel = (event) => {
        if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        event.preventDefault();
        const now = performance.now();
        if (now - wheelAt < 160) return;
        wheelAt = now;
        setLevel(level + (event.deltaY < 0 ? 1 : -1));
    };
    zoomOut.addEventListener('click', () => setLevel(level - 1));
    zoomIn.addEventListener('click', () => setLevel(level + 1));
    viewport.addEventListener('wheel', onWheel, { passive: false });
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
    resize?.observe(viewport);
    draw();
    return {
        selectScene(key) { selectedScene = key; if (level === 2) draw(); },
        destroy() {
            destroyed = true;
            hideTooltip();
            resize?.disconnect();
            viewport.removeEventListener('wheel', onWheel);
            tooltip.remove();
            root.remove();
        },
    };
}

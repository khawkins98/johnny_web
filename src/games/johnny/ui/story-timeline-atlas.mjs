import { buildSceneFlowLabelResolver, extractSceneFlow } from '../../../dgds/scripting/scene-flow.mjs';
import { JOHNNY_SCENES, SceneFlags } from '../story-controller.mjs';
import { buildSceneFlowMap } from './scene-flow-graph.mjs';

const svgNs = 'http://www.w3.org/2000/svg';
const dayKey = (day) => JOHNNY_SCENES.find((scene) => scene.day === day);
const sceneId = (scene) => scene.script === 'POSE'
    ? `POSE:${scene.tagId}:${scene.startSpot ?? '?'}:${scene.startHeading ?? '?'}`
    : `${scene.script}:${scene.tagId}`;
const padDay = (day) => String(day).padStart(2, '0');
const COMMON = JOHNNY_SCENES.filter((scene) => scene.day === 0);
const MIN_DAY_HEIGHT = 1500;
const DAY_WIDTH = 980;
const GAG_W = 106;
const GAG_H = 52;
const GAP = 126;

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

function makeLayout(visitItems, storyDay, height) {
    const days = [];
    let x = 0;
    for (let day = 1; day <= 11; day++) {
        const route = day === storyDay ? visitItems : [];
        const width = DAY_WIDTH;
        days.push({ day, x, width, route });
        x += width + 28;
    }
    return { days, width: x - 28, height };
}

/** One fixed world: day bands contain the live visit and every catalog possibility. */
export function mountStoryTimelineAtlas({ host, resolveEntry, sequenceTools, storyDay, exploredDay,
    inspectedGag, selectedSceneKey, visitItems = [], camera: savedCamera,
    onDay, onGag, onScene }) {
    const graphCache = new Map();
    const inspectedDay = exploredDay ?? storyDay;
    const scriptGraph = inspectedGag && inspectedGag.script !== 'POSE'
        ? graphForGag(inspectedGag, resolveEntry, graphCache) : null;
    const scriptOriginY = inspectedDay === storyDay ? 1190 : 880;
    const worldHeight = Math.max(MIN_DAY_HEIGHT,
        scriptOriginY + Math.ceil((scriptGraph?.nodes.length ?? 0) / 6) * 53 + 100);
    const layout = makeLayout(visitItems, storyDay, worldHeight);
    const root = document.createElement('div');
    root.className = 'scene-flow-atlas';
    const toolbar = document.createElement('div');
    toolbar.className = 'scene-flow-atlas-toolbar';
    const title = document.createElement('span');
    title.textContent = 'STORY MAP · DRAG TO PAN · WHEEL TO ZOOM';
    const controls = document.createElement('div');
    controls.className = 'scene-flow-atlas-controls';
    const control = (text, label, action, wide = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.setAttribute('aria-label', label);
        if (wide) button.className = 'is-wide';
        button.addEventListener('click', action);
        controls.appendChild(button);
        return button;
    };
    toolbar.append(title, controls);
    const viewport = document.createElement('div');
    viewport.className = 'scene-flow-atlas-viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', 'Story map. Drag to pan, wheel to zoom, arrow keys to move, plus and minus to zoom.');
    const stage = document.createElement('div');
    stage.className = 'scene-flow-atlas-stage';
    stage.style.width = `${layout.width}px`;
    stage.style.height = `${layout.height}px`;
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
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
    footer.textContent = 'DAY BANDS are landmarks · yellow is live · dashed is planned · cyan is possible · line width shows catalog weight, not odds';
    root.append(toolbar, viewport, footer);
    host.appendChild(root);
    document.body.appendChild(tooltip);

    let preview = null;
    let tooltipRequest = 0;
    let destroyed = false;
    let selectedScene = selectedSceneKey;
    let camera = savedCamera && Number.isFinite(savedCamera.scale) ? { ...savedCamera } : null;
    let drag = null;
    const points = new Map();
    const dayAt = (day) => layout.days[day - 1];
    const nameOf = (gag) => {
        if (gag.script === 'POSE') {
            const spot = ['A', 'B', 'C', 'D', 'E', 'G'][gag.startSpot] ?? '?';
            const heading = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'][gag.startHeading] ?? '?';
            return `Pose ${spot} · ${heading}`;
        }
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
        const left = rect.right + 220 < window.innerWidth ? rect.right + 10 : rect.left - 216;
        tooltip.style.left = `${Math.max(6, Math.min(window.innerWidth - 212, left))}px`;
        const kicker = document.createElement('small');
        kicker.textContent = info.kicker;
        const label = document.createElement('strong');
        label.textContent = info.name;
        const previewHost = document.createElement('div');
        previewHost.className = 'scene-flow-atlas-preview';
        const note = document.createElement('small');
        note.textContent = info.note || 'Preparing original game preview…';
        tooltip.append(kicker, label, previewHost, note);
        const top = rect.top + tooltip.offsetHeight < window.innerHeight - 6
            ? rect.top : window.innerHeight - tooltip.offsetHeight - 6;
        tooltip.style.top = `${Math.max(6, top)}px`;
        if (!info.gag || info.gag.script === 'POSE') {
            previewHost.remove();
            if (info.gag?.script === 'POSE') note.textContent = 'Engine standing pose; no ADS animation preview.';
            return;
        }
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
            if (destroyed || request !== tooltipRequest || !previewHost.isConnected) return;
            try {
                preview = mountSceneFlowPreview({ host: previewHost, resolveEntry, sequenceTools,
                    script: info.gag.script, gagTag: info.gag.tagId, slot, tag, route,
                    storyDay: info.day, onError: () => { note.textContent = 'Preview unavailable for this scene.'; } });
                if (!info.note) note.textContent = 'Silent original game preview';
            } catch { note.textContent = 'Preview unavailable for this scene.'; }
        }).catch(() => { if (request === tooltipRequest) note.textContent = 'Preview unavailable for this scene.'; });
    };
    const addPath = (d, kind, strokeWidth = 2) => {
        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', `scene-flow-atlas-line is-${kind}`);
        path.setAttribute('stroke-width', String(strokeWidth));
        svg.appendChild(path);
    };
    const addText = (x, y, value, className) => {
        const label = document.createElement('div');
        label.className = className;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.textContent = value;
        buttons.appendChild(label);
    };
    const addNode = ({ x, y, text, kind, current, selected, label, info, onClick, width }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `scene-flow-atlas-node is-${kind}`;
        button.classList.toggle('is-current', Boolean(current));
        button.classList.toggle('is-selected', Boolean(selected));
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
        if (width) button.style.width = `${width}px`;
        button.textContent = text;
        button.setAttribute('aria-label', label);
        button.addEventListener('mouseenter', () => showTooltip(info, button));
        button.addEventListener('mouseleave', hideTooltip);
        button.addEventListener('focus', () => showTooltip(info, button));
        button.addEventListener('blur', hideTooltip);
        button.addEventListener('click', onClick);
        buttons.appendChild(button);
        return button;
    };
    const keyInfo = (gag, day, role, note) => ({ kicker: `${role} · STORY DAY ${padDay(day)}`,
        name: nameOf(gag), gag, day, note });
    const inspectedId = inspectedGag && sceneId(inspectedGag);
    const routeItemId = (item) => `${sceneId(item.gag)}:${item.gag.index ?? ''}`;
    let inspectedPoint = null;
    let livePoint = null;

    for (const band of layout.days) {
        const { day, x, width, route } = band;
        const rect = document.createElementNS(svgNs, 'rect');
        rect.setAttribute('x', String(x + 5));
        rect.setAttribute('y', '8');
        rect.setAttribute('width', String(width - 10));
        rect.setAttribute('height', String(layout.height - 16));
        rect.setAttribute('class', `scene-flow-atlas-day-band${day === storyDay ? ' is-live' : ''}`);
        svg.appendChild(rect);
        addText(x + 52, 22, padDay(day), 'scene-flow-atlas-overview-label');
        const key = dayKey(day);
        addNode({ x: x + 104, y: 57, text: `DAY ${padDay(day)}`, kind: 'day',
            current: day === storyDay, selected: day === exploredDay,
            label: `Inspect story day ${day}`, info: keyInfo(key, day, 'STORY DAY', 'Select to inspect; Play day changes playback'),
            onClick: () => onDay(day) });
        addText(x + 200, 39, day === storyDay ? 'CURRENT VISIT' : 'KEY SCENE & POSSIBILITIES', 'scene-flow-atlas-day-caption');
        const keyX = x + 108;
        addNode({ x: keyX, y: 140, text: nameOf(key), kind: 'gag',
            selected: inspectedId === sceneId(key) && (exploredDay === day || day === storyDay),
            label: `Inspect ${nameOf(key)}, key scene for day ${day}`,
            info: keyInfo(key, day, 'DAY KEY SCENE', 'Select to inspect · Play day starts here'),
            onClick: () => onGag(key, day) });
        points.set(`${day}:${sceneId(key)}`, { x: keyX, y: 140 });
        if (day === storyDay && route.length) {
            addText(x + 20, 189, 'THIS VISIT · SOLID = SEEN / LIVE · DASHED = PLANNED', 'scene-flow-atlas-lane-label');
            const routeColumns = 7;
            route.forEach((item, index) => {
                const row = Math.floor(index / routeColumns);
                const column = index % routeColumns;
                const px = x + 105 + (row % 2 ? routeColumns - 1 - column : column) * GAP;
                const y = 255 + row * 76;
                const gag = item.gag;
                const live = item.state === 'current';
                const info = keyInfo(gag, day, item.label, live ? 'Johnny is playing this gag now' :
                    item.state === 'planned' ? 'Already chosen for this visit' : 'Already seen in this visit');
                if (index > 0) {
                    const prevRow = Math.floor((index - 1) / routeColumns);
                    const prevCol = (index - 1) % routeColumns;
                    const previous = x + 105 + (prevRow % 2 ? routeColumns - 1 - prevCol : prevCol) * GAP;
                    const previousY = 255 + prevRow * 76;
                    const d = row === prevRow
                        ? `M${previous + (row % 2 ? -1 : 1) * GAG_W / 2} ${y} L${px - (row % 2 ? -1 : 1) * GAG_W / 2} ${y}`
                        : `M${previous} ${previousY + GAG_H / 2} L${px} ${y - GAG_H / 2}`;
                    addPath(d,
                        item.state === 'planned' ? 'planned' : 'visited', 3);
                }
                addNode({ x: px, y, text: `${String(gag.index ?? index + 1).padStart(2, '0')} · ${nameOf(gag)}`,
                    kind: 'gag', current: live,
                    selected: inspectedId === sceneId(gag) && (inspectedGag?.index ?? null) === (gag.index ?? null),
                    label: `${item.label}: ${nameOf(gag)}`, info,
                    onClick: () => onGag(gag, day) });
                points.set(`visit:${routeItemId(item)}`, { x: px, y });
                if (live) livePoint = { x: px, y };
                if (inspectedId === sceneId(gag) && (inspectedGag?.index ?? null) === (gag.index ?? null)) {
                    inspectedPoint = { x: px, y };
                }
            });
            addText(x + 20, 487, 'NEXT VISIT UNKNOWN', 'scene-flow-atlas-lane-label');
        }
        const candidates = [...COMMON, ...JOHNNY_SCENES.filter((scene) => scene.day === day && sceneId(scene) !== sceneId(key))];
        const columns = 7;
        const rowHeight = 50;
        const candidateTop = day === storyDay ? 570 : 265;
        addText(x + 20, candidateTop - 42, `POSSIBLE GAGS · ${candidates.length} CATALOG RECORDS · CONDITIONS APPLY`, 'scene-flow-atlas-lane-label');
        const maxWeight = Math.max(1, ...candidates.map((candidate) => candidate.weight));
        candidates.forEach((gag, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            const px = x + 105 + col * GAP;
            const py = candidateTop + row * rowHeight;
            const gated = gag.tideMin !== 0 || gag.tideMax !== 16;
            const final = Boolean(gag.flags & SceneFlags.FINAL);
            const possibilityNote = `Catalog weight ${gag.weight}; ${gated ? `tide ${gag.tideMin}–${gag.tideMax - 1}` : 'all tides'}${final ? '; ending gag' : ''}. Actual selection also depends on visit state.`;
            addPath(`M${px - GAG_W / 2 - 14} ${py} L${px - GAG_W / 2 - 2} ${py}`, 'possible',
                1.5 + 5 * Math.sqrt(gag.weight / maxWeight));
            addNode({ x: px, y: py, text: nameOf(gag), kind: 'gag',
                selected: inspectedId === sceneId(gag) && (exploredDay === day || day === storyDay) && inspectedGag?.index == null,
                label: `${nameOf(gag)}; possible on day ${day}; source weight ${gag.weight}${gated ? '; tide gated' : ''}`,
                info: keyInfo(gag, day, `POSSIBLE · SOURCE WEIGHT ${gag.weight}`, possibilityNote),
                onClick: () => onGag(gag, day) });
            points.set(`${day}:${sceneId(gag)}`, { x: px, y: py });
        });
    }

    const inspectedBand = dayAt(inspectedDay);
    const inspectedKey = inspectedGag && sceneId(inspectedGag);
    if (!inspectedPoint && inspectedKey) inspectedPoint = points.get(`${inspectedDay}:${inspectedKey}`);
    if (inspectedPoint && inspectedGag && inspectedGag.script !== 'POSE') {
        const graph = scriptGraph;
        if (graph) {
            const originX = inspectedBand.x + 35;
            const originY = scriptOriginY;
            const graphNodes = graph.nodes;
            const nodePositions = new Map();
            const lens = document.createElementNS(svgNs, 'rect');
            lens.setAttribute('x', String(originX - 14));
            lens.setAttribute('y', String(originY - 68));
            lens.setAttribute('width', '736');
            lens.setAttribute('height', String(Math.max(250, Math.ceil(graphNodes.length / 6) * 53 + 90)));
            lens.setAttribute('class', 'scene-flow-atlas-script-lens');
            svg.appendChild(lens);
            graphNodes.forEach((node, index) => {
                const col = index % 6;
                const row = Math.floor(index / 6);
                nodePositions.set(node.key, { x: originX + 60 + col * 112, y: originY + row * 53 });
            });
            addText(originX, originY - 46, `INSIDE ${nameOf(inspectedGag)} · SCRIPT REFERENCES · GUARDS AND PARALLEL ACTIONS IN INSPECTOR`, 'scene-flow-atlas-lane-label');
            for (const edge of graph.edges) {
                const from = nodePositions.get(edge.from);
                const to = nodePositions.get(edge.to);
                if (!from || !to) continue;
                const backwards = to.x <= from.x;
                const d = backwards
                    ? `M${from.x} ${from.y - 16} Q${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - 33} ${to.x} ${to.y - 16}`
                    : `M${from.x + 40} ${from.y} C${from.x + 55} ${from.y} ${to.x - 55} ${to.y} ${to.x - 40} ${to.y}`;
                addPath(d, edge.random ? 'random' : backwards ? 'return' : 'script', 1.7);
            }
            for (const node of graphNodes) {
                const { x, y } = nodePositions.get(node.key);
                const button = addNode({ x, y, text: node.name, kind: 'scene', width: 90,
                    selected: node.key === selectedScene,
                    label: `Inspect ${node.name} in ${nameOf(inspectedGag)}`,
                    info: { ...keyInfo(inspectedGag, inspectedDay, 'SCRIPT ACTION',
                        'Possible script step; selection is not live playback'), sceneKey: node.key },
                    onClick: () => onScene(node.key) });
                button.dataset.sceneKey = node.key;
            }
        }
    }

    const clampScale = (value) => Math.max(0.02, Math.min(2.4, value));
    const clampCamera = () => {
        const w = viewport.clientWidth;
        const h = viewport.clientHeight;
        const contentWidth = layout.width * camera.scale;
        const contentHeight = layout.height * camera.scale;
        camera.x = contentWidth < w ? (w - contentWidth) / 2
            : Math.min(24, Math.max(w - contentWidth - 24, camera.x));
        camera.y = contentHeight < h ? (h - contentHeight) / 2
            : Math.min(24, Math.max(h - contentHeight - 24, camera.y));
    };
    const paintCamera = () => {
        clampCamera();
        stage.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
        root.classList.toggle('is-overview', camera.scale < .42);
    };
    const focusPoint = (point, scale = camera?.scale ?? 1) => {
        camera = { scale: clampScale(scale), x: viewport.clientWidth / 2 - point.x * scale,
            y: viewport.clientHeight / 2 - point.y * scale };
        paintCamera();
    };
    const focusLive = () => focusPoint({ x: livePoint?.x ?? dayAt(storyDay).x + 220, y: 290 },
        viewport.clientWidth < 550 ? .52 : .75);
    const fitStory = () => {
        const scale = clampScale(Math.min((viewport.clientWidth - 36) / layout.width,
            (viewport.clientHeight - 24) / layout.height));
        camera = { scale, x: (viewport.clientWidth - layout.width * scale) / 2,
            y: (viewport.clientHeight - layout.height * scale) / 2 };
        paintCamera();
    };
    const zoom = (factor, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) => {
        const next = clampScale(camera.scale * factor);
        const ratio = next / camera.scale;
        camera.x = cx - (cx - camera.x) * ratio;
        camera.y = cy - (cy - camera.y) * ratio;
        camera.scale = next;
        paintCamera();
    };
    control('−', 'Zoom out', () => zoom(1 / 1.35));
    control('+', 'Zoom in', () => zoom(1.35));
    control('Follow live', 'Center on the live gag', focusLive, true);
    if (inspectedPoint) control('Script ↓', 'Focus the inspected gag script', () => {
        const narrow = viewport.clientWidth < 550;
        focusPoint({ x: inspectedBand.x + (narrow ? 300 : 380),
            y: scriptOriginY + (narrow ? 80 : 30) }, narrow ? .55 : .85);
    }, true);
    control('Fit story', 'Fit all 11 story days', fitStory, true);
    if (inspectedDay < 11) {
        const nextDay = inspectedDay + 1;
        control(`Day ${padDay(nextDay)} →`, `Inspect day ${nextDay} without changing playback`,
            () => onDay(nextDay), true);
    }
    viewport.addEventListener('wheel', (event) => {
        if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        zoom(Math.exp(-event.deltaY * .002), event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });
    viewport.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest('button')) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: camera.x, startY: camera.y };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        camera.x = drag.startX + event.clientX - drag.x;
        camera.y = drag.startY + event.clientY - drag.y;
        paintCamera();
    });
    const endDrag = () => { drag = null; viewport.classList.remove('is-dragging'); };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('keydown', (event) => {
        const delta = 90;
        if (event.key === '+' || event.key === '=') zoom(1.25);
        else if (event.key === '-') zoom(.8);
        else if (event.key === 'ArrowLeft') camera.x += delta;
        else if (event.key === 'ArrowRight') camera.x -= delta;
        else if (event.key === 'ArrowUp') camera.y += delta;
        else if (event.key === 'ArrowDown') camera.y -= delta;
        else return;
        event.preventDefault();
        paintCamera();
    });
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
        if (!destroyed && camera) paintCamera();
    }) : null;
    resize?.observe(viewport);
    if (camera) paintCamera();
    else focusLive();
    return {
        selectScene(key) {
            selectedScene = key;
            for (const node of buttons.querySelectorAll('.scene-flow-atlas-node.is-scene')) {
                node.classList.toggle('is-selected', node.dataset.sceneKey === key);
            }
        },
        getCamera() { return { ...camera }; },
        cameraForDay(day) {
            const band = dayAt(day);
            const scale = Math.max(.5, Math.min(.75, viewport.clientWidth / 1200));
            const centerX = viewport.clientWidth < 550 ? 230 : 400;
            return { scale, x: viewport.clientWidth / 2 - (band.x + centerX) * scale,
                y: viewport.clientHeight / 2 - 270 * scale };
        },
        destroy() {
            destroyed = true;
            hideTooltip();
            resize?.disconnect();
            tooltip.remove();
            root.remove();
        },
    };
}

import { buildSceneFlowLabelResolver, extractSceneFlow } from '../../../dgds/scripting/scene-flow.mjs';
import { JOHNNY_SCENES, SceneFlags } from '../story-controller.mjs';
import { buildSceneFlowMap } from './scene-flow-graph.mjs';
import { layoutScriptBranches } from './script-branch-layout.mjs';

const svgNs = 'http://www.w3.org/2000/svg';
const padDay = (day) => String(day).padStart(2, '0');
const dayKey = (day) => JOHNNY_SCENES.find((scene) => scene.day === day);
const sceneId = (scene) => scene.script === 'POSE'
    ? `POSE:${scene.tagId}:${scene.startSpot ?? '?'}:${scene.startHeading ?? '?'}`
    : `${scene.script}:${scene.tagId}`;
const COMMON = JOHNNY_SCENES.filter((scene) => scene.day === 0);
const DAY_WIDTH = 1000;
const DAY_GAP = 36;
const ROUTE_STEP = 210;
const ROUTE_START = 400;
const ROUTE_Y = 270;
const ROUTE_CARD_WIDTH = 176;
const CATALOG_TOP = 540;
const CATALOG_COLUMN_WIDTH = 270;
const CATALOG_COLUMNS = 3;
const CATALOG_PANEL_OFFSET = 170;
const CATALOG_PANEL_WIDTH = CATALOG_COLUMNS * CATALOG_COLUMN_WIDTH + 25;
const SCRIPT_NODE_STEP = 172;
const SCRIPT_NODE_WIDTH = 132;
const SCRIPT_LANE_GAP = 112;
const SCRIPT_MAIN_Y = 175;
const SCRIPT_LANE_COLORS = ['#8cdeed', '#f0b66f', '#d5b2ef', '#9cd5ac', '#f5cf85', '#e6a6a6', '#a2c9fa', '#c4e38b'];
const scriptLaneColor = (lane) => SCRIPT_LANE_COLORS[lane % SCRIPT_LANE_COLORS.length];

function catalogForDay(day) {
    const key = dayKey(day);
    return [...COMMON, ...JOHNNY_SCENES.filter((scene) => scene.day === day && sceneId(scene) !== sceneId(key))];
}

function catalogGroups(records) {
    const groups = new Map();
    for (const record of records) {
        const name = record.script === 'POSE' ? 'POSE' : record.script.replace('.ADS', '');
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(record);
    }
    const columns = Array.from({ length: CATALOG_COLUMNS }, () => ({ height: 0, groups: [] }));
    for (const [name, items] of groups) {
        const column = columns.reduce((shortest, entry) => entry.height < shortest.height ? entry : shortest);
        column.groups.push({ name, items, y: column.height });
        column.height += 65 + items.length * 52;
    }
    return { columns, height: Math.max(...columns.map((column) => column.height)) };
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

function routeTo(graph, key) {
    const parents = new Map([[graph.start, null]]);
    const queue = [graph.start];
    while (queue.length && !parents.has(key)) {
        const from = queue.shift();
        for (const edge of graph.edges) {
            if (edge.action !== 'stop' && edge.from === from && !parents.has(edge.to)) {
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

function makeLayout(visitItems, storyDay, catalogOpenDay, catalogHeight, scriptHeight, scriptExtent) {
    const days = [];
    let x = 0;
    for (let day = 1; day <= 11; day++) {
        const route = day === storyDay ? visitItems : [];
        const gateOffset = route.length ? ROUTE_START + route.length * ROUTE_STEP + 70 : 590;
        const baseWidth = route.length ? Math.max(DAY_WIDTH, gateOffset + 560) : DAY_WIDTH;
        const catalogWidth = day === catalogOpenDay
            ? gateOffset + CATALOG_PANEL_OFFSET + CATALOG_PANEL_WIDTH + 75 : 0;
        const width = Math.max(baseWidth, catalogWidth,
            day === scriptExtent?.day ? scriptExtent.width : 0);
        days.push({ day, x, width, route, gateX: x + gateOffset });
        x += width + DAY_GAP;
    }
    const catalogBottom = catalogOpenDay == null ? 0 : CATALOG_TOP + catalogHeight + 90;
    const height = Math.max(850, catalogBottom, scriptHeight);
    return { days, width: x - DAY_GAP, height };
}

/** A single world: days contain an actual visit or an unchosen catalog of possibilities. */
export function mountStoryTimelineAtlas({ host, resolveEntry, sequenceTools, storyDay, exploredDay, catalogOpenDay,
    inspectedGag, selectedSceneKey, visitItems = [], camera: savedCamera, scriptExpanded = false,
    onDay, onPossibilities, onGag, onScene }) {
    const graphCache = new Map();
    const inspectedDay = exploredDay ?? storyDay;
    const inspectedId = inspectedGag && sceneId(inspectedGag);
    const scriptGraph = inspectedGag && inspectedGag.script !== 'POSE'
        ? graphForGag(inspectedGag, resolveEntry, graphCache) : null;
    const scriptBranches = scriptGraph ? layoutScriptBranches(scriptGraph) : null;
    const catalogRecords = catalogForDay(inspectedDay);
    const catalog = catalogGroups(catalogRecords);
    const catalogOpen = catalogOpenDay === inspectedDay;
    const keySelected = exploredDay != null && inspectedId === sceneId(dayKey(exploredDay));
    const candidateSelected = catalogOpen && inspectedGag && !keySelected && inspectedGag.index == null;
    const catalogBottom = catalogOpen ? CATALOG_TOP + catalog.height + 65 : 0;
    const scriptBaseY = candidateSelected ? catalogBottom + 110 : 465;
    const scriptWidth = scriptGraph ? Math.max(1000, scriptGraph.nodes.length * SCRIPT_NODE_STEP + 170) : 0;
    const selectedVisitIndex = visitItems.findIndex(({ gag }) => gag.index === inspectedGag?.index &&
        sceneId(gag) === inspectedId);
    const gateOffset = inspectedDay === storyDay && visitItems.length
        ? ROUTE_START + visitItems.length * ROUTE_STEP + 70 : 590;
    const scriptOffset = candidateSelected ? gateOffset + CATALOG_PANEL_OFFSET :
        selectedVisitIndex < 0 ? 100 : Math.max(60, ROUTE_START + selectedVisitIndex * ROUTE_STEP - 130);
    const scriptHeight = scriptBranches
        ? scriptBaseY + SCRIPT_MAIN_Y + scriptBranches.maxLane * SCRIPT_LANE_GAP + 160 : 850;
    const scriptExtent = scriptGraph ? { day: inspectedDay, width: scriptOffset + scriptWidth + 80 } : null;
    const layout = makeLayout(visitItems, storyDay, catalogOpenDay, catalog.height, scriptHeight, scriptExtent);
    const dayAt = (day) => layout.days[day - 1];

    const root = document.createElement('div');
    root.className = 'scene-flow-atlas';
    const toolbar = document.createElement('div');
    toolbar.className = 'scene-flow-atlas-toolbar';
    const title = document.createElement('span');
    title.textContent = 'THE STORY · DRAG TO MOVE · WHEEL TO ZOOM';
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
    const ruler = document.createElement('div');
    ruler.className = 'scene-flow-atlas-ruler';
    ruler.setAttribute('aria-label', 'Choose a story day to inspect');
    const rulerButtons = [];
    for (let day = 1; day <= 11; day++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = padDay(day);
        button.setAttribute('aria-label', `Inspect story day ${day} without changing playback`);
        button.title = `Inspect day ${day}; Play day in the inspector changes playback`;
        button.classList.toggle('is-live', day === storyDay);
        button.classList.toggle('is-selected', day === exploredDay);
        button.addEventListener('click', () => onDay(day));
        ruler.appendChild(button);
        rulerButtons.push(button);
    }
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
    svg.innerHTML = '<defs><marker id="atlas-arrow-visited" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#eadfc8"/></marker><marker id="atlas-arrow-planned" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#8cdeed"/></marker><marker id="atlas-arrow-return" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7" fill="#efa65f"/></marker></defs>';
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
    footer.innerHTML = '<span class="is-seen">Seen</span><span class="is-live">Johnny now</span><span class="is-planned">Already planned</span><span class="is-possible">Possible, unchosen</span>';
    root.append(toolbar, ruler, viewport, footer);
    host.appendChild(root);
    document.body.appendChild(tooltip);

    let preview = null;
    let tooltipRequest = 0;
    let destroyed = false;
    let selectedScene = selectedSceneKey;
    let camera = savedCamera && Number.isFinite(savedCamera.scale) ? { ...savedCamera } : null;
    let drag = null;
    let livePoint = null;
    let selectedPoint = null;
    let scriptPoint = null;
    let scriptStartPoint = null;
    let highlightScriptLinks = () => {};
    let selectScriptDot = () => {};
    const points = new Map();
    const nameOf = (gag) => {
        if (gag.script === 'POSE') {
            if (gag.startSpot == null) return 'Standing pose';
            const spot = ['A', 'B', 'C', 'D', 'E', 'G'][gag.startSpot] ?? '?';
            const heading = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'][gag.startHeading] ?? '?';
            return `Pose ${spot} · ${heading}`;
        }
        try {
            return resolveEntry(gag.script)?.scenes?.find((scene) => scene.tagId?.id === gag.tagId)?.tagId?.description ||
                `${gag.script} #${gag.tagId}`;
        } catch { return `${gag.script} #${gag.tagId}`; }
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
        const left = info.sceneKey
            ? rect.left + rect.width / 2 - 103
            : rect.right + 220 < window.innerWidth ? rect.right + 10 : rect.left - 216;
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
        if (!info.gag || info.gag.script === 'POSE') {
            previewHost.remove();
            if (info.gag?.script === 'POSE') note.textContent = 'Engine standing pose; no ADS animation preview.';
        }
        const top = info.sceneKey
            ? rect.top - tooltip.offsetHeight - 12 >= 6
                ? rect.top - tooltip.offsetHeight - 12 : rect.bottom + 12
            : rect.top + tooltip.offsetHeight < window.innerHeight - 6
                ? rect.top : window.innerHeight - tooltip.offsetHeight - 6;
        tooltip.style.top = `${Math.max(6, Math.min(window.innerHeight - tooltip.offsetHeight - 6, top))}px`;
        if (!info.gag || info.gag.script === 'POSE') return;
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
    const addPath = (d, kind, width = 2, extraClass = '') => {
        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', `scene-flow-atlas-line is-${kind} ${extraClass}`);
        path.setAttribute('stroke-width', String(width));
        if (kind === 'visited' || kind === 'planned') path.setAttribute('marker-end', `url(#atlas-arrow-${kind})`);
        svg.appendChild(path);
        return path;
    };
    const addRect = (x, y, width, height, className) => {
        const rect = document.createElementNS(svgNs, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(width));
        rect.setAttribute('height', String(height));
        rect.setAttribute('class', className);
        svg.appendChild(rect);
        return rect;
    };
    const addText = (x, y, value, className) => {
        const label = document.createElement('div');
        label.className = className;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.textContent = value;
        buttons.appendChild(label);
        return label;
    };
    const addNode = ({ x, y, text, kind, state, selected, label, info, onClick, width, extraClass }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `scene-flow-atlas-node is-${kind}${extraClass ? ` ${extraClass}` : ''}`;
        if (state) button.dataset.state = state;
        button.classList.toggle('is-selected', Boolean(selected));
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
        if (width) button.style.width = `${width}px`;
        button.textContent = text;
        button.setAttribute('aria-label', label);
        if (info) {
            button.addEventListener('mouseenter', () => showTooltip(info, button));
            button.addEventListener('mouseleave', hideTooltip);
            button.addEventListener('focus', () => showTooltip(info, button));
            button.addEventListener('blur', hideTooltip);
        }
        button.addEventListener('click', onClick);
        buttons.appendChild(button);
        return button;
    };
    const keyInfo = (gag, day, role, note) => ({ kicker: `${role} · STORY DAY ${padDay(day)}`,
        name: nameOf(gag), gag, day, note });

    for (const band of layout.days) {
        const { day, x, width, route, gateX } = band;
        addRect(x + 4, 8, width - 8, layout.height - 16,
            `scene-flow-atlas-day-band${day === storyDay ? ' is-live' : ''}`);
        addText(x + 52, 36, `DAY ${padDay(day)}`, 'scene-flow-atlas-day-heading');
        addText(x + 52, 83, day === storyDay ? 'CURRENT VISIT' : 'DAY KEY SCENE · VISIT NOT YET CHOSEN',
            'scene-flow-atlas-day-caption');
        const key = dayKey(day);
        const keyX = x + 185;
        if (day > 1) {
            const previousKeyX = layout.days[day - 2].x + 185;
            addPath(`M${previousKeyX + 125} 155 H${keyX - 125}`, 'story', 3.5);
        }
        addNode({ x: keyX, y: 155, text: nameOf(key), kind: 'key',
            selected: inspectedId === sceneId(key) && (exploredDay === day || day === storyDay),
            label: `Inspect ${nameOf(key)}, key scene for day ${day}`,
            info: keyInfo(key, day, 'DAY KEY SCENE', 'Inspect this scene; Play day starts here'),
            onClick: () => onGag(key, day, 'key') });
        points.set(`${day}:${sceneId(key)}`, { x: keyX, y: 155, kind: 'key' });
        if (route.length) {
            const firstX = x + ROUTE_START;
            addPath(`M${keyX} 187 C${keyX} 235 ${firstX - 88} 220 ${firstX - 88} ${ROUTE_Y}`,
                'visit-branch', 3.5);
            addText(x + 310, 202, 'THIS VISIT · ORDER OF GAGS', 'scene-flow-atlas-lane-label');
            route.forEach((item, index) => {
                const gag = item.gag;
                const px = x + ROUTE_START + index * ROUTE_STEP;
                const live = item.state === 'current';
                if (index > 0) {
                    const previousX = x + ROUTE_START + (index - 1) * ROUTE_STEP;
                    addPath(`M${previousX + ROUTE_CARD_WIDTH / 2} ${ROUTE_Y} L${px - ROUTE_CARD_WIDTH / 2} ${ROUTE_Y}`,
                        item.state === 'planned' ? 'planned' : 'visited', 3);
                }
                const info = keyInfo(gag, day, item.label, live ? 'Johnny is playing this gag now' :
                    item.state === 'planned' ? 'Already chosen for this visit' : 'Already seen in this visit');
                const node = addNode({ x: px, y: ROUTE_Y,
                    text: `${padDay(gag.index ?? index + 1)} · ${nameOf(gag)}`, kind: 'visit', state: item.state,
                    selected: inspectedId === sceneId(gag) && (inspectedGag?.index ?? null) === (gag.index ?? null),
                    label: `Gag ${gag.index ?? index + 1}, ${item.label}: ${nameOf(gag)}`, info,
                    onClick: () => onGag(gag, day, 'visit') });
                node.dataset.visitIndex = String(gag.index ?? index + 1);
                if (live) livePoint = { x: px, y: ROUTE_Y };
                if (inspectedId === sceneId(gag) && (inspectedGag?.index ?? null) === (gag.index ?? null)) {
                    selectedPoint = { x: px, y: ROUTE_Y, kind: 'visit' };
                }
            });
            const lastX = x + ROUTE_START + (route.length - 1) * ROUTE_STEP;
            addPath(`M${lastX + ROUTE_CARD_WIDTH / 2} ${ROUTE_Y} L${gateX - 146} ${ROUTE_Y}`, 'unresolved', 3);
        } else {
            addPath(`M${keyX} 187 C${keyX} 238 ${gateX - 145} 220 ${gateX - 145} ${ROUTE_Y}`,
                'possibility-branch', 2.5);
            addText(x + 360, 185, 'UNCHOSEN POSSIBILITIES', 'scene-flow-atlas-lane-label');
        }
        const candidates = catalogForDay(day);
        const examples = [];
        const exampleScripts = new Set();
        for (const gag of candidates.filter((item) => item.script !== 'POSE' && item.script !== 'STAND.ADS')
            .sort((a, b) => b.weight - a.weight)) {
            if (exampleScripts.has(gag.script)) continue;
            exampleScripts.add(gag.script);
            examples.push(gag);
            if (examples.length === 3) break;
        }
        const gate = addNode({ x: gateX, y: ROUTE_Y,
            text: day === storyDay ? `?  NEXT VISIT UNKNOWN\n${candidates.length} catalog possibilities` :
                `?  POSSIBLE ON DAY ${padDay(day)}\n${candidates.length} catalog records`,
            kind: 'gate', state: 'possible', selected: catalogOpenDay === day,
            label: `Explore ${candidates.length} possible catalog records on day ${day}; playback will not change`,
            info: { kicker: `POSSIBILITIES · DAY ${padDay(day)}`, name: `${candidates.length} catalog records`,
                day, note: `Examples: ${examples.map(nameOf).join(' · ')}. These are not predictions for the next visit.` },
            onClick: () => onPossibilities(day) });
        gate.title = 'Select to inspect possibilities. Play day is a separate action.';
        if (day === storyDay && catalogOpenDay !== day) {
            addText(gateX + 230, 302, 'EXAMPLE FORKS · NOT A FORECAST', 'scene-flow-atlas-lane-label');
            examples.forEach((gag, index) => {
                const exampleX = gateX + 350;
                const exampleY = 350 + index * 92;
                addPath(`M${gateX + 145} ${ROUTE_Y} H${gateX + 195} C${gateX + 225} ${ROUTE_Y} ${gateX + 225} ${exampleY} ${exampleX - 95} ${exampleY}`,
                    'possibility-branch', 2.5);
                addNode({ x: exampleX, y: exampleY, text: nameOf(gag), kind: 'example', state: 'possible',
                    label: `Inspect example possibility ${nameOf(gag)} on day ${day}; not a prediction`,
                    info: keyInfo(gag, day, 'EXAMPLE POSSIBILITY',
                        `Source weight ${gag.weight}. Actual selection depends on visit state, tide, and recent history.`),
                    onClick: () => onGag(gag, day, 'catalog') });
            });
        }
    }

    const inspectedBand = dayAt(inspectedDay);
    if (catalogOpen) {
        const panelX = inspectedBand.gateX + CATALOG_PANEL_OFFSET;
        addPath(`M${inspectedBand.gateX} ${ROUTE_Y + 57} C${inspectedBand.gateX} 408 ${panelX + 60} 420 ${panelX + 60} ${CATALOG_TOP - 62}`,
            'possibility-branch', 2.6);
        addRect(panelX - 20, CATALOG_TOP - 62, CATALOG_PANEL_WIDTH + 35, catalog.height + 92,
            'scene-flow-atlas-catalog-panel');
        addText(panelX, CATALOG_TOP - 49,
            `DAY ${padDay(inspectedDay)} POSSIBILITIES · ${catalogRecords.length} SOURCE RECORDS · NOT A PLANNED ROUTE`,
            'scene-flow-atlas-catalog-heading');
        addText(panelX, CATALOG_TOP - 24, 'Bars compare catalog weights within the source; tide, budget, and history change selection.',
            'scene-flow-atlas-catalog-note');
        const maxWeight = Math.max(1, ...catalogRecords.map((item) => item.weight));
        catalog.columns.forEach((column, columnIndex) => {
            const columnX = panelX + columnIndex * CATALOG_COLUMN_WIDTH;
            for (const group of column.groups) {
                const groupY = CATALOG_TOP + group.y;
                addText(columnX + 4, groupY, `${group.name} · ${group.items.length}`, 'scene-flow-atlas-family-heading');
                group.items.forEach((gag, index) => {
                    const px = columnX + 119;
                    const py = groupY + 49 + index * 52;
                    const gated = gag.tideMin !== 0 || gag.tideMax !== 16;
                    const final = Boolean(gag.flags & SceneFlags.FINAL);
                    const note = `Source weight ${gag.weight}; ${gated ? `tide ${gag.tideMin}–${gag.tideMax - 1}` : 'all tides'}${final ? '; ending gag' : ''}. Actual selection also depends on visit state.`;
                    const node = addNode({ x: px, y: py, text: nameOf(gag), kind: 'candidate', state: 'possible',
                        selected: inspectedId === sceneId(gag) && inspectedGag?.index == null,
                        label: `${nameOf(gag)}; possible on day ${inspectedDay}; source weight ${gag.weight}${gated ? '; tide gated' : ''}`,
                        info: keyInfo(gag, inspectedDay, `POSSIBLE · SOURCE WEIGHT ${gag.weight}`, note),
                        onClick: () => onGag(gag, inspectedDay, 'catalog') });
                    node.style.setProperty('--catalog-weight', `${Math.max(6, gag.weight / maxWeight * 100)}%`);
                    points.set(`${inspectedDay}:${sceneId(gag)}`, { x: px, y: py, kind: 'candidate' });
                });
            }
        });
    }

    if (!selectedPoint && inspectedId) selectedPoint = points.get(`${inspectedDay}:${inspectedId}`);
    if (!selectedPoint && inspectedGag) selectedPoint = { x: inspectedBand.gateX, y: ROUTE_Y, kind: 'gate' };
    if (selectedPoint && scriptGraph) {
        const scriptSceneCount = Math.max(0, scriptGraph.nodes.length - 1);
        const scriptY = candidateSelected ? catalogBottom + 110 : 465;
        const scriptX = inspectedBand.x + scriptOffset;
        const mainY = scriptY + SCRIPT_MAIN_Y;
        const nodePositions = new Map();
        const firstNodeX = scriptX + 145;
        const lastNodeX = firstNodeX + (scriptGraph.nodes.length - 1) * SCRIPT_NODE_STEP;
        const lensHeight = SCRIPT_MAIN_Y + scriptBranches.maxLane * SCRIPT_LANE_GAP + 170;
        addRect(scriptX - 25, scriptY - 70, scriptWidth + 40, lensHeight,
            'scene-flow-atlas-script-lens scene-flow-atlas-script-detail');
        addText(scriptX, scriptY - 53, `INSIDE ${nameOf(inspectedGag)} · ${scriptSceneCount} SCRIPT SCENES + START`,
            'scene-flow-atlas-script-heading scene-flow-atlas-script-detail');
        addText(scriptX, scriptY - 28,
            'Authored lanes · yellow = inspected route',
            'scene-flow-atlas-script-note scene-flow-atlas-script-detail');
        addText(scriptX, scriptY - 8,
            'Solid = path · faint = links · amber = loops/random',
            'scene-flow-atlas-script-note scene-flow-atlas-script-detail');
        for (let lane = 0; lane <= scriptBranches.maxLane; lane++) {
            const firstInLane = scriptBranches.lanes.indexOf(lane);
            const labelX = lane === 0 ? scriptX + 10 : firstNodeX + firstInLane * SCRIPT_NODE_STEP - 124;
            const label = addText(labelX, mainY + lane * SCRIPT_LANE_GAP - 14,
                lane === 0 ? 'REFERENCE SPINE' : `BRANCH ${padDay(lane)}`,
                'scene-flow-atlas-branch-label scene-flow-atlas-script-detail');
            label.style.color = scriptLaneColor(lane);
        }
        scriptGraph.nodes.forEach((node, index) => {
            const x = firstNodeX + index * SCRIPT_NODE_STEP;
            const lane = scriptBranches.lanes[index];
            nodePositions.set(node.key, { x, y: mainY + lane * SCRIPT_LANE_GAP, index, lane });
        });
        const linkPaths = [];
        const orderedEdges = [...scriptGraph.edges].sort((a, b) => {
            const aTrack = scriptBranches.isTrack(scriptBranches.indexByKey.get(a.from),
                scriptBranches.indexByKey.get(a.to));
            const bTrack = scriptBranches.isTrack(scriptBranches.indexByKey.get(b.from),
                scriptBranches.indexByKey.get(b.to));
            return Number(aTrack) - Number(bTrack);
        });
        for (const edge of orderedEdges) {
            const from = nodePositions.get(edge.from);
            const to = nodePositions.get(edge.to);
            if (!from || !to) continue;
            const backwards = to.index <= from.index;
            const span = Math.abs(to.index - from.index);
            const track = edge.action !== 'stop' && scriptBranches.isTrack(from.index, to.index);
            let d;
            if (backwards) {
                const loopY = Math.min(from.y, to.y) - 125 - Math.min(28, span * 3);
                d = `M${from.x} ${from.y} C${from.x - 40} ${from.y} ${from.x - 40} ${loopY} ${(from.x + to.x) / 2} ${loopY} S${to.x + 40} ${to.y} ${to.x} ${to.y}`;
            } else if (track && from.lane === to.lane) {
                d = `M${from.x} ${from.y} H${to.x}`;
            } else if (track) {
                const departure = from.x + Math.min(50, (to.x - from.x) / 3);
                const arrival = to.x - Math.min(50, (to.x - from.x) / 3);
                d = `M${from.x} ${from.y} H${departure} C${departure + 24} ${from.y} ${arrival - 24} ${to.y} ${arrival} ${to.y} H${to.x}`;
            } else {
                const jumpY = scriptY + 64 - Math.min(35, span * 3);
                d = `M${from.x} ${from.y} C${from.x + 35} ${from.y} ${from.x + 35} ${jumpY} ${(from.x + to.x) / 2} ${jumpY} S${to.x - 35} ${to.y} ${to.x} ${to.y}`;
            }
            const path = addPath(d, backwards ? 'return' : 'script', track ? 4 : 1.7,
                `scene-flow-atlas-script-detail is-script-link${track ? ' is-track' : ' is-cross-link'}${backwards ? ' is-loop' : ''}${edge.random ? ' is-random' : ''}${edge.action === 'stop' ? ' is-stop' : ''}`);
            path.style.setProperty('--link-color', scriptLaneColor(to.lane));
            if (backwards || edge.random) path.setAttribute('marker-end', 'url(#atlas-arrow-return)');
            path.dataset.from = edge.from;
            path.dataset.to = edge.to;
            path.dataset.action = edge.action;
            const title = document.createElementNS(svgNs, 'title');
            title.textContent = `${scriptGraph.nodes[from.index].name} → ${scriptGraph.nodes[to.index].name} · ${edge.guard}${edge.random ? ' · random pick' : ''}${edge.action === 'stop' ? ' · stop' : ''}`;
            path.appendChild(title);
            linkPaths.push(path);
        }
        highlightScriptLinks = (key, dimOthers = false) => {
            const route = key ? routeTo(scriptGraph, key) : [];
            const traced = new Set(route.slice(1).map((to, index) => `${route[index]}\0${to}`));
            for (const path of linkPaths) {
                const connected = key && (path.dataset.from === key || path.dataset.to === key);
                path.classList.toggle('is-emphasized', Boolean(connected));
                path.classList.toggle('is-dimmed', Boolean(key && dimOthers && !connected));
                path.classList.toggle('is-traced', path.dataset.action !== 'stop' &&
                    traced.has(`${path.dataset.from}\0${path.dataset.to}`));
            }
        };
        const dots = new Map();
        for (const node of scriptGraph.nodes) {
            const { x, y, lane } = nodePositions.get(node.key);
            const stem = addPath(`M${x} ${y - 18} V${y - 7}`, 'node-stem', 1.5,
                'scene-flow-atlas-script-detail');
            stem.style.setProperty('--link-color', scriptLaneColor(lane));
            const dot = document.createElementNS(svgNs, 'circle');
            dot.setAttribute('cx', String(x));
            dot.setAttribute('cy', String(y));
            dot.setAttribute('r', '7');
            dot.setAttribute('class', 'scene-flow-atlas-commit scene-flow-atlas-script-detail');
            dot.style.setProperty('--link-color', scriptLaneColor(lane));
            svg.appendChild(dot);
            dots.set(node.key, dot);
            const button = addNode({ x, y: y - 54, text: node.name, kind: 'scene', width: SCRIPT_NODE_WIDTH,
                selected: node.key === selectedScene,
                label: `Inspect ${node.name} in ${nameOf(inspectedGag)}`,
                info: { ...keyInfo(inspectedGag, inspectedDay, 'SCRIPT REFERENCE',
                    'A possible script reference, not Johnny’s live playhead'), name: node.name,
                    sceneKey: node.key },
                onClick: () => onScene(node.key), extraClass: 'scene-flow-atlas-script-detail' });
            button.dataset.sceneKey = node.key;
            button.dataset.order = node.key === scriptGraph.start ? 'START' :
                padDay(nodePositions.get(node.key).index);
            button.style.setProperty('--lane-color', scriptLaneColor(lane));
            button.addEventListener('mouseenter', () => highlightScriptLinks(node.key, true));
            button.addEventListener('mouseleave', () => highlightScriptLinks(selectedScene));
            button.addEventListener('focus', () => highlightScriptLinks(node.key, true));
            button.addEventListener('blur', () => highlightScriptLinks(selectedScene));
        }
        selectScriptDot = (key) => {
            for (const [nodeKey, dot] of dots) dot.classList.toggle('is-selected', nodeKey === key);
        };
        selectScriptDot(selectedScene);
        highlightScriptLinks(selectedScene);
        const focusedX = nodePositions.get(selectedScene)?.x ?? firstNodeX + SCRIPT_NODE_STEP;
        scriptPoint = { x: Math.max(firstNodeX, Math.min(lastNodeX, Math.max(firstNodeX + 270, focusedX))),
            y: scriptY + 90 };
        scriptStartPoint = { x: scriptX + 230, y: scriptY + 90 };
        if (!scriptExpanded || keySelected) {
            const summary = addNode({ x: selectedPoint.x, y: selectedPoint.y + 142,
                text: `↓  Inside this gag · ${scriptSceneCount} script scenes`, kind: 'script-summary',
                label: `Explore ${scriptSceneCount} script scenes inside ${nameOf(inspectedGag)}`,
                onClick: () => { root.classList.add('is-script-open'); focusScript(); } });
            summary.title = 'Reveal the selected gag’s script references in this map';
        }
    }

    const clampScale = (value) => Math.max(0.025, Math.min(2.4, value));
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
        root.classList.toggle('is-overview', camera.scale < .4);
        const worldCenter = (viewport.clientWidth / 2 - camera.x) / camera.scale;
        const visible = layout.days.find((band) => worldCenter >= band.x && worldCenter < band.x + band.width)
            ?? layout.days.at(-1);
        rulerButtons.forEach((button, index) => button.classList.toggle('is-in-view', index + 1 === visible.day));
    };
    const focusPoint = (point, scale = camera?.scale ?? 1) => {
        const next = clampScale(scale);
        camera = { scale: next, x: viewport.clientWidth / 2 - point.x * next,
            y: viewport.clientHeight / 2 - point.y * next };
        paintCamera();
    };
    const focusLive = () => focusPoint({ x: livePoint?.x ?? dayAt(storyDay).x + 200, y: 265 },
        viewport.clientWidth < 550 ? .7 : 1);
    const focusGate = () => {
        const narrow = viewport.clientWidth < 550;
        const showForks = inspectedDay === storyDay;
        focusPoint({ x: dayAt(inspectedDay).gateX + (narrow && showForks ? 160 : 0),
            y: showForks ? (narrow ? 375 : 310) : ROUTE_Y }, narrow ? (showForks ? .5 : .7) : .9);
    };
    const focusScript = () => {
        if (!scriptPoint) return;
        root.classList.add('is-script-open');
        const narrow = viewport.clientWidth < 550;
        focusPoint(narrow ? scriptStartPoint : scriptPoint, narrow ? .65 : 1.05);
    };
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
    control('−', 'Zoom out', () => zoom(1 / 1.25));
    control('+', 'Zoom in', () => zoom(1.25));
    control('Follow live', 'Center on the live gag', focusLive, true);
    control(inspectedDay === storyDay ? 'Next visit ?' : `Day ${padDay(inspectedDay)} options →`,
        inspectedDay === storyDay ? 'Go to the end of this visit and inspect what may follow' :
            `Go to possible catalog choices for inspected day ${inspectedDay}`, focusGate, true);
    if (scriptPoint) control('Script ↓', 'Focus the inspected gag script', focusScript, true);
    control('Fit story', 'Fit all 11 story days', fitStory, true);
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
        if (event.key === '+' || event.key === '=') zoom(1.25);
        else if (event.key === '-') zoom(.8);
        else if (event.key === 'ArrowLeft') camera.x += 90;
        else if (event.key === 'ArrowRight') camera.x -= 90;
        else if (event.key === 'ArrowUp') camera.y += 90;
        else if (event.key === 'ArrowDown') camera.y -= 90;
        else return;
        event.preventDefault();
        paintCamera();
    });
    let viewportWidth = viewport.clientWidth;
    let viewportHeight = viewport.clientHeight;
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
        if (destroyed || !camera) return;
        const worldX = (viewportWidth / 2 - camera.x) / camera.scale;
        const worldY = (viewportHeight / 2 - camera.y) / camera.scale;
        viewportWidth = viewport.clientWidth;
        viewportHeight = viewport.clientHeight;
        camera.x = viewportWidth / 2 - worldX * camera.scale;
        camera.y = viewportHeight / 2 - worldY * camera.scale;
        paintCamera();
    }) : null;
    resize?.observe(viewport);
    root.classList.toggle('is-script-open', Boolean(scriptExpanded && !keySelected));
    if (camera) paintCamera();
    else focusLive();
    const layoutForExploration = (day, openCatalog) => {
        const targetGraph = graphForGag(dayKey(day), resolveEntry, graphCache);
        const targetScriptWidth = targetGraph
            ? Math.max(1000, targetGraph.nodes.length * SCRIPT_NODE_STEP + 170) : 0;
        const targetExtent = targetGraph ? { day, width: 100 + targetScriptWidth + 80 } : null;
        const targetCatalogHeight = openCatalog ? catalogGroups(catalogForDay(day)).height : 0;
        return makeLayout(visitItems, storyDay, openCatalog ? day : null,
            targetCatalogHeight, 850, targetExtent);
    };
    return {
        selectScene(key) {
            selectedScene = key;
            highlightScriptLinks(key);
            selectScriptDot(key);
            for (const node of buttons.querySelectorAll('.scene-flow-atlas-node.is-scene')) {
                node.classList.toggle('is-selected', node.dataset.sceneKey === key);
            }
        },
        getCamera() { return { ...camera }; },
        cameraForDay(day) {
            const band = layoutForExploration(day, false).days[day - 1];
            const narrow = viewport.clientWidth < 550;
            const scale = narrow ? .7 : .85;
            return { scale, x: viewport.clientWidth / 2 - (band.x + (narrow ? 220 : 310)) * scale,
                y: viewport.clientHeight / 2 - 240 * scale };
        },
        cameraForPossibilities(day) {
            const band = layoutForExploration(day, true).days[day - 1];
            const panelX = band.gateX + CATALOG_PANEL_OFFSET;
            const narrow = viewport.clientWidth < 550;
            const scale = narrow ? .65 : .88;
            return { scale, x: viewport.clientWidth / 2 - (panelX + (narrow ? 150 : 260)) * scale,
                y: viewport.clientHeight / 2 - 500 * scale };
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

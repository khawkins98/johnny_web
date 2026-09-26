import * as THREE from 'three';

const START = '__gag__';

function layoutMap(graph) {
    const distance = new Map([[graph.start, 0]]);
    const queue = [graph.start];
    while (queue.length) {
        const from = queue.shift();
        for (const edge of graph.edges) {
            if (edge.from === from && !distance.has(edge.to)) {
                distance.set(edge.to, distance.get(from) + 1);
                queue.push(edge.to);
            }
        }
    }
    const reachableMax = Math.max(0, ...distance.values());
    for (const node of graph.nodes) {
        if (!distance.has(node.key)) distance.set(node.key, reachableMax + 1);
    }
    const positions = new Map([[graph.start, { x: 0, y: 0 }]]);
    // Golden-angle placement spreads dense retry ladders around the island while
    // retaining the authored edge order. The ellipse fits the wide game viewport.
    const ordered = graph.nodes.filter((node) => node.key !== graph.start)
        .sort((a, b) => distance.get(a.key) - distance.get(b.key));
    ordered.forEach((node, index) => {
        const angle = -Math.PI / 2 + index * 2.399963229728653;
        const radius = 105 + Math.sqrt(index) * 43;
        positions.set(node.key, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.6 });
    });
    return positions;
}

const color = {
    water: 0x081caa,
    contour: 0x226cf0,
    route: 0xf8ed27,
    possible: 0x55d9e7,
    random: 0xffa95c,
    node: 0xffe82a,
    stop: 0xffa15c,
};

/** WebGL drawing layer. The positioned HTML buttons above it provide labels and input. */
export function mountSceneFlowMap({ viewport, canvas, labels, graph, onSelect }) {
    const positions = layoutMap(graph);
    let renderer = null;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    } catch {
        canvas.style.display = 'none';
    }
    const scene = renderer ? new THREE.Scene() : null;
    const camera = renderer ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100) : null;
    if (camera) camera.position.z = 10;
    const resources = [];
    const add = (object) => {
        scene?.add(object);
        resources.push(object.geometry, object.material);
    };
    const line = (a, b, tint, opacity = 1, width = 1.5) => {
        if (!scene || !a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const geometry = new THREE.PlaneGeometry(Math.hypot(dx, dy), width);
        const material = new THREE.MeshBasicMaterial({ color: tint, transparent: opacity < 1, opacity, depthWrite: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
        mesh.rotation.z = Math.atan2(dy, dx);
        add(mesh);
        return mesh;
    };
    const rings = [];
    if (scene) {
        for (const radius of [145, 205, 252, 290]) {
            const geometry = new THREE.BufferGeometry().setFromPoints(
                Array.from({ length: 65 }, (_, i) => new THREE.Vector3(
                    Math.cos(i / 64 * Math.PI * 2) * radius,
                    Math.sin(i / 64 * Math.PI * 2) * radius, -1,
                )),
            );
            const material = new THREE.LineBasicMaterial({ color: color.contour, transparent: true, opacity: 0.45 });
            const ring = new THREE.Line(geometry, material);
            add(ring);
            rings.push(ring);
        }
    }
    const edgeMeshes = graph.edges.map((edge) => line(positions.get(edge.from), positions.get(edge.to),
        edge.random ? color.random : color.possible, 0.65, 2));
    graph.nodes.forEach((node) => {
        const point = positions.get(node.key);
        if (!scene || !point) return;
        const geometry = new THREE.CircleGeometry(node.kind === 'start' ? 17 : 9, 16);
        const material = new THREE.MeshBasicMaterial({ color: node.kind === 'stop' ? color.stop : color.node });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(point.x, point.y, 1);
        add(mesh);
    });

    const buttons = new Map();
    for (const [index, node] of graph.nodes.entries()) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'scene-map-node';
        button.dataset.key = node.key;
        button.textContent = node.key === START ? node.name : String(index).padStart(2, '0');
        button.dataset.name = node.name;
        button.setAttribute('aria-label', `${node.name}, scene ${index}`);
        button.title = node.key === START ? 'The running gag' : `${node.name} · ${node.key}`;
        button.addEventListener('click', () => onSelect(node.key));
        labels.appendChild(button);
        buttons.set(node.key, button);
    }
    let panX = 0;
    let panY = 0;
    let scale = 1;
    let width = 0;
    let height = 0;
    let selected = START;
    let route = new Set([START]);
    const render = () => {
        width = viewport.clientWidth;
        height = viewport.clientHeight;
        if (!width || !height) return;
        if (renderer) {
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.setSize(width, height, false);
            camera.left = -width / 2;
            camera.right = width / 2;
            camera.top = height / 2;
            camera.bottom = -height / 2;
            camera.updateProjectionMatrix();
            for (const [index, edge] of graph.edges.entries()) {
                if (!edgeMeshes[index]) continue;
                const active = route.has(edge.from) && route.has(edge.to);
                edgeMeshes[index].material.color.setHex(active ? color.route : edge.random ? color.random : color.possible);
                edgeMeshes[index].material.opacity = active ? 1 : 0.55;
            }
            scene.position.set(panX, -panY, 0);
            scene.scale.setScalar(scale);
            renderer.render(scene, camera);
        }
        for (const node of graph.nodes) {
            const point = positions.get(node.key);
            const button = buttons.get(node.key);
            button.style.left = `${width / 2 + panX + point.x * scale}px`;
            button.style.top = `${height / 2 + panY - point.y * scale}px`;
            button.classList.toggle('is-selected', node.key === selected);
            button.classList.toggle('is-route', route.has(node.key));
            button.classList.toggle('is-start', node.key === START);
        }
    };
    const fit = () => {
        const maxX = Math.max(1, ...[...positions.values()].map(({ x }) => Math.abs(x)));
        const maxY = Math.max(1, ...[...positions.values()].map(({ y }) => Math.abs(y)));
        scale = Math.min(1, (viewport.clientWidth / 2 - 55) / maxX, (viewport.clientHeight / 2 - 35) / maxY);
        scale = Math.max(0.45, scale);
        panX = 0;
        panY = 0;
        render();
    };
    const select = (key, path = [key]) => {
        selected = key;
        route = new Set(path);
        render();
    };
    let drag = null;
    const onDown = (event) => {
        if (event.target.closest('button')) return;
        drag = { x: event.clientX, y: event.clientY, panX, panY };
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-dragging');
    };
    const onMove = (event) => {
        if (!drag) return;
        panX = drag.panX + event.clientX - drag.x;
        panY = drag.panY + event.clientY - drag.y;
        render();
    };
    const onUp = () => { drag = null; viewport.classList.remove('is-dragging'); };
    const onWheel = (event) => {
        event.preventDefault();
        scale = Math.max(0.4, Math.min(2.2, scale * (event.deltaY > 0 ? 0.9 : 1.1)));
        render();
    };
    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove);
    viewport.addEventListener('pointerup', onUp);
    viewport.addEventListener('pointercancel', onUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    resizeObserver?.observe(viewport);
    fit();
    return {
        fit, select,
        zoom(direction) {
            scale = Math.max(0.4, Math.min(2.2, scale * (direction > 0 ? 1.2 : 1 / 1.2)));
            render();
        },
        destroy() {
            resizeObserver?.disconnect();
            viewport.removeEventListener('pointerdown', onDown);
            viewport.removeEventListener('pointermove', onMove);
            viewport.removeEventListener('pointerup', onUp);
            viewport.removeEventListener('pointercancel', onUp);
            viewport.removeEventListener('wheel', onWheel);
            resources.forEach((resource) => resource.dispose());
            renderer?.dispose();
            labels.replaceChildren();
        },
    };
}

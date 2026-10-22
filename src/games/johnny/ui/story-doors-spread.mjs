/**
 * story-doors-spread.mjs — "The Spread", slice 1 of the Doors visualizer (#47).
 *
 * The live visit is dealt as cards on brass stands around an observatory
 * floor. Played cards lean back, the live card stands raised and lit, planned
 * cards wait face-down and turn over on hover. Behind them floats the deck:
 * gags that could appear in a later visit, or are sealed by day or tide.
 * A 16-segment tide ring on the floor shows the live tide phase.
 *
 * three.js only draws. Every card is also a real <button> in a DOM layer
 * positioned over it, which carries focus, labels and clicks. When WebGL is
 * unavailable the same buttons render as a flat card grid instead.
 */
import * as THREE from 'three';
import { TIDE_PHASES } from '../story-controller.mjs';
import { describeDoor, describeTideWindow } from '../story-doors.mjs';
import { CARD_HEIGHT, CARD_WIDTH, paintCardBack, paintCardFace } from './story-card-faces.mjs';

export { createCardFaceQueue } from './story-card-faces.mjs';

const DECK_OPEN_LIMIT = 9;
const DECK_SEALED_LIMIT = 7;
const LOW_TIDE_FROM = 12;
const pad = (value) => String(value).padStart(2, '0');

export const SPREAD_STYLE = `
.story-doors { position: relative; height: clamp(360px, 52vh, 520px); margin: 4px 0 14px;
  border-radius: 14px; overflow: hidden; color: #efe3c4;
  background: radial-gradient(ellipse at 50% 110%, #1d1a2c 0%, #090b14 55%, #04050a 100%);
  font-family: Georgia, 'Times New Roman', serif; }
.story-doors canvas.story-doors-gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.story-doors-labels { position: absolute; inset: 0; pointer-events: none; }
.story-doors-card { position: absolute; pointer-events: auto; background: transparent; border: 0;
  padding: 0; margin: 0; cursor: pointer; border-radius: 8px; }
.story-doors-card:focus-visible { outline: 2px solid #ffd77a; outline-offset: 3px; }
.story-doors-caption { position: absolute; left: 18px; top: 14px; font-size: 11px; letter-spacing: .22em;
  color: #c9a45c; text-transform: uppercase; pointer-events: none; }
.story-doors-caption strong { display: block; margin-top: 6px; font-weight: 400; letter-spacing: 0;
  font-size: 22px; color: #efe3c4; text-transform: none; }
.story-doors-legend { position: absolute; left: 18px; bottom: 14px; font-size: 11px; letter-spacing: .08em;
  color: #a8987a; pointer-events: none; display: flex; gap: 14px; flex-wrap: wrap; max-width: 46%; }
.story-doors-info { position: absolute; right: 14px; bottom: 14px; width: min(320px, 46%);
  padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(201,164,92,.45);
  background: rgba(14,16,28,.72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.story-doors-info small { display: block; font-size: 10px; letter-spacing: .2em; color: #c9a45c; text-transform: uppercase; }
.story-doors-info strong { display: block; margin: 4px 0 6px; font-weight: 400; font-size: 19px; }
.story-doors-info p { margin: 2px 0; font-size: 13px; line-height: 1.35; color: #cfc3a6; }
.story-doors-info .is-sealed { color: #e0a070; }
.story-doors-turn { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); display: flex; gap: 6px; }
.story-doors-turn button { min-width: 34px; height: 30px; padding: 0 10px; border-radius: 15px; cursor: pointer;
  border: 1px solid rgba(201,164,92,.55); background: rgba(14,16,28,.7); color: #efe3c4;
  font: 14px Georgia, serif; letter-spacing: .06em; }
.story-doors-turn button:hover:not(:disabled) { border-color: #ffd77a; color: #ffd77a; }
.story-doors-turn button:disabled { opacity: .35; cursor: default; }
.story-doors-turn button:focus-visible { outline: 2px solid #ffd77a; outline-offset: 2px; }
.story-doors.is-flat { height: auto; padding: 58px 14px 150px; }
.story-doors.is-flat .story-doors-labels { position: static; display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); }
.story-doors.is-flat .story-doors-card { position: static; width: 100%; aspect-ratio: 2 / 3; }
.story-doors.is-flat .story-doors-card canvas { width: 100%; height: 100%; display: block; border-radius: 8px; }
.story-doors.is-flat .story-doors-card[data-role="seen"] { opacity: .6; }
.story-doors.is-flat .story-doors-card[data-role="live"] { box-shadow: 0 0 0 2px #ffd77a, 0 0 24px rgba(255,215,122,.45); }
.story-doors.is-flat .story-doors-card[data-sealed="true"] { opacity: .5; }
.story-doors.is-flat .story-doors-divider { grid-column: 1 / -1; font-size: 11px; letter-spacing: .2em; color: #c9a45c; }
@media (max-width: 640px) {
  .story-doors-info { position: static; width: auto; margin: 12px; }
  .story-doors-legend { max-width: none; }
}
`;

const roleWords = { seen: 'Already played', live: 'Johnny is here now', planned: 'Planned, face down', deck: 'In the deck' };

/** Pick the deck cards worth showing: the heaviest open ones, then the sealed ones nearest to opening. */
const chooseDeck = (deck) => [
    ...deck.filter((card) => card.door.open).slice(0, DECK_OPEN_LIMIT),
    ...deck.filter((card) => !card.door.open).slice(0, DECK_SEALED_LIMIT),
];

export function mountStoryDoorsSpread({ host, spread, gagName, faces = null, onInspect = () => {}, inspectedKey = null, reducedMotion = false }) {
    let destroyed = false;
    const root = document.createElement('section');
    root.className = 'story-doors';
    root.setAttribute('aria-label', 'This visit as a spread of cards');
    const labels = document.createElement('div');
    labels.className = 'story-doors-labels';
    const caption = document.createElement('div');
    caption.className = 'story-doors-caption';
    const info = document.createElement('div');
    info.className = 'story-doors-info';
    info.setAttribute('aria-live', 'polite');
    const legend = document.createElement('div');
    legend.className = 'story-doors-legend';
    root.append(labels, caption, legend, info);
    host.appendChild(root);

    const { visit, deck, storyDay, tidePhase, openWeight } = spread;
    const shownDeck = chooseDeck(deck);
    const sealedCount = deck.filter((card) => !card.door.open).length;
    const live = visit.find((card) => card.role === 'live') ?? visit[0] ?? null;
    const liveIndex = live?.index ?? 0;
    const visitTotal = visit.at(-1)?.index ?? visit.length;

    const tideWords = tidePhase == null ? 'tide unknown'
        : `tide phase ${tidePhase} · ${tidePhase >= LOW_TIDE_FROM ? 'low tide' : 'high tide'}`;
    caption.textContent = `Day ${pad(storyDay)} of 11 · ${tideWords}`;
    const captionName = document.createElement('strong');
    captionName.textContent = live ? `Visit · gag ${liveIndex} of ${visitTotal}` : 'No visit yet';
    caption.appendChild(captionName);
    legend.innerHTML = '';
    for (const text of ['Leaning back: played', 'Lit: now', 'Face down: planned',
        `Behind: ${deck.length - sealedCount} open · ${sealedCount} sealed`, '☾ ends a visit', '✦ day key scene']) {
        const item = document.createElement('span');
        item.textContent = text;
        legend.appendChild(item);
    }

    const nameOf = (card) => (card.pose ? 'Johnny pauses' : gagName(card));
    const kickerOf = (card) => {
        if (card.role === 'deck') return card.door.open ? 'Could appear' : 'Sealed';
        const base = `${pad(card.index ?? 0)} · ${card.role === 'live' ? 'Now' : card.role === 'seen' ? 'Played' : 'Planned'}`;
        return card.repeat > 1 ? `${base} ×${card.repeat}` : base;
    };

    const describe = (card) => {
        info.textContent = '';
        const kicker = document.createElement('small');
        kicker.textContent = card.role === 'deck'
            ? `Deck · ${card.door.open ? 'open for a later visit' : 'sealed'}`
            : `This visit · ${pad(card.index ?? 0)} of ${pad(visitTotal)} · ${roleWords[card.role]}`;
        const name = document.createElement('strong');
        name.textContent = card.repeat > 1 ? `${nameOf(card)} (×${card.repeat})` : nameOf(card);
        info.append(kicker, name);
        const line = (text, className = '') => {
            const p = document.createElement('p');
            p.textContent = text;
            if (className) p.className = className;
            info.appendChild(p);
        };
        if (card.role === 'deck') {
            line(describeDoor(card.door), card.door.open ? '' : 'is-sealed');
            if (card.door.open && openWeight) line(`Weight ${card.weight} of ${openWeight} across the open deck`);
        } else if (!card.pose) {
            line(describeTideWindow(card.tideMin, card.tideMax));
        }
        if (card.final) line('☾ Ends a visit');
        if (card.keyDay) line(`✦ Key scene for day ${card.keyDay}`);
        if (!card.pose) line(card.role === 'deck' ? 'Select to read its script' : 'Select to read its script below');
    };

    const cards = [
        ...visit.map((card) => ({ card, group: 'visit' })),
        ...shownDeck.map((card) => ({ card, group: 'deck' })),
    ];
    let hovered = null;
    const setHovered = (entry) => {
        hovered = entry;
        describe((entry ?? cards.find((c) => c.card === live) ?? cards[0])?.card ?? null);
        requestRender();
    };

    const sealedOf = (card) => card.role === 'deck' && !card.door.open;
    const paint = (entry, context, faceUp) => {
        const { card } = entry;
        context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        if (!faceUp) paintCardBack(context, { sealed: sealedOf(card) });
        else {
            paintCardFace(context, {
                name: nameOf(card), kicker: kickerOf(card), image: entry.image, final: card.final,
                keyDay: card.keyDay, sealed: sealedOf(card), live: card.role === 'live',
            });
        }
    };

    // DOM buttons: focus, labels, clicks. Positions are set from the 3D layout.
    for (const entry of cards) {
        const { card } = entry;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'story-doors-card';
        button.dataset.role = card.role;
        button.dataset.key = card.key;
        if (sealedOf(card)) button.dataset.sealed = 'true';
        const extra = card.role === 'deck' ? describeDoor(card.door) : roleWords[card.role];
        button.setAttribute('aria-label', `${kickerOf(card)}: ${nameOf(card)}. ${extra}.`);
        if (inspectedKey && inspectedKey === `${card.key}:${card.index ?? ''}`) button.setAttribute('aria-current', 'true');
        button.addEventListener('pointerenter', () => setHovered(entry));
        button.addEventListener('pointerleave', () => { if (hovered === entry) setHovered(null); });
        button.addEventListener('focus', () => setHovered(entry));
        button.addEventListener('blur', () => { if (hovered === entry) setHovered(null); });
        if (card.pose) button.disabled = true;
        else button.addEventListener('click', () => onInspect(card));
        entry.button = button;
        entry.image = null;
    }

    let gl = null;
    try {
        gl = mountScene();
    } catch {
        gl = null;
    }
    if (!gl) mountFlat();

    // Real frames fill in as the queue renders them, live card first.
    if (faces) {
        if (live) faces.prioritize(live);
        for (const entry of cards) {
            faces.request(entry.card, (image) => {
                if (destroyed || !image) return;
                entry.image = image;
                entry.repaint?.();
                requestRender();
            });
        }
        if (live) faces.prioritize(live);
    }

    setHovered(null);

    function requestRender() {
        gl?.requestRender();
    }

    function mountFlat() {
        root.classList.add('is-flat');
        let deckDividerAdded = false;
        const visitDivider = document.createElement('div');
        visitDivider.className = 'story-doors-divider';
        visitDivider.textContent = 'This visit';
        labels.appendChild(visitDivider);
        for (const entry of cards) {
            if (entry.group === 'deck' && !deckDividerAdded) {
                const divider = document.createElement('div');
                divider.className = 'story-doors-divider';
                divider.textContent = 'The deck · later visits';
                labels.appendChild(divider);
                deckDividerAdded = true;
            }
            const canvas = document.createElement('canvas');
            canvas.width = CARD_WIDTH;
            canvas.height = CARD_HEIGHT;
            canvas.setAttribute('aria-hidden', 'true');
            entry.button.appendChild(canvas);
            const context = canvas.getContext?.('2d');
            entry.repaint = () => { if (context) paint(entry, context, true); };
            entry.repaint();
            labels.appendChild(entry.button);
        }
    }

    function mountScene() {
        const canvas = document.createElement('canvas');
        canvas.className = 'story-doors-gl';
        canvas.setAttribute('aria-hidden', 'true');
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setClearColor(0x05060c, 1);
        root.insertBefore(canvas, labels);
        for (const entry of cards) labels.appendChild(entry.button);

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x05060c, 14, 30);
        const camera = new THREE.PerspectiveCamera(34, 2, 0.1, 80);
        const target = new THREE.Vector3(0, 1.35, -1.2);
        camera.position.set(0, 3.4, 10.5);
        camera.lookAt(target);
        const disposables = [];
        const keep = (...items) => { disposables.push(...items); return items[0]; };

        scene.add(new THREE.AmbientLight(0xffffff, 1));

        // Starfield.
        const starCount = 700;
        const starPositions = new Float32Array(starCount * 3);
        for (let index = 0; index < starCount; index++) {
            const radius = 22 + Math.random() * 18;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 0.55;
            starPositions[index * 3] = Math.cos(theta) * Math.sin(phi) * radius;
            starPositions[index * 3 + 1] = Math.cos(phi) * radius * 0.7 + 1;
            starPositions[index * 3 + 2] = Math.sin(theta) * Math.sin(phi) * radius - 8;
        }
        const starGeometry = keep(new THREE.BufferGeometry());
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        const stars = new THREE.Points(starGeometry, keep(new THREE.PointsMaterial({
            color: 0xe9d9a8, size: 0.07, transparent: true, opacity: 0.8, fog: false,
        })));
        scene.add(stars);

        // Observatory floor: concentric brass rings and spokes.
        const brass = keep(new THREE.LineBasicMaterial({ color: 0x8a6a35, transparent: true, opacity: 0.55 }));
        const circle = (radius) => {
            const points = [];
            for (let step = 0; step <= 128; step++) {
                const angle = (step / 128) * Math.PI * 2;
                points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
            }
            const geometry = keep(new THREE.BufferGeometry().setFromPoints(points));
            scene.add(new THREE.Line(geometry, brass));
        };
        [1.7, 3.2, 5.6, 8.4, 11.5].forEach(circle);
        for (let spoke = 0; spoke < 12; spoke++) {
            const angle = (spoke / 12) * Math.PI * 2;
            const geometry = keep(new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(Math.cos(angle) * 1.7, 0, Math.sin(angle) * 1.7),
                new THREE.Vector3(Math.cos(angle) * 11.5, 0, Math.sin(angle) * 11.5),
            ]));
            scene.add(new THREE.Line(geometry, brass));
        }
        const floor = new THREE.Mesh(
            keep(new THREE.CircleGeometry(11.5, 96)),
            keep(new THREE.MeshBasicMaterial({ color: 0x0c0d18 })),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.01;
        scene.add(floor);

        // Tide ring: 16 phases around the floor's centre. Phase 0 sits at the back.
        const tideSegments = [];
        for (let phase = 0; phase < TIDE_PHASES; phase++) {
            const material = keep(new THREE.MeshBasicMaterial({ color: 0x2a2a3a, side: THREE.DoubleSide, transparent: true }));
            const gap = 0.025;
            const geometry = keep(new THREE.RingGeometry(1.95, 2.7, 6, 1,
                Math.PI / 2 + (phase / TIDE_PHASES) * Math.PI * 2 + gap,
                (Math.PI * 2) / TIDE_PHASES - gap * 2));
            const segment = new THREE.Mesh(geometry, material);
            segment.rotation.x = -Math.PI / 2;
            segment.position.y = 0.01;
            scene.add(segment);
            tideSegments.push(material);
        }
        const paintTide = (window) => {
            tideSegments.forEach((material, phase) => {
                const low = phase >= LOW_TIDE_FROM;
                const inWindow = window && phase >= window.min && phase < window.max;
                let colour = low ? 0x1d3340 : 0x262640;
                if (inWindow) colour = low ? 0x3d7d8c : 0x5d5a8c;
                if (phase === tidePhase) colour = 0xffd77a;
                material.color.setHex(colour);
                material.opacity = window && !inWindow && phase !== tidePhase ? 0.45 : 1;
            });
        };

        // Cards.
        const cardGeometry = keep(new THREE.PlaneGeometry(1, CARD_HEIGHT / CARD_WIDTH));
        const postMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x7a5a2c }));
        const postGeometry = keep(new THREE.CylinderGeometry(0.025, 0.035, 1, 8));
        const baseGeometry = keep(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 20));
        const glowTexture = (() => {
            const glowCanvas = document.createElement('canvas');
            glowCanvas.width = glowCanvas.height = 128;
            const context = glowCanvas.getContext('2d');
            const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
            gradient.addColorStop(0, 'rgba(255,215,122,.85)');
            gradient.addColorStop(1, 'rgba(255,215,122,0)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, 128, 128);
            return keep(new THREE.CanvasTexture(glowCanvas));
        })();

        const visitEntries = cards.filter((entry) => entry.group === 'visit');
        const deckEntries = cards.filter((entry) => entry.group === 'deck');
        // The visit is a wheel of stands centred on the focused card (the live
        // card at first). Cards past the edge of the wheel are hidden; the turn
        // buttons and keyboard focus rotate it.
        // `bow` -1 fans away from the viewer (edges recede, like a tarot fan);
        // +1 curves toward the viewer (edges wrap around them).
        const VISIT_RING = { radius: 6, centerZ: -0.2, y: 1.2, scale: 0.9, step: 0.17, maxAngle: 1.3, bow: -1 };
        const DECK_RING = { radius: 11, centerZ: -6.2, y: 3.25, scale: 0.62, bow: 1 };
        const placeOnRing = (stand, angle, ring) => {
            stand.position.set(Math.sin(angle) * ring.radius, 0,
                ring.centerZ + ring.bow * ring.radius * (1 - Math.cos(angle)));
            stand.rotation.y = -ring.bow * angle;
        };
        visitEntries.forEach((entry, slot) => {
            entry.slot = slot;
            entry.home = { y: VISIT_RING.y, scale: VISIT_RING.scale };
            entry.stands = true;
        });
        const deckStep = deckEntries.length > 1
            ? Math.min((84 * Math.PI / 180) / (deckEntries.length - 1), (DECK_RING.scale * 1.18) / DECK_RING.radius) : 0;
        deckEntries.forEach((entry, index) => {
            entry.angle = (index - (deckEntries.length - 1) / 2) * deckStep;
            entry.home = { y: DECK_RING.y, scale: DECK_RING.scale };
            entry.stands = false;
        });

        for (const entry of cards) {
            const { card } = entry;
            const faceCanvas = document.createElement('canvas');
            faceCanvas.width = CARD_WIDTH;
            faceCanvas.height = CARD_HEIGHT;
            const context = faceCanvas.getContext('2d');
            const texture = keep(new THREE.CanvasTexture(faceCanvas));
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;
            const backCanvas = document.createElement('canvas');
            backCanvas.width = CARD_WIDTH;
            backCanvas.height = CARD_HEIGHT;
            paintCardBack(backCanvas.getContext('2d'), { sealed: sealedOf(card) });
            const backTexture = keep(new THREE.CanvasTexture(backCanvas));
            backTexture.colorSpace = THREE.SRGBColorSpace;
            const dim = card.role === 'seen' ? 0.62 : sealedOf(card) ? 0.55 : 1;
            const front = new THREE.Mesh(cardGeometry, keep(new THREE.MeshBasicMaterial({
                map: texture, color: new THREE.Color(dim, dim, dim), transparent: true,
            })));
            const back = new THREE.Mesh(cardGeometry, keep(new THREE.MeshBasicMaterial({
                map: backTexture, color: new THREE.Color(dim, dim, dim), transparent: true,
            })));
            back.rotation.y = Math.PI;
            const pivot = new THREE.Group();
            pivot.add(front, back);
            const holder = new THREE.Group();
            holder.add(pivot);
            const stand = new THREE.Group();
            stand.add(holder);
            const { y, scale } = entry.home;
            const cardScale = card.role === 'live' ? scale * 1.3 : scale;
            holder.scale.setScalar(cardScale);
            entry.baseY = y + (card.role === 'live' ? 0.35 : 0);
            holder.position.y = entry.baseY;
            if (card.role === 'seen') pivot.rotation.x = -0.42;
            if (entry.stands) {
                const height = entry.baseY - (CARD_HEIGHT / CARD_WIDTH) * cardScale * 0.5;
                for (const side of [-0.32, 0.32]) {
                    const post = new THREE.Mesh(postGeometry, postMaterial);
                    post.scale.y = Math.max(0.05, height);
                    post.position.set(side * cardScale, height / 2, 0);
                    stand.add(post);
                }
                const base = new THREE.Mesh(baseGeometry, postMaterial);
                base.position.y = 0.03;
                stand.add(base);
            }
            if (card.role === 'live') {
                const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({
                    map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
                    opacity: 0.75,
                })));
                glow.scale.set(2.3, 2.6, 1);
                glow.position.set(0, entry.baseY, -0.2);
                stand.add(glow);
                entry.glow = glow;
            }
            if (entry.group === 'deck') placeOnRing(stand, entry.angle, DECK_RING);
            scene.add(stand);
            entry.stand = stand;
            entry.holder = holder;
            entry.pivot = pivot;
            entry.texture = texture;
            // Planned and sealed cards start face down; hovering turns them over.
            entry.faceUp = !(card.role === 'planned' || sealedOf(card));
            entry.flip = entry.faceUp ? 0 : Math.PI;
            pivot.rotation.y = entry.flip;
            entry.repaint = () => {
                if (!context) return;
                paint(entry, context, true);
                texture.needsUpdate = true;
            };
            entry.repaint();
        }

        // Wheel focus: which visit slot sits front and centre.
        const liveSlot = Math.max(0, visitEntries.findIndex((entry) => entry.card.role === 'live'));
        let focusGoal = liveSlot;
        let focus = liveSlot;
        const lastSlot = Math.max(0, visitEntries.length - 1);
        const turn = (delta) => {
            focusGoal = Math.max(0, Math.min(lastSlot, Math.round(focusGoal + delta)));
            updateTurnButtons();
            requestRenderGl();
        };
        const turnControls = document.createElement('div');
        turnControls.className = 'story-doors-turn';
        const earlier = document.createElement('button');
        earlier.type = 'button';
        earlier.textContent = '‹';
        earlier.setAttribute('aria-label', 'Turn to earlier gags in this visit');
        earlier.addEventListener('click', () => turn(-4));
        const toLive = document.createElement('button');
        toLive.type = 'button';
        toLive.textContent = 'Now';
        toLive.setAttribute('aria-label', 'Turn back to the live gag');
        toLive.addEventListener('click', () => turn(liveSlot - focusGoal));
        const later = document.createElement('button');
        later.type = 'button';
        later.textContent = '›';
        later.setAttribute('aria-label', 'Turn to later gags in this visit');
        later.addEventListener('click', () => turn(4));
        turnControls.append(earlier, toLive, later);
        root.appendChild(turnControls);
        const updateTurnButtons = () => {
            earlier.disabled = focusGoal <= 0;
            later.disabled = focusGoal >= lastSlot;
            toLive.disabled = focusGoal === liveSlot;
        };
        updateTurnButtons();
        // Tabbing onto a card past the edge turns the wheel to it.
        for (const entry of visitEntries) {
            entry.button.addEventListener('focus', () => {
                const angle = (entry.slot - focusGoal) * VISIT_RING.step;
                if (Math.abs(angle) > VISIT_RING.maxAngle * 0.8) turn(entry.slot - focusGoal);
            });
        }
        const placeVisit = () => {
            for (const entry of visitEntries) {
                const angle = (entry.slot - focus) * VISIT_RING.step;
                const visible = Math.abs(angle) <= VISIT_RING.maxAngle;
                entry.stand.visible = visible;
                entry.button.style.visibility = visible ? '' : 'hidden';
                if (visible) placeOnRing(entry.stand, angle, VISIT_RING);
            }
        };

        let width = 0;
        let height = 0;
        const resize = () => {
            const rect = root.getBoundingClientRect();
            if (!rect.width || !rect.height) return false;
            if (rect.width === width && rect.height === height) return true;
            width = rect.width;
            height = rect.height;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            // Narrow screens: step back so the whole arc stays in view.
            const pullBack = Math.max(0, 1.6 - camera.aspect) * 6;
            camera.position.set(0, 3.4 + pullBack * 0.25, 10.5 + pullBack);
            camera.lookAt(target);
            camera.updateProjectionMatrix();
            return true;
        };

        const corner = new THREE.Vector3();
        const placeButtons = () => {
            const halfH = (CARD_HEIGHT / CARD_WIDTH) / 2;
            for (const entry of cards) {
                entry.holder.updateMatrixWorld();
                let minX = Infinity;
                let minY = Infinity;
                let maxX = -Infinity;
                let maxY = -Infinity;
                for (const [cx, cy] of [[-0.5, -halfH], [0.5, -halfH], [-0.5, halfH], [0.5, halfH]]) {
                    corner.set(cx, cy, 0).applyMatrix4(entry.pivot.matrixWorld).project(camera);
                    const sx = (corner.x + 1) / 2 * width;
                    const sy = (1 - corner.y) / 2 * height;
                    minX = Math.min(minX, sx);
                    maxX = Math.max(maxX, sx);
                    minY = Math.min(minY, sy);
                    maxY = Math.max(maxY, sy);
                }
                const style = entry.button.style;
                style.left = `${minX}px`;
                style.top = `${minY}px`;
                style.width = `${Math.max(8, maxX - minX)}px`;
                style.height = `${Math.max(8, maxY - minY)}px`;
            }
        };

        let frameId = null;
        let needsRender = true;
        let last = 0;
        const animate = (now) => {
            frameId = null;
            if (!root.isConnected) return;
            if (!resize()) {
                frameId = requestAnimationFrame(animate);
                return;
            }
            const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
            last = now;
            let moving = false;
            if (reducedMotion) focus = focusGoal;
            else if (Math.abs(focus - focusGoal) > 0.002) {
                focus += (focusGoal - focus) * Math.min(1, dt * 7);
                moving = true;
            } else focus = focusGoal;
            placeVisit();
            const highlighted = hovered?.card ?? null;
            for (const entry of cards) {
                const wantFaceUp = entry.faceUp || entry === hovered;
                const goal = wantFaceUp ? 0 : Math.PI;
                if (reducedMotion) entry.flip = goal;
                else if (Math.abs(entry.flip - goal) > 0.001) {
                    entry.flip += (goal - entry.flip) * Math.min(1, dt * 9);
                    moving = true;
                } else entry.flip = goal;
                entry.pivot.rotation.y = entry.flip;
                const lift = entry === hovered ? 0.18 : 0;
                const baseY = entry.baseY;
                const bob = !reducedMotion && entry.card.role === 'live' ? Math.sin(now / 900) * 0.05 : 0;
                const goalY = baseY + lift + bob;
                if (reducedMotion) entry.holder.position.y = baseY + lift;
                else {
                    entry.holder.position.y += (goalY - entry.holder.position.y) * Math.min(1, dt * 8);
                    if (Math.abs(goalY - entry.holder.position.y) > 0.002) moving = true;
                }
                if (entry.glow) entry.glow.position.y = entry.holder.position.y;
            }
            paintTide(highlighted && !highlighted.pose ? { min: highlighted.tideMin, max: highlighted.tideMax } : null);
            if (!reducedMotion) {
                stars.rotation.y += dt * 0.004;
                moving = true; // the live card bobs and the stars drift
            }
            renderer.render(scene, camera);
            placeButtons();
            needsRender = false;
            if (moving && !document.hidden) frameId = requestAnimationFrame(animate);
        };
        const requestRenderGl = () => {
            needsRender = true;
            if (frameId === null) frameId = requestAnimationFrame(animate);
        };
        const onVisibility = () => { if (!document.hidden) requestRenderGl(); };
        document.addEventListener('visibilitychange', onVisibility);
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => requestRenderGl()) : null;
        observer?.observe(root);
        requestRenderGl();

        return {
            requestRender: requestRenderGl,
            get needsRender() { return needsRender; },
            destroy() {
                if (frameId !== null) cancelAnimationFrame(frameId);
                document.removeEventListener('visibilitychange', onVisibility);
                observer?.disconnect();
                for (const item of disposables) item.dispose?.();
                renderer.dispose();
                renderer.forceContextLoss();
            },
        };
    }

    return {
        destroy() {
            destroyed = true;
            gl?.destroy();
            root.remove();
        },
    };
}

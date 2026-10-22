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
.story-doors { position: relative; height: clamp(460px, 64vh, 700px); margin: 6px 0 14px; overflow: hidden;
  color: #fffbe2; font: 20px/1.1 'VT323', monospace; border: 2px solid #65c8e2;
  background: repeating-linear-gradient(0deg, transparent 0 17px, rgba(83,219,255,.08) 18px 19px), #071998; }
.story-doors canvas.story-doors-gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.story-doors-labels { position: absolute; inset: 0; pointer-events: none; }
.story-doors-card { position: absolute; pointer-events: auto; background: transparent; border: 0;
  padding: 0; margin: 0; cursor: pointer; }
.story-doors-card:focus-visible { outline: 3px solid #ffe02d; outline-offset: 3px; }
.story-doors-card[aria-pressed="true"] { outline: 3px dashed #ffe02d; outline-offset: 5px; }
.story-doors-caption { position: absolute; left: 16px; top: 12px; pointer-events: none;
  color: #a4e5de; font-size: 20px; letter-spacing: .04em; text-transform: uppercase; text-shadow: 2px 2px 0 #020d5b; }
.story-doors-caption strong { display: block; margin-top: 2px; font: 34px/1 'Caveat', cursive; color: #fff2a1;
  letter-spacing: 0; text-transform: none; }
.story-doors-legend { position: absolute; left: 16px; bottom: 12px; pointer-events: none; display: flex; gap: 6px 16px;
  flex-wrap: wrap; max-width: 44%; color: #bde9e9; font-size: 18px; text-shadow: 2px 2px 0 #020d5b; }
.story-doors-info { position: absolute; right: 14px; bottom: 14px; width: min(360px, 46%); box-sizing: border-box;
  padding: 10px 14px 12px; border: 2px solid #8b5a2b; background: #d4c4a8; color: #302816;
  box-shadow: 4px 4px 0 #020d5b; }
.story-doors-info small { display: block; font-size: 18px; color: #8b5a2b; text-transform: uppercase; }
.story-doors-info strong { display: block; margin: 2px 0 6px; font: 32px/1 'Caveat', cursive; }
.story-doors-info p { margin: 2px 0; font-size: 20px; line-height: 1.05; }
.story-doors-info .is-sealed { color: #9a3412; }
.story-doors-info .is-hint { color: #6b5a3a; }
.story-doors-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.story-doors-actions button { flex: 1 1 auto; min-height: 42px; padding: 4px 10px; cursor: pointer;
  border: 2px solid #704a1e; background: #fff8dc; color: #302816; font: 20px/1 'VT323', monospace; }
.story-doors-actions button.is-play { background: #ffe02d; }
.story-doors-actions button:hover:not(:disabled) { filter: brightness(1.06); box-shadow: 2px 2px 0 #704a1e; }
.story-doors-actions button:disabled { opacity: .5; cursor: default; }
.story-doors-actions button:focus-visible { outline: 3px solid #071998; outline-offset: 2px; }
.story-doors-turn { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); display: flex; gap: 6px; }
.story-doors-turn button { min-width: 44px; min-height: 40px; padding: 0 12px; cursor: pointer;
  border: 1px solid #65c8e2; background: #1642b1; color: #fffbdc; font: 24px/1 'VT323', monospace; }
.story-doors-turn button:hover:not(:disabled) { background: #1d52d0; }
.story-doors-turn button:disabled { opacity: .4; cursor: default; }
.story-doors-turn button:focus-visible { outline: 3px solid #ffe02d; outline-offset: 2px; }
.story-doors.is-flat { height: auto; padding: 84px 14px 14px; }
.story-doors.is-flat .story-doors-labels { position: static; display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.story-doors.is-flat .story-doors-card { position: static; width: 100%; aspect-ratio: 2 / 3; }
.story-doors.is-flat .story-doors-card canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
.story-doors.is-flat .story-doors-card[data-role="seen"] { opacity: .65; }
.story-doors.is-flat .story-doors-card[data-sealed="true"] { opacity: .55; }
.story-doors.is-flat .story-doors-divider { grid-column: 1 / -1; color: #a4e5de; font-size: 20px; text-transform: uppercase; }
.story-doors.is-flat .story-doors-info, .story-doors.is-flat .story-doors-legend { position: static; width: auto; max-width: none; margin-top: 14px; }
@media (max-width: 640px) {
  .story-doors-info { position: static; width: auto; margin: 12px; }
  .story-doors-legend { display: none; }
}
`;

const roleWords = { seen: 'Already played', live: 'Johnny is here now', planned: 'Planned, face down', deck: 'In the deck' };

/** Pick the deck cards worth showing: the heaviest open ones, then the sealed ones nearest to opening. */
const chooseDeck = (deck) => [
    ...deck.filter((card) => card.door.open).slice(0, DECK_OPEN_LIMIT),
    ...deck.filter((card) => !card.door.open).slice(0, DECK_SEALED_LIMIT),
];

export function mountStoryDoorsSpread({
    host, spread, gagName, faces = null, onInspect = () => {}, onPlay = null, onRead = null,
    inspectedKey = null, reducedMotion = false,
}) {
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

    const entryKey = (card) => `${card.key}:${card.index ?? ''}`;
    const describe = (card, isSelected) => {
        info.textContent = '';
        if (!card) return;
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
        if (card.pose) return;
        if (!isSelected) {
            line('Click to select this card', 'is-hint');
            return;
        }
        const actions = document.createElement('div');
        actions.className = 'story-doors-actions';
        if (onPlay) {
            const play = document.createElement('button');
            play.type = 'button';
            play.className = 'is-play';
            play.textContent = card.role === 'live' ? '▶ Replay this gag' : '▶ Play this gag';
            play.title = 'Start a new visit from this gag; the story carries on from there';
            play.addEventListener('click', () => {
                if (onPlay(card) === false) {
                    play.disabled = true;
                    play.textContent = 'Could not start this gag';
                }
            });
            actions.appendChild(play);
        }
        if (onRead) {
            const read = document.createElement('button');
            read.type = 'button';
            read.textContent = 'Read its script ↓';
            read.addEventListener('click', () => onRead(card));
            actions.appendChild(read);
        }
        if (actions.childElementCount) info.appendChild(actions);
    };

    const cards = [
        ...visit.map((card) => ({ card, group: 'visit' })),
        ...shownDeck.map((card) => ({ card, group: 'deck' })),
    ];
    let hovered = null;
    let selected = cards.find((entry) => inspectedKey && entryKey(entry.card) === inspectedKey)
        ?? cards.find((entry) => entry.card === live) ?? null;
    const showInfo = () => {
        const shown = hovered ?? selected ?? cards[0] ?? null;
        describe(shown?.card ?? null, Boolean(shown) && shown === selected);
    };
    const setHovered = (entry) => {
        if (hovered === entry) return;
        hovered = entry;
        showInfo();
        requestRender();
    };
    const select = (entry, { notify = true } = {}) => {
        if (!entry || entry.card.pose) return;
        selected = entry;
        for (const other of cards) other.button.setAttribute('aria-pressed', String(other === entry));
        showInfo();
        gl?.focusEntry(entry);
        requestRender();
        if (notify) onInspect(entry.card);
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
        if (card.role === 'live') button.setAttribute('aria-current', 'step');
        button.addEventListener('pointerenter', () => setHovered(entry));
        button.addEventListener('pointerleave', () => { if (hovered === entry) setHovered(null); });
        button.addEventListener('focus', () => setHovered(entry));
        button.addEventListener('blur', () => { if (hovered === entry) setHovered(null); });
        if (card.pose) button.disabled = true;
        else button.addEventListener('click', () => select(entry));
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

    for (const entry of cards) entry.button.setAttribute('aria-pressed', String(entry === selected));
    showInfo();
    if (selected) gl?.focusEntry(selected, { instant: true });
    // Card text is painted in VT323; repaint once the webfont is ready.
    document.fonts?.load?.("44px 'VT323'").then(() => {
        if (destroyed) return;
        for (const entry of cards) entry.repaint?.();
        requestRender();
    }).catch(() => {});

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
        renderer.setClearColor(0x06146c, 1);
        root.insertBefore(canvas, labels);
        for (const entry of cards) labels.appendChild(entry.button);

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x06146c, 12, 26);
        const camera = new THREE.PerspectiveCamera(34, 2, 0.1, 80);
        const target = new THREE.Vector3(0, 1.75, -1.2);
        camera.position.set(0, 2.9, 7.6);
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
            color: 0xfffbe2, size: 0.08, transparent: true, opacity: 0.85, fog: false,
        })));
        scene.add(stars);

        // Observatory floor: concentric brass rings and spokes.
        const brass = keep(new THREE.LineBasicMaterial({ color: 0x65c8e2, transparent: true, opacity: 0.35 }));
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
            keep(new THREE.MeshBasicMaterial({ color: 0x071998 })),
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
                let colour = low ? 0x0e4f7a : 0x1642b1;
                if (inWindow) colour = low ? 0x66d8e8 : 0xa4e5de;
                if (phase === tidePhase) colour = 0xffe02d;
                material.color.setHex(colour);
                material.opacity = window && !inWindow && phase !== tidePhase ? 0.45 : 1;
            });
        };

        // Cards.
        const cardGeometry = keep(new THREE.PlaneGeometry(1, CARD_HEIGHT / CARD_WIDTH));
        const postMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x8b5a2b }));
        const postGeometry = keep(new THREE.CylinderGeometry(0.025, 0.035, 1, 8));
        const baseGeometry = keep(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 20));
        const glowTexture = (() => {
            const glowCanvas = document.createElement('canvas');
            glowCanvas.width = glowCanvas.height = 128;
            const context = glowCanvas.getContext('2d');
            const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
            gradient.addColorStop(0, 'rgba(255,224,45,.7)');
            gradient.addColorStop(1, 'rgba(255,224,45,0)');
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
        const VISIT_RING = { radius: 5.6, centerZ: -0.4, y: 1.3, scale: 1.05, step: 0.2, maxAngle: 1.3, bow: -1 };
        const DECK_RING = { radius: 10, centerZ: -5.6, y: 3.6, scale: 0.7, bow: 1 };
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
            ? Math.min((58 * Math.PI / 180) / (deckEntries.length - 1), (DECK_RING.scale * 1.12) / DECK_RING.radius) : 0;
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
            const pullBack = Math.max(0, 1.6 - camera.aspect) * 5;
            camera.position.set(0, 2.9 + pullBack * 0.25, 7.6 + pullBack);
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
                const wantFaceUp = entry.faceUp || entry === hovered || entry === selected;
                const goal = wantFaceUp ? 0 : Math.PI;
                if (reducedMotion) entry.flip = goal;
                else if (Math.abs(entry.flip - goal) > 0.001) {
                    entry.flip += (goal - entry.flip) * Math.min(1, dt * 9);
                    moving = true;
                } else entry.flip = goal;
                entry.pivot.rotation.y = entry.flip;
                const lift = entry === selected ? 0.3 : entry === hovered ? 0.18 : 0;
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
            // Turn the wheel so a selected visit card comes to the front.
            focusEntry(entry, { instant = false } = {}) {
                if (entry.group !== 'visit') return;
                focusGoal = entry.slot;
                if (instant) focus = focusGoal;
                updateTurnButtons();
                requestRenderGl();
            },
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
        element: root,
        /** Mark a card selected without telling the panel (it already knows). */
        select(key) {
            const entry = cards.find((candidate) => entryKey(candidate.card) === key)
                ?? cards.find((candidate) => candidate.card.key === key.split(':').slice(0, 2).join(':'));
            if (entry && entry !== selected) select(entry, { notify: false });
        },
        destroy() {
            destroyed = true;
            gl?.destroy();
            root.remove();
        },
    };
}

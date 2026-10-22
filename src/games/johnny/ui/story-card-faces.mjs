/**
 * story-card-faces.mjs — painted card faces for the "Doors" story visualizer.
 *
 * Each gag card shows a real frame of that gag, rendered by running it in its
 * own silent offscreen DGDS runtime (the same pipeline scene-flow-preview.mjs
 * uses). Frames are made in the browser from the user's own game data and only
 * cached in memory; nothing derived from the proprietary data is committed.
 */
import { DgdsRuntime } from '../../../dgds/scripting/runtime.mjs';
import { createSoftwareSurface } from '../../../dgds/scripting/surface.mjs';
import { createTimingCompatibility } from '../../../dgds/scripting/timing-compatibility.mjs';
import { createBrowserFramePresenter } from '../../../dgds/hosts/browser-frame-presenter.mjs';
import { createBrowserPresentationPolicy } from '../../../dgds/hosts/browser-presentation-policy.mjs';
import { drawBackground } from '../../../dgds/scripting/frame-renderer.mjs';
import { DGDS_TICK_MS } from '../../../dgds/scripting/timing.mjs';
import { createJohnnyIslandPresentationState } from '../island-presenter.mjs';
import { johnnyCastaway } from '../manifest.mjs';

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 480;

// The app's own palette (scene-flow-panel.mjs, settings.mjs): parchment and
// brown for paper, island blue with cyan and yellow for the screen.
export const PALETTE = Object.freeze({
    paper: '#d4c4a8',
    paperShade: '#bfa982',
    brown: '#8b5a2b',
    ink: '#302816',
    blue: '#071998',
    blueMid: '#12339c',
    blueDeep: '#06146c',
    cyan: '#66d8e8',
    yellow: '#ffe02d',
    cream: '#fffbe2',
});
const P = PALETTE;
export const CARD_FONT = "'VT323', monospace";

// How long (in game ticks) to search a gag for a good frame. 20 ms ticks, so
// 750 ticks is 15 s of game time. Ticks run in small slices between frames.
const MAX_TICKS = 750;
const SLICE_TICKS = 25;
const SAMPLE_EVERY = 10;
// Once Johnny (or anything) is on screen, keep watching this long for a busier frame.
const SETTLE_TICKS = 150;
const MIN_OPAQUE = 900;

const canvas2d = (width, height, options = undefined) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, context: canvas.getContext('2d', options) };
};

/** Opaque-pixel count and bounding box of a 640x480 foreground. */
const measure = (context) => {
    const { data } = context.getImageData(0, 0, 640, 480);
    let count = 0;
    let minX = 640;
    let minY = 480;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < 480; y += 2) {
        for (let x = 0; x < 640; x += 2) {
            if (!data[(y * 640 + x) * 4 + 3]) continue;
            count++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    return { count: count * 4, box: maxX < 0 ? null : { minX, minY, maxX, maxY } };
};

/**
 * Run one gag offscreen and keep its busiest early frame, cropped around the
 * action. Resolves to a canvas, or null if the gag can't run here.
 */
function captureGagFrame({ resolveEntry, sequenceTools, script, tagId, storyDay, isCancelled }) {
    return new Promise((resolve) => {
        let background;
        let foreground;
        let runtime;
        let presenter;
        try {
            background = canvas2d(640, 480);
            foreground = canvas2d(640, 480, { willReadFrequently: true });
            if (!background.context || !foreground.context) {
                resolve(null);
                return;
            }
            const data = resolveEntry(script);
            if (!data) {
                resolve(null);
                return;
            }
            const resourceProvider = { resolve: resolveEntry };
            const policy = createBrowserPresentationPolicy();
            const titleState = sequenceTools?.preview?.(script, tagId, { storyDay })?.titleState;
            const island = createJohnnyIslandPresentationState({ game: johnnyCastaway, resourceProvider });
            island.titleState = titleState;
            drawBackground(island, background.context, policy);
            presenter = createBrowserFramePresenter({
                context: foreground.context,
                mainContext: background.context,
                presentationPolicy: policy,
                backgroundDecorator: (state, context) => {
                    if (!state.bkgScreen && !state.bkgOcean?.length) drawBackground(island, context, policy);
                },
            });
            runtime = new DgdsRuntime({
                type: 'ADS', data, adsSceneTag: tagId, singleAdsScene: true,
                resourceProvider, game: johnnyCastaway, titleState,
                hostManagedTransitions: true, random: Math.random,
                surfaceFactory: createSoftwareSurface,
                timingCompatibility: createTimingCompatibility(),
            });
        } catch {
            resolve(null);
            return;
        }

        const best = canvas2d(640, 480);
        let bestCount = 0;
        let bestBox = null;
        let ticks = 0;
        let firstSeenAt = null;

        const finish = () => {
            if (!bestBox) {
                resolve(null);
                return;
            }
            resolve(crop(best.canvas, bestBox));
        };

        const slice = () => {
            if (isCancelled()) {
                resolve(null);
                return;
            }
            try {
                for (let step = 0; step < SLICE_TICKS && ticks < MAX_TICKS; step++, ticks++) {
                    const result = runtime.tick(DGDS_TICK_MS);
                    presenter.present(runtime.state, result.presentation);
                    if (ticks % SAMPLE_EVERY === 0) {
                        const { count, box } = measure(foreground.context);
                        if (count >= MIN_OPAQUE && count > bestCount) {
                            bestCount = count;
                            bestBox = box;
                            firstSeenAt ??= ticks;
                            best.context.clearRect(0, 0, 640, 480);
                            best.context.drawImage(background.canvas, 0, 0);
                            best.context.drawImage(foreground.canvas, 0, 0);
                        }
                    }
                    if (result.completed) {
                        finish();
                        return;
                    }
                }
            } catch {
                finish();
                return;
            }
            const settled = firstSeenAt !== null && ticks - firstSeenAt >= SETTLE_TICKS;
            if (ticks >= MAX_TICKS || settled) finish();
            else setTimeout(slice, 0);
        };
        setTimeout(slice, 0);
    });
}

// Crop a 640x480 frame to a window around the action, at the card's image aspect.
const IMAGE_ASPECT = 4 / 3;
function crop(source, box) {
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    let width = Math.max(240, (box.maxX - box.minX) * 1.5);
    let height = Math.max(width / IMAGE_ASPECT, (box.maxY - box.minY) * 1.4);
    width = Math.min(640, Math.max(width, height * IMAGE_ASPECT));
    height = Math.min(480, width / IMAGE_ASPECT);
    const x = Math.max(0, Math.min(640 - width, cx - width / 2));
    const y = Math.max(0, Math.min(480 - height, cy - height / 2));
    const out = canvas2d(Math.round(width), Math.round(height));
    out.context.imageSmoothingEnabled = false;
    out.context.drawImage(source, x, y, width, height, 0, 0, out.canvas.width, out.canvas.height);
    return out.canvas;
}

/**
 * A small queue that renders card thumbnails one at a time, so the panel stays
 * responsive while faces fill in. Results are cached for the page's lifetime.
 */
export function createCardFaceQueue({ resolveEntry, sequenceTools }) {
    const cache = new Map();
    const waiting = [];
    let running = false;
    let destroyed = false;

    const pump = async () => {
        if (running) return;
        running = true;
        while (waiting.length && !destroyed) {
            const job = waiting.shift();
            if (cache.has(job.key) && cache.get(job.key) !== 'pending') {
                job.resolve(cache.get(job.key));
                continue;
            }
            const frame = await captureGagFrame({ resolveEntry, sequenceTools, ...job.gag, isCancelled: () => destroyed });
            cache.set(job.key, frame);
            for (const listener of job.listeners) listener(frame);
        }
        running = false;
    };

    return {
        /** Ask for a gag's frame; `onReady(canvas|null)` fires once it exists. */
        request(gag, onReady) {
            if (gag.script === 'POSE') {
                onReady(null);
                return;
            }
            const key = `${gag.script}:${gag.tagId}`;
            const cached = cache.get(key);
            if (cached !== undefined && cached !== 'pending') {
                onReady(cached);
                return;
            }
            const existing = waiting.find((job) => job.key === key);
            if (existing) {
                existing.listeners.push(onReady);
                return;
            }
            cache.set(key, 'pending');
            waiting.push({ key, gag, listeners: [onReady], resolve: onReady });
            pump();
        },
        /** Move a gag to the front of the queue (e.g. the live card). */
        prioritize(gag) {
            const key = `${gag.script}:${gag.tagId}`;
            const index = waiting.findIndex((job) => job.key === key);
            if (index > 0) waiting.unshift(...waiting.splice(index, 1));
        },
        destroy() {
            destroyed = true;
            waiting.length = 0;
        },
    };
}

const wrap = (context, text, maxWidth, maxLines) => {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (context.measureText(next).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}…`;
    }
    return lines;
};

// Square, pixel-style frame like the panel's buttons and inspector.
const frame = (context, { fill, border, inner, width = 6 }) => {
    context.fillStyle = border;
    context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    context.fillStyle = fill;
    context.fillRect(width, width, CARD_WIDTH - width * 2, CARD_HEIGHT - width * 2);
    context.strokeStyle = inner;
    context.lineWidth = 2;
    context.strokeRect(width + 7, width + 7, CARD_WIDTH - (width + 7) * 2, CARD_HEIGHT - (width + 7) * 2);
};

/** The shared card back: an island-blue screen with a cyan sun over the sea. */
export function paintCardBack(context, { sealed = false } = {}) {
    const line = sealed ? '#3d6f9a' : P.cyan;
    frame(context, { fill: sealed ? P.blueDeep : P.blueMid, border: sealed ? '#2a3c78' : P.cyan, inner: line });
    // Scanlines, as on the panel's map.
    context.fillStyle = 'rgba(83,219,255,.10)';
    for (let y = 16; y < CARD_HEIGHT - 16; y += 8) context.fillRect(16, y, CARD_WIDTH - 32, 1);
    const cx = CARD_WIDTH / 2;
    const cy = CARD_HEIGHT / 2 - 24;
    context.strokeStyle = line;
    context.lineWidth = 3;
    for (let ray = 0; ray < 12; ray++) {
        const angle = (ray / 12) * Math.PI * 2;
        context.beginPath();
        context.moveTo(cx + Math.cos(angle) * 40, cy + Math.sin(angle) * 40);
        context.lineTo(cx + Math.cos(angle) * (ray % 2 ? 60 : 78), cy + Math.sin(angle) * (ray % 2 ? 60 : 78));
        context.stroke();
    }
    context.fillStyle = sealed ? '#3d6f9a' : P.yellow;
    context.beginPath();
    context.arc(cx, cy, 30, 0, Math.PI * 2);
    context.fill();
    for (let wave = 0; wave < 3; wave++) {
        const y = cy + 118 + wave * 18;
        context.beginPath();
        for (let x = 44; x <= CARD_WIDTH - 44; x += 4) {
            const yy = y + Math.sin((x + wave * 11) / 11) * 4;
            if (x === 44) context.moveTo(x, yy);
            else context.lineTo(x, yy);
        }
        context.stroke();
    }
}

/**
 * Paint a card face: parchment card, real frame in a window, gag name below,
 * flag glyphs in the corners (☾ ends a visit, ✦N key scene for day N).
 */
export function paintCardFace(context, { name, kicker, image = null, final = false, keyDay = null, sealed = false, live = false }) {
    frame(context, {
        fill: P.paper,
        border: live ? P.yellow : P.brown,
        inner: live ? P.brown : P.paperShade,
        width: live ? 10 : 6,
    });
    const windowX = 26;
    const windowY = 56;
    const windowW = CARD_WIDTH - 52;
    const windowH = Math.round(windowW * 0.82);
    context.fillStyle = P.blue;
    context.fillRect(windowX, windowY, windowW, windowH);
    if (image) {
        context.save();
        context.beginPath();
        context.rect(windowX, windowY, windowW, windowH);
        context.clip();
        context.imageSmoothingEnabled = false;
        const scale = Math.max(windowW / image.width, windowH / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        context.drawImage(image, windowX + (windowW - w) / 2, windowY + (windowH - h) / 2, w, h);
        context.restore();
    } else {
        context.fillStyle = P.cyan;
        context.font = `64px ${CARD_FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(name === 'Johnny pauses' ? '…' : '?', windowX + windowW / 2, windowY + windowH / 2);
    }
    context.strokeStyle = P.brown;
    context.lineWidth = 4;
    context.strokeRect(windowX, windowY, windowW, windowH);

    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = P.brown;
    context.font = `30px ${CARD_FONT}`;
    context.fillText((kicker || '').toUpperCase(), CARD_WIDTH / 2, 44);

    context.fillStyle = P.ink;
    context.font = `44px ${CARD_FONT}`;
    const lines = wrap(context, name.toUpperCase(), CARD_WIDTH - 48, 3);
    const top = windowY + windowH + 46;
    lines.forEach((line, index) => context.fillText(line, CARD_WIDTH / 2, top + index * 38));

    context.font = `34px ${CARD_FONT}`;
    context.fillStyle = P.brown;
    if (final) {
        context.textAlign = 'left';
        context.fillText('☾', 24, CARD_HEIGHT - 22);
    }
    if (keyDay) {
        context.textAlign = 'right';
        context.fillText(`✦${keyDay}`, CARD_WIDTH - 24, CARD_HEIGHT - 22);
    }
    if (sealed) {
        context.fillStyle = 'rgba(6,20,108,.5)';
        context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        // A stamp across the picture, so a sealed card reads as sealed at a glance.
        context.save();
        context.translate(CARD_WIDTH / 2, windowY + windowH / 2);
        context.rotate(-0.18);
        context.fillStyle = 'rgba(212,196,168,.92)';
        context.fillRect(-118, -30, 236, 60);
        context.strokeStyle = '#9a3412';
        context.lineWidth = 4;
        context.strokeRect(-112, -24, 224, 48);
        context.fillStyle = '#9a3412';
        context.font = `44px ${CARD_FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('SEALED', 0, 2);
        context.restore();
    }
}

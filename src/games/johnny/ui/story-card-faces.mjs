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

export const CARD_WIDTH = 256;
export const CARD_HEIGHT = 384;

export const GOLD = '#c9a45c';
const GOLD_DIM = '#6f5a33';
const INK = '#0b0f1c';
const PARCHMENT = '#efe3c4';

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

const roundRect = (context, x, y, width, height, radius) => {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
};

const wrap = (context, text, maxWidth) => {
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
    return lines.slice(0, 3);
};

const frame = (context, colour) => {
    context.fillStyle = INK;
    roundRect(context, 0, 0, CARD_WIDTH, CARD_HEIGHT, 14);
    context.fill();
    context.strokeStyle = colour;
    context.lineWidth = 3;
    roundRect(context, 8, 8, CARD_WIDTH - 16, CARD_HEIGHT - 16, 10);
    context.stroke();
    context.lineWidth = 1;
    roundRect(context, 15, 15, CARD_WIDTH - 30, CARD_HEIGHT - 30, 7);
    context.stroke();
};

/** The shared card back: a gold sun over a sea, drawn rather than stored. */
export function paintCardBack(context, { sealed = false } = {}) {
    const colour = sealed ? GOLD_DIM : GOLD;
    frame(context, colour);
    const cx = CARD_WIDTH / 2;
    const cy = CARD_HEIGHT / 2 - 10;
    context.strokeStyle = colour;
    context.lineWidth = 1.5;
    for (let ray = 0; ray < 16; ray++) {
        const angle = (ray / 16) * Math.PI * 2;
        context.beginPath();
        context.moveTo(cx + Math.cos(angle) * 30, cy + Math.sin(angle) * 30);
        context.lineTo(cx + Math.cos(angle) * (ray % 2 ? 48 : 64), cy + Math.sin(angle) * (ray % 2 ? 48 : 64));
        context.stroke();
    }
    context.beginPath();
    context.arc(cx, cy, 24, 0, Math.PI * 2);
    context.stroke();
    // Palm-and-island glyph in the sun.
    context.beginPath();
    context.ellipse(cx, cy + 12, 16, 4, 0, Math.PI, 0);
    context.moveTo(cx, cy + 9);
    context.quadraticCurveTo(cx + 3, cy - 2, cx - 1, cy - 12);
    context.stroke();
    for (let wave = 0; wave < 3; wave++) {
        const y = cy + 92 + wave * 12;
        context.beginPath();
        for (let x = 40; x <= CARD_WIDTH - 40; x += 4) {
            const yy = y + Math.sin((x + wave * 9) / 9) * 2.5;
            if (x === 40) context.moveTo(x, yy);
            else context.lineTo(x, yy);
        }
        context.stroke();
    }
}

/**
 * Paint a card face: real frame in a window, gag name below, flag glyphs in
 * the corners (☾ final scene, ✦ key scene for a story day).
 */
export function paintCardFace(context, { name, kicker, image = null, final = false, keyDay = null, sealed = false, live = false }) {
    const colour = sealed ? GOLD_DIM : GOLD;
    frame(context, live ? '#ffd77a' : colour);
    const windowX = 24;
    const windowY = 40;
    const windowW = CARD_WIDTH - 48;
    const windowH = Math.round(windowW * 0.75 + 30);
    context.save();
    roundRect(context, windowX, windowY, windowW, windowH, 6);
    context.clip();
    context.fillStyle = '#10204a';
    context.fillRect(windowX, windowY, windowW, windowH);
    if (image) {
        context.imageSmoothingEnabled = false;
        const scale = Math.max(windowW / image.width, windowH / image.height);
        const w = image.width * scale;
        const h = image.height * scale;
        context.drawImage(image, windowX + (windowW - w) / 2, windowY + (windowH - h) / 2, w, h);
    } else {
        context.fillStyle = 'rgba(201,164,92,.35)';
        context.font = '42px Georgia, serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('☀', windowX + windowW / 2, windowY + windowH / 2);
    }
    if (sealed) {
        context.fillStyle = 'rgba(5,8,18,.62)';
        context.fillRect(windowX, windowY, windowW, windowH);
    }
    context.restore();
    context.strokeStyle = colour;
    context.lineWidth = 1;
    roundRect(context, windowX, windowY, windowW, windowH, 6);
    context.stroke();

    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = colour;
    context.font = '600 13px Georgia, serif';
    context.fillText((kicker || '').toUpperCase(), CARD_WIDTH / 2, 30);

    context.fillStyle = sealed ? '#8d8270' : PARCHMENT;
    context.font = '22px Georgia, serif';
    const lines = wrap(context, name, CARD_WIDTH - 52);
    const top = windowY + windowH + 36;
    lines.forEach((line, index) => context.fillText(line, CARD_WIDTH / 2, top + index * 26));

    context.font = '18px Georgia, serif';
    context.fillStyle = colour;
    if (final) {
        context.textAlign = 'left';
        context.fillText('☾', 22, CARD_HEIGHT - 22);
    }
    if (keyDay) {
        context.textAlign = 'right';
        context.fillText(`✦ ${keyDay}`, CARD_WIDTH - 22, CARD_HEIGHT - 22);
    }
}

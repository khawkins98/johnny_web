/**
 * story-card-faces.mjs — painted card faces for the story timeline.
 *
 * Each gag card shows a real frame of that gag, rendered by running it in its
 * own silent offscreen DGDS runtime (the same pipeline scene-flow-preview.mjs
 * uses). Frames are made in the browser from the user's own game data and
 * cached in that browser (IndexedDB); nothing derived from the proprietary data
 * is committed or shipped. Until a frame exists, a card shows an original
 * pixel icon for its gag family.
 */
import { DgdsRuntime } from '../../../dgds/scripting/runtime.mjs';
import { createSoftwareSurface } from '../../../dgds/scripting/surface.mjs';
import { createTimingCompatibility } from '../../../dgds/scripting/timing-compatibility.mjs';
import { createBrowserFramePresenter } from '../../../dgds/hosts/browser-frame-presenter.mjs';
import { createBrowserPresentationPolicy } from '../../../dgds/hosts/browser-presentation-policy.mjs';
import { DGDS_TICK_MS } from '../../../dgds/scripting/timing.mjs';
import { withHostBackground } from '../../../bottle/host-background.mjs';
import { createJohnnyIslandPresentationState, createPreviewHostPainter } from '../island-presenter.mjs';
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
// 750 ticks is 15 s of game time.
const MAX_TICKS = 750;
const SAMPLE_EVERY = 15;
// Once Johnny (or anything) is on screen, keep watching this long for a busier frame.
const SETTLE_TICKS = 150;
const MIN_OPAQUE = 900;
// A candidate picture must be mostly lit. Some gags open on a "meanwhile" clock
// over black, which is the busiest early frame but a poor picture.
const MIN_LIT = 0.35;
// ...and its drawn layer mostly not black: the "meanwhile" clock sits in a
// black box over the sea, so the frame is lit but the box is most of the drawing.
const MAX_DARK = 0.5;
// Ticks run in short slices so the game behind the panel keeps animating.
const SLICE_BUDGET_MS = 6;

const canvas2d = (width, height, options = undefined) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, context: canvas.getContext('2d', options) };
};

const CPU = Object.freeze({ willReadFrequently: true });
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const nextSlice = (fn) => (typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout: 250 })
    : setTimeout(fn, 16));

/** Opaque-pixel count and bounding box of a 640x480 foreground. */
const measure = (data) => {
    let count = 0;
    let dark = 0;
    let minX = 640;
    let minY = 480;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < 480; y += 2) {
        for (let x = 0; x < 640; x += 2) {
            const i = (y * 640 + x) * 4;
            if (!data[i + 3]) continue;
            count++;
            if (data[i] + data[i + 1] + data[i + 2] <= 40) dark++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    return { count: count * 4, darkShare: count ? dark / count : 0, box: maxX < 0 ? null : { minX, minY, maxX, maxY } };
};

/** Bounds of the lit part of the background (a framed scene inside black). */
const litBounds = (background) => {
    let minX = 640;
    let minY = 480;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < 480; y += 4) {
        for (let x = 0; x < 640; x += 4) {
            const i = (y * 640 + x) * 4;
            if (background[i] + background[i + 1] + background[i + 2] <= 40) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x + 3;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y + 3;
        }
    }
    return maxX < 0 ? null : { minX, minY, maxX, maxY };
};

/**
 * Share of a window of the composed frame that isn't (near) black, sampled on
 * a grid. Reads the two layers directly rather than composing them first.
 * Only the window that becomes the card picture counts: some scenes (Suzy's
 * beach, Johnny's office) are a small framed picture inside a black screen.
 */
const litFraction = (foreground, background, window) => {
    const isLit = (data, i) => data[i] + data[i + 1] + data[i + 2] > 40;
    let lit = 0;
    let total = 0;
    for (let y = window.y; y < window.y + window.height; y += 4) {
        for (let x = window.x; x < window.x + window.width; x += 4) {
            const i = (y * 640 + x) * 4;
            total++;
            if (foreground[i + 3] ? isLit(foreground, i) : isLit(background, i)) lit++;
        }
    }
    return lit / total;
};

/**
 * Run one gag offscreen and keep its busiest early frame, cropped around the
 * action. Resolves to a canvas, or null if the gag can't run here or never
 * shows a usable frame.
 */
function captureGagFrame({ resolveEntry, sequenceTools, script, tagId, storyDay, isCancelled }) {
    return new Promise((resolve) => {
        let background;
        let foreground;
        let runtime;
        let presenter;
        try {
            background = canvas2d(640, 480, CPU);
            foreground = canvas2d(640, 480, CPU);
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
            const paintHost = createPreviewHostPainter({ island, presentationPolicy: policy });
            paintHost(background.context);
            presenter = createBrowserFramePresenter({
                context: foreground.context,
                mainContext: background.context,
                presentationPolicy: policy,
                backgroundDecorator: withHostBackground({
                    presentHost: paintHost,
                    backgroundDecorator: null,
                }),
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

        const best = canvas2d(640, 480, CPU);
        let bestCount = 0;
        let bestBox = null;
        let bestBounds = null;
        let ticks = 0;
        let firstSeenAt = null;

        const finish = () => resolve(bestBox ? crop(best.canvas, bestBox, bestBounds) : null);
        const consider = () => {
            const front = foreground.context.getImageData(0, 0, 640, 480).data;
            const { count, darkShare, box } = measure(front);
            if (count < MIN_OPAQUE || count <= bestCount || darkShare > MAX_DARK) return;
            const back = background.context.getImageData(0, 0, 640, 480).data;
            const bounds = litBounds(back);
            if (litFraction(front, back, cropWindow(box, bounds)) < MIN_LIT) return;
            bestCount = count;
            bestBox = box;
            bestBounds = bounds;
            firstSeenAt ??= ticks;
            best.context.clearRect(0, 0, 640, 480);
            best.context.drawImage(background.canvas, 0, 0);
            best.context.drawImage(foreground.canvas, 0, 0);
        };

        const slice = () => {
            if (isCancelled()) {
                resolve(null);
                return;
            }
            const started = now();
            try {
                while (ticks < MAX_TICKS && now() - started < SLICE_BUDGET_MS) {
                    const result = runtime.tick(DGDS_TICK_MS);
                    presenter.present(runtime.state, result.presentation);
                    if (ticks % SAMPLE_EVERY === 0) consider();
                    ticks++;
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
            else nextSlice(slice);
        };
        nextSlice(slice);
    });
}

// The card's picture window, in card pixels. Frames are cropped to exactly
// this size from the 640x480 game frame, so they are drawn 1:1. The game art
// is dithered: any fractional nearest-neighbour resize breaks the dither into
// moire stripes. Shrinking the finished card is left to the browser's smooth
// downscale, which averages the dither into its intended colour.
export const IMAGE_WIDTH = CARD_WIDTH - 52;
export const IMAGE_HEIGHT = Math.round(IMAGE_WIDTH * 0.82);

/**
 * The picture-sized window of the 640x480 frame centred on the action, kept
 * inside the lit background when that is big enough to hold it.
 */
export function cropWindow(box, bounds = null) {
    const place = (centre, size, low, high) => {
        const [min, max] = high - low + 1 >= size ? [low, high + 1 - size] : [0, (size === IMAGE_WIDTH ? 640 : 480) - size];
        return Math.round(Math.max(min, Math.min(max, centre - size / 2)));
    };
    const x = place((box.minX + box.maxX) / 2, IMAGE_WIDTH, bounds?.minX ?? 0, bounds?.maxX ?? 639);
    const y = place((box.minY + box.maxY) / 2, IMAGE_HEIGHT, bounds?.minY ?? 0, bounds?.maxY ?? 479);
    return { x, y, width: IMAGE_WIDTH, height: IMAGE_HEIGHT };
}

/** Crop a native-resolution window around the action. No resampling. */
function crop(source, box, bounds) {
    const { x, y } = cropWindow(box, bounds);
    const out = canvas2d(IMAGE_WIDTH, IMAGE_HEIGHT);
    out.context.drawImage(source, x, y, IMAGE_WIDTH, IMAGE_HEIGHT, 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
    return out.canvas;
}

// Card pictures are kept in this browser's IndexedDB, beside the game data the
// user imported, so each gag is rendered once rather than on every visit.
// Bump CACHE_VERSION when the capture rules change so old pictures are redone.
const CACHE_VERSION = 5;
const DB_NAME = 'jc-card-faces';
const STORE = 'faces';
const NONE = 'none';

/** A tiny IndexedDB key/value store. Every failure degrades to "not cached". */
export function createFaceStore() {
    let opening = null;
    const open = () => {
        if (typeof indexedDB === 'undefined') return Promise.resolve(null);
        opening ??= new Promise((resolve) => {
            try {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => request.result.createObjectStore(STORE);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(null);
                request.onblocked = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
        return opening;
    };
    const run = async (mode, action) => {
        const db = await open();
        if (!db) return undefined;
        return new Promise((resolve) => {
            try {
                const request = action(db.transaction(STORE, mode).objectStore(STORE));
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(undefined);
            } catch {
                resolve(undefined);
            }
        });
    };
    return {
        /** A cached picture (ImageBitmap), null for "no usable frame", or undefined if not cached. */
        async get(key) {
            const value = await run('readonly', (store) => store.get(key));
            if (value === NONE) return null;
            if (!(value instanceof Blob) || typeof createImageBitmap !== 'function') return undefined;
            try {
                return await createImageBitmap(value);
            } catch {
                return undefined;
            }
        },
        async put(key, canvas) {
            if (!canvas) {
                await run('readwrite', (store) => store.put(NONE, key));
                return;
            }
            const blob = await new Promise((resolve) => {
                try {
                    canvas.toBlob(resolve, 'image/png');
                } catch {
                    resolve(null);
                }
            });
            if (blob) await run('readwrite', (store) => store.put(blob, key));
        },
    };
}

/**
 * Renders card pictures one at a time, cheapest first: memory, then this
 * browser's cache, then a fresh offscreen run. Requests for cards that have
 * left the screen (`wanted()` false) are dropped before they cost anything.
 */
export function createCardFaceQueue({ resolveEntry, sequenceTools, store = createFaceStore() }) {
    const memory = new Map();
    const jobs = new Map();
    const order = [];
    let running = false;
    let destroyed = false;
    const keyOf = (gag) => `${gag.script}:${gag.tagId}`;
    const storeKey = (key) => `${CACHE_VERSION}:${IMAGE_WIDTH}x${IMAGE_HEIGHT}:${key}`;

    const pump = async () => {
        if (running) return;
        running = true;
        while (order.length && !destroyed) {
            const key = order.shift();
            const job = jobs.get(key);
            if (!job) continue;
            for (const listener of [...job.listeners]) if (!listener.wanted()) job.listeners.delete(listener);
            if (!job.listeners.size) {
                jobs.delete(key);
                continue;
            }
            let image = await store.get(storeKey(key));
            if (image === undefined) {
                image = await captureGagFrame({ resolveEntry, sequenceTools, ...job.gag, isCancelled: () => destroyed });
                if (!destroyed) store.put(storeKey(key), image);
            }
            if (destroyed) break;
            memory.set(key, image);
            jobs.delete(key);
            for (const listener of job.listeners) listener.onReady(image);
        }
        running = false;
    };

    return {
        /** Ask for a gag's picture; `onReady(image|null)` fires once it exists. */
        request(gag, onReady, { wanted = () => true } = {}) {
            if (gag.script === 'POSE') {
                onReady(null);
                return;
            }
            const key = keyOf(gag);
            if (memory.has(key)) {
                onReady(memory.get(key));
                return;
            }
            const listener = { onReady, wanted };
            const job = jobs.get(key);
            if (job) {
                job.listeners.add(listener);
                if (!order.includes(key)) order.push(key);
                return;
            }
            jobs.set(key, { gag, listeners: new Set([listener]) });
            order.push(key);
            pump();
        },
        /** Move a gag to the front of the queue (e.g. the chosen card). */
        prioritize(gag) {
            const key = keyOf(gag);
            const index = order.indexOf(key);
            if (index > 0) order.unshift(...order.splice(index, 1));
        },
        destroy() {
            destroyed = true;
            order.length = 0;
            jobs.clear();
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

// Original 12x12 pixel icons, one per gag family (the ADS script a gag lives
// in). Shown while a card's real frame renders, or when a gag has no usable
// frame. Drawn at a whole-number scale so the pixels stay square.
const ICON_COLOURS = {
    Y: P.yellow, W: P.cream, C: P.cyan, B: P.brown, R: '#d8432c', O: '#f08a24', G: '#3fae4a', K: P.ink,
};
const FAMILY_ICONS = {
    FISHING: [
        '............', '............', '....CCCC...C', '..CCCCCCC.CC', '.CKCCCCCCCCC', '.CCCCCCCCCCC',
        '..CCCCCCC.CC', '....CCCC...C', '............', '...W........', '..W.W.......', '...W........',
    ],
    BUILDING: [
        '............', '.....R......', '....RR......', '....RRR.....', '...RRORR....', '...ROYORR...',
        '..RROYYORR..', '..ROYYYYOR..', '..ROYYYYOR..', '...ROYYOR...', '..BBBBBBBB..', '.BB.B..B.BB.',
    ],
    VISITOR: [
        '............', '.....W......', '.....WW.....', '.....WWW....', '.....WWWW...', '.....WWWWW..',
        '.....B......', 'RRRRRRRRRRR.', '.RWWWWWWWR..', '..RRRRRRR...', 'CCCCCCCCCCCC', '.C.C.C.C.C.C',
    ],
    MARY: [
        '............', '............', '..RR....RR..', '.RRRR..RRRR.', 'RRRRRRRRRRRR', 'RRWRRRRRRRRR',
        'RRRRRRRRRRRR', '.RRRRRRRRRR.', '..RRRRRRRR..', '...RRRRRR...', '....RRRR....', '.....RR.....',
    ],
    SUZY: [
        '............', '..W.........', '..W.....W...', '.WWW....WW..', '.WYW.WW.WW..', '.WWW.WY.WWW.',
        '.WYWWWWWWYW.', 'WWWWWYWWWWWW', 'WYWWWWWYWWYW', 'WWWWWWWWWWWW', 'CCCCCCCCCCCC', '............',
    ],
    JOHNNY: [
        '..........BB', '.........BB.', '........GG..', '.......GGG..', '......GWWG..', '.....GWWG...',
        '....GWWG....', '...GWWG.....', '..GGGG......', '..GGG.......', '............', 'CCCCCCCCCCCC',
    ],
    ACTIVITY: [
        '.....Y......', '..Y..Y..Y...', '...Y...Y....', '....YYY.....', 'YY.YYYYY.YY.', '....YYY.....',
        '...Y...Y....', '..Y..Y..Y...', '.....Y......', '............', 'CCCCCCCCCCCC', 'C.C.C.C.C.C.',
    ],
    WALKSTUF: [
        '............', '.........W..', '........WWW.', '........WWW.', '..W......W..', '.WWW........',
        '.WWW.....W..', '..W.....WWW.', '........WWW.', '..W......W..', '.WWW........', '.WWW........',
    ],
    MISCGAG: [
        '.....Y......', '.....Y......', '....YYY.....', 'YYYYYYYYYYY.', '.YYYYYYYYY..', '..YYYYYYY...',
        '...YYYYY....', '..YYY.YYY...', '.YY.....YY..', 'Y.........Y.', '............', '............',
    ],
    PAUSE: [
        '............', '............', '............', '............', '............', '............',
        '.WW..WW..WW.', '.WW..WW..WW.', '............', '............', '............', '............',
    ],
};
export const familyOf = (script) => {
    if (!script || script === 'POSE' || script === 'STAND.ADS') return 'PAUSE';
    const family = script.replace(/\.ADS$/, '');
    return FAMILY_ICONS[family] ? family : 'MISCGAG';
};

function paintFamilyIcon(context, x, y, width, height, script) {
    const rows = FAMILY_ICONS[familyOf(script)];
    const scale = Math.floor(Math.min(width, height) * 0.7 / 12);
    const left = x + Math.round((width - 12 * scale) / 2);
    const top = y + Math.round((height - 12 * scale) / 2);
    rows.forEach((row, rowIndex) => {
        [...row].forEach((cell, column) => {
            const colour = ICON_COLOURS[cell];
            if (!colour) return;
            context.fillStyle = colour;
            context.fillRect(left + column * scale, top + rowIndex * scale, scale, scale);
        });
    });
}

/**
 * Paint a card face: parchment card, real frame in a window, gag name below,
 * flag glyphs in the corners (☾ ends a visit, ✦N key scene for day N).
 */
export function paintCardFace(context, { name, kicker, image = null, script = null, final = false, keyDay = null, sealed = false, live = false }) {
    frame(context, {
        fill: P.paper,
        border: live ? P.yellow : P.brown,
        inner: live ? P.brown : P.paperShade,
        width: live ? 10 : 6,
    });
    const windowX = 26;
    const windowY = 56;
    const windowW = IMAGE_WIDTH;
    const windowH = IMAGE_HEIGHT;
    context.fillStyle = P.blue;
    context.fillRect(windowX, windowY, windowW, windowH);
    if (image) {
        context.save();
        context.beginPath();
        context.rect(windowX, windowY, windowW, windowH);
        context.clip();
        // Frames arrive at exactly the window size: draw them 1:1.
        context.imageSmoothingEnabled = false;
        context.drawImage(image, windowX + Math.round((windowW - image.width) / 2),
            windowY + Math.round((windowH - image.height) / 2));
        context.restore();
    } else {
        paintFamilyIcon(context, windowX, windowY, windowW, windowH, script);
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

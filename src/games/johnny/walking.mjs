import { buildSpriteCanvas } from '../../dgds/graphics.mjs';
import { DGDS_TICK_MS } from '../../dgds/scripting/timing.mjs';

const DATA_OFFSET = 0x188ea;
const DATA_ROWS = 480;
const BOOKMARKS = [
    [-1, 68, 38, -1, 0, 17],
    [109, -1, 133, -1, -1, -1],
    [163, 196, -1, 211, 224, 245],
    [-1, -1, 278, -1, 289, 302],
    [332, -1, 356, 381, -1, 394],
    [423, -1, 443, 457, 463, -1],
];
const TURNS = [91, 145, 260, 314, 405, 471];
const START_HEADINGS = [
    [-1, 6, 6, -1, 5, 5],
    [3, -1, 5, -1, -1, -1],
    [2, 1, -1, 3, 2, 2],
    [-1, -1, 7, -1, 2, 1],
    [1, -1, 7, 6, -1, 7],
    [2, -1, 6, 5, 3, -1],
];
const END_HEADINGS = [
    [-1, 7, 5, -1, 5, 5],
    [3, -1, 5, -1, -1, -1],
    [2, 1, -1, 4, 3, 3],
    [-1, -1, 7, -1, 2, 1],
    [1, -1, 6, 6, -1, 7],
    [2, -1, 6, 5, 3, -1],
];

/** Decode the original host's compact walking table without persisting a dump. */
export const decodeJohnnyWalkData = (archiveBuffer) => {
    if (!(archiveBuffer instanceof ArrayBuffer) || archiveBuffer.byteLength < DATA_OFFSET + DATA_ROWS * 6) {
        throw new TypeError('Johnny walking requires the original SCRANTIC.SCR archive');
    }
    const view = new DataView(archiveBuffer, DATA_OFFSET, DATA_ROWS * 6);
    return Array.from({ length: DATA_ROWS }, (_, index) => {
        const flagsAndFrame = view.getUint16(index * 6, true);
        return Object.freeze({
            flipX: Boolean(flagsAndFrame & 0x8000),
            frame: (flagsAndFrame & 0x7fff) - 1,
            x: view.getUint16(index * 6 + 2, true),
            y: view.getUint16(index * 6 + 4, true),
        });
    });
};

const enumerateSimplePaths = (from, to, path, visited, paths) => {
    if (from === to) {
        paths.push(path);
        return;
    }
    for (let next = 0; next < BOOKMARKS.length; next++) {
        if (BOOKMARKS[from][next] < 0 || visited.has(next)) continue;
        visited.add(next);
        enumerateSimplePaths(next, to, [...path, next], visited, paths);
        visited.delete(next);
    }
};

/** Select one non-repeating route through the recovered island bookmark graph. */
export const selectJohnnyWalkPath = (from, to, random = Math.random) => {
    if (!Number.isInteger(from) || !Number.isInteger(to) || !BOOKMARKS[from] || !BOOKMARKS[to]) return [];
    if (from === to) return [from];
    const paths = [];
    enumerateSimplePaths(from, to, [from], new Set([from]), paths);
    if (!paths.length) return [];
    const choice = Math.min(paths.length - 1, Math.max(0, Math.floor(random() * paths.length)));
    return paths[choice];
};

const appendTurn = (frames, data, spot, fromHeading, toHeading, waiting = false) => {
    let heading = fromHeading;
    let difference = (toHeading - heading) & 7;
    const increment = difference === 0 ? 0 : difference < 4 ? 1 : -1;
    while (heading !== toHeading) {
        heading = (heading + increment + 8) & 7;
        frames.push(data[TURNS[spot] + heading + (waiting ? 9 : 0)]);
    }
};

export const planJohnnyWalkFrames = (walk, data, random = Math.random) => {
    const path = selectJohnnyWalkPath(walk.fromSpot, walk.toSpot, random);
    if (!path.length || walk.fromHeading == null || walk.toHeading == null) return [];
    const frames = [];
    let heading = walk.fromHeading;
    for (let index = 0; index < path.length - 1; index++) {
        const from = path[index];
        const to = path[index + 1];
        appendTurn(frames, data, from, heading, START_HEADINGS[from][to]);
        for (let row = BOOKMARKS[from][to]; data[row]?.frame >= 0; row++) frames.push(data[row]);
        heading = END_HEADINGS[from][to];
    }
    // The original renders Johnny's CURRENT heading standing pose before he turns
    // in place at the destination (engine FUN_1018_06bf draws the current heading
    // every tick, then steps toward the target). Seed that pose so a destination
    // turn whose heading resolves to a hold sentinel (frame -1 -- the pure W/E
    // facings have no distinct standing sprite) still has a real sprite to show
    // and hold, instead of an all-invisible sequence that leaves Johnny absent for
    // the whole interlude. Only when an actual turn happens (heading changes), so a
    // stationary rest is unaffected.
    if (heading !== walk.toHeading) frames.push(data[TURNS[walk.toSpot] + 9 + heading]);
    appendTurn(frames, data, walk.toSpot, heading, walk.toHeading, true);
    frames.push(data[TURNS[walk.toSpot] + 9 + walk.toHeading]);
    return frames.filter(Boolean);
};

const delay = (milliseconds, { signal } = {}) =>
    new Promise((resolve) => {
        if (signal?.aborted) return resolve(false);
        let timer;
        const finish = (completed) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            resolve(completed);
        };
        const onAbort = () => finish(false);
        timer = setTimeout(() => finish(true), milliseconds);
        signal?.addEventListener('abort', onAbort, { once: true });
    });

/** Play the executable-owned walk between two ADS scenes. */
export const runJohnnyWalk = async ({
    walk,
    titleState,
    archiveBuffer,
    resourceProvider,
    context,
    presentBackground = null,
    wait = delay,
    signal = null,
    random = Math.random,
    record = null,
}) => {
    if (!walk || signal?.aborted) return false;
    const frames = planJohnnyWalkFrames(walk, decodeJohnnyWalkData(archiveBuffer), random);
    const sprites = resourceProvider.resolve('JOHNWALK.BMP');
    const background = resourceProvider.resolve('BACKGRND.BMP');
    const offsetX = titleState?.x || 0;
    const offsetY = titleState?.y || 0;
    const behindTree = (walk.fromSpot === 3 && walk.toSpot === 4) || (walk.fromSpot === 4 && walk.toSpot === 3);

    for (let index = 0; index < frames.length; index++) {
        const frame = frames[index];
        const image = sprites?.images?.[frame.frame];
        const hasVisiblePixels = Boolean(image?.pixels?.some((pixel) => pixel.a > 0));
        const sprite = hasVisiblePixels ? buildSpriteCanvas(image) : null;
        const visible = Boolean(sprite);
        record?.('walk-frame', {
            index,
            frame: frame.frame,
            x: frame.x + offsetX,
            y: frame.y + offsetY,
            flipX: frame.flipX,
            visible,
        });
        // Retain the preceding Johnny frame if the recovered table points at
        // an absent or fully transparent sprite. Clearing first would turn a
        // single bad authored/decode frame into a visible blink.
        if (visible) {
            context.clearRect(0, 0, 640, 480);
            presentBackground?.();
            context.save();
            if (frame.flipX) {
                context.translate(frame.x + offsetX + image.width, frame.y + offsetY);
                context.scale(-1, 1);
                context.drawImage(sprite, 0, 0);
            } else {
                context.drawImage(sprite, frame.x + offsetX, frame.y + offsetY);
            }
            context.restore();
        }
        if (visible && behindTree) {
            for (const [frameIndex, x, y] of [
                [13, 442, 148],
                [12, 365, 122],
            ]) {
                const image = background?.images?.[frameIndex];
                const sprite = image && buildSpriteCanvas(image);
                if (sprite) context.drawImage(sprite, x + offsetX, y + offsetY);
            }
        }
        const completed = await wait((index === frames.length - 1 ? 80 : 6) * DGDS_TICK_MS, { signal });
        if (signal?.aborted || completed === false) {
            context.clearRect(0, 0, 640, 480);
            return false;
        }
    }
    return true;
};

// Idle duration for a pure-pose scene (binary adsId 0xFF): Johnny just stands.
// The record carries no duration, so this is an authored idle -- tune as needed.
const POSE_IDLE_TICKS = 150; // ~3s at DGDS_TICK_MS

/** The standing sprite row for a pose at (spot, heading), from the walk sheet. */
export const johnnyPoseFrame = (data, spot, heading) => data[TURNS[spot] + 9 + heading];

/**
 * Play a pure-pose scene: Johnny stands at a spot facing a heading for a brief
 * idle, drawn from the walk sprite sheet with no ADS runtime. Pure engine pose
 * (binary adsId 0xFF). A pose is normally reached via a walk interlude that has
 * already left Johnny standing at the spot/heading; for the pure W/E facings
 * (heading 2/6) the standing row is the -1 "hold" sentinel, so -- exactly as the
 * walk interlude does -- an invisible frame RETAINS what is already on the canvas
 * rather than clearing to a blink.
 */
export const runJohnnyPose = async ({
    pose,
    titleState,
    archiveBuffer,
    resourceProvider,
    context,
    presentBackground = null,
    wait = delay,
    signal = null,
    record = null,
    idleTicks = POSE_IDLE_TICKS,
}) => {
    if (!pose || signal?.aborted) return false;
    const data = decodeJohnnyWalkData(archiveBuffer);
    const frame = johnnyPoseFrame(data, pose.spot, pose.heading);
    const sprites = resourceProvider.resolve('JOHNWALK.BMP');
    const offsetX = titleState?.x || 0;
    const offsetY = titleState?.y || 0;
    const image = frame && frame.frame >= 0 ? sprites?.images?.[frame.frame] : null;
    const hasVisiblePixels = Boolean(image?.pixels?.some((pixel) => pixel.a > 0));
    const sprite = hasVisiblePixels ? buildSpriteCanvas(image) : null;
    const visible = Boolean(sprite);
    record?.('pose-frame', {
        spot: pose.spot,
        heading: pose.heading,
        frame: frame?.frame ?? -1,
        x: (frame?.x ?? 0) + offsetX,
        y: (frame?.y ?? 0) + offsetY,
        flipX: Boolean(frame?.flipX),
        visible,
    });
    if (visible) {
        context.clearRect(0, 0, 640, 480);
        presentBackground?.();
        context.save();
        if (frame.flipX) {
            context.translate(frame.x + offsetX + image.width, frame.y + offsetY);
            context.scale(-1, 1);
            context.drawImage(sprite, 0, 0);
        } else {
            context.drawImage(sprite, frame.x + offsetX, frame.y + offsetY);
        }
        context.restore();
    }
    const completed = await wait(idleTicks * DGDS_TICK_MS, { signal });
    if (signal?.aborted || completed === false) {
        context.clearRect(0, 0, 640, 480);
        return false;
    }
    return true;
};

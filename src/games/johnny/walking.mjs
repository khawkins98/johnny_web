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
        const sprite = image && buildSpriteCanvas(image);
        context.clearRect(0, 0, 640, 480);
        presentBackground?.();
        if (sprite) {
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
        if (behindTree) {
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

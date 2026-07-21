#!/usr/bin/env node
/**
 * Headless conformance capture for Johnny's historically fragile sequences.
 *
 * Proprietary game data stays in public/data and is never written to the
 * golden. The committed artifact contains only logical operations, retained
 * layer identities, and deterministic software-framebuffer fingerprints.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { johnnyCastaway } from '../src/games/johnny/manifest.mjs';
import { loadResources } from '../src/dgds/resource.mjs';
import { createEntryResourceProvider } from '../src/dgds/resource-provider.mjs';
import { composeTtmFrame, getCompositionRevision } from '../src/dgds/scripting/composition.mjs';
import { DgdsRuntime } from '../src/dgds/scripting/runtime.mjs';
import { DGDS_TICK_MS } from '../src/dgds/scripting/timing.mjs';
import { createSoftwareSurface } from '../src/dgds/scripting/surface.mjs';
import { createTimingCompatibility } from '../src/dgds/scripting/timing-compatibility.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = path.join(root, 'public', 'data');
const goldenPath = path.join(root, 'test', 'goldens', 'johnny-rendering.jsonl');
const update = process.argv.includes('--update');

const scenarioDefinitions = Object.freeze([
    {
        id: 'dive-walk-out',
        gag: 1,
        includes: (layers) => layers.some((layer) => layer[0] === 2 && layer[1] === 2),
    },
    {
        id: 'gull-landing',
        gag: 1,
        includes: (layers) => layers.some((layer) => layer[0] === 1 && layer[1] === 13),
    },
    {
        id: 'bathing',
        gag: 11,
        includes: () => true,
    },
    {
        id: 'concurrent-bathing-layers',
        gag: 11,
        includes: (layers) => layers.filter((layer) => layer[2] === 'r').length > 1,
    },
]);

const asArrayBuffer = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const seededRandom = (initialSeed) => {
    let seed = initialSeed >>> 0;
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
};
const layerSnapshot = (state) =>
    [...state.scenes]
        .sort((left, right) => {
            const leftOrder = left.paintOrder || {};
            const rightOrder = right.paintOrder || {};
            return (
                (leftOrder.resource ?? 0) - (rightOrder.resource ?? 0) ||
                (leftOrder.sequence ?? 0) - (rightOrder.sequence ?? 0)
            );
        })
        .map((scene) => [scene.sceneIdx, scene.tagId, scene.lifecycle[0], scene.state?.layerRevision || 0]);

const compactFrameOperation = (operation) => {
    const identity = [operation.type, operation.sceneIdx, operation.tagId];
    switch (operation.type) {
        case 'draw-sprite':
            return [...identity, operation.slot, operation.frame, operation.x, operation.y, operation.flipX ? 1 : 0];
        case 'begin-scene-frame':
            return [...identity, operation.restoreSlot];
        case 'store-area':
        case 'save-image-region':
            return [
                ...identity,
                operation.slot,
                operation.rect.x,
                operation.rect.y,
                operation.rect.width,
                operation.rect.height,
            ];
        case 'draw-line':
            return [...identity, operation.x1, operation.y1, operation.x2, operation.y2];
        case 'fill-rect':
            return [...identity, operation.x, operation.y, operation.width, operation.height];
        case 'fill-circle':
            return [...identity, operation.x, operation.y, operation.radius];
        default:
            return identity;
    }
};

const compactPixels = (pixels) => [
    pixels.hash,
    pixels.pixels,
    ...(pixels.bounds ? [pixels.bounds.x, pixels.bounds.y, pixels.bounds.width, pixels.bounds.height] : []),
];

const captureGag = ({ archive, data, gag }) => {
    const runtime = new DgdsRuntime({
        type: 'ADS',
        data,
        game: johnnyCastaway,
        resourceProvider: createEntryResourceProvider(archive.entries),
        surfaceFactory: createSoftwareSurface,
        timingCompatibility: createTimingCompatibility(),
        random: seededRandom(0x4a430000 + gag),
    });
    if (!runtime.jumpToScene(gag)) throw new Error(`Unknown Johnny gag ${gag}`);

    const startedAt = runtime.state.currentScene;
    const changes = [];
    let previousRevision = null;
    for (let tick = 1; tick <= 5000; tick++) {
        const result = runtime.tick(DGDS_TICK_MS);
        if (result.presentation.compose) {
            const revision = getCompositionRevision(runtime.state);
            if (revision !== previousRevision) {
                previousRevision = revision;
                composeTtmFrame(runtime.state);
                changes.push({
                    t: tick,
                    l: layerSnapshot(runtime.state),
                    o: result.frameOperations.map(compactFrameOperation),
                    a: result.audioOperations.map((operation) => [operation.type, operation.sample]),
                    p: compactPixels(runtime.state.surface.fingerprint()),
                });
            }
        }
        if (runtime.state.currentScene !== startedAt) return changes;
    }
    throw new Error(`Gag ${gag} did not complete within 5000 logical ticks`);
};

const verifyCampfireContinuity = ({ archive }) => {
    const frames = captureGag({
        archive,
        data: archive.loadEntry('BUILDING.ADS'),
        gag: 7,
    });
    const bootRoutineTags = new Set([47, 75, 72, 144, 54, 79]);
    let fireStarted = false;
    let checkedFrames = 0;

    for (const frame of frames) {
        const tags = new Set(frame.l.filter((layer) => layer[0] === 3).map((layer) => layer[1]));
        if (tags.has(44)) fireStarted = true;
        if (!fireStarted || ![...bootRoutineTags].some((tag) => tags.has(tag))) continue;
        checkedFrames++;
        if (!tags.has(44)) {
            throw new Error(`campfire layer disappeared during the boot routine at logical tick ${frame.t}`);
        }
    }

    if (checkedFrames === 0) throw new Error('campfire continuity check did not reach the boot routine');
    console.log(`campfire continuity: ${checkedFrames} retained actor frames`);
};

const readGame = async () => {
    let mapBuffer;
    let archiveBuffer;
    try {
        [mapBuffer, archiveBuffer] = await Promise.all([
            readFile(path.join(dataDirectory, johnnyCastaway.resources.map)),
            readFile(path.join(dataDirectory, johnnyCastaway.resources.archive)),
        ]);
    } catch (error) {
        throw new Error(`Golden rendering checks require extracted game data in ${dataDirectory}: ${error.message}`);
    }
    const resources = loadResources(asArrayBuffer(mapBuffer), asArrayBuffer(archiveBuffer));
    const archive = resources.getResource(johnnyCastaway.resources.archive);
    return { archive, data: archive.loadEntry(johnnyCastaway.resources.activity) };
};

const main = async () => {
    const game = await readGame();
    verifyCampfireContinuity(game);
    const captures = new Map();
    for (const gag of new Set(scenarioDefinitions.map((scenario) => scenario.gag))) {
        captures.set(gag, captureGag({ ...game, gag }));
    }

    const scenarios = Object.fromEntries(
        scenarioDefinitions.map((definition) => {
            const capturedFrames = captures.get(definition.gag).filter((frame) => definition.includes(frame.l));
            const frames = capturedFrames.map((frame) => [
                frame.t,
                digest({ layers: frame.l, frameOperations: frame.o, audioOperations: frame.a }),
                ...frame.p,
            ]);
            return [
                definition.id,
                {
                    gag: definition.gag,
                    frameCount: frames.length,
                    digest: digest(frames),
                    frames,
                },
            ];
        }),
    );
    const actual = {
        schema: 3,
        game: { id: johnnyCastaway.id, version: johnnyCastaway.version },
        timingProfile: createTimingCompatibility().profile,
        scenarios,
    };
    const records = [
        {
            type: 'header',
            schema: actual.schema,
            game: actual.game,
            timingProfile: actual.timingProfile,
        },
    ];
    for (const [id, scenario] of Object.entries(actual.scenarios)) {
        records.push({
            type: 'scenario',
            id,
            gag: scenario.gag,
            frameCount: scenario.frameCount,
            digest: scenario.digest,
        });
        scenario.frames.forEach((frame, index) =>
            records.push({
                type: 'frame',
                scenario: id,
                index,
                frame,
            }),
        );
    }
    const serialized = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;

    if (update) {
        await mkdir(path.dirname(goldenPath), { recursive: true });
        await writeFile(goldenPath, serialized);
        console.log(`Updated ${path.relative(root, goldenPath)}`);
        return;
    }

    const expectedRecords = (await readFile(goldenPath, 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
    const expected = { scenarios: {} };
    for (const record of expectedRecords) {
        if (record.type === 'scenario') {
            expected.scenarios[record.id] = { ...record, frames: [] };
        } else if (record.type === 'frame') {
            expected.scenarios[record.scenario]?.frames.push(record.frame);
        }
    }
    for (const definition of scenarioDefinitions) {
        const id = definition.id;
        const wanted = expected.scenarios[id];
        const found = actual.scenarios[id];
        if (wanted?.digest !== found.digest || wanted?.frameCount !== found.frameCount) {
            const mismatch = found.frames.findIndex(
                (frame, index) => JSON.stringify(frame) !== JSON.stringify(wanted?.frames?.[index]),
            );
            throw new Error(
                `${id} diverged at retained-frame ${mismatch}; ` +
                    `expected ${wanted?.digest}/${wanted?.frameCount}, ` +
                    `received ${found.digest}/${found.frameCount}`,
            );
        }
        console.log(`${id}: ${found.frameCount} retained frames (${found.digest})`);
    }
};

await main();

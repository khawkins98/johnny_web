import { describe, expect, it } from 'vitest';
import { TTMDispatch } from '../script-runner.mjs';
import { createRecordingSurface, createSoftwareSurface } from '../surface.mjs';
import { presentSurfaceFrameOperation } from '../surface-frame-presenter.mjs';

const opcode = (value) => TTMDispatch.find((entry) => entry.opcode === value).callback;
const withPresenter = (state) => ({
    frameOperations: [],
    presentFrameOperation: presentSurfaceFrameOperation,
    ...state,
});

const pixel = (surface, x, y) =>
    Array.from(surface.pixels.slice((y * surface.width + x) * 4, (y * surface.width + x) * 4 + 4));

describe('software DGDS surface', () => {
    it('rasterizes clipped sprites and horizontal flips deterministically', () => {
        const image = {
            width: 3,
            height: 1,
            pixels: [
                { r: 255, g: 0, b: 0, a: 255 },
                { r: 0, g: 255, b: 0, a: 255 },
                { r: 0, g: 0, b: 255, a: 255 },
            ],
        };
        const normal = createSoftwareSurface({ width: 5, height: 2 });
        const flipped = createSoftwareSurface({ width: 5, height: 2 });

        normal.drawSprite(image, 1, 0, { clip: { x: 2, y: 0, width: 2, height: 1 } });
        flipped.drawSprite(image, 1, 0, { flipX: true });

        expect(pixel(normal, 1, 0)).toEqual([0, 0, 0, 0]);
        expect(pixel(normal, 2, 0)).toEqual([0, 255, 0, 255]);
        expect(pixel(normal, 3, 0)).toEqual([0, 0, 255, 255]);
        expect(pixel(flipped, 1, 0)).toEqual([0, 0, 255, 255]);
        expect(pixel(flipped, 3, 0)).toEqual([255, 0, 0, 255]);
    });

    it('overwrites a GET/PUT region, including transparent saved pixels', () => {
        const destination = createSoftwareSurface({ width: 4, height: 2 });
        const source = createSoftwareSurface({ width: 4, height: 2 });
        destination.fillRect(0, 0, 4, 2, { r: 255, g: 0, b: 0, a: 255 });
        source.fillRect(2, 0, 1, 1, { r: 0, g: 0, b: 255, a: 255 });

        destination.replaceRegionFrom(source, { x: 1, y: 0, width: 2, height: 1 });

        expect(pixel(destination, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel(destination, 1, 0)).toEqual([0, 0, 0, 0]);
        expect(pixel(destination, 2, 0)).toEqual([0, 0, 255, 255]);
    });

    it('composes transparent layers without erasing lower pixels', () => {
        const destination = createSoftwareSurface({ width: 3, height: 1 });
        const source = createSoftwareSurface({ width: 3, height: 1 });
        destination.fillRect(0, 0, 3, 1, { r: 255, g: 0, b: 0, a: 255 });
        source.fillRect(1, 0, 1, 1, { r: 0, g: 255, b: 0, a: 255 });

        destination.drawSurface(source);

        expect(pixel(destination, 0, 0)).toEqual([255, 0, 0, 255]);
        expect(pixel(destination, 1, 0)).toEqual([0, 255, 0, 255]);
        expect(destination.fingerprint()).toEqual({
            hash: '91e5b0a3',
            pixels: 3,
            bounds: { x: 0, y: 0, width: 3, height: 1 },
        });
    });
});

describe('TTM drawing opcode surface contract', () => {
    it('records normal and flipped sprite commands without Canvas', () => {
        const surface = createRecordingSurface();
        const image = { width: 10, height: 20, pixels: [] };
        const clip = { x: 1, y: 2, width: 30, height: 40 };
        const state = withPresenter({
            surface,
            res: [{ images: [image] }],
            clip,
            scenesRes: [],
            sceneIdx: 1,
            tagId: 2,
        });

        opcode(0xa500)(state, 50, 60, 0, 0);
        opcode(0xa520)(state, 70, 80, 0, 0);

        expect(surface.commands).toEqual([
            { operation: 'drawSprite', image, x: 50, y: 60, options: { clip, flipX: false } },
            { operation: 'drawSprite', image, x: 70, y: 80, options: { clip, flipX: true } },
        ]);
        expect(state.frameOperations).toMatchObject([
            { type: 'draw-sprite', frame: 0, slot: 0, x: 50, y: 60, flipX: false },
            { type: 'draw-sprite', frame: 0, slot: 0, x: 70, y: 80, flipX: true },
        ]);
    });

    it('routes primitive drawing through the surface', () => {
        const surface = createRecordingSurface();
        const color = { r: 12, g: 34, b: 56 };
        const state = withPresenter({ surface, foregroundColor: color });

        opcode(0xa0a0)(state, 1, 2, 3, 4);
        opcode(0xa100)(state, 5, 6, 7, 8);
        opcode(0xa400)(state, 10, 20, 30, 30);

        expect(surface.commands).toEqual([
            { operation: 'drawLine', x1: 1, y1: 2, x2: 3, y2: 4, color: 'white' },
            { operation: 'fillRect', x: 5, y: 6, width: 7, height: 8, color },
            { operation: 'fillCircle', x: 25, y: 35, radius: 15, color: 'white' },
        ]);
        expect(state.frameOperations.map((operation) => operation.type)).toEqual([
            'draw-line',
            'fill-rect',
            'fill-circle',
        ]);
    });

    it('captures and overwrites GET/PUT regions through surfaces', () => {
        const surface = createRecordingSurface();
        const savedSurface = createRecordingSurface();
        const save = { surface: savedSurface, canDraw: false, x: 0, y: 0, width: 0, height: 0 };
        const state = withPresenter({ surface, save: [save], saveIndex: 0 });

        opcode(0x4210)(state, 10, 20, 30, 40);
        opcode(0xa600)(state, 0);
        opcode(0xa060)(state, 1, 2, 3, 4);

        expect(surface.commands[0]).toMatchObject({
            operation: 'copyRegionTo',
            target: savedSurface,
            rect: { x: 10, y: 20, width: 30, height: 40 },
        });
        expect(surface.commands.slice(1)).toEqual([
            {
                operation: 'clear',
                rect: { x: 0, y: 0, width: 640, height: 480 },
            },
            {
                operation: 'replaceRegionFrom',
                source: savedSurface,
                rect: { x: 10, y: 20, width: 30, height: 40 },
            },
        ]);
    });

    it('clears only the scene layer when GET/PUT has no saved region', () => {
        const surface = createRecordingSurface();
        const state = withPresenter({
            surface,
            save: [{ canDraw: false }],
            layerRevision: 0,
        });

        opcode(0xa600)(state, 0);

        expect(surface.commands).toEqual([
            {
                operation: 'clear',
                rect: { x: 0, y: 0, width: 640, height: 480 },
            },
        ]);
        expect(state.layerRevision).toBe(1);
    });
});

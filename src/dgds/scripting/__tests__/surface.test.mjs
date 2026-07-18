import { describe, expect, it, vi } from 'vitest';
import { TTMDispatch } from '../script-runner.mjs';
import { createCanvasSurface, createCanvasSurfaceElement, createRecordingSurface } from '../surface.mjs';

const opcode = value => TTMDispatch.find(entry => entry.opcode === value).callback;

const createMockContext = () => ({
    canvas: {},
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
});

describe('Canvas DGDS surface adapter', () => {
    it('owns browser canvas construction at the adapter boundary', () => {
        const context = createMockContext();
        const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
        context.canvas = canvas;
        const documentRef = { createElement: vi.fn(() => canvas) };

        const surface = createCanvasSurfaceElement({ documentRef });

        expect(documentRef.createElement).toHaveBeenCalledWith('canvas');
        expect(canvas).toMatchObject({ width: 640, height: 480 });
        expect(surface.canvas).toBe(context.canvas);
    });

    it('applies clipping and destination coordinates for a sprite', () => {
        const context = createMockContext();
        const surface = createCanvasSurface(context);
        const spriteCanvas = {};
        const image = { width: 10, height: 20, _canvas: spriteCanvas };
        const clip = { x: 1, y: 2, width: 30, height: 40 };

        surface.drawSprite(image, 50, 60, { clip });

        expect(context.rect).toHaveBeenCalledWith(1, 2, 30, 40);
        expect(context.drawImage).toHaveBeenCalledWith(spriteCanvas, 0, 0, 10, 20, 50, 60, 10, 20);
        expect(context.restore).toHaveBeenCalledOnce();
    });

    it('contains horizontal-flip transforms inside save/restore', () => {
        const context = createMockContext();
        const surface = createCanvasSurface(context);
        const spriteCanvas = {};
        const image = { width: 10, height: 20, _canvas: spriteCanvas };

        surface.drawSprite(image, 50, 60, { flipX: true });

        expect(context.translate).toHaveBeenCalledWith(60, 60);
        expect(context.scale).toHaveBeenCalledWith(-1, 1);
        expect(context.drawImage).toHaveBeenCalledWith(spriteCanvas, 0, 0, 10, 20);
        expect(context.save).toHaveBeenCalledOnce();
        expect(context.restore).toHaveBeenCalledOnce();
    });

    it('overwrites a GET/PUT region, including transparent saved pixels', () => {
        const context = createMockContext();
        const surface = createCanvasSurface(context);
        const sourceCanvas = {};
        const source = { canvas: sourceCanvas };

        surface.replaceRegionFrom(source, { x: 10, y: 20, width: 30, height: 40 });

        expect(context.clearRect).toHaveBeenCalledWith(10, 20, 30, 40);
        expect(context.drawImage).toHaveBeenCalledWith(
            sourceCanvas,
            10, 20, 30, 40,
            10, 20, 30, 40,
        );
        expect(context.clearRect.mock.invocationCallOrder[0])
            .toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
    });
});

describe('TTM drawing opcode surface contract', () => {
    it('records normal and flipped sprite commands without Canvas', () => {
        const surface = createRecordingSurface();
        const image = { width: 10, height: 20, pixels: [] };
        const clip = { x: 1, y: 2, width: 30, height: 40 };
        const state = {
            surface,
            res: [{ images: [image] }],
            clip,
            scenesRes: [],
            sceneIdx: 1,
            tagId: 2,
        };

        opcode(0xa500)(state, 50, 60, 0, 0);
        opcode(0xa520)(state, 70, 80, 0, 0);

        expect(surface.commands).toEqual([
            { operation: 'drawSprite', image, x: 50, y: 60, options: { clip, flipX: false } },
            { operation: 'drawSprite', image, x: 70, y: 80, options: { clip, flipX: true } },
        ]);
    });

    it('routes primitive drawing through the surface', () => {
        const surface = createRecordingSurface();
        const color = { r: 12, g: 34, b: 56 };
        const state = { surface, foregroundColor: color };

        opcode(0xa0a0)(state, 1, 2, 3, 4);
        opcode(0xa100)(state, 5, 6, 7, 8);
        opcode(0xa400)(state, 10, 20, 30, 30);

        expect(surface.commands).toEqual([
            { operation: 'drawLine', x1: 1, y1: 2, x2: 3, y2: 4, color: 'white' },
            { operation: 'fillRect', x: 5, y: 6, width: 7, height: 8, color },
            { operation: 'fillCircle', x: 25, y: 35, radius: 15, color: 'white' },
        ]);
    });

    it('captures and overwrites GET/PUT regions through surfaces', () => {
        const surface = createRecordingSurface();
        const savedSurface = createRecordingSurface();
        const save = { surface: savedSurface, canDraw: false, x: 0, y: 0, width: 0, height: 0 };
        const state = { surface, save: [save], saveIndex: 0 };

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
                operation: 'replaceRegionFrom',
                source: savedSurface,
                rect: { x: 10, y: 20, width: 30, height: 40 },
            },
        ]);
    });

    it('clears only the scene layer when GET/PUT has no saved region', () => {
        const surface = createRecordingSurface();
        const state = {
            surface,
            save: [{ canDraw: false }],
            layerRevision: 0,
        };

        opcode(0xa600)(state, 0);

        expect(surface.commands).toEqual([{
            operation: 'clear',
            rect: { x: 0, y: 0, width: 640, height: 480 },
        }]);
        expect(state.layerRevision).toBe(1);
    });
});

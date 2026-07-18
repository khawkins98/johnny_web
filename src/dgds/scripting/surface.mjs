/**
 * DGDS logical drawing-surface contract.
 *
 * TTM opcodes depend on these operations, not on CanvasRenderingContext2D.
 * The browser host supplies createCanvasSurface(); tests and trace tooling use
 * createRecordingSurface() to observe deterministic drawing commands.
 */
import { buildSpriteCanvas, getPaletteColor } from '../graphics.mjs';

export const SURFACE_WIDTH = 640;
export const SURFACE_HEIGHT = 480;

const fullSurface = () => ({ x: 0, y: 0, width: SURFACE_WIDTH, height: SURFACE_HEIGHT });
const normalizeRect = (rect) => rect
    ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    : fullSurface();

export const createCanvasSurface = (context) => {
    if (!context) throw new TypeError('createCanvasSurface requires a 2D context');

    const surface = {
        get canvas() {
            return context.canvas;
        },

        clear(rect) {
            const r = normalizeRect(rect);
            context.clearRect(r.x, r.y, r.width, r.height);
        },

        drawSprite(image, x, y, { clip = fullSurface(), flipX = false } = {}) {
            const spriteCanvas = buildSpriteCanvas(image);
            if (!spriteCanvas) return;

            context.save();
            context.beginPath();
            context.rect(clip.x, clip.y, clip.width, clip.height);
            context.clip();

            if (flipX) {
                context.translate(x + image.width, y);
                context.scale(-1, 1);
                context.drawImage(spriteCanvas, 0, 0, image.width, image.height);
            } else {
                context.drawImage(
                    spriteCanvas,
                    0, 0, image.width, image.height,
                    x, y, image.width, image.height,
                );
            }

            context.restore();
        },

        drawLine(x1, y1, x2, y2, color = 'white') {
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x2, y2);
            context.strokeStyle = color;
            context.stroke();
        },

        fillRect(x, y, width, height, color) {
            context.fillStyle = typeof color === 'string' ? color : getPaletteColor(color);
            context.fillRect(x, y, width, height);
        },

        fillCircle(x, y, radius, color = 'white') {
            context.beginPath();
            context.arc(x, y, radius, 0, 2 * Math.PI, false);
            context.fillStyle = typeof color === 'string' ? color : getPaletteColor(color);
            context.fill();
            context.strokeStyle = context.fillStyle;
            context.stroke();
        },

        drawSurface(source, rect) {
            if (!source?.canvas) return;
            if (rect) {
                context.drawImage(
                    source.canvas,
                    rect.x, rect.y, rect.width, rect.height,
                    rect.x, rect.y, rect.width, rect.height,
                );
            } else {
                context.drawImage(source.canvas, 0, 0);
            }
        },

        replaceRegionFrom(source, rect) {
            if (!source?.canvas) return;
            const r = normalizeRect(rect);
            // DGDS GET/PUT is an overwrite, including transparent/zero pixels.
            // A normal source-over draw would leave old destination pixels behind.
            context.clearRect(r.x, r.y, r.width, r.height);
            context.drawImage(
                source.canvas,
                r.x, r.y, r.width, r.height,
                r.x, r.y, r.width, r.height,
            );
        },

        fingerprint() {
            if (typeof context.getImageData !== 'function') return null;
            const { data } = context.getImageData(0, 0, SURFACE_WIDTH, SURFACE_HEIGHT);
            let hash = 0x811c9dc5;
            let left = SURFACE_WIDTH;
            let top = SURFACE_HEIGHT;
            let right = -1;
            let bottom = -1;
            let pixels = 0;
            for (let i = 0; i < data.length; i += 4) {
                hash ^= data[i]; hash = Math.imul(hash, 0x01000193);
                hash ^= data[i + 1]; hash = Math.imul(hash, 0x01000193);
                hash ^= data[i + 2]; hash = Math.imul(hash, 0x01000193);
                hash ^= data[i + 3]; hash = Math.imul(hash, 0x01000193);
                if (data[i + 3] !== 0) {
                    const pixel = i / 4;
                    const x = pixel % SURFACE_WIDTH;
                    const y = Math.floor(pixel / SURFACE_WIDTH);
                    left = Math.min(left, x);
                    top = Math.min(top, y);
                    right = Math.max(right, x);
                    bottom = Math.max(bottom, y);
                    pixels++;
                }
            }
            return {
                hash: (hash >>> 0).toString(16).padStart(8, '0'),
                pixels,
                bounds: pixels ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null,
            };
        },

        copyRegionTo(target, rect) {
            target.clear();
            target.drawSurface(surface, rect);
        },
    };

    return surface;
};

/** Browser host factory for a process-owned 640x480 drawing surface. */
export const createCanvasSurfaceElement = ({ documentRef = document } = {}) => {
    const canvas = documentRef.createElement('canvas');
    canvas.width = SURFACE_WIDTH;
    canvas.height = SURFACE_HEIGHT;
    return createCanvasSurface(canvas.getContext('2d'));
};

export const createRecordingSurface = () => {
    const commands = [];
    const record = (operation, args) => commands.push({ operation, ...args });

    const surface = {
        commands,
        clear: rect => record('clear', { rect: normalizeRect(rect) }),
        drawSprite: (image, x, y, options = {}) => record('drawSprite', { image, x, y, options }),
        drawLine: (x1, y1, x2, y2, color = 'white') => record('drawLine', { x1, y1, x2, y2, color }),
        fillRect: (x, y, width, height, color) => record('fillRect', { x, y, width, height, color }),
        fillCircle: (x, y, radius, color = 'white') => record('fillCircle', { x, y, radius, color }),
        drawSurface: (source, rect) => record('drawSurface', { source, rect }),
        replaceRegionFrom: (source, rect) => record('replaceRegionFrom', {
            source,
            rect: normalizeRect(rect),
        }),
        fingerprint: () => ({ commandCount: commands.length }),
        copyRegionTo(target, rect) {
            record('copyRegionTo', { target, rect });
            target.clear();
            target.drawSurface(surface, rect);
        },
    };

    return surface;
};

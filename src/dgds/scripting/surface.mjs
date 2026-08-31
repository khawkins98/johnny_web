/**
 * Deterministic DGDS retained-surface model.
 *
 * The faithful runtime owns RGBA pixels, clipping, GET/PUT overwrite semantics,
 * and layer composition. Browser hosts only copy the completed pixel buffer to
 * their presentation target. Tests may use the recording adapter when they
 * need to inspect operation routing rather than raster output.
 */

export const SURFACE_WIDTH = 640;
export const SURFACE_HEIGHT = 480;

const fullSurface = (width = SURFACE_WIDTH, height = SURFACE_HEIGHT) => ({
    x: 0,
    y: 0,
    width,
    height,
});

const normalizeRect = (rect, width = SURFACE_WIDTH, height = SURFACE_HEIGHT) =>
    rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : fullSurface(width, height);

const intersectRect = (left, right) => {
    const x = Math.max(0, Math.ceil(left.x), Math.ceil(right.x));
    const y = Math.max(0, Math.ceil(left.y), Math.ceil(right.y));
    const rightEdge = Math.min(Math.floor(left.x + left.width), Math.floor(right.x + right.width));
    const bottomEdge = Math.min(Math.floor(left.y + left.height), Math.floor(right.y + right.height));
    return {
        x,
        y,
        width: Math.max(0, rightEdge - x),
        height: Math.max(0, bottomEdge - y),
    };
};

const colorChannels = (color) => {
    if (typeof color === 'object' && color) {
        return [color.r ?? 0, color.g ?? 0, color.b ?? 0, color.a ?? 255];
    }
    if (color === 'black') return [0, 0, 0, 255];
    if (color === 'transparent') return [0, 0, 0, 0];
    return [255, 255, 255, 255];
};

const mergeBounds = (left, right) => {
    if (!left) return right ? { ...right } : null;
    if (!right) return { ...left };
    const x = Math.min(left.x, right.x);
    const y = Math.min(left.y, right.y);
    const rightEdge = Math.max(left.x + left.width, right.x + right.width);
    const bottomEdge = Math.max(left.y + left.height, right.y + right.height);
    return { x, y, width: rightEdge - x, height: bottomEdge - y };
};

export const createSoftwareSurface = ({ width = SURFACE_WIDTH, height = SURFACE_HEIGHT } = {}) => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    const extent = fullSurface(width, height);
    let occupiedBounds = null;
    let revision = 0;
    const touch = () => { revision += 1; };

    const pixelOffset = (x, y) => (y * width + x) * 4;
    const markPixel = (x, y) => {
        if (!occupiedBounds) {
            occupiedBounds = { x, y, width: 1, height: 1 };
            return;
        }
        const right = Math.max(occupiedBounds.x + occupiedBounds.width, x + 1);
        const bottom = Math.max(occupiedBounds.y + occupiedBounds.height, y + 1);
        occupiedBounds.x = Math.min(occupiedBounds.x, x);
        occupiedBounds.y = Math.min(occupiedBounds.y, y);
        occupiedBounds.width = right - occupiedBounds.x;
        occupiedBounds.height = bottom - occupiedBounds.y;
    };
    const blendChannels = (offset, red, green, blue, sourceAlpha) => {
        if (sourceAlpha === 0) return;
        if (sourceAlpha === 255 || pixels[offset + 3] === 0) {
            pixels[offset] = red;
            pixels[offset + 1] = green;
            pixels[offset + 2] = blue;
            pixels[offset + 3] = sourceAlpha;
            return;
        }

        const destinationAlpha = pixels[offset + 3];
        const inverseAlpha = 255 - sourceAlpha;
        const outputAlpha = sourceAlpha + Math.round((destinationAlpha * inverseAlpha) / 255);
        pixels[offset] = Math.round(
            (red * sourceAlpha + Math.round((pixels[offset] * destinationAlpha * inverseAlpha) / 255)) / outputAlpha,
        );
        pixels[offset + 1] = Math.round(
            (green * sourceAlpha + Math.round((pixels[offset + 1] * destinationAlpha * inverseAlpha) / 255)) /
                outputAlpha,
        );
        pixels[offset + 2] = Math.round(
            (blue * sourceAlpha + Math.round((pixels[offset + 2] * destinationAlpha * inverseAlpha) / 255)) /
                outputAlpha,
        );
        pixels[offset + 3] = outputAlpha;
    };
    const blendPixel = (offset, rgba) => blendChannels(offset, rgba[0], rgba[1], rgba[2], rgba[3]);
    const recalculateBounds = (searchRect) => {
        const area = intersectRect(searchRect || extent, extent);
        let left = width;
        let top = height;
        let right = -1;
        let bottom = -1;
        for (let y = area.y; y < area.y + area.height; y++) {
            for (let x = area.x; x < area.x + area.width; x++) {
                if (pixels[pixelOffset(x, y) + 3] !== 0) {
                    left = Math.min(left, x);
                    top = Math.min(top, y);
                    right = Math.max(right, x);
                    bottom = Math.max(bottom, y);
                }
            }
        }
        occupiedBounds =
            right < left
                ? null
                : {
                      x: left,
                      y: top,
                      width: right - left + 1,
                      height: bottom - top + 1,
                  };
    };

    const surface = {
        width,
        height,
        pixels,

        get bounds() {
            return occupiedBounds ? { ...occupiedBounds } : null;
        },

        clear(rect) {
            const area = intersectRect(normalizeRect(rect, width, height), extent);
            if (area.width === 0 || area.height === 0) return;
            touch();
            if (area.x === 0 && area.y === 0 && area.width === width && area.height === height) {
                pixels.fill(0);
                occupiedBounds = null;
                return;
            }
            for (let y = area.y; y < area.y + area.height; y++) {
                pixels.fill(0, pixelOffset(area.x, y), pixelOffset(area.x + area.width, y));
            }
            if (occupiedBounds) recalculateBounds(mergeBounds(occupiedBounds, area));
        },

        drawSprite(image, x, y, { clip = extent, flipX = false } = {}) {
            if (!image?.pixels || !image.width || !image.height) return;
            const destination = intersectRect(
                { x, y, width: image.width, height: image.height },
                intersectRect(clip, extent),
            );
            let drawnLeft = width;
            let drawnTop = height;
            let drawnRight = -1;
            let drawnBottom = -1;
            for (let destinationY = destination.y; destinationY < destination.y + destination.height; destinationY++) {
                const sourceY = destinationY - y;
                for (
                    let destinationX = destination.x;
                    destinationX < destination.x + destination.width;
                    destinationX++
                ) {
                    const localX = destinationX - x;
                    const sourceX = flipX ? image.width - localX - 1 : localX;
                    const source = image.pixels[sourceY * image.width + sourceX];
                    if (!source || source.a === 0) continue;
                    blendChannels(
                        pixelOffset(destinationX, destinationY),
                        source.r ?? 0,
                        source.g ?? 0,
                        source.b ?? 0,
                        source.a ?? 255,
                    );
                    drawnLeft = Math.min(drawnLeft, destinationX);
                    drawnTop = Math.min(drawnTop, destinationY);
                    drawnRight = Math.max(drawnRight, destinationX);
                    drawnBottom = Math.max(drawnBottom, destinationY);
                }
            }
            if (drawnRight >= drawnLeft) {
                occupiedBounds = mergeBounds(occupiedBounds, {
                    x: drawnLeft,
                    y: drawnTop,
                    width: drawnRight - drawnLeft + 1,
                    height: drawnBottom - drawnTop + 1,
                });
                touch();
            }
        },

        drawLine(x1, y1, x2, y2, color = 'white') {
            const rgba = colorChannels(color);
            let x = Math.round(x1);
            let y = Math.round(y1);
            const endX = Math.round(x2);
            const endY = Math.round(y2);
            const dx = Math.abs(endX - x);
            const sx = x < endX ? 1 : -1;
            const dy = -Math.abs(endY - y);
            const sy = y < endY ? 1 : -1;
            let error = dx + dy;
            let drew = false;
            while (true) {
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    blendPixel(pixelOffset(x, y), rgba);
                    if (rgba[3] !== 0) {
                        markPixel(x, y);
                        drew = true;
                    }
                }
                if (x === endX && y === endY) break;
                const doubled = error * 2;
                if (doubled >= dy) {
                    error += dy;
                    x += sx;
                }
                if (doubled <= dx) {
                    error += dx;
                    y += sy;
                }
            }
            if (drew) touch();
        },

        fillRect(x, y, rectangleWidth, rectangleHeight, color) {
            const area = intersectRect({ x, y, width: rectangleWidth, height: rectangleHeight }, extent);
            const rgba = colorChannels(color);
            for (let destinationY = area.y; destinationY < area.y + area.height; destinationY++) {
                for (let destinationX = area.x; destinationX < area.x + area.width; destinationX++) {
                    blendPixel(pixelOffset(destinationX, destinationY), rgba);
                }
            }
            if (rgba[3] !== 0 && area.width && area.height) {
                occupiedBounds = mergeBounds(occupiedBounds, area);
                touch();
            }
        },

        fillCircle(x, y, radius, color = 'white') {
            const rgba = colorChannels(color);
            const area = intersectRect(
                {
                    x: Math.floor(x - radius),
                    y: Math.floor(y - radius),
                    width: Math.ceil(radius * 2) + 1,
                    height: Math.ceil(radius * 2) + 1,
                },
                extent,
            );
            const radiusSquared = radius * radius;
            let drawnLeft = width;
            let drawnTop = height;
            let drawnRight = -1;
            let drawnBottom = -1;
            for (let destinationY = area.y; destinationY < area.y + area.height; destinationY++) {
                for (let destinationX = area.x; destinationX < area.x + area.width; destinationX++) {
                    const dx = destinationX + 0.5 - x;
                    const dy = destinationY + 0.5 - y;
                    if (dx * dx + dy * dy > radiusSquared) continue;
                    blendPixel(pixelOffset(destinationX, destinationY), rgba);
                    if (rgba[3] !== 0) {
                        drawnLeft = Math.min(drawnLeft, destinationX);
                        drawnTop = Math.min(drawnTop, destinationY);
                        drawnRight = Math.max(drawnRight, destinationX);
                        drawnBottom = Math.max(drawnBottom, destinationY);
                    }
                }
            }
            if (drawnRight >= drawnLeft) {
                occupiedBounds = mergeBounds(occupiedBounds, {
                    x: drawnLeft,
                    y: drawnTop,
                    width: drawnRight - drawnLeft + 1,
                    height: drawnBottom - drawnTop + 1,
                });
                touch();
            }
        },

        drawSurface(source, rect) {
            if (!source?.pixels) return;
            const requested = rect ? intersectRect(rect, extent) : extent;
            const sourceArea = source.bounds ? intersectRect(requested, source.bounds) : requested;
            const area = intersectRect(sourceArea, {
                x: 0,
                y: 0,
                width: source.width,
                height: source.height,
            });
            let drewPixel = false;
            for (let destinationY = area.y; destinationY < area.y + area.height; destinationY++) {
                for (let destinationX = area.x; destinationX < area.x + area.width; destinationX++) {
                    const sourceOffset = (destinationY * source.width + destinationX) * 4;
                    if (source.pixels[sourceOffset + 3] === 0) continue;
                    blendChannels(
                        pixelOffset(destinationX, destinationY),
                        source.pixels[sourceOffset],
                        source.pixels[sourceOffset + 1],
                        source.pixels[sourceOffset + 2],
                        source.pixels[sourceOffset + 3],
                    );
                    drewPixel = true;
                }
            }
            if (drewPixel) {
                occupiedBounds = mergeBounds(occupiedBounds, area);
                touch();
            }
        },

        replaceRegionFrom(source, rect) {
            if (!source?.pixels) return;
            const area = intersectRect(normalizeRect(rect, width, height), extent);
            const copyArea = intersectRect(area, {
                x: 0,
                y: 0,
                width: source.width,
                height: source.height,
            });
            const previousBounds = occupiedBounds;
            for (let destinationY = area.y; destinationY < area.y + area.height; destinationY++) {
                for (let destinationX = area.x; destinationX < area.x + area.width; destinationX++) {
                    const destinationOffset = pixelOffset(destinationX, destinationY);
                    if (
                        destinationX < copyArea.x ||
                        destinationX >= copyArea.x + copyArea.width ||
                        destinationY < copyArea.y ||
                        destinationY >= copyArea.y + copyArea.height
                    ) {
                        pixels.fill(0, destinationOffset, destinationOffset + 4);
                        continue;
                    }
                    const sourceOffset = (destinationY * source.width + destinationX) * 4;
                    pixels.set(source.pixels.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
                }
            }
            recalculateBounds(mergeBounds(previousBounds, area));
            touch();
        },

        fingerprint() {
            let hash = 0x811c9dc5;
            let count = 0;
            const area = occupiedBounds || { x: 0, y: 0, width: 0, height: 0 };
            for (const value of [area.x, area.y, area.width, area.height]) {
                hash ^= value & 0xff;
                hash = Math.imul(hash, 0x01000193);
                hash ^= (value >>> 8) & 0xff;
                hash = Math.imul(hash, 0x01000193);
            }
            for (let y = area.y; y < area.y + area.height; y++) {
                for (let x = area.x; x < area.x + area.width; x++) {
                    const offset = pixelOffset(x, y);
                    hash ^= pixels[offset];
                    hash = Math.imul(hash, 0x01000193);
                    hash ^= pixels[offset + 1];
                    hash = Math.imul(hash, 0x01000193);
                    hash ^= pixels[offset + 2];
                    hash = Math.imul(hash, 0x01000193);
                    hash ^= pixels[offset + 3];
                    hash = Math.imul(hash, 0x01000193);
                    if (pixels[offset + 3] !== 0) count++;
                }
            }
            return {
                hash: (hash >>> 0).toString(16).padStart(8, '0'),
                pixels: count,
                bounds: occupiedBounds ? { ...occupiedBounds } : null,
            };
        },

        copyRegionTo(target, rect) {
            target.clear();
            target.replaceRegionFrom(surface, rect);
        },


        get revision() {
            return revision;
        },
    };

    return surface;
};

export const createRecordingSurface = () => {
    const commands = [];
    let revision = 0;
    const touch = () => { revision += 1; };
    const record = (operation, args) => {
        commands.push({ operation, ...args });
        touch();
    };

    const surface = {
        commands,
        clear: (rect) => record('clear', { rect: normalizeRect(rect) }),
        drawSprite: (image, x, y, options = {}) => record('drawSprite', { image, x, y, options }),
        drawLine: (x1, y1, x2, y2, color = 'white') => record('drawLine', { x1, y1, x2, y2, color }),
        fillRect: (x, y, width, height, color) => record('fillRect', { x, y, width, height, color }),
        fillCircle: (x, y, radius, color = 'white') => record('fillCircle', { x, y, radius, color }),
        drawSurface: (source, rect) => record('drawSurface', { source, rect }),
        replaceRegionFrom: (source, rect) =>
            record('replaceRegionFrom', {
                source,
                rect: normalizeRect(rect),
            }),
        fingerprint: () => ({ commandCount: commands.length }),
        copyRegionTo(target, rect) {
            record('copyRegionTo', { target, rect });
            target.clear();
            target.drawSurface(surface, rect);
        },
        get revision() {
            return revision;
        },
    };

    return surface;
};

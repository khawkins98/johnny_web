/**
 * Pre-build and cache an offscreen canvas for a sprite image.
 * Called once per unique image object; subsequent calls return the cached canvas.
 * This eliminates the per-frame O(W×H) pixel loop in hot rendering paths.
 */
export const buildSpriteCanvas = (image) => {
    if (image._canvas !== undefined) return image._canvas;
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d');
    if (!ctx) { image._canvas = null; return null; }
    const img = ctx.createImageData(image.width, image.height);
    for (let p = 0; p < image.pixels.length; p += 1) {
        img.data[(p * 4)    ] = image.pixels[p].r;
        img.data[(p * 4) + 1] = image.pixels[p].g;
        img.data[(p * 4) + 2] = image.pixels[p].b;
        img.data[(p * 4) + 3] = image.pixels[p].a;
    }
    ctx.putImageData(img, 0, 0);
    image._canvas = c;
    return c;
};

export const drawImage = (image, context, posX, posY) => {
    const img = context.createImageData(image.width, image.height);
    for (let p = 0; p < image.pixels.length; p += 1) {
        img.data[(p * 4) + 0] = image.pixels[p].r;
        img.data[(p * 4) + 1] = image.pixels[p].g;
        img.data[(p * 4) + 2] = image.pixels[p].b;
        img.data[(p * 4) + 3] = image.pixels[p].a;
    }

    context.putImageData(img, posX, posY);
};



export const drawScreen = (data, context) => {
    context.fillStyle = 'black';
    context.fillRect(0, 0, 640, 480);

    context.canvas.width = 640;
    context.canvas.height = 480;

    drawImage(data.images[0], context, 0, 0);
};

export const getPaletteColor = (c) => `rgb(${c.r},${c.g},${c.b})`;

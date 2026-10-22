// Minimal software implementation of the Canvas 2D calls that the browser frame
// presenter and drawBackground make. render-ours.mjs uses it to run the browser's
// own background + foreground path headless, with no jsdom/canvas dependency.
//
// Supported: createImageData, putImageData, getImageData, clearRect, fillRect
// (#rgb / #rrggbb / rgb() / rgba() fillStyle), drawImage(canvas, dx, dy) and the
// 9-argument form without scaling, save/restore/translate/scale(+-1, +-1). Blending
// is source-over. Anything else throws, so a new browser call shows up here
// instead of rendering silently wrong.

const parseColor = (style) => {
    if (typeof style !== 'string') throw new TypeError(`soft-canvas: unsupported fillStyle ${style}`);
    const s = style.trim();
    let m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return [...m[1]].map((c) => Number.parseInt(c + c, 16)).concat(255);
    m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16)).concat(255);
    m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
        const parts = m[1].split(',').map((p) => Number.parseFloat(p));
        return [parts[0], parts[1], parts[2], Math.round((parts[3] ?? 1) * 255)];
    }
    throw new TypeError(`soft-canvas: unsupported fillStyle ${style}`);
};

const blend = (data, o, r, g, b, a) => {
    if (a <= 0) return;
    if (a >= 255) {
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
        return;
    }
    const da = data[o + 3] / 255;
    const sa = a / 255;
    const oa = sa + da * (1 - sa);
    data[o] = Math.round((r * sa + data[o] * da * (1 - sa)) / oa);
    data[o + 1] = Math.round((g * sa + data[o + 1] * da * (1 - sa)) / oa);
    data[o + 2] = Math.round((b * sa + data[o + 2] * da * (1 - sa)) / oa);
    data[o + 3] = Math.round(oa * 255);
};

export class SoftContext2D {
    #canvas;

    constructor(canvas) {
        this.#canvas = canvas;
        this.fillStyle = '#000';
        this.globalAlpha = 1;
        this.transform = { tx: 0, ty: 0, sx: 1, sy: 1 };
        this.stack = [];
    }

    get canvas() {
        return this.#canvas;
    }

    get data() {
        return this.#canvas.data;
    }

    createImageData(width, height) {
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
    }

    putImageData(image, dx, dy) {
        const W = this.#canvas.width;
        const H = this.#canvas.height;
        const data = this.data;
        for (let y = 0; y < image.height; y++) {
            const ty = dy + y;
            if (ty < 0 || ty >= H) continue;
            const x0 = Math.max(0, -dx);
            const x1 = Math.min(image.width, W - dx);
            if (x1 <= x0) continue;
            const s = (y * image.width + x0) * 4;
            data.set(image.data.subarray(s, s + (x1 - x0) * 4), (ty * W + dx + x0) * 4);
        }
    }

    getImageData(x, y, width, height) {
        const out = this.createImageData(width, height);
        const W = this.#canvas.width;
        for (let j = 0; j < height; j++) {
            for (let i = 0; i < width; i++) {
                const sx = x + i;
                const sy = y + j;
                if (sx < 0 || sy < 0 || sx >= W || sy >= this.#canvas.height) continue;
                const s = (sy * W + sx) * 4;
                out.data.set(this.data.subarray(s, s + 4), (j * width + i) * 4);
            }
        }
        return out;
    }

    #rect(x, y, w, h, fn) {
        const { tx, ty } = this.transform;
        const x0 = Math.max(0, Math.round(x + tx));
        const y0 = Math.max(0, Math.round(y + ty));
        const x1 = Math.min(this.#canvas.width, Math.round(x + tx + w));
        const y1 = Math.min(this.#canvas.height, Math.round(y + ty + h));
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) fn((yy * this.#canvas.width + xx) * 4);
    }

    clearRect(x, y, w, h) {
        if (x <= 0 && y <= 0 && w >= this.#canvas.width && h >= this.#canvas.height && this.transform.tx === 0 && this.transform.ty === 0) {
            this.data.fill(0);
            return;
        }
        this.#rect(x, y, w, h, (o) => this.data.fill(0, o, o + 4));
    }

    fillRect(x, y, w, h) {
        const [r, g, b, a] = parseColor(this.fillStyle);
        const alpha = Math.round(a * this.globalAlpha);
        this.#rect(x, y, w, h, (o) => blend(this.data, o, r, g, b, alpha));
    }

    save() {
        this.stack.push({ ...this.transform });
    }

    restore() {
        this.transform = this.stack.pop() ?? { tx: 0, ty: 0, sx: 1, sy: 1 };
    }

    translate(x, y) {
        this.transform.tx += x * this.transform.sx;
        this.transform.ty += y * this.transform.sy;
    }

    scale(x, y) {
        if (Math.abs(x) !== 1 || Math.abs(y) !== 1) throw new Error('soft-canvas: only +-1 scale is supported');
        this.transform.sx *= x;
        this.transform.sy *= y;
    }

    drawImage(source, ...args) {
        let sx = 0;
        let sy = 0;
        let sw = source.width;
        let sh = source.height;
        let dx;
        let dy;
        if (args.length === 2) [dx, dy] = args;
        else if (args.length === 8) {
            let dw;
            let dh;
            [sx, sy, sw, sh, dx, dy, dw, dh] = args;
            if (dw !== sw || dh !== sh) throw new Error('soft-canvas: scaled drawImage is not supported');
        } else throw new Error(`soft-canvas: drawImage with ${args.length + 1} arguments is not supported`);
        const src = source.data;
        if (!src) throw new Error('soft-canvas: drawImage source has no pixel data');
        const { tx, ty, sx: kx, sy: ky } = this.transform;
        const W = this.#canvas.width;
        const H = this.#canvas.height;
        const data = this.data;
        const alphaScale = this.globalAlpha;
        for (let j = 0; j < sh; j++) {
            const srcY = sy + j;
            if (srcY < 0 || srcY >= source.height) continue;
            // A destination pixel covers [p, p+1); under a mirrored axis it lands at -p-1.
            const py = dy + j;
            const outY = Math.round(ky > 0 ? ty + py : ty - py - 1);
            if (outY < 0 || outY >= H) continue;
            for (let i = 0; i < sw; i++) {
                const srcX = sx + i;
                if (srcX < 0 || srcX >= source.width) continue;
                const s = (srcY * source.width + srcX) * 4;
                if (src[s + 3] === 0) continue;
                const px = dx + i;
                const outX = Math.round(kx > 0 ? tx + px : tx - px - 1);
                if (outX < 0 || outX >= W) continue;
                const a = alphaScale === 1 ? src[s + 3] : Math.round(src[s + 3] * alphaScale);
                blend(data, (outY * W + outX) * 4, src[s], src[s + 1], src[s + 2], a);
            }
        }
    }
}

export class SoftCanvas {
    #width;
    #height;

    constructor(width = 640, height = 480) {
        this.#width = width;
        this.#height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
        this.context = new SoftContext2D(this);
    }

    get width() {
        return this.#width;
    }

    set width(value) {
        this.#width = value;
        this.data = new Uint8ClampedArray(this.#width * this.#height * 4);
    }

    get height() {
        return this.#height;
    }

    set height(value) {
        this.#height = value;
        this.data = new Uint8ClampedArray(this.#width * this.#height * 4);
    }

    getContext(kind) {
        if (kind !== '2d') throw new Error(`soft-canvas: unsupported context ${kind}`);
        return this.context;
    }
}

/**
 * Make `document.createElement('canvas')` return a SoftCanvas so browser helpers
 * such as graphics.mjs buildSpriteCanvas work headless. Under jsdom (no canvas
 * backend, getContext returns null) only canvas creation is redirected; other tags
 * still go to the existing document.
 */
export const installSoftDocument = () => {
    const existing = globalThis.document;
    if (existing?.createElement?.__softCanvas) return false;
    const fallback = existing?.createElement?.bind(existing);
    const createElement = (tag, ...rest) => {
        if (tag === 'canvas') return new SoftCanvas(1, 1);
        if (fallback) return fallback(tag, ...rest);
        throw new Error(`soft-canvas: document.createElement(${tag}) is not supported`);
    };
    createElement.__softCanvas = true;
    if (existing) existing.createElement = createElement;
    else globalThis.document = { createElement };
    return true;
};

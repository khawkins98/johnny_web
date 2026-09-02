// soft-canvas.mjs -- a minimal SOFTWARE 2D-canvas shim so the production
// background renderer (drawBackground in src/dgds/scripting/frame-renderer.mjs,
// buildSpriteCanvas in src/dgds/graphics.mjs) can run under plain Node, with no
// `canvas` npm package installed. This exists ONLY so the rendering oracle can
// reuse the browser's real background compositor unchanged, instead of
// reimplementing it (and risking drift from the faithful renderer).
//
// It supports exactly the subset of the Canvas 2D API those two functions use:
// createElement('canvas'), createImageData/putImageData, clearRect, drawImage
// (3-arg and 9-arg forms, honouring the current transform), save/restore,
// translate, and scale (only the horizontal-flip case, scale(-1,1), is ever
// used by the production code, but a general affine matrix is implemented
// since it costs nothing extra and avoids baking in that assumption).

const IDENTITY = [1, 0, 0, 1, 0, 0]; // [a, b, c, d, e, f] -- x' = a*x+c*y+e; y' = b*x+d*y+f

function makeBuffer(width, height) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function compositeSrcOver(dst, doo, sr, sg, sb, sa) {
    if (sa === 0) return;
    if (sa === 255) {
        dst[doo] = sr; dst[doo + 1] = sg; dst[doo + 2] = sb; dst[doo + 3] = 255;
        return;
    }
    const da = dst[doo + 3];
    const ia = 255 - sa;
    const outA = sa + Math.round((da * ia) / 255);
    if (outA === 0) return;
    dst[doo] = Math.round((sr * sa + dst[doo] * da * ia / 255) / outA);
    dst[doo + 1] = Math.round((sg * sa + dst[doo + 1] * da * ia / 255) / outA);
    dst[doo + 2] = Math.round((sb * sa + dst[doo + 2] * da * ia / 255) / outA);
    dst[doo + 3] = outA;
}

function makeContext(canvas) {
    let m = IDENTITY.slice();
    const stack = [];

    const apply = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

    return {
        canvas,
        createImageData(w, h) {
            return makeBuffer(w, h);
        },
        clearRect(x, y, w, h) {
            const { data, width, height } = canvas._buf;
            const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
            const x1 = Math.min(width, Math.ceil(x + w)), y1 = Math.min(height, Math.ceil(y + h));
            for (let yy = y0; yy < y1; yy++) {
                for (let xx = x0; xx < x1; xx++) {
                    const o = (yy * width + xx) * 4;
                    data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0;
                }
            }
        },
        putImageData(img, dx, dy) {
            const dst = canvas._buf;
            for (let y = 0; y < img.height; y++) {
                const dyy = dy + y;
                if (dyy < 0 || dyy >= dst.height) continue;
                for (let x = 0; x < img.width; x++) {
                    const dxx = dx + x;
                    if (dxx < 0 || dxx >= dst.width) continue;
                    const so = (y * img.width + x) * 4;
                    const doo = (dyy * dst.width + dxx) * 4;
                    dst.data[doo] = img.data[so];
                    dst.data[doo + 1] = img.data[so + 1];
                    dst.data[doo + 2] = img.data[so + 2];
                    dst.data[doo + 3] = img.data[so + 3];
                }
            }
        },
        save() {
            stack.push(m.slice());
        },
        restore() {
            const s = stack.pop();
            if (s) m = s;
        },
        translate(tx, ty) {
            // post-multiply: M' = M * T(tx,ty)
            m = [m[0], m[1], m[2], m[3], m[0] * tx + m[2] * ty + m[4], m[1] * tx + m[3] * ty + m[5]];
        },
        scale(sx, sy) {
            // post-multiply: M' = M * S(sx,sy)
            m = [m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, m[4], m[5]];
        },
        drawImage(src, ...args) {
            let sx0 = 0, sy0 = 0, sw = src.width, sh = src.height, ddx, ddy, dw, dh;
            if (args.length === 2) {
                [ddx, ddy] = args;
                dw = sw; dh = sh;
            } else if (args.length === 4) {
                [ddx, ddy, dw, dh] = args;
            } else {
                [sx0, sy0, sw, sh, ddx, ddy, dw, dh] = args;
            }
            const srcBuf = src._buf;
            const dst = canvas._buf;
            for (let y = 0; y < dh; y++) {
                const syy = sy0 + Math.floor((y * sh) / dh);
                if (syy < 0 || syy >= srcBuf.height) continue;
                for (let x = 0; x < dw; x++) {
                    const sxx = sx0 + Math.floor((x * sw) / dw);
                    if (sxx < 0 || sxx >= srcBuf.width) continue;
                    const so = (syy * srcBuf.width + sxx) * 4;
                    const sa = srcBuf.data[so + 3];
                    if (sa === 0) continue;
                    const [px, py] = apply(ddx + x, ddy + y);
                    const fx = Math.round(px), fy = Math.round(py);
                    if (fx < 0 || fx >= dst.width || fy < 0 || fy >= dst.height) continue;
                    const doo = (fy * dst.width + fx) * 4;
                    compositeSrcOver(dst.data, doo, srcBuf.data[so], srcBuf.data[so + 1], srcBuf.data[so + 2], sa);
                }
            }
        },
    };
}

function makeCanvas() {
    const canvas = {
        width: 0,
        height: 0,
        _buf: null,
        getContext(type) {
            if (type !== '2d') return null;
            // (Re)allocate the backing buffer to the canvas's current size the
            // first time a context is requested -- matches buildSpriteCanvas's
            // usage (set width/height, then getContext).
            if (!canvas._buf || canvas._buf.width !== canvas.width || canvas._buf.height !== canvas.height) {
                canvas._buf = makeBuffer(canvas.width, canvas.height);
            }
            if (!canvas._ctx) canvas._ctx = makeContext(canvas);
            return canvas._ctx;
        },
    };
    return canvas;
}

/** Install the global `document.createElement('canvas')` shim. Idempotent. */
export const installDomShim = () => {
    if (globalThis.document?.__softCanvasShim) return;
    globalThis.document = {
        __softCanvasShim: true,
        createElement(tag) {
            if (tag !== 'canvas') throw new Error(`soft-canvas: unsupported element <${tag}>`);
            return makeCanvas();
        },
    };
};

/** Create a standalone root canvas of the given size (for use as a render target). */
export const createCanvas = (width, height) => {
    const c = makeCanvas();
    c.width = width;
    c.height = height;
    c.getContext('2d');
    return c;
};

/** Read out an RGBA Uint8Array copy of a canvas's current pixels. */
export const readCanvasRGBA = (canvas) => Uint8Array.from(canvas._buf.data);

/**
 * Minimal deterministic browser-presentation-policy stub -- just enough for
 * drawBackground: settings all resolve to their defaults (clouds off, waves
 * on, time 'original', so day/night selection is driven explicitly by the
 * caller rather than by the policy), the clock is frozen, and per-key
 * animation state persists across calls (as the real policy's backgroundState
 * does) so repeated calls with the same key don't re-seed cloud/wave phase.
 */
export const makePolicy = (seed = 1) => {
    const states = new Map();
    let rngState = (seed >>> 0) || 1;
    return {
        now: () => 0,
        setting: (_key, def) => def,
        currentHour: () => 12,
        random: () => {
            rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
            return rngState / 0x100000000;
        },
        backgroundState: (key) => {
            if (!states.has(key)) states.set(key, {});
            return states.get(key);
        },
    };
};

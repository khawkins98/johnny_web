import { createVga } from './vga.mjs';
import { createLottes } from './lottes.mjs';
import { createCrt } from './renderer.mjs';
import { trackCanvasWrites } from './canvas-writes.mjs';

/** Read completed native layers; never mutate or re-run the game renderer. */
export function createCrtPresentation({ root, onStatus = () => {}, onActiveChange = () => {} }) {
    // "Active" means a CRT look is wanted and usable; transient context loss does not count,
    // so the picture is not resized while the GPU recovers.
    let active = false;
    const report = () => {
        const next = enabled && !settings?.bypass && !failed && !disposed;
        if (next !== active) { active = next; onActiveChange(active); }
    };
    // With no CRT look, the same GPU path can still resample the picture evenly at sizes where
    // the browser offers only blurry or uneven scaling. It uses the Creative renderer, effects off.
    let resample = false;
    const NEUTRAL = Object.freeze({ blur: 0, bleed: 0, bloom: 0, scanlines: 0, curvature: 0, vignette: 0 });
    const neutral = () => !enabled && resample;
    const running = () => (enabled && !settings?.bypass) || neutral();
    const factory = () => (neutral() ? createCrt : { vga: createVga, lottes: createLottes }[settings?.model] || createCrt);
    const layers = ['mainCanvas', 'canvas'].map(id => root.querySelector(`#${id}`));
    const source = document.createElement('canvas'); source.width = 640; source.height = 480;
    let context, writes;
    // What the output currently shows; null forces the next frame to be drawn.
    let shown = null;
    const style = document.createElement('style');
    style.textContent = '#root.jc-crt-active > #mainCanvas, #root.jc-crt-active > #canvas { visibility: hidden !important; }';
    document.head.append(style);
    let output, renderer, frame = 0, enabled = false, settings, lost = false, failed = false, disposed = false;
    const reveal = () => { shown = null; root.classList.remove('jc-crt-active'); if (output) output.hidden = true; };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; reveal(); };
    const failure = message => {
        const quiet = neutral();
        failed = true; stop(); report();
        // Resampling is an invisible refinement: fall back to the browser's scaling without a warning.
        onStatus(quiet ? 'CRT off.' : `${message}. Showing the normal picture. Switch CRT off and on to retry.`);
    };
    function build() {
        output?.remove(); shown = null;
        output = document.createElement('canvas'); output.id = 'johnny-crt-output';
        output.setAttribute('aria-hidden', 'true');
        Object.assign(output.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2' });
        output.hidden = true; document.body.append(output);
        const canvas = output;
        output.addEventListener('webglcontextrestored', () => {
            if (disposed || !running() || output !== canvas) return;
            try { renderer?.dispose(false); renderer = factory()(output, contextLost); lost = false; failed = false; report(); schedule(); }
            catch (error) { failure(error.message); }
        });
        renderer = factory()(output, contextLost);
    }
    function contextLost(message) { lost = true; stop(); if (!neutral()) onStatus(`${message}. Showing the normal picture while the GPU recovers.`); }
    function tick() {
        frame = 0;
        if (!running() || document.hidden || disposed || lost || failed) { reveal(); return; }
        try {
            const rect = layers[0].getBoundingClientRect();
            if (!rect.width || !rect.height || root.querySelector('#data-error.visible')) { reveal(); schedule(); return; }
            const dpr = window.devicePixelRatio || 1;
            // Bound GPU allocation on large / high-DPR displays; source remains native.
            const limit = Math.min(4096, renderer.maxOutputSize);
            const ratio = Math.min(dpr, limit / rect.width, limit / rect.height);
            const width = Math.max(1, Math.round(rect.width * ratio));
            const height = Math.max(1, Math.round(rect.height * ratio));
            const plain = neutral();
            if (!plain && settings.model === 'vga' && (width < 160 || height < 120)) { reveal(); onStatus('VGA needs at least 160×120 output pixels. Showing the normal picture.'); schedule(); return; }
            // Base sampling: 0 linear, 1 nearest (whole device multiples), 2 even blocks with blended edges.
            const sharp = plain ? 2 : getComputedStyle(layers[0]).imageRendering === 'pixelated' ? 1 : 0;
            // Put the output on device pixels at exactly its backing size, so the browser does not
            // resample the finished picture a second time.
            const aligned = ratio === dpr;
            const box = aligned
                ? { left: Math.round(rect.left * dpr) / dpr, top: Math.round(rect.top * dpr) / dpr, width: width / dpr, height: height / dpr }
                : rect;
            // The game changes its picture far less often than the display refreshes (never while
            // paused), so only upload and redraw when the layers, geometry or settings changed.
            writes ||= layers.map(trackCanvasWrites);
            const state = [...writes.map(count => count()), ...layers.flatMap(layer => [layer.width, layer.height]),
                rect.left, rect.top, rect.width, rect.height, width, height, sharp].join();
            if (state === shown) { schedule(); return; }
            Object.assign(output.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
            context ||= source.getContext('2d');
            context.fillStyle = '#000'; context.fillRect(0, 0, 640, 480);
            for (const layer of layers) context.drawImage(layer, 0, 0, 640, 480);
            renderer.draw(source, width, height, plain ? NEUTRAL : settings, sharp);
            output.hidden = false; root.classList.add('jc-crt-active'); shown = state;
            onStatus(plain ? 'CRT off.' : 'CRT enabled.');
        } catch (error) { failure(error.message); return; }
        schedule();
    }
    function schedule() {
        if (!frame && running() && !document.hidden && !lost && !failed && !disposed) frame = requestAnimationFrame(tick);
    }
    const visibility = () => { if (document.hidden) stop(); else schedule(); };
    document.addEventListener('visibilitychange', visibility);
    // pagehide also releases the context; pageshow recreates it for bfcache returns.
    // A loss belongs to the context being discarded; a rebuilt output starts with a fresh one.
    const release = () => { stop(); renderer?.dispose(); renderer = null; output?.remove(); output = null; lost = false; };
    const resume = () => {
        if (!running() || disposed) return;
        try { if (!renderer) build(); lost = false; failed = false; report(); schedule(); } catch (error) { failure(error.message); }
    };
    window.addEventListener('pagehide', release); window.addEventListener('pageshow', resume);
    return {
        update(nextEnabled, nextSettings) {
            const changedModel = settings?.model !== nextSettings.model;
            settings = nextSettings; shown = null;
            if (changedModel) { release(); failed = false; lost = false; }
            if (enabled !== nextEnabled) {
                // The resampling pass and the CRT looks use different renderers; start clean either way.
                enabled = nextEnabled; failed = false; lost = false; release();
            }
            if (!enabled || settings.bypass) onStatus(enabled ? 'CRT bypassed.' : 'CRT off.');
            if (!running()) { stop(); report(); return; }
            try { if (!renderer && !failed) build(); schedule(); } catch (error) { failure(error.message); }
            report();
        },
        /** Ask for even GPU resampling while no CRT look is on; the sizing code decides when it helps. */
        setResample(next) {
            if (resample === !!next) return;
            resample = !!next; shown = null;
            if (enabled || !settings) return;
            if (!resample) { release(); return; }
            try { if (!renderer && !failed) build(); schedule(); } catch (error) { failure(error.message); }
        },
        dispose() {
            disposed = true; enabled = false; release(); report(); style.remove();
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('pagehide', release); window.removeEventListener('pageshow', resume);
        },
    };
}

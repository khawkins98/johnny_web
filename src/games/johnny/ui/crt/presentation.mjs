import { createCrt } from './renderer.mjs';

/** Read completed native layers; never mutate or re-run the game renderer. */
export function createCrtPresentation({ root, onStatus = () => {} }) {
    const layers = ['mainCanvas', 'canvas'].map(id => root.querySelector(`#${id}`));
    const source = document.createElement('canvas'); source.width = 640; source.height = 480;
    let context;
    const style = document.createElement('style');
    style.textContent = '#root.jc-crt-active > #mainCanvas, #root.jc-crt-active > #canvas { visibility: hidden !important; }';
    document.head.append(style);
    let output, renderer, frame = 0, enabled = false, settings, lost = false, failed = false, disposed = false;
    const reveal = () => { root.classList.remove('jc-crt-active'); if (output) output.hidden = true; };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; reveal(); };
    const failure = message => { failed = true; stop(); onStatus(`${message}. Showing the normal picture. Switch CRT off and on to retry.`); };
    function build() {
        output?.remove();
        output = document.createElement('canvas'); output.id = 'johnny-crt-output';
        output.setAttribute('aria-hidden', 'true');
        Object.assign(output.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2' });
        output.hidden = true; document.body.append(output);
        const canvas = output;
        output.addEventListener('webglcontextrestored', () => {
            if (disposed || !enabled || output !== canvas) return;
            try { renderer?.dispose(false); renderer = createCrt(output, contextLost); lost = false; failed = false; schedule(); }
            catch (error) { failure(error.message); }
        });
        renderer = createCrt(output, contextLost);
    }
    function contextLost(message) { lost = true; stop(); onStatus(`${message}. Showing the normal picture while the GPU recovers.`); }
    function tick() {
        frame = 0;
        if (!enabled || settings.bypass || document.hidden || disposed || lost || failed) { reveal(); return; }
        try {
            const rect = layers[0].getBoundingClientRect();
            if (!rect.width || !rect.height || root.querySelector('#data-error.visible')) { reveal(); schedule(); return; }
            const dpr = window.devicePixelRatio || 1;
            // Bound GPU allocation on large / high-DPR displays; source remains native.
            const limit = Math.min(4096, renderer.maxOutputSize);
            const ratio = Math.min(dpr, limit / rect.width, limit / rect.height);
            const width = Math.max(1, Math.round(rect.width * ratio));
            const height = Math.max(1, Math.round(rect.height * ratio));
            const sharp = getComputedStyle(layers[0]).imageRendering === 'pixelated';
            Object.assign(output.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
            context ||= source.getContext('2d');
            context.fillStyle = '#000'; context.fillRect(0, 0, 640, 480);
            for (const layer of layers) context.drawImage(layer, 0, 0, 640, 480);
            renderer.draw(source, width, height, settings, sharp);
            output.hidden = false; root.classList.add('jc-crt-active');
            onStatus('CRT enabled.');
        } catch (error) { failure(error.message); return; }
        schedule();
    }
    function schedule() {
        if (!frame && enabled && !settings.bypass && !document.hidden && !lost && !failed && !disposed) frame = requestAnimationFrame(tick);
    }
    const visibility = () => { if (document.hidden) stop(); else schedule(); };
    document.addEventListener('visibilitychange', visibility);
    // pagehide also releases the context; pageshow recreates it for bfcache returns.
    const release = () => { stop(); renderer?.dispose(); renderer = null; output?.remove(); output = null; };
    const resume = () => {
        if (!enabled || settings.bypass || disposed) return;
        try { if (!renderer) build(); lost = false; failed = false; schedule(); } catch (error) { failure(error.message); }
    };
    window.addEventListener('pagehide', release); window.addEventListener('pageshow', resume);
    return {
        update(nextEnabled, nextSettings) {
            settings = nextSettings;
            if (enabled !== nextEnabled) {
                enabled = nextEnabled; failed = false; lost = false;
                if (!enabled) release();
            }
            if (!enabled || settings.bypass) { stop(); onStatus(enabled ? 'CRT bypassed.' : 'CRT off.'); return; }
            try { if (!renderer && !failed) build(); schedule(); } catch (error) { failure(error.message); }
        },
        dispose() {
            disposed = true; enabled = false; release(); style.remove();
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('pagehide', release); window.removeEventListener('pageshow', resume);
        },
    };
}

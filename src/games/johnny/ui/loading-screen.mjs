/**
 * loading-screen.mjs — keeps the page covered until the title screen can appear whole.
 *
 * index.html draws the cover (#jc-loading) with inline styles, so it is on screen before
 * any stylesheet or script arrives. Without it the first paint shows the title screen's
 * markup unstyled (in development, where styles arrive with the scripts) and then the
 * painted cabinet, shelf and controls popping in one by one as several megabytes of
 * artwork download.
 *
 * The cover lifts when all of these are done, or after MAX_WAIT_MS whatever happens, so a
 * stalled download can never leave the page blank:
 *   - the title-screen artwork has downloaded and decoded
 *   - the bundled fonts are ready
 *   - the app has shown the title screen, or the "add the game files" card
 */
import cabinet from './island-art/cabinet.png';
import shelf from './island-art/shelf.png';
import objects from './island-art/objects.png';
import labels from './island-art/labels.png';
import title from './island-art/title.png';

export const LOADING_ART = Object.freeze([cabinet, shelf, objects, labels, title]);
export const MAX_WAIT_MS = 10000;
const FADE_MS = 260;

const decode = (url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => (image.decode ? image.decode().then(resolve, resolve) : resolve());
    image.onerror = resolve;
    image.src = url;
});

/** Resolves once the title screen or the missing-data card is showing. */
const screenShown = (doc) => new Promise((resolve) => {
    const targets = [doc.getElementById('start-overlay'), doc.getElementById('data-error')].filter(Boolean);
    const shown = () => targets.some((node) => node.classList.contains('visible'));
    if (!targets.length || shown()) return resolve();
    const observer = new MutationObserver(() => {
        if (!shown()) return;
        observer.disconnect();
        resolve();
    });
    for (const node of targets) observer.observe(node, { attributes: true, attributeFilter: ['class'] });
});

/**
 * Start watching. Returns a promise that resolves when the cover has gone.
 *
 * @param {object} [options]
 * @param {Document} [options.doc]
 * @param {string[]} [options.art]  picture URLs to wait for
 * @param {number} [options.maxWait]
 */
export function runLoadingScreen({ doc = document, art = LOADING_ART, maxWait = MAX_WAIT_MS } = {}) {
    const cover = doc.getElementById('jc-loading');
    if (!cover) return Promise.resolve();
    const bar = cover.querySelector('.jc-loading-bar');
    const steps = [
        ...art.map(decode),
        doc.fonts?.ready ? Promise.resolve(doc.fonts.ready).catch(() => {}) : Promise.resolve(),
        screenShown(doc),
    ];
    let done = 0;
    const report = () => {
        done++;
        const percent = Math.round((done / steps.length) * 100);
        bar?.style.setProperty('--jc-loading-progress', `${percent}%`);
        bar?.setAttribute('aria-valuenow', String(percent));
    };
    for (const step of steps) step.then(report);

    return new Promise((resolve) => {
        let lifted = false;
        const lift = () => {
            if (lifted) return;
            lifted = true;
            window.clearTimeout(cap);
            cover.classList.add('is-done');
            window.setTimeout(() => {
                cover.remove();
                resolve();
            }, FADE_MS);
        };
        const cap = window.setTimeout(lift, maxWait);
        // One more frame after the last step, so the title screen has been laid out and painted.
        Promise.all(steps).then(() => (typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(() => requestAnimationFrame(lift)) : lift()));
    });
}

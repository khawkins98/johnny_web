/**
 * saver-mode.mjs — the app opened as a screensaver, from a link ending in `?saver`.
 *
 * The link skips the title screen and goes straight to Full view (browser-app.mjs does that
 * part). While that Full view lasts, this module does what a screensaver host would:
 *   - asks the browser to keep the screen awake, so the system's own saver or display
 *     sleep does not cut in
 *   - hides a pointer that has stopped moving
 *
 * Both wait for the picture. Over the title screen or the "add the game files" card the
 * page behaves normally. Leaving Full view (Esc, F, H) ends saver mode for the visit and
 * takes the flag off the address, so a reload opens the ordinary app.
 *
 * See docs/screensaver-mode.md.
 */
export const SAVER_PARAM = 'saver';
export const POINTER_IDLE_MS = 3000;
const OFF_VALUES = new Set(['0', 'off', 'false']);

/** Does this address ask for saver mode? `?saver` and `?saver=1` do; `?saver=off` does not. */
export const isSaverRequest = (search) => {
    try {
        const value = new URLSearchParams(search ?? '').get(SAVER_PARAM);
        return value !== null && !OFF_VALUES.has(value.toLowerCase());
    } catch {
        return false;
    }
};

/** The link to bookmark or drag to the desktop: this copy of the app, in saver mode. */
export const saverLinkFor = ({ origin, pathname }) => `${origin}${pathname}?${SAVER_PARAM}`;

/**
 * @param {object} [options]
 * @param {Window} [options.win]
 * @param {Document} [options.doc]
 * @param {number} [options.idleMs]  how long the pointer rests before it is hidden
 * @returns {{ readonly armed: boolean, destroy: () => void }}  `armed` is true from a
 *   saver link until Full view has been entered and left.
 */
export function setupSaverMode({ win = window, doc = document, idleMs = POINTER_IDLE_MS } = {}) {
    const body = doc.body;
    let armed = isSaverRequest(win.location.search);
    let engaged = false;
    let sentinel = null;
    let idleTimer = null;

    const holdAwake = async () => {
        const wakeLock = win.navigator?.wakeLock;
        if (!wakeLock?.request || sentinel || doc.visibilityState === 'hidden') return;
        try {
            const granted = await wakeLock.request('screen');
            // Saver mode may have ended, or a second request raced this one, while we waited.
            if (!engaged || sentinel) granted.release?.().catch?.(() => {});
            else {
                sentinel = granted;
                // The browser releases the lock itself when the tab is hidden.
                granted.addEventListener?.('release', () => { if (sentinel === granted) sentinel = null; });
            }
        } catch {
            // No permission, low battery, or a hidden tab: the saver still plays.
        }
    };
    const letSleep = () => {
        sentinel?.release?.().catch?.(() => {});
        sentinel = null;
    };
    const onVisibility = () => {
        if (doc.visibilityState === 'hidden') return;
        // A lock held across a hidden spell has been released by the browser already.
        sentinel = null;
        holdAwake();
    };
    const restPointer = () => {
        win.clearTimeout(idleTimer);
        idleTimer = win.setTimeout(() => body.classList.add('jc-saver-idle'), idleMs);
    };
    const onPointer = () => {
        body.classList.remove('jc-saver-idle');
        restPointer();
    };

    const engage = () => {
        engaged = true;
        body.classList.add('jc-saver');
        win.addEventListener('pointermove', onPointer);
        win.addEventListener('pointerdown', onPointer);
        doc.addEventListener('visibilitychange', onVisibility);
        restPointer();
        holdAwake();
    };
    const disengage = () => {
        engaged = false;
        win.clearTimeout(idleTimer);
        win.removeEventListener('pointermove', onPointer);
        win.removeEventListener('pointerdown', onPointer);
        doc.removeEventListener('visibilitychange', onVisibility);
        body.classList.remove('jc-saver', 'jc-saver-idle');
        letSleep();
    };
    const forgetFlag = () => {
        try {
            const url = new URL(win.location.href);
            url.searchParams.delete(SAVER_PARAM);
            win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        } catch {
            // An address that cannot be rewritten only means a reload starts the saver again.
        }
    };

    const follow = () => {
        const fullView = body.classList.contains('jc-full-view');
        if (armed && !engaged && fullView) engage();
        else if (engaged && !fullView) {
            disengage();
            armed = false;
            forgetFlag();
        }
    };
    const observer = armed && typeof MutationObserver === 'function' ? new MutationObserver(follow) : null;
    observer?.observe(body, { attributes: true, attributeFilter: ['class'] });
    follow();

    return {
        get armed() { return armed; },
        destroy() {
            observer?.disconnect();
            if (engaged) disengage();
        },
    };
}

/**
 * share-link.mjs — keeps the address bar pointing at what is playing.
 *
 * As each gag starts, the page's hash is rewritten (without adding history entries) to the
 * same stage link the debug panel copies, plus the time of day:
 *
 *     #stage=FISHING.ADS:3&day=2&mode=preview&time=early
 *
 * so the address can be bookmarked or shared at any moment. Opening such a link is handled
 * where it always was (the host reads it at startup and plays that gag as a temporary
 * visit); this module also follows a hash edited or pasted into an open page.
 */
import { formatDebugStageHash, parseDebugStageHash } from '../../../bottle/debug-stage-link.mjs';
import { bandForPhase, findRecord } from '../story-steps.mjs';

// Idle fillers between gags are not worth linking to: the link keeps the last real gag.
const isLinkable = (gag) => Boolean(gag && gag.script !== 'STAND.ADS' && /\.ADS$/.test(gag.script) && findRecord(gag));

/** The hash for a playback status, or null when nothing linkable is playing. */
export const shareHashFor = (status) => {
    if (!isLinkable(status?.active)) return null;
    return formatDebugStageHash({
        script: status.active.script,
        tagId: status.active.tagId,
        storyDay: status.storyDay ?? 1,
        // A whole visit (the Log's Visit this day, or a sequence link) stays one; anything else is the single gag.
        mode: status.band && !status.preview ? 'sequence' : 'preview',
        band: status.band ?? bandForPhase(status.tidePhase)?.id ?? null,
    });
};

/**
 * @param {object} options
 * @param {object|null} options.sequenceTools  needs subscribeStatus; startRun to follow pasted links
 * @param {Window} [options.win]
 * @returns {{destroy: () => void}}
 */
export function setupShareLink({ sequenceTools = null, win = window } = {}) {
    let written = null;
    const unsubscribe = sequenceTools?.subscribeStatus?.((status) => {
        const hash = shareHashFor(status);
        if (!hash || hash === written || hash === win.location.hash) {
            if (hash) written = hash;
            return;
        }
        written = hash;
        try {
            win.history.replaceState(win.history.state, '', hash);
        } catch { /* A sandboxed page may refuse; the link just stays as it was. */ }
    });
    // replaceState never fires this, so it is only a hash someone typed or pasted.
    const onHashChange = () => {
        const stage = parseDebugStageHash(win.location.hash);
        if (!stage || win.location.hash === written || !findRecord(stage)) return;
        try {
            sequenceTools?.startRun?.(stage);
        } catch { /* Not a gag the game can start; leave playback alone. */ }
    };
    win.addEventListener('hashchange', onHashChange);
    return {
        destroy() {
            if (typeof unsubscribe === 'function') unsubscribe();
            win.removeEventListener('hashchange', onHashChange);
        },
    };
}

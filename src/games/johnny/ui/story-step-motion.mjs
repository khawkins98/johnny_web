/**
 * story-step-motion.mjs — short entrances between story timeline steps.
 *
 * Going deeper deals the next step's cards in like a hand of cards; going
 * back slides them in from the other side. A card picked to open a gag flies
 * from where it was clicked to its place at the top of the gag view, so the
 * eye can follow it. Everything is skipped when the viewer asks for reduced
 * motion, or when the browser can't animate elements.
 */

export const STEP_LEVELS = Object.freeze(['day', 'tide', 'gag', 'detail']);

/** 'forward' when moving deeper (day → tide → gag → detail), 'back' when returning, else null. */
export function stepDirection(fromLevel, toLevel) {
    const from = STEP_LEVELS.indexOf(fromLevel);
    const to = STEP_LEVELS.indexOf(toLevel);
    if (from < 0 || to < 0 || from === to) return null;
    return to > from ? 'forward' : 'back';
}

const prefersReducedMotion = () => {
    try {
        return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
        return false;
    }
};

const EASE_OUT = 'cubic-bezier(.2, .8, .25, 1)';
// Only the first few items are staggered, so a long grid doesn't take ages.
const STAGGER_MS = 28;
const STAGGER_LIMIT = 14;

/** Deal or slide a list of elements in, one after another. */
function dealIn(items, direction) {
    items.forEach((item, index) => {
        const tilt = index % 2 ? 2.5 : -2.5;
        const start = direction === 'back'
            ? { opacity: 0, transform: 'translateX(-28px)' }
            : { opacity: 0, transform: `translateY(26px) rotate(${tilt}deg) scale(.94)` };
        item.animate([start, { opacity: 1, transform: 'none' }], {
            duration: 260,
            delay: Math.min(index, STAGGER_LIMIT) * STAGGER_MS,
            easing: EASE_OUT,
            fill: 'backwards',
        });
    });
}

/** Fly an element from a previous on-screen rectangle to where it is now. */
function flyFrom(element, from) {
    const to = element.getBoundingClientRect();
    if (!to.width || !to.height || !from?.width || !from?.height) return false;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const scale = from.width / to.width;
    element.style.transformOrigin = '0 0';
    element.animate([
        { transform: `perspective(900px) translate(${dx}px, ${dy}px) scale(${scale}) rotateY(-18deg)` },
        { transform: 'perspective(900px) none' },
    ], { duration: 420, easing: EASE_OUT });
    return true;
}

/**
 * Play the entrance for a freshly rendered step.
 *
 * @param {HTMLElement} root  the stepper section (`.story-steps`)
 * @param {{direction:'forward'|'back'|null, from?:DOMRect|null}|null} motion
 */
export function playStepEntrance(root, motion) {
    if (!root || !motion?.direction || prefersReducedMotion()) return;
    if (typeof root.animate !== 'function') return;

    const hero = root.querySelector('.story-steps-hero');
    if (hero) {
        const card = hero.querySelector('.story-steps-card');
        const flew = motion.direction === 'forward' && card && flyFrom(card, motion.from);
        const rest = [...hero.children].filter((child) => !(flew && child === card));
        dealIn(rest, motion.direction);
        return;
    }
    const items = root.querySelectorAll('.story-steps-grid > *, .story-steps-tides > *, .story-steps-visit, .story-steps-empty');
    dealIn([...items], motion.direction);
}

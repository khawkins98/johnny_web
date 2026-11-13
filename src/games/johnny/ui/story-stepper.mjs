/**
 * story-stepper.mjs — the story timeline in two screens: pick what to watch, then
 * (only if it matters) what time of day.
 *
 * Home is a beach scene (see island-map.mjs): a fold-out map of the island holding the 40
 * everyday gags, eleven flags for the story days, and a diary of the visit in progress. The
 * day changes only which story scene plays and the time of day only matters for a
 * dozen gags, so neither is a step of its own; time of day is a choice on the scene.
 *
 * The panel owns the state ({ level, day, band, gag, filter }); this module renders
 * the current screen and reports choices through callbacks.
 */
import {
    TIDE_BANDS, bandById, bandForGag, bandsFor, describeWhenItPlays,
} from '../story-steps.mjs';
import { CARD_HEIGHT, CARD_WIDTH, paintCardFace } from './story-card-faces.mjs';
import { DEFAULT_START_TIME, bandClockRanges } from '../start-time.mjs';
import { ISLAND_MAP_STYLE, renderIslandMap } from './island-map.mjs';

const pad = (value) => String(value).padStart(2, '0');

export const STEPPER_STYLE = `
.story-steps { margin: 4px 0 12px; color: #234e52; font: 14px/1.45 'Trebuchet MS', Arial, sans-serif; }
.story-steps-play { border-radius: 7px 4px; min-height: 42px; padding: 4px 14px; border: 2px solid #22553b; background: #f2cc91; color: #234e52;
  font: 700 14px/1.35 'Trebuchet MS', Arial, sans-serif; cursor: pointer; }
.story-steps-play:disabled { opacity: .5; cursor: default; }
.story-steps-grid { display: grid; gap: 22px 14px; padding-top: 8px; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); }
.story-steps-card { position: relative; padding: 0; border: 0; background: none; cursor: pointer; text-align: left; }
.story-steps-card canvas { display: block; width: 100%; height: auto; aspect-ratio: ${CARD_WIDTH} / ${CARD_HEIGHT};
  box-shadow: 3px 4px #234e5233; transition: transform .12s ease; }
.story-steps-card:hover canvas { transform: translateY(-4px); }
.story-steps-card:focus-visible { outline: 3px solid #e99a32; outline-offset: 3px; }
.story-steps-card .story-steps-badge { position: absolute; top: -16px; left: 50%; transform: translateX(-50%); padding: 2px 6px; background: #f2cc91; color: #234e52;
  border: 2px solid #22553b; font-size: 12px; }
.story-steps-hero { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: start; }
.story-steps-hero .story-steps-card { cursor: default; }
.story-steps-hero ul { list-style: none; margin: 6px 0 12px; padding: 0; color: #234e52; }
.story-steps-hero li { margin: 3px 0; }
@media (max-width: 640px) {
  .story-steps-hero { grid-template-columns: 100px minmax(0, 1fr); }
  .story-steps-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
}
.story-steps-hero-name { margin: 0; font: 700 28px/1.15 Georgia, serif; color: #22553b; overflow-wrap: anywhere; }
.story-steps-play:hover:not(:disabled) { background: #f6e2ae; }
.story-steps-card canvas { border-radius: 7px 4px; }
.story-steps-hero > div { min-width: 0; }
@media (max-width: 640px) { .story-steps-hero-name { font-size: 22px; } }
@media (prefers-reduced-motion: reduce) {
  .story-steps-card canvas { transition: none; }
  .story-steps-card:hover canvas { transform: none; }
}

.story-steps-link { border: 0; background: none; padding: 0; min-height: 40px; color: #22553b; cursor: pointer;
  font: 700 14px/1.35 'Trebuchet MS', Arial, sans-serif; text-decoration: underline; }
.story-steps-link:focus-visible, .story-steps-chip:focus-visible { outline: 3px solid #e99a32; outline-offset: 2px; }
.story-steps-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
.story-steps-chip { min-height: 40px; padding: 4px 14px; border: 2px solid #22553b; border-radius: 999px; background: #fff9dc; color: #234e52;
  font: 700 13px/1.35 'Trebuchet MS', Arial, sans-serif; cursor: pointer; }
.story-steps-chip[aria-pressed="true"] { background: #2f6f5e; color: #fff9dc; }
.story-steps-chip:disabled { opacity: .45; cursor: not-allowed; text-decoration: line-through; }
.story-steps-card.is-dim { opacity: .3; }
.story-steps-question { margin: 12px 0 6px; font: 700 14px/1.35 'Trebuchet MS', Arial, sans-serif; }
.story-steps-hint { margin: 0 0 10px; color: #53736a; }
.story-steps-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.story-steps-backrow { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 14px; margin: 0 0 8px; }
${ISLAND_MAP_STYLE}
`;

/**
 * A card button with a painted face. The real frame fills in when the face
 * queue has rendered it.
 */
function cardButton({ gag, name, kicker, live = false, badge = null, faces, label, onClick, priority = false }) {
    const button = document.createElement(onClick ? 'button' : 'div');
    if (onClick) {
        button.type = 'button';
        button.addEventListener('click', onClick);
        // Lets the panel put focus back on this card after it redraws.
        button.dataset.focus = `card:${gag.script}:${gag.tagId}`;
    } else button.setAttribute('role', 'img');
    button.className = 'story-steps-card';
    button.setAttribute('aria-label', label);
    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    canvas.setAttribute('aria-hidden', 'true');
    button.appendChild(canvas);
    if (badge) {
        const tag = document.createElement('span');
        tag.className = 'story-steps-badge';
        tag.textContent = badge;
        tag.setAttribute('aria-hidden', 'true');
        button.appendChild(tag);
    }
    const context = canvas.getContext?.('2d');
    let image = null;
    const paint = () => {
        if (!context) return;
        context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        paintCardFace(context, { name, kicker, image, script: gag.script, final: gag.final, keyDay: gag.keyDay, live });
    };
    paint();
    // Only render a real frame once the card is (nearly) on screen, and drop the
    // request if the card has gone by the time its turn comes.
    const requestFace = () => {
        faces?.request(gag, (frame) => {
            if (!frame) return;
            image = frame;
            paint();
        }, { wanted: () => button.isConnected });
        if (priority) faces?.prioritize(gag);
    };
    if (priority || typeof IntersectionObserver !== 'function') requestFace();
    else {
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            requestFace();
        }, { rootMargin: '200px' });
        observer.observe(button);
    }
    // Repaint if the browser resolves a delayed system-font fallback.
    document.fonts?.ready?.then(paint).catch(() => {});
    return button;
}

/**
 * Render the current screen into `host`.
 *
 * @param {HTMLElement} host
 * @param {object} options
 * @param {{level:'home'|'detail', day:number, band:string, gag:object|null, filter?:string, place?:string, mapDay?:number}} options.step
 * @param {{day:number, band:string|null, gag:object|null, startTime?:number}} options.live  where Johnny is now,
 *        and the Start Time (HHMM) the story clock counts from
 * @param {Array} options.visit       the live visit (visitSequence), for the diary
 * @param {{day:number, band:string}|null} options.visiting  a temporary visit in progress
 * @param {number} [options.today]    the saved story day (differs from live.day while visiting)
 * @param {string|null} [options.nowBand]  the real time of day, or null when it is not known
 * @param {(gag)=>string} options.gagName
 * @param {object} options.faces      card face queue
 * @param {(patch, from?:DOMRect|null)=>void} options.onStep  move between screens / pick something;
 *        `from` is where the picked card was, for the entrance animation
 * @param {()=>void} options.onLive   show the gag Johnny is playing now
 * @param {(()=>void)|null} options.onGoBack  leave a temporary visit
 * @param {((gag, day, band)=>boolean)|null} options.onPlayGag
 * @param {string} [options.conditions]  the sky and tide now, for the diary
 * @returns {HTMLElement} the rendered screen, for playStepEntrance
 */
export function renderStoryStepper(host, {
    step, live, visit = [], visiting = null, today = live.day, nowBand = live.band, gagName, faces, onStep, onLive,
    onGoBack = null, onPlayGag = null, conditions = '',
}) {
    const root = document.createElement('section');
    root.className = 'story-steps';
    root.setAttribute('aria-label', 'Story timeline');
    host.appendChild(root);
    const startTime = live.startTime ?? DEFAULT_START_TIME;
    const sameGag = (a, b) => Boolean(a && b && a.script === b.script && a.tagId === b.tagId);
    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    };
    const playButton = (text, title, handler) => {
        const button = el('button', 'story-steps-play', text);
        button.type = 'button';
        button.title = title;
        button.disabled = !handler;
        button.addEventListener('click', () => {
            if (handler() === false) {
                button.disabled = true;
                button.textContent = 'Could not start';
            }
        });
        return button;
    };
    // A time-of-day chip; its tooltip gives the local clock times the band covers.
    const bandChip = (option, { pressed, disabled = false, onPick, focus }) => {
        const isNow = option.id === nowBand;
        const chip = el('button', 'story-steps-chip', `${option.label}${isNow ? ' · now' : ''}`);
        chip.type = 'button';
        chip.dataset.band = option.id;
        chip.dataset.focus = `${focus}:${option.id}`;
        chip.setAttribute('aria-pressed', String(pressed));
        chip.disabled = disabled;
        const ranges = bandClockRanges(startTime, option.min, option.max).join(', ');
        chip.title = disabled ? 'This one does not play then' : `${option.label}: ${ranges}`;
        chip.setAttribute('aria-label', `${option.label}${isNow ? ' (the time now)' : ''}, ${ranges}${disabled ? ', not available' : ''}`);
        chip.addEventListener('click', () => onPick(option.id));
        return chip;
    };

    if (step.level !== 'detail' || !step.gag) {
        // Home is the beach: the island map, the day flags and the diary. At its top, a
        // time-of-day filter that only dims what cannot play then; it starts nothing.
        const filter = bandById(step.filter);
        const chips = el('div', 'story-steps-chips story-steps-filter');
        chips.setAttribute('role', 'group');
        chips.setAttribute('aria-label', 'Show what can play at');
        const any = el('button', 'story-steps-chip', 'Any time');
        any.type = 'button';
        any.dataset.focus = 'filter:any';
        any.setAttribute('aria-pressed', String(!filter));
        any.addEventListener('click', () => onStep({ filter: null }));
        chips.appendChild(any);
        for (const option of TIDE_BANDS) {
            chips.appendChild(bandChip(option, { pressed: filter?.id === option.id, focus: 'filter', onPick: (id) => onStep({ filter: id }) }));
        }
        renderIslandMap(root, {
            toolbar: chips, conditions,
            place: step.place ?? null, day: step.mapDay ?? null, filter: filter?.id ?? null, live, today, gagName, onStep,
            // The diary shows where Johnny is and the visit in progress.
            visit, visiting, onLive, onGoBack,
            // Starting a day plays its story scene at the filtered time, else the time now,
            // whichever the scene can actually show.
            onStartDay: onPlayGag
                ? (scene) => onPlayGag(scene, scene.keyDay, bandForGag(scene, filter?.id ?? live.band, live.band)) : null,
            // A gag picked on the map plays at the filtered time, else the time now, whichever
            // it can actually play at.
            onPlay: onPlayGag
                ? (gag, day) => onPlayGag(gag, day, bandForGag(gag, filter?.id ?? live.band, live.band)) : null,
            makeCard: (options) => cardButton({ ...options, faces }),
        });
        return root;
    }

    // One scene: what it is, what time of day to play it at, and Play. The panel renders
    // how the gag unfolds below.
    const gag = step.gag;
    const isLive = sameGag(gag, live.gag);
    const allowed = bandsFor(gag);
    // The panel keeps step.band to a time this gag can play at; this is only a safeguard.
    const band = allowed.find((option) => option.id === step.band) ?? allowed[0];
    const day = gag.keyDay || step.day || live.day;

    const backRow = el('div', 'story-steps-backrow');
    const back = el('button', 'story-steps-link', '‹ Back to the map');
    back.type = 'button';
    back.dataset.focus = 'back';
    back.addEventListener('click', () => onStep({ level: 'home' }));
    backRow.appendChild(back);
    if (!isLive && live.gag) {
        const liveLink = el('button', 'story-steps-link', '↖ Johnny now');
        liveLink.type = 'button';
        liveLink.dataset.focus = 'live';
        liveLink.addEventListener('click', onLive);
        backRow.appendChild(liveLink);
    }
    root.appendChild(backRow);

    const hero = el('div', 'story-steps-hero');
    hero.appendChild(cardButton({
        gag, faces, name: gagName(gag),
        kicker: isLive ? 'Now' : gag.keyDay ? `Day ${pad(gag.keyDay)}` : 'Gag',
        live: isLive, label: gagName(gag), priority: true,
    }));
    const info = document.createElement('div');
    info.appendChild(el('h3', 'story-steps-hero-name', gag.keyDay ? `Day ${gag.keyDay}: ${gagName(gag)}` : gagName(gag)));
    const facts = document.createElement('ul');
    const fact = (text) => facts.appendChild(el('li', null, text));
    if (isLive) fact('Johnny is playing this now.');
    if (gag.keyDay) fact(`✦ The story scene for day ${gag.keyDay}. In normal play, reaching it unlocks the next day.`);
    if (gag.final) fact(gag.first && !gag.keyDay ? '☾ Ends a visit, or plays on its own.' : '☾ Ends a visit.');
    if (!gag.keyDay && allowed.length === TIDE_BANDS.length) fact(describeWhenItPlays(gag));
    info.appendChild(facts);

    if (gag.offIsland) {
        // No island, no sky: asking would be a question with no visible answer.
        info.appendChild(el('p', 'story-steps-hint', 'This scene happens away from the island, so the time of day makes no difference.'));
    } else {
        info.appendChild(el('p', 'story-steps-question', 'What time of day?'));
        const chips = el('div', 'story-steps-chips');
        chips.setAttribute('role', 'group');
        chips.setAttribute('aria-label', 'Time of day');
        for (const option of TIDE_BANDS) {
            chips.appendChild(bandChip(option, {
                pressed: option.id === band.id,
                disabled: !allowed.includes(option),
                focus: 'band',
                onPick: (id) => onStep({ band: id }),
            }));
        }
        info.appendChild(chips);
        if (allowed.length < TIDE_BANDS.length) {
            const words = (option) => (option.id === 'night' ? 'at night' : `in the ${option.label.toLowerCase()}`);
            info.appendChild(el('p', 'story-steps-hint', gag.forceNight ? 'This scene always plays at night.'
                : allowed.length === 1 ? `This one only plays ${words(allowed[0])}.`
                    : `This one does not play ${TIDE_BANDS.filter((option) => !allowed.includes(option)).map(words).join(' or ')}.`));
        }
    }

    const actions = el('div', 'story-steps-actions');
    if (onPlayGag) {
        actions.appendChild(playButton(isLive ? '▶ Replay this gag' : gag.keyDay ? '▶ Play this scene' : '▶ Play this gag',
            'Play just this now, then go back to where you were', () => onPlayGag(gag, day, band.id)));
        actions.lastChild.dataset.focus = 'play';
    }
    info.appendChild(actions);
    hero.appendChild(info);
    root.appendChild(hero);
    return root;
}

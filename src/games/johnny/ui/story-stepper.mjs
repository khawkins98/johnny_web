/**
 * story-stepper.mjs — the story timeline in two screens: pick what to watch, then
 * (only if it matters) what time of day.
 *
 * Home is a fold-out map of the island (see island-map.mjs) or, as a plain list, the 11
 * story scenes in day order and the 40 everyday gags by kind. The
 * day changes only which story scene plays and the time of day only matters for a
 * dozen gags, so neither is a step of its own; time of day is a choice on the scene.
 *
 * The panel owns the state ({ level, day, band, gag, filter }); this module renders
 * the current screen and reports choices through callbacks.
 */
import {
    TIDE_BANDS, bandById, bandForGag, bandsFor, describeWhenItPlays, everydayGagsByFamily, restrictionLabel, storyScenes,
} from '../story-steps.mjs';
import { CARD_HEIGHT, CARD_WIDTH, paintCardFace } from './story-card-faces.mjs';
import { DEFAULT_START_TIME, bandClockRanges } from '../start-time.mjs';
import { ISLAND_MAP_STYLE, renderIslandMap } from './island-map.mjs';

const pad = (value) => String(value).padStart(2, '0');
// Where a pick was clicked, so the next step can fly the card from there.
const originOf = (event) => event?.currentTarget?.querySelector?.('canvas')?.getBoundingClientRect?.() ?? null;

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
.story-steps-visit { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 14px; padding: 8px 10px;
  border: 2px dashed #8bb9a8; }
.story-steps-visit > span { color: #53736a; margin-right: 4px; }
.story-steps-visit button { min-height: 40px; border-radius: 5px; padding: 3px 8px; border: 1px solid #8bb9a8; background: #c7e4df; color: #234e52;
  font: 13px/1.35 'Trebuchet MS', Arial, sans-serif; cursor: pointer; }
.story-steps-visit button[data-role="seen"] { opacity: .65; }
.story-steps-visit button[data-role="live"] { background: #f2cc91; color: #234e52; border-color: #22553b; }
.story-steps-visit button:disabled { cursor: default; opacity: .5; }
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

/* Where Johnny is and the visit in progress sit along the bottom edge of the panel, like a
   status strip, so the map or the list gets the top of the screen. */
.story-steps-now { position: sticky; bottom: 0; z-index: 6; box-shadow: 0 -5px 10px -4px #234e5244;
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 14px 0 0; padding: 10px 12px;
  border: 2px solid #8bb9a8; border-radius: 9px 5px; background: #e4f1dc; }
/* On a small screen a pinned strip would take a fifth of the view, and the end of a long list is
   a long way down: there it goes back to the top and scrolls with the page. */
@media (max-width: 700px), (max-height: 620px) {
  .story-steps { display: flex; flex-direction: column; }
  .story-steps-now { position: static; order: -1; margin: 0 0 14px; box-shadow: none; }
}
.story-steps-now-where { margin: 0; }
.story-steps-now-where strong { display: block; font: 700 17px/1.25 Georgia, serif; color: #22553b; }
/* One row that scrolls sideways, so a long visit never pushes the scenes off the first screen. */
.story-steps-now .story-steps-visit { flex: 1 1 100%; min-width: 0; margin: 0; padding: 2px 0 6px; border: 0;
  flex-wrap: nowrap; overflow-x: auto; }
.story-steps-now .story-steps-visit > * { flex: none; }
.story-steps-link { border: 0; background: none; padding: 0; min-height: 40px; color: #22553b; cursor: pointer;
  font: 700 14px/1.35 'Trebuchet MS', Arial, sans-serif; text-decoration: underline; }
.story-steps-link:focus-visible, .story-steps-chip:focus-visible { outline: 3px solid #e99a32; outline-offset: 2px; }
.story-steps-section { margin: 0 0 18px; }
.story-steps-section > h3 { margin: 0; font: 34px/1 'Caveat', cursive; color: #22553b; }
.story-steps-section > p { margin: 4px 0 10px; }
.story-steps-family { margin: 0 0 14px; }
.story-steps-family h4 { margin: 0 0 2px; color: #53736a; font: 700 13px/1.35 'Trebuchet MS', Arial, sans-serif;
  letter-spacing: .05em; text-transform: uppercase; }
.story-steps-days { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 22px 10px; }
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
.story-steps-viewbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 22px; margin: 0 0 10px; }
.story-steps-viewbar .story-steps-chips { margin: 0; }
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
        // Lets the panel put focus back on this card after it redraws the list.
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
 * @param {{level:'home'|'detail', day:number, band:string, gag:object|null, filter?:string, view?:'map'|'list', place?:string, mapDay?:number}} options.step
 * @param {{day:number, band:string|null, gag:object|null, startTime?:number}} options.live  where Johnny is now,
 *        and the Start Time (HHMM) the story clock counts from
 * @param {Array} options.visit       the live visit (visitSequence), for the Now bar
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
 * @returns {HTMLElement} the rendered screen, for playStepEntrance
 */
export function renderStoryStepper(host, {
    step, live, visit = [], visiting = null, today = live.day, nowBand = live.band, gagName, faces, onStep, onLive,
    onGoBack = null, onPlayGag = null,
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
        // Now: where Johnny is, and the visit in progress.
        const now = el('div', 'story-steps-now');
        const where = el('p', 'story-steps-now-where');
        const liveBand = bandById(live.band);
        where.appendChild(el('strong', null, visiting
            ? `Visiting Day ${visiting.day} · ${bandById(visiting.band)?.label ?? ''}`
            : `Now: Day ${live.day}${liveBand ? ` · ${liveBand.label}` : ''}`));
        where.appendChild(document.createTextNode(live.gag ? gagName(live.gag) : 'Nothing is playing yet.'));
        now.appendChild(where);
        if (live.gag) {
            const show = el('button', 'story-steps-link', 'How this gag works ›');
            show.type = 'button';
            show.dataset.focus = 'now-link';
            show.addEventListener('click', onLive);
            now.appendChild(show);
        }
        if (visiting && onGoBack) {
            const back = el('button', 'story-steps-play', 'Go back');
            back.type = 'button';
            back.dataset.focus = 'go-back';
            back.title = 'Return now to the day and gag you left. Nothing from this visit is saved.';
            back.addEventListener('click', onGoBack);
            now.appendChild(back);
        }
        if (visit.length) {
            const strip = el('div', 'story-steps-visit');
            strip.appendChild(el('span', null, 'This visit:'));
            for (const gag of visit) {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.dataset.role = gag.role;
                chip.dataset.focus = `visit:${gag.index ?? 0}`;
                const name = gag.filler ? 'pause' : gagName(gag);
                chip.textContent = `${pad(gag.index ?? 0)} ${name}${gag.repeat > 1 ? ` ×${gag.repeat}` : ''}`;
                chip.title = gag.role === 'live' ? 'Johnny now' : gag.role === 'seen' ? 'Already played' : 'Planned';
                if (gag.filler) chip.disabled = true;
                else chip.addEventListener('click', () => onStep({ level: 'detail', gag, day: live.day }));
                strip.appendChild(chip);
            }
            now.appendChild(strip);
            // Start the row at the gag that is playing.
            const liveChip = strip.querySelector('[data-role="live"]');
            if (liveChip) strip.scrollLeft = Math.max(0, liveChip.offsetLeft - 80);
        }
        const filter = bandById(step.filter);
        // The time-of-day filter only dims what cannot play then; it starts nothing.
        const filterChips = () => {
            const chips = el('div', 'story-steps-chips');
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
            return chips;
        };
        // Two ways to see the same scenes: the island map, or everything as a list.
        const view = step.view === 'map' ? 'map' : 'list';
        const viewbar = el('div', 'story-steps-viewbar');
        const views = el('div', 'story-steps-chips');
        views.setAttribute('role', 'group');
        views.setAttribute('aria-label', 'View');
        for (const [id, label] of [['map', 'Map'], ['list', 'List']]) {
            const chip = el('button', 'story-steps-chip', label);
            chip.type = 'button';
            chip.dataset.view = id;
            chip.dataset.focus = `view:${id}`;
            chip.setAttribute('aria-pressed', String(view === id));
            chip.addEventListener('click', () => onStep({ view: id }));
            views.appendChild(chip);
        }
        viewbar.appendChild(views);
        if (view === 'map') {
            viewbar.appendChild(filterChips());
            root.appendChild(viewbar);
            renderIslandMap(root, {
                place: step.place ?? null, day: step.mapDay ?? null, filter: filter?.id ?? null, live, today, gagName, onStep,
                // Starting a day plays its story scene at the filtered time, else the time now,
                // whichever the scene can actually show.
                onStartDay: onPlayGag
                    ? (scene) => onPlayGag(scene, scene.keyDay, bandForGag(scene, filter?.id ?? live.band, live.band)) : null,
                makeCard: (options) => cardButton({ ...options, faces }),
            });
            root.appendChild(now);
            return root;
        }
        root.appendChild(viewbar);

        // The story: one scene per day, in order.
        const story = el('section', 'story-steps-section');
        story.appendChild(el('h3', null, 'The story'));
        story.appendChild(el('p', null, 'Eleven days, one scene each. Pick a day to visit it.'));
        const days = el('div', 'story-steps-grid story-steps-days');
        for (const scene of storyScenes()) {
            const day = scene.keyDay;
            const isToday = day === today;
            days.appendChild(cardButton({
                gag: scene, faces,
                name: gagName(scene),
                kicker: `Day ${pad(day)}`,
                live: isToday,
                badge: isToday ? 'TODAY' : null,
                label: `Day ${day}: ${gagName(scene)}${isToday ? ' (today)' : ''}`,
                onClick: (event) => onStep({ level: 'detail', gag: scene, day }, originOf(event)),
            }));
        }
        story.appendChild(days);
        root.appendChild(story);

        // Everyday gags by kind. The filter only dims what cannot play then.
        const groups = everydayGagsByFamily();
        const total = groups.reduce((count, group) => count + group.gags.length, 0);
        const everyday = el('section', 'story-steps-section');
        everyday.appendChild(el('h3', null, 'Things Johnny does'));
        everyday.appendChild(el('p', null, `${total} everyday gags. They can turn up on any day; a few only by day or only at night.`));
        everyday.appendChild(filterChips());
        for (const group of groups) {
            const family = el('div', 'story-steps-family');
            family.appendChild(el('h4', null, group.label));
            const grid = el('div', 'story-steps-grid');
            for (const gag of group.gags) {
                const isLive = sameGag(gag, live.gag);
                const restriction = restrictionLabel(gag);
                const card = cardButton({
                    gag, faces,
                    name: gagName(gag),
                    kicker: restriction || (gag.final ? 'Ends a visit' : 'Gag'),
                    live: isLive,
                    badge: isLive ? 'NOW' : null,
                    label: `${gagName(gag)}${restriction ? `, ${restriction.toLowerCase()}` : ''}${gag.final ? ', ends a visit' : ''}${isLive ? ' (Johnny now)' : ''}`,
                    onClick: (event) => onStep({ level: 'detail', gag, day: live.day }, originOf(event)),
                });
                if (filter && !bandsFor(gag).some((band) => band.id === filter.id)) card.classList.add('is-dim');
                grid.appendChild(card);
            }
            family.appendChild(grid);
            everyday.appendChild(family);
        }
        root.appendChild(everyday);
        root.appendChild(now);
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
    const back = el('button', 'story-steps-link', '‹ All scenes');
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

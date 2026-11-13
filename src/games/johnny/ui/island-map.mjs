/**
 * island-map.mjs — the story timeline as a scene on the beach (issue #96).
 *
 * Three things lie on the sand: a fold-out map of the island with one painted object per
 * place you can go and watch; a row of eleven numbered flags for the story days, planted
 * outside the map because days are not places on the island; and an open logbook, the
 * diary, with today's visit written in as a checklist. It is a flat picture with buttons
 * on it: nothing here animates the game or changes playback. Picking a gag or starting a
 * day hands over to the same scene screen and Play actions as the list view.
 *
 * The stepper owns the state (the open place, the picked day, the time-of-day filter);
 * this module draws the scene and reports choices through callbacks.
 */
import { islandPlaces, placeForGag, placeOpenAt, storyTrail } from '../island-places.mjs';
import { bandById, bandsFor, restrictionLabel, gagFacts } from '../story-steps.mjs';
import { islandMapArt, islandMapArtSize } from './island-map-art.mjs';

// Handwriting for the diary: Caveat (bundled through @fontsource in src/index.mjs), then system hands.
const HAND = "'Caveat', 'Bradley Hand', 'Segoe Print', 'Ink Free', 'Noteworthy', cursive";

export const ISLAND_MAP_STYLE = `
.island-beach { position: relative; padding: clamp(10px, 1.6vw, 22px); border: 2px solid #8bb9a8; border-radius: 9px 5px;
  background: #ecd9a6 var(--island-beach) center bottom / cover no-repeat; }
/* With the map as the Timeline's home, the beach is the whole panel: no frame inside a frame.
   The panel's padding, header bar and status line go (the sky and tide are in the diary); the
   title stays for screen readers, and the close button floats over the sand. */
body #scene-flow-modal.is-map-home { padding: 0; }
body #scene-flow-modal.is-map-home .scene-flow-header { position: sticky; top: 0; height: 0; margin: 0; padding: 0; border: 0; background: none; box-shadow: none; }
body #scene-flow-modal.is-map-home .scene-flow-header .scene-flow-close { top: 10px; right: 12px; box-shadow: 0 2px 4px #5a431f55; }
body #scene-flow-modal.is-map-home #scene-flow-title { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
#scene-flow-modal.is-map-home #scene-flow-subtitle { display: none; }
#scene-flow-modal.is-map-home .island-beach { border: 0; border-radius: 0; }
#scene-flow-modal.is-map-home .island-top { padding-right: 100px; }
#scene-flow-modal.is-map-home .scene-flow-story-shell { padding: 0; background: none; box-shadow: none; }
#scene-flow-modal.is-map-home .story-steps { margin: 0; }
#scene-flow-modal.is-map-home .scene-flow-links:empty { display: none; }
/* The top of the beach: the time-of-day chips, and the days as flags planted in the sand above
   the map, not on it. */
/* Above the diary, so a flag is never half behind the starfish on the logbook's corner. */
.island-top { position: relative; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 6px clamp(10px, 2vw, 28px); margin: 0 0 clamp(6px, 1vw, 14px); }
.island-top .story-steps-chips { flex: none; margin: 0; }
.island-top .story-steps-chip { min-height: 36px; padding: 2px 12px; font-size: 12.5px; box-shadow: 0 2px 2px #5a431f33; }
.island-days { flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: center; gap: 2px clamp(2px, 1.1vw, 16px);
  margin: 0; padding: 0; }
.island-map-day { position: relative; flex: none; width: clamp(40px, 4.4vw, 62px); padding: 0; border: 0; background: none; cursor: pointer; line-height: 0;
  filter: drop-shadow(0 2px 1px #0003); transition: transform .14s; }
.island-map-day > img { display: block; width: 100%; height: auto; }
.island-map-day:hover, .island-map-day:focus-visible { transform: translateY(-3px) scale(1.1); z-index: 3; }
.island-map-day.is-picked { transform: translateY(-6px) scale(1.22); z-index: 2; }
#scene-flow-modal .island-map-day:focus-visible, #scene-flow-modal .island-map-thing:focus-visible { outline: none; }
.island-map-day:focus-visible > img, .island-map-thing:focus-visible > img { outline: 3px solid #e99a32; outline-offset: 3px; border-radius: 8px; }
/* The number is written on the cloth. */
.island-map-daynum { position: absolute; left: 51%; top: 26.5%; transform: translate(-50%, -50%); letter-spacing: -.03em; color: #234e52;
  font: 700 clamp(11px, 1.15vw, 16px)/1 'Trebuchet MS', Arial, sans-serif; }
.island-map-day.is-flagged .island-map-daynum { color: #fff9dc; }
.island-map-footprints { flex: none; align-self: flex-end; width: clamp(28px, 3vw, 44px); height: auto; margin: 0 -6px 0 -10px; opacity: .8; }
/* Side by side only where the map still gets its full minimum width beside the diary; below
   that the diary sits under the map. */
.island-map-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: clamp(12px, 1.8vw, 26px); align-items: start; }
@media (min-width: 1180px) { .island-map-layout { grid-template-columns: minmax(0, 1fr) clamp(280px, 24vw, 370px); } }
/* Objects must stay big enough to recognise and press, so the map keeps a minimum size and pans
   sideways instead of shrinking. It is also capped by the window's height, so the whole island
   is on screen at once rather than running below the fold. */
.island-map-main { min-width: 0; }
/* Sideways only: without overflow-y the browser would add a needless vertical scrollbar. */
.island-map-scroll { min-width: 0; overflow-x: auto; overflow-y: hidden; padding: 22px 38px 56px; }
.island-map-hint { margin: 0 0 6px; color: #234e52; font: 13px/1.4 'Trebuchet MS', Arial, sans-serif; }
.island-map-hint[hidden] { display: none; }
.island-map { position: relative; min-width: 720px; max-width: max(720px, min(100%, calc((100dvh - 268px) * 1.5))); margin-inline: auto; line-height: 0;
  border-radius: 4px; box-shadow: 3px 6px 8px #5a431f55; container-type: inline-size; }
.island-map-base { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; border-radius: 4px; transition: filter .3s; }
.island-map.is-night .island-map-base { filter: brightness(.58) saturate(.85) hue-rotate(10deg); }
.island-map.is-night .island-map-thing > img { filter: brightness(.82) saturate(.9); }
/* Driftwood and shells hold the map's corners down. */
.island-map-weight { position: absolute; z-index: 1; width: 13%; height: auto; pointer-events: none; filter: drop-shadow(0 3px 2px #0004); }
.island-map-thing { position: absolute; z-index: 2; transform: translate(-50%, -50%); padding: 0; border: 0; background: none; cursor: pointer;
  line-height: 0; filter: drop-shadow(0 2px 2px #0005); transition: transform .14s, opacity .25s, filter .25s; }
.island-map-thing > img { display: block; width: 100%; height: auto; }
.island-map-thing:hover, .island-map-thing:focus-visible { transform: translate(-50%, -50%) scale(1.14); z-index: 4; }
.island-map-thing.is-away { opacity: .3; filter: grayscale(1); }
.island-map-thing.is-live { filter: drop-shadow(0 0 6px #fff) drop-shadow(0 2px 2px #0005); }
.island-map-thing.is-away.is-live { filter: grayscale(1) drop-shadow(0 0 6px #fff); }
.island-map-thing[aria-pressed="true"] { z-index: 3; filter: drop-shadow(0 0 5px #ffd36b) drop-shadow(0 0 2px #ffd36b); }
.island-map-story { filter: drop-shadow(0 0 5px #ffd36b) drop-shadow(0 2px 2px #0005); }
.island-map-story .island-map-name { background: #f2cc91; }
/* Names scale with the map: 10px at its smallest, up to 15px on a large screen. */
.island-map-name { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 1px; padding: .08em .5em; white-space: nowrap;
  border: 2px solid #22553b; border-radius: 7px 4px; background: #fff9dc; color: #234e52;
  font: 700 clamp(10px, 1.22cqw, 15px)/1.35 'Trebuchet MS', Arial, sans-serif; }
.island-map-thing.is-live .island-map-name { background: #f2cc91; }
/* The diary: an open logbook lying on the sand. Its page is the picture; the writing is live. */
.island-map-panel { position: relative; min-height: 420px; padding: 11% 23% 27% 13%; color: #234e52;
  background: var(--island-logbook) center / 100% 100% no-repeat; font: 21px/1.3 ${HAND}; }
/* On the logbook's bottom corner: at the top it reached into the row of flags. */
.island-map-starfish { position: absolute; left: -9%; bottom: 1%; transform: rotate(-14deg); width: 22%; height: auto; pointer-events: none; filter: drop-shadow(0 3px 2px #0004); }
.island-map-panel h3 { margin: 0 0 2px; font: 700 30px/1.1 ${HAND}; color: #22553b; }
.island-map-panel h3:focus-visible { outline: 3px solid #e99a32; outline-offset: 3px; }
.island-map-panel p { margin: 0 0 8px; }
.island-map-panel .island-diary-eyebrow { margin: 0; font: 700 12px/1.3 'Trebuchet MS', Arial, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #53736a; }
.island-map-panel .island-diary-conditions { margin: 0 0 4px; font: 12px/1.35 'Trebuchet MS', Arial, sans-serif; color: #53736a; }
.island-diary-list { list-style: none; margin: 4px 0 8px; padding: 0; max-height: min(30dvh, 290px); overflow-y: auto; }
.island-diary-list li { margin: 0; }
.island-diary-entry { display: inline-block; max-width: 100%; min-height: 34px; margin: 0 0 1px; padding: 2px 12px 2px 26px; border: 0; background: none; cursor: pointer;
  position: relative; color: inherit; font: inherit; text-align: left; text-transform: none; }
.island-diary-entry:hover { text-decoration: underline; }
.island-diary-entry:focus-visible { outline: 3px solid #e99a32; outline-offset: 1px; }
.island-diary-entry[data-role="seen"] { color: #53736a; }
.island-diary-entry[data-role="seen"]::before { content: '✓'; position: absolute; left: 4px; font-weight: 700; color: #22553b; }
/* Circled, as in a diary: this one is happening now. */
.island-diary-entry[data-role="live"] { border: 2.5px solid #22553b; border-radius: 50% 46% 52% 48% / 60% 55% 62% 58%; padding-left: 14px; margin-left: 10px; font-weight: 700; }
.island-diary-rest { display: block; padding: 0 0 0 26px; color: #8a9a8c; font-size: .8em; }
.island-map-panel .island-map-question { margin: 8px 0 6px; font-weight: 700; }
.island-map-panel .island-map-aside { margin: 10px 0 0; color: #53736a; font-size: .85em; }
.island-map-panel .story-steps-link, .island-map-panel .story-steps-play { font-family: 'Trebuchet MS', Arial, sans-serif; }
.island-map-daycard { grid-template-columns: minmax(0, 130px) !important; justify-content: center; }
.island-map-panel-art { display: block; width: 84px; height: auto; margin: 0 auto 4px; }
/* A long list scrolls inside the page, so the book keeps its size and the map stays beside it. */
.island-map-panel .story-steps-grid { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 16px 8px; padding: 10px 4px 6px 0; }
/* A place's gags: the same handwriting, with a dash for each and a small note where one has a catch. */
.island-diary-picks { max-height: min(48dvh, 440px); }
.island-diary-pick::before { content: '–'; position: absolute; left: 6px; color: #53736a; }
.island-diary-pick[data-role="live"]::before { content: none; }
.island-diary-pick small { display: block; margin-top: -2px; color: #53736a; font: 11.5px/1.3 'Trebuchet MS', Arial, sans-serif; }
.island-diary-pick.is-dim { opacity: .4; }
.island-diary-list { scrollbar-width: thin; }
.island-map-panel .island-map-daycard { max-height: none; overflow: visible; }
@media (prefers-reduced-motion: reduce) {
  .island-map-thing, .island-map-base, .island-map-day { transition: none; }
  .island-map-thing:hover, .island-map-thing:focus-visible { transform: translate(-50%, -50%); }
  .island-map-day:hover, .island-map-day:focus-visible { transform: none; }
  .island-map-day.is-picked { transform: translateY(-6px); }
}
`;

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};
// A picture with its size set, so its button has the right shape before the file arrives.
const picture = (name, src, className) => {
    const img = el('img', className);
    img.src = src;
    img.alt = '';
    const size = islandMapArtSize[name];
    if (size) [img.width, img.height] = size;
    return img;
};
const sameGag = (a, b) => Boolean(a && b && a.script === b.script && a.tagId === b.tagId);

/**
 * Draw the beach, the days, the map and the diary into `root`.
 *
 * @param {HTMLElement} root
 * @param {object} options
 * @param {string|null} options.place     id of the open place, if any
 * @param {number|null} options.day       the story day picked from its flag, if any
 * @param {string|null} options.filter    time-of-day band id that dims closed places, or null
 * @param {{day:number, band:string|null, gag:object|null}} options.live  where Johnny is
 * @param {number} options.today          the saved story day
 * @param {Array} options.visit           the visit in progress (visitSequence), for the diary
 * @param {{day:number, band:string}|null} options.visiting  a temporary visit in progress
 * @param {(gag)=>string} options.gagName
 * @param {(options:object)=>HTMLElement} options.makeCard  the stepper's card factory
 * @param {(patch:object, from?:DOMRect|null)=>void} options.onStep
 * @param {()=>void} options.onLive       show the gag Johnny is playing now
 * @param {(()=>void)|null} options.onGoBack  leave a temporary visit
 * @param {((scene:object)=>boolean)|null} options.onStartDay  play a day's story scene
 */
export function renderIslandMap(root, {
    place: openId = null, day: pickedDay = null, filter = null, live, today, visit = [], visiting = null,
    gagName, makeCard, onStep, onLive = () => {}, onGoBack = null, onStartDay = null, onPlay = null, toolbar = null, conditions = '',
}) {
    const beach = el('div', 'island-beach');
    beach.style.setProperty('--island-beach', `url("${islandMapArt.beach}")`);
    beach.style.setProperty('--island-logbook', `url("${islandMapArt.logbook}")`);

    // Whatever is picked plays as the day chosen from its flag, else the day Johnny is on.
    const openGag = (gag, event) => onStep({ level: 'detail', gag, day: pickedDay ?? live.day },
        event?.currentTarget?.querySelector?.('canvas, img')?.getBoundingClientRect?.() ?? null);
    // Picking a gag plays it, there and then. Its outline (how it unfolds, scene by scene) is one
    // Shift-click away, and is where a pick lands if nothing can be played.
    const pickGag = (gag, event) => {
        if (onPlay && !event?.shiftKey && onPlay(gag, pickedDay ?? live.day) !== false) return;
        openGag(gag, event);
    };
    const PLAY_HINT = 'Play this now. Shift-click to see how it unfolds.';

    // The story: eleven numbered flags planted in the sand above the map.
    const trail = storyTrail();
    const days = el('div', 'island-days');
    days.setAttribute('role', 'group');
    days.setAttribute('aria-label', 'The eleven days of the story');
    for (const stop of trail) {
        const isToday = stop.day === today;
        const isPicked = stop.day === pickedDay;
        // Orange cloth marks today, and the day being looked at.
        const flagged = isToday || isPicked;
        const button = el('button', `island-map-day${isToday ? ' is-today' : ''}${isPicked ? ' is-picked' : ''}${flagged ? ' is-flagged' : ''}`);
        button.type = 'button';
        button.dataset.focus = `day:${stop.day}`;
        button.setAttribute('aria-pressed', String(isPicked));
        const name = `Day ${stop.day}: ${gagName(stop.scene)}`;
        button.setAttribute('aria-label', `${name}${isToday ? ' (today)' : ''}`);
        button.title = `${name}${isToday ? ' · today' : ''}`;
        button.append(picture(flagged ? 'flagToday' : 'flag', flagged ? islandMapArt.flagToday : islandMapArt.flag),
            el('span', 'island-map-daynum', String(stop.day)));
        // A flag picks its day: the map then shows that day's own scene, and anything chosen
        // plays as that day. Pressing it again lets go of the day.
        button.addEventListener('click', () => onStep({ mapDay: isPicked ? null : stop.day, place: null }));
        // Footprints lead up to today.
        if (isToday) days.appendChild(picture('footprints', islandMapArt.footprints, 'island-map-footprints'));
        days.appendChild(button);
    }
    const top = el('div', 'island-top');
    if (toolbar) top.appendChild(toolbar);
    top.appendChild(days);
    beach.appendChild(top);

    const layout = el('div', 'island-map-layout');
    const map = el('div', `island-map${filter === 'night' ? ' is-night' : ''}`);
    map.setAttribute('role', 'group');
    map.setAttribute('aria-label', "Map of Johnny's island");
    map.appendChild(picture('map', islandMapArt.map, 'island-map-base'));
    for (const [name, css] of [['driftwood', 'left:-3%;top:-4.5%;transform:rotate(-8deg)'], ['shell', 'right:-2.5%;top:-4%;width:7%'],
        ['shell', 'left:-2.5%;bottom:-4%;width:7%;transform:rotate(-30deg)'], ['driftwood', 'right:-3%;bottom:-5%;transform:rotate(172deg)']]) {
        const weight = picture(name, islandMapArt[name], 'island-map-weight');
        weight.style.cssText = css;
        map.appendChild(weight);
    }

    // In reading order across the map (rows from the top, left to right within a row), which is
    // the order the keyboard and a screen reader move through them.
    const places = islandPlaces().sort((a, b) => Math.round(a.y / 14) - Math.round(b.y / 14) || a.x - b.x);
    const livePlace = placeForGag(live.gag);
    const open = places.find((entry) => entry.id === openId) ?? null;

    // The one thing a day has to itself: its story scene, standing on the island while picked.
    const picked = trail.find((stop) => stop.day === pickedDay) ?? null;
    if (picked) {
        const marker = el('button', 'island-map-thing island-map-story');
        marker.type = 'button';
        marker.dataset.focus = 'story-marker';
        marker.style.left = '48%';
        marker.style.top = '26%';
        marker.style.width = '6.5%';
        marker.setAttribute('aria-label', `Day ${picked.day}'s story: ${gagName(picked.scene)}`);
        marker.append(picture('signpost', islandMapArt.signpost), el('span', 'island-map-name', `Day ${picked.day}'s story`));
        marker.addEventListener('click', () => onStep({ mapDay: picked.day, place: null }));
        map.appendChild(marker);
    }

    // The places: one object each, named, with how many gags it holds.
    for (const entry of places) {
        const isOpen = placeOpenAt(entry, filter);
        const isLive = livePlace?.id === entry.id;
        const many = entry.gags.length > 1;
        const button = el('button', `island-map-thing island-map-place${isOpen ? '' : ' is-away'}${isLive ? ' is-live' : ''}`);
        button.type = 'button';
        button.dataset.focus = `place:${entry.id}`;
        button.dataset.place = entry.id;
        button.style.left = `${entry.x}%`;
        button.style.top = `${entry.y}%`;
        button.style.width = `${entry.width}%`;
        if (many) button.setAttribute('aria-pressed', String(open?.id === entry.id));
        button.setAttribute('aria-label',
            `${entry.name}, ${many ? `${entry.gags.length} gags` : gagName(entry.gags[0])}${isLive ? ' (Johnny now)' : ''}${isOpen ? '' : ', nothing on at this time'}`);
        button.append(picture(entry.id, islandMapArt.places[entry.id]),
            el('span', 'island-map-name', `${entry.name}${many ? ` · ${entry.gags.length}` : ''}`));
        // One thing happens here: play it. Several: list them in the diary; pressing the open
        // place again closes it.
        if (!many && onPlay) button.title = PLAY_HINT;
        button.addEventListener('click', (event) =>
            (many ? onStep({ place: open?.id === entry.id ? null : entry.id }) : pickGag(entry.gags[0], event)));
        map.appendChild(button);
    }

    const scroller = el('div', 'island-map-scroll');
    scroller.tabIndex = -1;
    const hint = el('p', 'island-map-hint', 'Scroll sideways to see the whole map.');
    hint.hidden = true;
    const main = el('div', 'island-map-main');
    main.append(hint, scroller);
    layout.appendChild(main);
    scroller.appendChild(map);
    // Say so whenever part of the map is off to the side, at whatever window size that happens.
    const checkOverflow = () => { hint.hidden = scroller.scrollWidth <= scroller.clientWidth + 1; };
    if (typeof ResizeObserver === 'function') new ResizeObserver(checkOverflow).observe(scroller);
    queueMicrotask(checkOverflow);

    // The diary. With nothing picked it is today's page: where Johnny is, and the visit as a
    // checklist. Picking a place or a day turns to that instead.
    const panel = el('aside', 'island-map-panel');
    // Announced when it changes, since it can be far from the button in reading order.
    panel.setAttribute('aria-live', 'polite');
    panel.appendChild(picture('starfish', islandMapArt.starfish, 'island-map-starfish'));
    const heading = el('h3');
    heading.tabIndex = -1;
    heading.dataset.focus = 'place-panel';
    const backToToday = () => {
        const link = el('button', 'story-steps-link', '‹ Today’s page');
        link.type = 'button';
        link.dataset.focus = 'diary-today';
        link.addEventListener('click', () => onStep({ place: null, mapDay: null }));
        return link;
    };

    if (open) {
        panel.setAttribute('aria-label', open.name);
        heading.textContent = open.name;
        const on = filter ? open.gags.filter((gag) => bandsFor(gag).some((band) => band.id === filter)).length : open.gags.length;
        panel.append(heading,
            el('p', null, (on === open.gags.length ? `${open.gags.length} things happen here. Pick one.`
                : on ? `${open.gags.length} things happen here; ${on} at this time of day.`
                    : `${open.gags.length} things happen here, none at this time of day.`) + (picked ? ` Playing as day ${picked.day}.` : '')));
        // Written out like the rest of the diary: names, no pictures, so the whole list fits the page.
        const list = el('ul', 'island-diary-list island-diary-picks');
        list.setAttribute('aria-label', `Things that happen at ${open.name}`);
        for (const gag of open.gags) {
            const isLive = sameGag(gag, live.gag);
            const restriction = restrictionLabel(gag);
            const notes = [isLive ? 'now' : null, restriction ? restriction.toLowerCase() : null, gag.final ? 'ends a visit' : null].filter(Boolean);
            const entry = el('button', 'island-diary-entry island-diary-pick', gagName(gag).toLowerCase().replace(/^./, (c) => c.toUpperCase()));
            entry.type = 'button';
            // The same key a card had, so focus comes back here from the scene screen.
            entry.dataset.focus = `card:${gag.script}:${gag.tagId}`;
            if (isLive) entry.dataset.role = 'live';
            entry.setAttribute('aria-label', `${gagName(gag)}${restriction ? `, ${restriction.toLowerCase()}` : ''}${gag.final ? ', ends a visit' : ''}${isLive ? ' (Johnny now)' : ''}`);
            if (notes.length) entry.appendChild(el('small', null, notes.join(' · ')));
            if (onPlay) entry.title = PLAY_HINT;
            entry.addEventListener('click', (event) => pickGag(gag, event));
            if (filter && !bandsFor(gag).some((band) => band.id === filter)) entry.classList.add('is-dim');
            const item = el('li');
            item.appendChild(entry);
            list.appendChild(item);
        }
        panel.append(list, backToToday());
    } else if (picked) {
        // A day: its story scene, and one question. No detour through the scene screen.
        const scene = picked.scene;
        panel.setAttribute('aria-label', `Day ${picked.day}`);
        heading.textContent = `Day ${picked.day}`;
        const grid = el('div', 'story-steps-grid island-map-daycard');
        grid.appendChild(makeCard({ gag: scene, name: gagName(scene), kicker: `Day ${String(picked.day).padStart(2, '0')}`, live: picked.day === today, label: gagName(scene), priority: true }));
        panel.append(heading, el('p', null, `${gagName(scene)}${picked.day === today ? ' · today' : ''}`), grid,
            el('p', 'island-map-question', 'Start this day from its story scene?'));
        const start = el('button', 'story-steps-play', `▶ Start day ${picked.day}`);
        start.type = 'button';
        start.dataset.focus = 'start-day';
        start.title = 'Play this day\'s story scene now. Nothing is saved unless you then choose Stay here.';
        start.disabled = !onStartDay;
        start.addEventListener('click', () => {
            if (onStartDay(scene) === false) {
                start.disabled = true;
                start.textContent = 'Could not start';
            }
        });
        const more = el('button', 'story-steps-link', 'How this scene unfolds ›');
        more.type = 'button';
        more.dataset.focus = 'day-detail';
        more.addEventListener('click', (event) => openGag(scene, event));
        const actions = el('div', 'story-steps-actions');
        actions.append(start, more);
        panel.append(actions, el('p', 'island-map-aside', `Anything else you pick on the map plays as day ${picked.day}.`), backToToday());
    } else {
        // Today's page.
        const band = bandById(visiting?.band ?? live.band);
        panel.setAttribute('aria-label', 'Diary: today on the island');
        heading.textContent = `Day ${visiting?.day ?? live.day}${band ? ` · ${band.label}` : ''}`;
        panel.append(el('p', 'island-diary-eyebrow', visiting ? 'Visiting' : 'Today on the island'), heading);
        // The sky and the tide: the panel's own line for these is hidden on this screen.
        if (conditions) panel.appendChild(el('p', 'island-diary-conditions', conditions));
        if (visiting && onGoBack) {
            const back = el('button', 'story-steps-play', 'Go back');
            back.type = 'button';
            back.dataset.focus = 'go-back';
            back.title = 'Return now to the day and gag you left. Nothing from this visit is saved.';
            back.addEventListener('click', onGoBack);
            panel.appendChild(back);
        }
        const entries = visit.filter((gag) => !gag.filler || gag.role === 'live');
        if (entries.length) {
            // Ticked: done. Circled: happening now. Plain: still to come.
            const list = el('ul', 'island-diary-list');
            list.setAttribute('aria-label', 'This visit');
            for (const gag of entries) {
                const item = el('li');
                if (gag.filler) item.appendChild(el('span', 'island-diary-rest', 'a quiet moment'));
                else {
                    const entry = el('button', 'island-diary-entry', gagName(gag).toLowerCase().replace(/^./, (c) => c.toUpperCase()));
                    entry.type = 'button';
                    entry.dataset.role = gag.role;
                    entry.dataset.focus = `visit:${gag.index ?? 0}`;
                    entry.setAttribute('aria-label', `${gagName(gag)}: ${gag.role === 'live' ? 'happening now' : gag.role === 'seen' ? 'done' : 'still to come'}`);
                    if (gag.role === 'live') entry.setAttribute('aria-current', 'true');
                    // Like any gag on the map: a click plays it now, Shift-click opens how it unfolds.
                    if (onPlay) entry.title = PLAY_HINT;
                    entry.addEventListener('click', (event) => {
                        if (onPlay && !event.shiftKey && onPlay(gagFacts(gag), live.day) !== false) return;
                        if (gag.role === 'live') onLive();
                        else onStep({ level: 'detail', gag, day: live.day });
                    });
                    item.appendChild(entry);
                }
                list.appendChild(item);
            }
            panel.appendChild(list);
            // Open the page at what is happening now.
            const current = list.querySelector('[data-role="live"]');
            if (current) queueMicrotask(() => { list.scrollTop = Math.max(0, current.offsetTop - list.offsetTop - 60); });
        } else {
            panel.appendChild(el('p', null, live.gag ? gagName(live.gag) : 'Nothing is written yet.'));
        }
        panel.appendChild(el('p', 'island-map-aside', 'Pick something on the map, or a flag for a day.'));
    }
    layout.appendChild(panel);
    beach.appendChild(layout);
    root.appendChild(beach);
    return beach;
}

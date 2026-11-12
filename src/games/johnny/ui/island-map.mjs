/**
 * island-map.mjs — the story timeline as a fold-out map of the island (issue #96).
 *
 * One painted object per place you can go and watch, and a trail of numbered flags for
 * the eleven story days, on a painted paper map. It is a flat picture with buttons on it:
 * nothing here animates the game or changes playback. Picking a gag or a day hands over
 * to the same scene screen as the list view.
 *
 * The stepper owns the state (which place is open, the time-of-day filter); this module
 * draws the map and its side panel and reports choices through `onStep`.
 */
import { islandPlaces, placeForGag, placeOpenAt, storyTrail } from '../island-places.mjs';
import { bandsFor, restrictionLabel } from '../story-steps.mjs';
import { islandMapArt, islandMapArtSize } from './island-map-art.mjs';

export const ISLAND_MAP_STYLE = `
/* Side by side only where the map still gets its full minimum width beside the panel; below
   that the panel sits under the map. */
.island-map-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
@media (min-width: 1180px) { .island-map-layout { grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); } }
/* Objects must stay big enough to recognise and press, so the map keeps a minimum size and pans
   sideways instead of shrinking. It is also capped by the window's height, so the whole island
   is on screen at once rather than running below the fold. */
.island-map-main { min-width: 0; }
.island-map-scroll { min-width: 0; overflow-x: auto; padding-bottom: 6px; }
.island-map-hint { margin: 0 0 6px; color: #53736a; font: 13px/1.4 'Trebuchet MS', Arial, sans-serif; }
.island-map-hint[hidden] { display: none; }
.island-map { position: relative; min-width: 720px; max-width: max(720px, calc((100dvh - 350px) * 1.5)); margin-inline: auto; line-height: 0;
  border-radius: 4px; box-shadow: 3px 5px 0 #234e5233; container-type: inline-size; }
.island-map-base { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; border-radius: 4px; transition: filter .3s; }
.island-map.is-night .island-map-base { filter: brightness(.58) saturate(.85) hue-rotate(10deg); }
.island-map.is-night .island-map-thing > img { filter: brightness(.82) saturate(.9); }
.island-map-trail { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.island-map-thing { position: absolute; transform: translate(-50%, -50%); padding: 0; border: 0; background: none; cursor: pointer;
  line-height: 0; filter: drop-shadow(0 2px 2px #0005); transition: transform .14s, opacity .25s, filter .25s; }
.island-map-thing > img { display: block; width: 100%; height: auto; }
.island-map-thing:hover, .island-map-thing:focus-visible { transform: translate(-50%, -50%) scale(1.14); z-index: 3; }
/* One ring, on the painted object; the panel's general button ring would add a second box. */
#scene-flow-modal .island-map-thing:focus-visible { outline: none; }
.island-map-thing:focus-visible > img { outline: 3px solid #e99a32; outline-offset: 3px; border-radius: 8px; }
.island-map-thing.is-away { opacity: .3; filter: grayscale(1); }
.island-map-thing.is-live { filter: drop-shadow(0 0 6px #fff) drop-shadow(0 2px 2px #0005); }
.island-map-thing.is-away.is-live { filter: grayscale(1) drop-shadow(0 0 6px #fff); }
.island-map-thing[aria-pressed="true"] { z-index: 2; filter: drop-shadow(0 0 5px #ffd36b) drop-shadow(0 0 2px #ffd36b); }
.island-map-day.is-picked { transform: translate(-50%, -62%) scale(1.25); }
.island-map-day.is-picked .island-map-daynum { background: #e99a32; }
.island-map-story { filter: drop-shadow(0 0 5px #ffd36b) drop-shadow(0 2px 2px #0005); }
.island-map-story .island-map-name { background: #f2cc91; }
/* Names scale with the map: 10px at its smallest, up to 15px on a large screen. */
.island-map-name { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 1px; padding: .08em .5em; white-space: nowrap;
  border: 2px solid #22553b; border-radius: 7px 4px; background: #fff9dc; color: #234e52;
  font: 700 clamp(10px, 1.22cqw, 15px)/1.35 'Trebuchet MS', Arial, sans-serif; }
.island-map-thing.is-live .island-map-name, .island-map-day.is-today .island-map-daynum { background: #f2cc91; }
.island-map-day { width: 4.4%; min-width: 40px; }
.island-map-daynum { position: absolute; left: 50%; top: 84%; transform: translateX(-50%); min-width: 1.8em; padding: .05em .4em; border: 2px solid #22553b;
  border-radius: 1em; background: #fff9dc; color: #234e52; font: 700 clamp(10px, 1.22cqw, 15px)/1.25 'Trebuchet MS', Arial, sans-serif; text-align: center; }
.island-map-day .island-map-name { display: none; top: calc(100% + 1.7em); z-index: 4; }
.island-map-day:hover .island-map-name, .island-map-day:focus-visible .island-map-name { display: block; }
.island-map-panel { padding: 12px; border: 2px solid #22553b; border-radius: 9px 5px; background: #fff9dc; color: #234e52;
  font: 14px/1.45 'Trebuchet MS', Arial, sans-serif; }
.island-map-panel h3 { margin: 0 0 2px; font: 700 21px/1.2 Georgia, serif; color: #22553b; }
.island-map-panel h3:focus-visible { outline: 3px solid #e99a32; outline-offset: 3px; }
.island-map-panel p { margin: 0 0 10px; }
.island-map-panel .island-map-question { margin: 10px 0 6px; font-weight: 700; }
.island-map-panel .island-map-aside { margin: 12px 0 0; color: #53736a; font-size: 13px; }
.island-map-daycard { grid-template-columns: minmax(0, 150px) !important; justify-content: center; }
.island-map-panel-art { display: block; width: 96px; height: auto; margin: 0 auto 6px; }
.island-map-panel .story-steps-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 18px 10px; padding-top: 12px; }
@media (prefers-reduced-motion: reduce) {
  .island-map-thing, .island-map-base { transition: none; }
  .island-map-thing:hover, .island-map-thing:focus-visible { transform: translate(-50%, -50%); }
  .island-map-day.is-picked { transform: translate(-50%, -62%); }
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
 * Draw the map and its side panel into `root`.
 *
 * @param {HTMLElement} root
 * @param {object} options
 * @param {string|null} options.place     id of the open place, if any
 * @param {number|null} options.day       the story day picked from its flag, if any
 * @param {((scene:object)=>boolean)|null} options.onStartDay  play a day's story scene
 * @param {string|null} options.filter    time-of-day band id that dims closed places, or null
 * @param {{day:number, gag:object|null}} options.live  where Johnny is
 * @param {number} options.today          the saved story day
 * @param {(gag)=>string} options.gagName
 * @param {(options:object)=>HTMLElement} options.makeCard  the stepper's card factory
 * @param {(patch:object, from?:DOMRect|null)=>void} options.onStep
 */
export function renderIslandMap(root, { place: openId = null, day: pickedDay = null, filter = null, live, today, gagName, makeCard, onStep, onStartDay = null }) {
    const layout = el('div', 'island-map-layout');
    const map = el('div', `island-map${filter === 'night' ? ' is-night' : ''}`);
    map.setAttribute('role', 'group');
    map.setAttribute('aria-label', "Map of Johnny's island");
    map.appendChild(picture('map', islandMapArt.map, 'island-map-base'));

    // In reading order across the map (rows from the top, left to right within a row), which is
    // the order the keyboard and a screen reader move through them.
    const places = islandPlaces().sort((a, b) => Math.round(a.y / 14) - Math.round(b.y / 14) || a.x - b.x);
    const livePlace = placeForGag(live.gag);
    const open = places.find((entry) => entry.id === openId) ?? null;
    // Whatever is picked plays as the day chosen from its flag, else the day Johnny is on.
    const pickGag = (gag, event) => onStep({ level: 'detail', gag, day: pickedDay ?? live.day },
        event?.currentTarget?.querySelector?.('canvas, img')?.getBoundingClientRect?.() ?? null);

    // The story: a dotted trail of numbered flags across the top of the sea.
    const trail = storyTrail();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'island-map-trail');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${trail.map((stop) => `${stop.x} ${stop.y + 3}`).join(' L')}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#fff9dc');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '4 5');
    path.setAttribute('opacity', '.75');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(path);
    map.appendChild(svg);
    for (const stop of trail) {
        const isToday = stop.day === today;
        const isPicked = stop.day === pickedDay;
        const button = el('button', `island-map-thing island-map-day${isToday ? ' is-today' : ''}${isPicked ? ' is-picked' : ''}`);
        button.setAttribute('aria-pressed', String(isPicked));
        button.type = 'button';
        button.dataset.focus = `day:${stop.day}`;
        button.style.left = `${stop.x}%`;
        button.style.top = `${stop.y}%`;
        const name = `Day ${stop.day}: ${gagName(stop.scene)}`;
        button.setAttribute('aria-label', `${name}${isToday ? ' (today)' : ''}`);
        button.append(picture('flag', islandMapArt.flag), el('span', 'island-map-daynum', String(stop.day)), el('span', 'island-map-name', `${name}${isToday ? ' · today' : ''}`));
        // A flag picks its day: the map then shows that day's own scene, and anything chosen
        // plays as that day. Pressing it again lets go of the day.
        button.addEventListener('click', () => onStep({ mapDay: isPicked ? null : stop.day, place: null }));
        map.appendChild(button);
    }
    // The one thing a day has to itself: its story scene, standing on the island while picked.
    const picked = trail.find((stop) => stop.day === pickedDay) ?? null;
    if (picked) {
        const marker = el('button', 'island-map-thing island-map-story');
        marker.type = 'button';
        marker.dataset.focus = 'story-marker';
        marker.style.left = '48%';
        marker.style.top = '33%';
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
        // One thing happens here: go straight to it. Several: list them in the panel; pressing
        // the open place again closes it.
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

    const panel = el('aside', 'island-map-panel');
    panel.setAttribute('aria-label', open ? open.name : 'About the map');
    // Announced when a place opens, since the panel can be far from the button in reading order.
    panel.setAttribute('aria-live', 'polite');
    const heading = el('h3', null, open ? open.name : picked ? `Day ${picked.day}` : "Johnny's island");
    heading.tabIndex = -1;
    heading.dataset.focus = 'place-panel';
    if (!open && picked) {
        // A day: its story scene, and one question. No detour through the scene screen.
        const scene = picked.scene;
        panel.setAttribute('aria-label', `Day ${picked.day}`);
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
        more.addEventListener('click', (event) => pickGag(scene, event));
        const actions = el('div', 'story-steps-actions');
        actions.append(start, more);
        panel.append(actions, el('p', 'island-map-aside', `Anything else you pick on the map plays as day ${picked.day}.`));
    } else if (!open) {
        panel.append(picture('signpost', islandMapArt.signpost, 'island-map-panel-art'), heading,
            el('p', null, 'Pick something on the map to go and see. The numbered flags are the eleven days of the story.'));
    } else {
        const on = filter ? open.gags.filter((gag) => bandsFor(gag).some((band) => band.id === filter)).length : open.gags.length;
        panel.append(picture(open.id, islandMapArt.places[open.id], 'island-map-panel-art'), heading,
            el('p', null, (on === open.gags.length ? `${open.gags.length} things happen here. Pick one.`
                : on ? `${open.gags.length} things happen here; ${on} at this time of day.`
                    : `${open.gags.length} things happen here, none at this time of day.`) + (picked ? ` Playing as day ${picked.day}.` : '')));
        const grid = el('div', 'story-steps-grid');
        for (const gag of open.gags) {
            const isLive = sameGag(gag, live.gag);
            const restriction = restrictionLabel(gag);
            const card = makeCard({
                gag,
                name: gagName(gag),
                kicker: restriction || (gag.final ? 'Ends a visit' : 'Gag'),
                live: isLive,
                badge: isLive ? 'NOW' : null,
                label: `${gagName(gag)}${restriction ? `, ${restriction.toLowerCase()}` : ''}${gag.final ? ', ends a visit' : ''}${isLive ? ' (Johnny now)' : ''}`,
                onClick: (event) => pickGag(gag, event),
            });
            if (filter && !bandsFor(gag).some((band) => band.id === filter)) card.classList.add('is-dim');
            grid.appendChild(card);
        }
        panel.appendChild(grid);
    }
    layout.appendChild(panel);
    root.appendChild(layout);
    return layout;
}

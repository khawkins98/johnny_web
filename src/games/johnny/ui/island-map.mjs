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
import { islandMapArt } from './island-map-art.mjs';

export const ISLAND_MAP_STYLE = `
.island-map-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); gap: 14px; align-items: start; }
/* Objects must stay big enough to recognise and press, so on a narrow screen the map keeps a
   minimum size and pans sideways instead of shrinking. */
.island-map-scroll { min-width: 0; overflow-x: auto; padding-bottom: 6px; }
.island-map-hint { display: none; margin: 0 0 6px; color: #53736a; font: 13px/1.4 'Trebuchet MS', Arial, sans-serif; }
.island-map { position: relative; min-width: 720px; line-height: 0; border-radius: 4px; box-shadow: 3px 5px 0 #234e5233; container-type: inline-size; }
.island-map-base { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; border-radius: 4px; transition: filter .3s; }
.island-map.is-night .island-map-base { filter: brightness(.58) saturate(.85) hue-rotate(10deg); }
.island-map-trail { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.island-map-thing { position: absolute; transform: translate(-50%, -50%); padding: 0; border: 0; background: none; cursor: pointer;
  line-height: 0; filter: drop-shadow(0 2px 2px #0005); transition: transform .14s, opacity .25s, filter .25s; }
.island-map-thing img { display: block; width: 100%; height: auto; }
.island-map-thing:hover, .island-map-thing:focus-visible { transform: translate(-50%, -50%) scale(1.14); z-index: 3; outline: none; }
.island-map-thing:focus-visible img { outline: 3px solid #e99a32; outline-offset: 3px; border-radius: 8px; }
.island-map-thing[aria-pressed="true"] { z-index: 2; filter: drop-shadow(0 0 5px #ffd36b) drop-shadow(0 0 2px #ffd36b); }
.island-map-thing.is-away { opacity: .3; filter: grayscale(1); }
.island-map-thing.is-live { filter: drop-shadow(0 0 6px #fff) drop-shadow(0 2px 2px #0005); }
.island-map-name { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 1px; padding: 1px 7px; white-space: nowrap;
  border: 2px solid #22553b; border-radius: 7px 4px; background: #fff9dc; color: #234e52; font: 700 12px/1.35 'Trebuchet MS', Arial, sans-serif; }
.island-map-thing.is-live .island-map-name, .island-map-day.is-today .island-map-daynum { background: #f2cc91; }
.island-map-day { width: 4.4%; min-width: 26px; }
.island-map-daynum { position: absolute; left: 50%; top: 84%; transform: translateX(-50%); min-width: 22px; padding: 1px 5px; border: 2px solid #22553b;
  border-radius: 11px; background: #fff9dc; color: #234e52; font: 700 12px/1.25 'Trebuchet MS', Arial, sans-serif; text-align: center; }
.island-map-day .island-map-name { display: none; top: calc(100% + 20px); z-index: 4; }
.island-map-day:hover .island-map-name, .island-map-day:focus-visible .island-map-name { display: block; }
@container (max-width: 620px) {
  .island-map-name { font-size: 10px; padding: 0 4px; border-width: 1px; }
  .island-map-daynum { font-size: 10px; min-width: 16px; padding: 0 3px; border-width: 1px; }
}
.island-map-panel { padding: 12px; border: 2px solid #22553b; border-radius: 9px 5px; background: #fff9dc; color: #234e52;
  font: 14px/1.45 'Trebuchet MS', Arial, sans-serif; }
.island-map-panel h3 { margin: 0 0 2px; font: 700 21px/1.2 Georgia, serif; color: #22553b; }
.island-map-panel p { margin: 0 0 10px; }
.island-map-panel-art { display: block; width: 96px; height: auto; margin: 0 auto 6px; }
.island-map-panel .story-steps-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 18px 10px; padding-top: 12px; }
@media (max-width: 860px) { .island-map-layout { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 800px) { .island-map-hint { display: block; } }
@media (prefers-reduced-motion: reduce) {
  .island-map-thing, .island-map-base { transition: none; }
  .island-map-thing:hover, .island-map-thing:focus-visible { transform: translate(-50%, -50%); }
}
`;

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};
const sameGag = (a, b) => Boolean(a && b && a.script === b.script && a.tagId === b.tagId);

/**
 * Draw the map and its side panel into `root`.
 *
 * @param {HTMLElement} root
 * @param {object} options
 * @param {string|null} options.place     id of the open place, if any
 * @param {string|null} options.filter    time-of-day band id that dims closed places, or null
 * @param {{day:number, gag:object|null}} options.live  where Johnny is
 * @param {number} options.today          the saved story day
 * @param {(gag)=>string} options.gagName
 * @param {(options:object)=>HTMLElement} options.makeCard  the stepper's card factory
 * @param {(patch:object, from?:DOMRect|null)=>void} options.onStep
 */
export function renderIslandMap(root, { place: openId = null, filter = null, live, today, gagName, makeCard, onStep }) {
    const layout = el('div', 'island-map-layout');
    const map = el('div', `island-map${filter === 'night' ? ' is-night' : ''}`);
    map.setAttribute('role', 'group');
    map.setAttribute('aria-label', "Map of Johnny's island");
    const base = el('img', 'island-map-base');
    base.src = islandMapArt.map;
    base.alt = '';
    map.appendChild(base);

    const places = islandPlaces();
    const livePlace = placeForGag(live.gag);
    const open = places.find((entry) => entry.id === openId) ?? null;
    const pickGag = (gag, event) => onStep({ level: 'detail', gag, day: live.day },
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
        const button = el('button', `island-map-thing island-map-day${isToday ? ' is-today' : ''}`);
        button.type = 'button';
        button.dataset.focus = `day:${stop.day}`;
        button.style.left = `${stop.x}%`;
        button.style.top = `${stop.y}%`;
        const name = `Day ${stop.day}: ${gagName(stop.scene)}`;
        button.setAttribute('aria-label', `${name}${isToday ? ' (today)' : ''}`);
        const flag = el('img');
        flag.src = islandMapArt.flag;
        flag.alt = '';
        button.append(flag, el('span', 'island-map-daynum', String(stop.day)), el('span', 'island-map-name', `${name}${isToday ? ' · today' : ''}`));
        button.addEventListener('click', (event) => pickGag(stop.scene, event));
        map.appendChild(button);
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
        const art = el('img');
        art.src = islandMapArt.places[entry.id];
        art.alt = '';
        button.append(art, el('span', 'island-map-name', `${entry.name}${many ? ` · ${entry.gags.length}` : ''}`));
        // One thing happens here: go straight to it. Several: list them beside the map.
        button.addEventListener('click', (event) => (many ? onStep({ place: entry.id }) : pickGag(entry.gags[0], event)));
        map.appendChild(button);
    }
    const scroller = el('div', 'island-map-scroll');
    scroller.append(el('p', 'island-map-hint', 'Swipe sideways to see the whole map.'), map);
    layout.appendChild(scroller);

    const panel = el('aside', 'island-map-panel');
    panel.setAttribute('aria-label', open ? open.name : 'About the map');
    if (!open) {
        const art = el('img', 'island-map-panel-art');
        art.src = islandMapArt.signpost;
        art.alt = '';
        panel.append(art, el('h3', null, "Johnny's island"),
            el('p', null, 'Pick something on the map to go and see. The numbered flags are the eleven days of the story.'));
    } else {
        const art = el('img', 'island-map-panel-art');
        art.src = islandMapArt.places[open.id];
        art.alt = '';
        panel.append(art, el('h3', null, open.name), el('p', null, `${open.gags.length} things happen here. Pick one.`));
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

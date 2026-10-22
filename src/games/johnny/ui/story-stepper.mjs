/**
 * story-stepper.mjs — the story timeline as one question at a time (issue #47):
 * which day, then what time of day, then which gag. A breadcrumb shows the path,
 * starting from where Johnny is now, and every level is one click away.
 *
 * The panel owns the state ({ level, day, band, gag }); this module renders the
 * breadcrumb and the current step, and reports choices through callbacks.
 */
import {
    TIDE_BANDS, bandById, describeTideWindow, gagCountsByBand, gagsFor, keySceneFor,
} from '../story-steps.mjs';
import { CARD_HEIGHT, CARD_WIDTH, paintCardFace } from './story-card-faces.mjs';

const pad = (value) => String(value).padStart(2, '0');
// Where a pick was clicked, so the next step can fly the card from there.
const originOf = (event) => event?.currentTarget?.querySelector?.('canvas')?.getBoundingClientRect?.() ?? null;

export const STEPPER_STYLE = `
.story-steps { margin: 4px 0 12px; color: #fffbe2; font: 20px/1.1 'VT323', monospace; }
.story-steps-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; }
.story-steps-crumbs button { min-height: 40px; padding: 4px 12px; border: 2px solid #65c8e2; background: #102d8f;
  color: #fffbdc; font: 20px/1 'VT323', monospace; cursor: pointer; }
.story-steps-crumbs button:hover { background: #1642b1; }
.story-steps-crumbs button[aria-current="step"] { background: #ffe02d; border-color: #704a1e; color: #302816; }
.story-steps-crumbs button:focus-visible { outline: 3px solid #ffe02d; outline-offset: 2px; }
.story-steps-crumbs .is-sep { color: #65c8e2; }
.story-steps-crumbs .is-live { margin-left: auto; border-color: #ffe02d; }
.story-steps-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.story-steps-head h3 { margin: 0; font: 34px/1 'Caveat', cursive; color: #fff2a1; }
.story-steps-head p { margin: 4px 0 0; color: #bde9e9; }
.story-steps-play { min-height: 42px; padding: 4px 14px; border: 2px solid #704a1e; background: #ffe02d; color: #302816;
  font: 20px/1 'VT323', monospace; cursor: pointer; }
.story-steps-play:disabled { opacity: .5; cursor: default; }
.story-steps-grid { display: grid; gap: 22px 14px; padding-top: 8px; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); }
.story-steps-card { position: relative; padding: 0; border: 0; background: none; cursor: pointer; text-align: left; }
.story-steps-card canvas { display: block; width: 100%; height: auto; aspect-ratio: ${CARD_WIDTH} / ${CARD_HEIGHT};
  box-shadow: 3px 3px 0 #020d5b; transition: transform .12s ease; }
.story-steps-card:hover canvas { transform: translateY(-4px); }
.story-steps-card:focus-visible { outline: 3px solid #ffe02d; outline-offset: 3px; }
.story-steps-card .story-steps-badge { position: absolute; top: -16px; left: 50%; transform: translateX(-50%); padding: 2px 6px; background: #ffe02d; color: #302816;
  border: 2px solid #704a1e; font-size: 16px; }
.story-steps-tides { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.story-steps-tide { position: relative; display: flex; flex-direction: column; gap: 6px; min-height: 150px; padding: 14px; cursor: pointer;
  border: 2px solid #65c8e2; background: #102d8f; color: #fffbdc; font: 20px/1.1 'VT323', monospace; text-align: left; box-shadow: 3px 3px 0 #020d5b; }
.story-steps-tide:hover { background: #1642b1; }
.story-steps-tide:focus-visible { outline: 3px solid #ffe02d; outline-offset: 3px; }
.story-steps-tide strong { font: 30px/1 'Caveat', cursive; color: #fff2a1; }
.story-steps-tide .story-steps-sea { height: 46px; margin: 2px 0 4px; border-bottom: 2px solid #d4c4a8;
  background: linear-gradient(#071998, #071998) bottom / 100% 40% no-repeat, #66d8e8; }
.story-steps-tide .story-steps-sea.is-night {
  background: radial-gradient(circle at 78% 30%, #fffbe2 0 6px, transparent 7px), linear-gradient(#071998, #071998) bottom / 100% 40% no-repeat, #06146c; }
.story-steps-tide .story-steps-count { color: #a4e5de; }
.story-steps-tide .story-steps-badge { position: absolute; top: -10px; right: -6px; padding: 2px 6px; background: #ffe02d; color: #302816;
  border: 2px solid #704a1e; font-size: 16px; }
.story-steps-visit { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 14px; padding: 8px 10px;
  border: 2px dashed #65c8e2; }
.story-steps-visit > span { color: #a4e5de; margin-right: 4px; }
.story-steps-visit button { padding: 3px 8px; border: 1px solid #65c8e2; background: #0b2384; color: #fffbdc;
  font: 18px/1 'VT323', monospace; cursor: pointer; }
.story-steps-visit button[data-role="seen"] { opacity: .65; }
.story-steps-visit button[data-role="live"] { background: #ffe02d; color: #302816; border-color: #704a1e; }
.story-steps-visit button:disabled { cursor: default; opacity: .5; }
.story-steps-hero { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: start; }
.story-steps-hero .story-steps-card { cursor: default; }
.story-steps-hero ul { list-style: none; margin: 6px 0 12px; padding: 0; color: #bde9e9; }
.story-steps-hero li { margin: 3px 0; }
.story-steps-empty { padding: 14px; border: 2px dashed #65c8e2; color: #bde9e9; }
@media (max-width: 640px) {
  .story-steps-hero { grid-template-columns: 110px 1fr; }
  .story-steps-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
}
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
    }
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
    // Card text uses the VT323 webfont; repaint once it is ready.
    document.fonts?.load?.("44px 'VT323'").then(paint).catch(() => {});
    return button;
}

/**
 * Render the breadcrumb and the current step into `host`.
 *
 * @param {HTMLElement} host
 * @param {object} options
 * @param {{level:'day'|'tide'|'gag'|'detail', day:number, band:string, gag:object|null}} options.step
 * @param {{day:number, band:string|null, gag:object|null}} options.live  where Johnny is now
 * @param {Array} options.visit       the live visit (visitSequence), for the gag step
 * @param {(gag)=>string} options.gagName
 * @param {object} options.faces      card face queue
 * @param {(patch, from?:DOMRect|null)=>void} options.onStep  move to another step / pick something;
 *        `from` is where the picked card was, for the entrance animation
 * @param {()=>void} options.onLive   jump back to where Johnny is now
 * @param {((day)=>boolean)|null} options.onPlayDay
 * @param {((gag, day)=>boolean)|null} options.onPlayGag
 * @returns {HTMLElement} the rendered step, for playStepEntrance
 */
export function renderStoryStepper(host, { step, live, visit = [], gagName, faces, onStep, onLive, onPlayDay = null, onPlayGag = null }) {
    const root = document.createElement('section');
    root.className = 'story-steps';
    root.setAttribute('aria-label', 'Story timeline steps');
    host.appendChild(root);
    const band = bandById(step.band) ?? TIDE_BANDS[0];
    const isLiveDay = step.day === live.day;
    const isLiveBand = step.band === live.band;
    const atLive = isLiveDay && isLiveBand && step.gag && live.gag &&
        step.gag.script === live.gag.script && step.gag.tagId === live.gag.tagId;

    // Breadcrumb: Day › Tide › Gag, each a way back to that question.
    const crumbs = document.createElement('nav');
    crumbs.className = 'story-steps-crumbs';
    crumbs.setAttribute('aria-label', 'Your path');
    const crumb = (text, level) => {
        if (crumbs.childElementCount) {
            const sep = document.createElement('span');
            sep.className = 'is-sep';
            sep.textContent = '›';
            sep.setAttribute('aria-hidden', 'true');
            crumbs.appendChild(sep);
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        if (step.level === level) button.setAttribute('aria-current', 'step');
        button.addEventListener('click', () => onStep({ level }));
        crumbs.appendChild(button);
    };
    crumb(`Day ${pad(step.day)}`, 'day');
    if (step.level !== 'day') crumb(band.label, 'tide');
    if (step.level === 'gag' || step.level === 'detail') crumb(step.level === 'detail' && step.gag ? gagName(step.gag) : 'Which gag?', step.level === 'detail' ? 'detail' : 'gag');
    if (!atLive && live.gag) {
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'is-live';
        back.textContent = '↖ Johnny now';
        back.addEventListener('click', onLive);
        crumbs.appendChild(back);
    }
    root.appendChild(crumbs);

    const head = (title, note, action = null) => {
        const row = document.createElement('div');
        row.className = 'story-steps-head';
        const copy = document.createElement('div');
        const h = document.createElement('h3');
        h.textContent = title;
        copy.appendChild(h);
        if (note) {
            const p = document.createElement('p');
            p.textContent = note;
            copy.appendChild(p);
        }
        row.appendChild(copy);
        if (action) row.appendChild(action);
        root.appendChild(row);
    };
    const playButton = (text, title, handler) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'story-steps-play';
        button.textContent = text;
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

    if (step.level === 'day') {
        head('Which day?', `Johnny's story runs over 11 days. Each day has a key scene. Today is day ${pad(live.day)}.`);
        const grid = document.createElement('div');
        grid.className = 'story-steps-grid';
        for (let day = 1; day <= 11; day++) {
            const key = keySceneFor(day);
            const gag = key ? { script: key.script, tagId: key.tagId, keyDay: day, final: false } : { script: 'POSE', tagId: 0 };
            grid.appendChild(cardButton({
                gag, faces,
                name: key ? gagName(key) : '',
                kicker: `Day ${pad(day)}`,
                live: day === live.day,
                badge: day === live.day ? 'TODAY' : null,
                label: `Day ${day}${key ? `: ${gagName(key)}` : ''}${day === live.day ? ' (today)' : ''}`,
                onClick: (event) => onStep({ level: 'tide', day }, originOf(event)),
            }));
        }
        root.appendChild(grid);
        return root;
    }

    if (step.level === 'tide') {
        const key = keySceneFor(step.day);
        head(`Day ${pad(step.day)} · what time of day?`,
            `The story clock decides which gags can appear. It runs in half-hour steps from the Start Time and repeats every 8 hours; the last 2 hours of each cycle are night.${key ? ` Day ${step.day}'s key scene is ${gagName(key)}.` : ''}`,
            onPlayDay ? playButton(`▶ Play day ${pad(step.day)}`, 'Save this story day and start a visit from its key scene',
                () => onPlayDay(step.day)) : null);
        const counts = gagCountsByBand(step.day);
        const tides = document.createElement('div');
        tides.className = 'story-steps-tides';
        for (const option of TIDE_BANDS) {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'story-steps-tide';
            const name = document.createElement('strong');
            name.textContent = option.label;
            const sea = document.createElement('span');
            // Sky over the sea: the original bakes the night sky for phases 12+.
            sea.className = option.id === 'night' ? 'story-steps-sea is-night' : 'story-steps-sea';
            sea.setAttribute('aria-hidden', 'true');
            const count = document.createElement('span');
            count.className = 'story-steps-count';
            count.textContent = `${counts[option.id]} gags can appear`;
            tile.append(name, sea, count);
            if (option.id === live.band) {
                const badge = document.createElement('span');
                badge.className = 'story-steps-badge';
                badge.textContent = 'NOW';
                tile.appendChild(badge);
            }
            tile.setAttribute('aria-label', `${option.label}: ${counts[option.id]} gags can appear${option.id === live.band ? ' (the time now)' : ''}`);
            tile.addEventListener('click', (event) => onStep({ level: 'gag', band: option.id }, originOf(event)));
            tides.appendChild(tile);
        }
        root.appendChild(tides);
        return root;
    }

    if (step.level === 'gag') {
        const gags = gagsFor(step.day, band);
        head(`Day ${pad(step.day)} · ${band.label} · which gag?`,
            `${gags.length} gags can appear. The game picks a visit's gags from these by weight.`);
        if (isLiveDay && isLiveBand && visit.length) {
            const strip = document.createElement('div');
            strip.className = 'story-steps-visit';
            const label = document.createElement('span');
            label.textContent = 'This visit:';
            strip.appendChild(label);
            for (const gag of visit) {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.dataset.role = gag.role;
                const name = gag.filler ? 'pause' : gagName(gag);
                chip.textContent = `${pad(gag.index ?? 0)} ${name}${gag.repeat > 1 ? ` ×${gag.repeat}` : ''}`;
                chip.title = gag.role === 'live' ? 'Johnny now' : gag.role === 'seen' ? 'Already played' : 'Planned';
                if (gag.filler) chip.disabled = true;
                else chip.addEventListener('click', () => onStep({ level: 'detail', gag }));
                strip.appendChild(chip);
            }
            root.appendChild(strip);
        }
        if (!gags.length) {
            const empty = document.createElement('p');
            empty.className = 'story-steps-empty';
            empty.textContent = 'No gags can appear on this day at this time.';
            root.appendChild(empty);
            return root;
        }
        const grid = document.createElement('div');
        grid.className = 'story-steps-grid';
        for (const gag of gags) {
            const isLive = isLiveDay && live.gag && gag.script === live.gag.script && gag.tagId === live.gag.tagId;
            grid.appendChild(cardButton({
                gag, faces,
                name: gagName(gag),
                kicker: gag.keyDay ? 'Key scene' : gag.final ? 'Ends a visit' : 'Gag',
                live: isLive,
                badge: isLive ? 'NOW' : null,
                label: `${gagName(gag)}${gag.keyDay ? `, key scene for day ${gag.keyDay}` : ''}${gag.final ? ', ends a visit' : ''}${isLive ? ' (Johnny now)' : ''}`,
                onClick: (event) => onStep({ level: 'detail', gag }, originOf(event)),
            }));
        }
        root.appendChild(grid);
        return root;
    }

    // Detail: the chosen gag, with its script steps rendered by the panel below.
    const gag = step.gag;
    if (!gag) return root;
    const hero = document.createElement('div');
    hero.className = 'story-steps-hero';
    const isLive = live.gag && gag.script === live.gag.script && gag.tagId === live.gag.tagId;
    hero.appendChild(cardButton({
        gag, faces, name: gagName(gag),
        kicker: isLive ? 'Now' : gag.keyDay ? 'Key scene' : 'Gag',
        live: isLive, label: gagName(gag), priority: true,
    }));
    const info = document.createElement('div');
    const h = document.createElement('h3');
    h.className = 'story-steps-hero-name';
    h.textContent = gagName(gag);
    h.style.cssText = "margin:0;font:38px/1 'Caveat',cursive;color:#fff2a1";
    const facts = document.createElement('ul');
    const fact = (text) => {
        const li = document.createElement('li');
        li.textContent = text;
        facts.appendChild(li);
    };
    if (isLive) fact('Johnny is playing this now.');
    if (gag.keyDay) fact(`✦ Key scene for day ${gag.keyDay}: playing it unlocks the next day.`);
    if (gag.final) fact('☾ Ends a visit.');
    if (gag.tideMin != null) fact(describeTideWindow(gag.tideMin, gag.tideMax));
    info.append(h, facts);
    if (onPlayGag) {
        info.appendChild(playButton(isLive ? '▶ Replay this gag' : '▶ Play this gag',
            'Start a new visit from this gag; the story carries on from there', () => onPlayGag(gag, step.day)));
    }
    hero.appendChild(info);
    root.appendChild(hero);
    return root;
}

import { __DEBUG__ } from '../../../dgds/scripting/process.mjs';
import { JOHNNY_SCENES } from '../story-controller.mjs';
import { TIDE_BANDS, bandForPhase, gagsFor, keySceneFor } from '../story-steps.mjs';
import deckCss from './playback-deck.css?inline';
const PLAYBACK_RATES = [0.5, 1, 2, 4];
const isTyping = (target) => target?.matches?.('input, select, textarea, button, a, [contenteditable="true"]');
const icons = import.meta.glob('./deck-icons/*.svg', { query: '?raw', import: 'default', eager: true });
const icon = (name) => icons[`./deck-icons/${name}.svg`].replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
const keyOf = (gag) => `${gag.script}:${gag.tagId}`;
const catalogue = new Set(JOHNNY_SCENES.filter((g) => g.script !== 'POSE' && g.script !== 'STAND.ADS').map(keyOf));

/** Shared playback chrome. The engine and coordinator remain the only playback owners. */
export function setupEnhancedUI({
    settings = null,
    sequenceTools = null,
    sceneFlow = null,
    resolveEntry = () => null,
} = {}) {
    const style = document.createElement('style');
    style.textContent = deckCss;
    document.head.append(style);
    const hud = document.createElement('section');
    hud.id = 'enhanced-hud';
    hud.setAttribute('aria-label', 'Playback controls');
    hud.innerHTML = `<nav id="jc-deck" aria-label="Playback toolbar">
        <div class="jc-deck-brand">${icon('compass')}<div><strong>Johnny Castaway</strong><small id="enhanced-hud-status"><span id="enhanced-hud-stage">Day 1</span> · <span id="enhanced-hud-name">On island time</span></small></div></div>
        <div class="jc-deck-tools"></div><span id="jc-deck-announcement" role="status"></span>
    </nav>
    <aside id="jc-log" aria-label="Captain’s log" hidden>
        <header class="jc-log-title"><h2>Captain’s log</h2><button class="jc-log-close" aria-label="Close captain’s log">×</button></header>
        <section><span class="jc-eyebrow">Story position</span><h3 id="jc-log-day">Day 1 of 11</h3><div class="jc-day-track" aria-hidden="true">${Array.from({ length: 11 }, (_, i) => `<span data-day="${i + 1}"></span>`).join('')}</div><p class="jc-log-note" id="jc-log-weather">A little island. A long story.</p></section>
        <dl class="jc-stat-grid"><div><dt>Gags visited</dt><dd id="jc-gags-seen">0 / ${catalogue.size}</dd></div><div><dt>Watching for</dt><dd id="jc-watch-time">00:00</dd></div></dl>
        <p class="jc-log-note">Unique gags · this playback session</p>
        <section class="jc-current"><span class="jc-eyebrow">Now playing</span><h3 id="jc-current-gag">Johnny settles in</h3><div class="jc-visit-row"><span id="jc-visit-label">Current visit</span><span id="jc-visit-count">—</span></div><progress id="jc-visit-progress" aria-label="Position in current visit" max="1" value="0"></progress></section>
        <section class="jc-log-navigation" aria-label="Day and gag navigation"><span class="jc-eyebrow">Take a look around</span>
        <label for="jc-jump-day">Story day</label><div class="jc-nav-row"><button id="jc-day-prev" aria-label="Play previous story day">‹</button><select id="jc-jump-day" aria-label="Story day">${Array.from({ length: 11 }, (_, i) => `<option value="${i + 1}">Day ${i + 1}</option>`).join('')}</select><button id="jc-day-next" aria-label="Play next story day">›</button></div>
        <label for="jc-jump-band">Time of day</label><select id="jc-jump-band">${TIDE_BANDS.map((b) => `<option value="${b.id}">${b.label}</option>`).join('')}</select>
        <button class="jc-full-width jc-play-day" id="jc-play-day">Visit this day →</button>
        <label for="jc-jump-gag">Gag on this day</label><select id="jc-jump-gag"></select><div class="jc-nav-row" style="margin-top:8px"><button id="jc-gag-prev" aria-label="Play previous gag">‹</button><button id="jc-play-gag" class="jc-play-day">Play gag</button><button id="jc-gag-next" aria-label="Play next gag">›</button></div>
        <button id="jc-return-live" class="jc-full-width">↶ Return to live story</button><p id="jc-log-error" class="jc-log-error" role="status"></p>
        </section>
    </aside>`;
    document.body.append(hud);
    const $ = (id) => hud.querySelector('#' + id),
        rail = $('jc-log'),
        tools = hud.querySelector('.jc-deck-tools');
    const restore = document.createElement('button');
    restore.id = 'jc-deck-restore';
    restore.textContent = '⌃';
    restore.title = 'Show playback toolbar [H]';
    restore.setAttribute('aria-label', 'Show playback toolbar');
    restore.hidden = true;
    document.body.append(restore);
    let hudVisible = true,
        railOpen = false,
        disposed = false,
        status = sequenceTools?.status?.() ?? null,
        animationFrame = null,
        lastPaint = -Infinity,
        lastSignature = '',
        choices = [],
        picked = false;
    const seen = new Set(),
        days = new Set();
    let watching = 0,
        previousTime = null;
    const refreshLayout = () => settings?.refreshLayout?.();
    const button = (id, label, symbol, action) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.id = id;
        b.innerHTML = icon(symbol) + `<span>${label}</span>`;
        b.setAttribute('aria-label', label);
        b.title = label;
        b.onclick = action;
        tools.append(b);
        return b;
    };
    const report = (message) => {
        $('jc-log-error').textContent = message;
        $('jc-deck-announcement').textContent = message;
    };
    const invoke = (fn) => {
        try {
            fn();
            report('');
        } catch {
            report('Could not start that visit. Try another gag.');
        }
    };
    const sound = button('jc-deck-sound', 'Sound', 'sound', () => {
        const control = document.querySelector('[data-setting="sound"]');
        if (control) {
            control.value = control.value === 'off' ? 'on' : 'off';
            control.dispatchEvent(new Event('change'));
        }
        renderStatus();
    });
    const speed = button('jc-deck-speed', '1×', 'speed', () => {
        const p = __DEBUG__.getPresentation();
        __DEBUG__.setPlaybackRate(
            PLAYBACK_RATES[(Math.max(0, PLAYBACK_RATES.indexOf(p.playbackRate)) + 1) % PLAYBACK_RATES.length],
        );
        renderStatus();
    });
    button('jc-deck-timeline', 'Timeline', 'book', () => sceneFlow?.open());
    button('jc-deck-picture', 'Picture', 'picture', () => {
        settings?.open();
        const detail = document.querySelector('.johnny-crt');
        if (detail) {
            detail.open = true;
            detail.scrollIntoView?.({ block: 'nearest' });
        }
    });
    button('jc-deck-options', 'Options', 'options', () => settings?.open());
    const fullscreen = async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen?.();
            else await document.documentElement.requestFullscreen?.();
        } catch {
            if (!disposed) report('Fullscreen is unavailable in this browser.');
        }
    };
    button('jc-deck-fullscreen', 'Full screen', 'full', fullscreen);
    const logButton = button('jc-deck-log', 'Log', 'rail', () => setRailOpen(!railOpen));
    logButton.setAttribute('aria-controls', 'jc-log');
    logButton.setAttribute('aria-expanded', 'false');
    button('enhanced-hud-dismiss', 'Hide', 'hide', () => setHudVisible(false)).setAttribute(
        'aria-label',
        'Hide playback toolbar; press H to restore',
    );
    function setRailOpen(value) {
        railOpen = value;
        rail.hidden = !value || !hudVisible;
        logButton.setAttribute('aria-expanded', String(value && hudVisible));
        refreshLayout();
    }
    function setHudVisible(value) {
        const hadFocus = hud.contains(document.activeElement);
        hudVisible = value;
        hud.classList.toggle('is-hidden', !value);
        hud.inert = !value;
        hud.setAttribute('aria-hidden', String(!value));
        document.body.classList.toggle('jc-deck-visible', value);
        restore.hidden = value;
        rail.hidden = !value || !railOpen;
        logButton.setAttribute('aria-expanded', String(value && railOpen));
        refreshLayout();
        if (!value && hadFocus) restore.focus();
    }
    restore.onclick = () => {
        setHudVisible(true);
        logButton.focus();
    };
    hud.querySelector('.jc-log-close').onclick = () => {
        setRailOpen(false);
        logButton.focus();
    };
    function gagName(gag) {
        if (!gag) return 'Johnny settles in';
        if (gag.script === 'POSE') return 'A moment on the island';
        try {
            return (
                resolveEntry(gag.script)?.scenes?.find((s) => s.tagId?.id === gag.tagId)?.tagId?.description ||
                `${gag.script.replace(/\.ADS$/, '')} · ${gag.tagId}`
            );
        } catch {
            return `${gag.script} · ${gag.tagId}`;
        }
    }
    function fillGags() {
        const select = $('jc-jump-gag'),
            previous = choices[Number(select.value)];
        choices = gagsFor(
            Number($('jc-jump-day').value),
            TIDE_BANDS.find((b) => b.id === $('jc-jump-band').value) || TIDE_BANDS[0],
        );
        select.replaceChildren(...choices.map((g, i) => new Option(gagName(g), String(i))));
        const selected = picked ? previous : status?.active;
        if (selected) {
            const at = choices.findIndex((g) => keyOf(g) === keyOf(selected));
            if (at >= 0) select.value = String(at);
        }
        updateNavigation();
    }
    function updateNavigation() {
        const capable = typeof sequenceTools?.startRun === 'function',
            day = Number($('jc-jump-day').value);
        for (const id of ['jc-play-gag', 'jc-gag-prev', 'jc-gag-next']) $(id).disabled = !capable || !choices.length;
        for (const id of ['jc-play-day', 'jc-day-prev', 'jc-day-next'])
            $(id).disabled = !capable || typeof sequenceTools?.setStoryDay !== 'function' || !keySceneFor(day);
        $('jc-day-prev').disabled ||= day <= 1;
        $('jc-day-next').disabled ||= day >= 11;
        $('jc-return-live').disabled = !capable;
        $('jc-jump-gag').disabled = !capable || !choices.length;
    }
    function playDay(day) {
        const gag = keySceneFor(day);
        if (!gag) return;
        picked = false;
        $('jc-jump-day').value = String(day);
        fillGags();
        invoke(() => {
            const previous = sequenceTools.getStoryDay?.();
            try {
                sequenceTools.setStoryDay(day);
                sequenceTools.startRun({
                    mode: 'sequence',
                    script: gag.script,
                    tagId: gag.tagId,
                    storyDay: day,
                    band: $('jc-jump-band').value,
                });
            } catch (error) {
                if (previous != null) sequenceTools.setStoryDay(previous);
                throw error;
            }
        });
    }
    function playGag(delta = 0) {
        if (!choices.length) return;
        const select = $('jc-jump-gag'),
            at = (Number(select.value) + delta + choices.length) % choices.length;
        select.value = String(at);
        const gag = choices[at];
        invoke(() =>
            sequenceTools.startRun({
                mode: 'preview',
                script: gag.script,
                tagId: gag.tagId,
                storyDay: gag.keyDay || Number($('jc-jump-day').value),
                band: $('jc-jump-band').value,
            }),
        );
    }
    $('jc-jump-day').onchange = $('jc-jump-band').onchange = () => {
        picked = true;
        fillGags();
    };
    $('jc-play-day').onclick = () => playDay(Number($('jc-jump-day').value));
    $('jc-day-prev').onclick = () => playDay(Math.max(1, Number($('jc-jump-day').value) - 1));
    $('jc-day-next').onclick = () => playDay(Math.min(11, Number($('jc-jump-day').value) + 1));
    $('jc-jump-gag').onchange = () => {
        picked = true;
    };
    $('jc-play-gag').onclick = () => playGag();
    $('jc-gag-prev').onclick = () => playGag(-1);
    $('jc-gag-next').onclick = () => playGag(1);
    $('jc-return-live').onclick = () => {
        picked = false;
        invoke(() => sequenceTools.startRun({ mode: 'live' }));
    };
    function storyChanged(next) {
        status = next;
        const day = next?.storyDay ?? sequenceTools?.getStoryDay?.() ?? 1;
        days.add(day);
        if (next?.active && catalogue.has(keyOf(next.active))) seen.add(keyOf(next.active));
        if (!picked) {
            $('jc-jump-day').value = String(day);
            $('jc-jump-band').value = next?.band || bandForPhase(next?.tidePhase)?.id || 'early';
        }
        fillGags();
        renderStatus();
    }
    function renderStatus() {
        const p = __DEBUG__.getPresentation(),
            day = status?.storyDay ?? sequenceTools?.getStoryDay?.() ?? 1,
            band = TIDE_BANDS.find((b) => b.id === (status?.band || bandForPhase(status?.tidePhase)?.id));
        const current = Math.min(status?.total || 1, (status?.current ?? -1) + (status?.preview ? 0 : 1));
        const muted = document.querySelector('[data-setting="sound"]')?.value === 'off';
        const signature = JSON.stringify([
            muted,
            p.scene,
            p.name,
            p.playbackRate,
            day,
            band?.id,
            status?.active,
            status?.total,
            current,
            status?.preview,
            seen.size,
            Math.floor(watching),
        ]);
        if (signature === lastSignature) return;
        lastSignature = signature;
        $('enhanced-hud-stage').textContent = `Day ${day}`;
        $('enhanced-hud-name').textContent = band?.label || 'On island time';
        speed.querySelector('span').textContent = `${p.playbackRate}×`;
        speed.setAttribute('aria-label', `Playback speed ${p.playbackRate} times; change speed`);
        sound.querySelector('span').textContent = muted ? 'Muted' : 'Sound';
        sound.setAttribute('aria-pressed', String(!muted));
        $('jc-log-day').textContent = `Day ${day} of 11`;
        $('jc-log-weather').textContent =
            `${band?.label || 'Island time'}${status?.lowTide != null ? ' · ' + (status.lowTide ? 'Low tide' : 'High tide') : ''}`;
        for (const mark of hud.querySelectorAll('[data-day]')) {
            mark.classList.toggle('is-current', Number(mark.dataset.day) === day);
            mark.classList.toggle('is-visited', days.has(Number(mark.dataset.day)));
        }
        $('jc-gags-seen').textContent = `${seen.size} / ${catalogue.size}`;
        const seconds = Math.floor(watching);
        $('jc-watch-time').textContent =
            `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        $('jc-current-gag').textContent = gagName(status?.active);
        $('jc-visit-label').textContent = status?.preview ? 'Gag preview' : 'Current visit';
        $('jc-visit-count').textContent = status?.total ? `${Math.max(0, current)} / ${status.total}` : '—';
        $('jc-visit-progress').max = status?.total || 1;
        $('jc-visit-progress').value = Math.max(0, current);
    }
    const unsubscribe = sequenceTools?.subscribeStatus?.(storyChanged);
    if (!sequenceTools?.subscribeStatus) storyChanged(status);
    function render(time) {
        if (!document.hidden) {
            if (previousTime != null) watching += (time - previousTime) / 1000;
            previousTime = time;
            if (time - lastPaint >= 250) {
                renderStatus();
                lastPaint = time;
            }
        } else previousTime = null;
        animationFrame = requestAnimationFrame(render);
    }
    const modalOpen = () =>
        document.querySelector('#settings-overlay[aria-hidden="false"],#scene-flow-overlay[aria-hidden="false"]');
    const handleKeydown = async (event) => {
        if (modalOpen()) return;
        if (event.key === 'Escape' && railOpen) {
            event.preventDefault();
            setRailOpen(false);
            logButton.focus();
            return;
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (
            event.key.toLowerCase() === 'h' &&
            !event.target?.matches?.('input, select, textarea, [contenteditable="true"]')
        ) {
            event.preventDefault();
            setHudVisible(!hudVisible);
            return;
        }
        if (isTyping(event.target)) return;
        const p = __DEBUG__.getPresentation(),
            index = Math.max(0, PLAYBACK_RATES.indexOf(p.playbackRate));
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            __DEBUG__.stepScene(event.key === 'ArrowRight' ? 1 : -1);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            __DEBUG__.setPlaybackRate(
                PLAYBACK_RATES[Math.max(0, Math.min(3, index + (event.key === 'ArrowUp' ? 1 : -1)))],
            );
        } else if (event.key.toLowerCase() === 'f') {
            event.preventDefault();
            await fullscreen();
        }
    };
    const resetVisibilityClock = () => {
        previousTime = null;
    };
    document.addEventListener('visibilitychange', resetVisibilityClock);
    window.addEventListener('keydown', handleKeydown, true);
    const onResize = () => refreshLayout();
    window.addEventListener('resize', onResize);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refreshLayout) : null;
    observer?.observe($('jc-deck'));
    setHudVisible(true);
    renderStatus();
    animationFrame = requestAnimationFrame(render);
    const destroy = () => {
        disposed = true;
        cancelAnimationFrame(animationFrame);
        observer?.disconnect();
        unsubscribe?.();
        document.removeEventListener('visibilitychange', resetVisibilityClock);
        window.removeEventListener('keydown', handleKeydown, true);
        window.removeEventListener('resize', onResize);
        document.body.classList.remove('jc-deck-visible');
        hud.remove();
        restore.remove();
        style.remove();
        refreshLayout();
    };
    return { hud, setHudVisible, setRailOpen, destroy };
}

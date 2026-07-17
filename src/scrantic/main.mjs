import { drawScreen } from '../dgds/graphics.mjs';
import { loadResources } from '../dgds/resource.mjs';
import { createAudioManager } from '../dgds/audio.mjs';
import Story from './story.mjs';
import { setupDebugUI } from '../debug-ui.mjs';

export const run = async () => {
    const mainContext = document.getElementById('mainCanvas').getContext('2d');
    mainContext.clearRect(0, 0, 640, 480);

    const base = import.meta.env.BASE_URL;

    // Load resources immediately so errors surface before any user interaction.
    let resMapResp, resFileResp;
    try {
        [resMapResp, resFileResp] = await Promise.all([
            fetch(`${base}data/RESOURCE.MAP`),
            fetch(`${base}data/RESOURCE.001`),
        ]);
    } catch {
        showDataError(['RESOURCE.MAP', 'RESOURCE.001']);
        return;
    }

    // Vite's dev server returns 200 + text/html (SPA history fallback) for
    // files that don't exist, so content-type is a more reliable signal than ok.
    const isMissing = r => !r.ok || r.headers.get('content-type')?.startsWith('text/html');
    const missing = [
        isMissing(resMapResp) && 'RESOURCE.MAP',
        isMissing(resFileResp) && 'RESOURCE.001',
    ].filter(Boolean);

    if (missing.length) {
        showDataError(missing);
        return;
    }

    let res;
    try {
        res = loadResources(
            await resMapResp.arrayBuffer(),
            await resFileResp.arrayBuffer(),
        );
    } catch (err) {
        showDataError(['RESOURCE.MAP', 'RESOURCE.001'], `Could not parse game data: ${err.message}`);
        return;
    }

    const resource = res.getResource('RESOURCE.001');
    const introRes = resource.loadEntry('INTRO.SCR');
    drawScreen(introRes, mainContext);

    // Gate audio and animation behind a user gesture (browser autoplay policy).
    // AudioContext is created synchronously inside the click callback so the
    // browser's user-activation requirement is satisfied.
    const audioManager = await waitForStart();

    setupDebugUI();

    const story = new Story(resource);
    while (true) {
        await story.play(audioManager);
    }
};

/**
 * Show the start overlay and resolve with a fresh AudioManager once the user
 * clicks. AudioContext must be constructed synchronously inside the click
 * handler — creating it after an await loses the user-activation context.
 */
function waitForStart() {
    return new Promise((resolve) => {
        const overlay = document.getElementById('start-overlay');
        const btn = document.getElementById('start-btn');
        overlay.classList.add('visible');
        btn.addEventListener('click', () => {
            overlay.classList.remove('visible');
            resolve(createAudioManager({ soundFxVolume: 0.50 }));
        }, { once: true });
    });
}

function showDataError(missing, detail) {
    const overlay = document.getElementById('data-error');
    const list = document.getElementById('data-error-files');
    if (!overlay || !list) return;

    const allFiles = ['RESOURCE.MAP', 'RESOURCE.001', 'SCRANTIC.SCR'];
    list.innerHTML = allFiles
        .map(f => `<li class="${missing.includes(f) ? '' : 'ok'}">${f}</li>`)
        .join('');

    if (detail) {
        const detailEl = overlay.querySelector('.detail');
        if (detailEl) detailEl.textContent = detail;
    }

    overlay.classList.add('visible');
    console.error('[johnny_web]', missing.join(', '), detail ?? '');
}

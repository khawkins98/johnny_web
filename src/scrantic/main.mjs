import { drawScreen } from '../dgds/graphics.mjs';
import { loadResources } from '../dgds/resource.mjs';
import { createAudioManager } from '../dgds/audio.mjs';
import { startProcess } from '../dgds/scripting/process.mjs';
import { setupDebugUI } from '../debug-ui.mjs';
import { setupEnhancedUI } from '../enhanced-ui.mjs';
import { setupSettingsUI, SOUND_SETTING_KEY } from '../settings-ui.mjs';
import { johnnyCastaway } from '../games/johnny/manifest.mjs';

export const run = async () => {
    const mainContext = document.getElementById('mainCanvas').getContext('2d');
    mainContext.clearRect(0, 0, 640, 480);

    const base = import.meta.env.BASE_URL;

    // Load resources immediately so errors surface before any user interaction.
    let resMapResp, resFileResp;
    try {
        [resMapResp, resFileResp] = await Promise.all([
            fetch(`${base}data/${johnnyCastaway.resources.map}`),
            fetch(`${base}data/${johnnyCastaway.resources.archive}`),
        ]);
    } catch {
        showDataError([johnnyCastaway.resources.map, johnnyCastaway.resources.archive]);
        return;
    }

    // Vite's dev server returns 200 + text/html (SPA history fallback) for
    // files that don't exist, so content-type is a more reliable signal than ok.
    const isMissing = r => !r.ok || r.headers.get('content-type')?.startsWith('text/html');
    const missing = [
        isMissing(resMapResp) && johnnyCastaway.resources.map,
        isMissing(resFileResp) && johnnyCastaway.resources.archive,
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
        showDataError(
            [johnnyCastaway.resources.map, johnnyCastaway.resources.archive],
            `Could not parse game data: ${err.message}`,
        );
        return;
    }

    const resource = res.getResource(johnnyCastaway.resources.archive);
    const introRes = resource.loadEntry(johnnyCastaway.resources.intro);
    drawScreen(introRes, mainContext);

    let audioManager = null;
    setupDebugUI();
    const settings = setupSettingsUI({ getAudioManager: () => audioManager });

    // Gate audio and animation behind a user gesture (browser autoplay policy).
    // AudioContext is created synchronously inside the click callback so the
    // browser's user-activation requirement is satisfied.
    const start = await waitForStart(settings);
    audioManager = start.audioManager;
    if (start.experience === 'enhanced') setupEnhancedUI();

    const context = document.getElementById('canvas').getContext('2d');
    const data = resource.loadEntry(johnnyCastaway.resources.activity);

    while (true) {
        context.clearRect(0, 0, 640, 480);
        mainContext.clearRect(0, 0, 640, 480);
        
        await new Promise((resolve) => {
            startProcess({
                type: 'ADS',
                context,
                mainContext,
                data,
                entries: resource.entries,
                game: johnnyCastaway,
                audioManager,
                onComplete: resolve,
            });
        });
    }
};

/**
 * Show the start overlay and resolve with a fresh AudioManager once the user
 * clicks. AudioContext must be constructed synchronously inside the click
 * handler — creating it after an await loses the user-activation context.
 */
function waitForStart(settings) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('start-overlay');
        const classicBtn = document.getElementById('start-classic-btn');
        const enhancedBtn = document.getElementById('start-enhanced-btn');
        const helpBtn = document.getElementById('start-help-btn');
        const help = document.getElementById('start-help');
        const settingsBtn = document.getElementById('start-settings-btn');
        overlay.classList.add('visible');
        settingsBtn.addEventListener('click', () => settings.open());
        helpBtn.addEventListener('click', () => {
            const visible = help.classList.toggle('visible');
            helpBtn.setAttribute('aria-expanded', String(visible));
        });
        const start = experience => {
            settings.applyExperience(experience);
            overlay.classList.remove('visible');
            resolve({
                experience,
                audioManager: createAudioManager({
                    soundFxVolume: 0.50,
                    enabled: localStorage.getItem(SOUND_SETTING_KEY) !== 'off',
                    sampleCatalog: johnnyCastaway.audio,
                }),
            });
        };
        classicBtn.addEventListener('click', () => start('classic'), { once: true });
        enhancedBtn.addEventListener('click', () => start('enhanced'), { once: true });
    });
}

function showDataError(missing, detail) {
    const overlay = document.getElementById('data-error');
    const list = document.getElementById('data-error-files');
    if (!overlay || !list) return;

    const allFiles = [
        johnnyCastaway.resources.map,
        johnnyCastaway.resources.archive,
        johnnyCastaway.audio.archive,
    ];
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

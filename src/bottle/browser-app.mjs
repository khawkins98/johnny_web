import { drawScreen } from '../dgds/graphics.mjs';
import { loadResources } from '../dgds/resource.mjs';
import { createAudioManager } from '../dgds/audio.mjs';
import { startProcess, stopProcess } from '../dgds/scripting/process.mjs';

/**
 * Run one packaged DGDS title in the Bottle browser host.
 *
 * The game package supplies title/version resource knowledge. UI factories are
 * injected because settings and enhancements belong to the title/application,
 * not to the faithful DGDS machine.
 */
export const runBrowserGame = async ({
    game,
    setupDebugUI = () => {},
    setupEnhancedUI = () => null,
    setupSettingsUI,
    soundSettingKey,
}) => {
    if (!game) throw new TypeError('Bottle browser host requires a game package');
    if (typeof setupSettingsUI !== 'function') {
        throw new TypeError('Bottle browser host requires a settings UI factory');
    }

    const mainContext = document.getElementById('mainCanvas').getContext('2d');
    mainContext.clearRect(0, 0, 640, 480);

    const base = import.meta.env.BASE_URL;

    // Load resources immediately so errors surface before any user interaction.
    let resMapResp, resFileResp;
    try {
        [resMapResp, resFileResp] = await Promise.all([
            fetch(`${base}data/${game.resources.map}`),
            fetch(`${base}data/${game.resources.archive}`),
        ]);
    } catch {
        showDataError(game, [game.resources.map, game.resources.archive]);
        return;
    }

    // Vite's dev server returns 200 + text/html (SPA history fallback) for
    // files that don't exist, so content-type is a more reliable signal than ok.
    const isMissing = r => !r.ok || r.headers.get('content-type')?.startsWith('text/html');
    const missing = [
        isMissing(resMapResp) && game.resources.map,
        isMissing(resFileResp) && game.resources.archive,
    ].filter(Boolean);

    if (missing.length) {
        showDataError(game, missing);
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
            game,
            [game.resources.map, game.resources.archive],
            `Could not parse game data: ${err.message}`,
        );
        return;
    }

    const resource = res.getResource(game.resources.archive);
    const introRes = resource.loadEntry(game.resources.intro);
    let audioManager = null;
    let enhancedUI = null;
    setupDebugUI();
    const settings = setupSettingsUI({
        getAudioManager: () => audioManager,
        onRestart: () => {
            audioManager?.stopAll?.();
            stopProcess('restart');
        },
    });

    const context = document.getElementById('canvas').getContext('2d');
    const data = resource.loadEntry(game.resources.activity);

    while (true) {
        context.clearRect(0, 0, 640, 480);
        mainContext.clearRect(0, 0, 640, 480);
        drawScreen(introRes, mainContext);

        // Gate first-time audio creation behind a user gesture. Returning to
        // the title reuses the existing AudioContext instead of leaking one.
        const start = await waitForStart({
            settings,
            existingAudioManager: audioManager,
            game,
            soundSettingKey,
        });
        audioManager = start.audioManager;
        enhancedUI?.destroy();
        enhancedUI = start.experience === 'enhanced' ? setupEnhancedUI() : null;

        let outcome;
        do {
            context.clearRect(0, 0, 640, 480);
            mainContext.clearRect(0, 0, 640, 480);
            outcome = await new Promise((resolve) => {
                startProcess({
                    type: 'ADS',
                    context,
                    mainContext,
                    data,
                    entries: resource.entries,
                    game,
                    audioManager,
                    onComplete: resolve,
                });
            });
        } while (outcome?.reason === 'completed');

        enhancedUI?.destroy();
        enhancedUI = null;
    }
};

/**
 * Show the start overlay and resolve with a fresh AudioManager once the user
 * clicks. AudioContext must be constructed synchronously inside the click
 * handler — creating it after an await loses the user-activation context.
 */
function waitForStart({ settings, existingAudioManager = null, game, soundSettingKey }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('start-overlay');
        const classicBtn = document.getElementById('start-classic-btn');
        const enhancedBtn = document.getElementById('start-enhanced-btn');
        const helpBtn = document.getElementById('start-help-btn');
        const help = document.getElementById('start-help');
        const settingsBtn = document.getElementById('start-settings-btn');
        overlay.classList.add('visible');
        help.classList.remove('visible');
        helpBtn.setAttribute('aria-expanded', 'false');
        const openSettings = () => settings.open();
        const toggleHelp = () => {
            const visible = help.classList.toggle('visible');
            helpBtn.setAttribute('aria-expanded', String(visible));
        };
        settingsBtn.addEventListener('click', openSettings);
        helpBtn.addEventListener('click', toggleHelp);
        const start = experience => {
            classicBtn.removeEventListener('click', startClassic);
            enhancedBtn.removeEventListener('click', startEnhanced);
            settingsBtn.removeEventListener('click', openSettings);
            helpBtn.removeEventListener('click', toggleHelp);
            settings.applyExperience(experience);
            overlay.classList.remove('visible');
            const nextAudioManager = existingAudioManager || createAudioManager({
                soundFxVolume: 0.50,
                enabled: localStorage.getItem(soundSettingKey) !== 'off',
                sampleCatalog: game.audio,
            });
            nextAudioManager.setEnabled(localStorage.getItem(soundSettingKey) !== 'off');
            resolve({
                experience,
                audioManager: nextAudioManager,
            });
        };
        const startClassic = () => start('classic');
        const startEnhanced = () => start('enhanced');
        classicBtn.addEventListener('click', startClassic);
        enhancedBtn.addEventListener('click', startEnhanced);
    });
}

function showDataError(game, missing, detail) {
    const overlay = document.getElementById('data-error');
    const list = document.getElementById('data-error-files');
    if (!overlay || !list) return;

    const allFiles = [
        game.resources.map,
        game.resources.archive,
        game.audio.archive,
    ];
    list.innerHTML = allFiles
        .map(f => `<li class="${missing.includes(f) ? '' : 'ok'}">${f}</li>`)
        .join('');

    if (detail) {
        const detailEl = overlay.querySelector('.detail');
        if (detailEl) detailEl.textContent = detail;
    }

    overlay.classList.add('visible');
    console.error(`[bottle-dgds:${game.id}]`, missing.join(', '), detail ?? '');
}

import { drawScreen } from '../dgds/graphics.mjs';
import { loadResources } from '../dgds/resource.mjs';
import { loadFile } from './idb.mjs';
import { extractArchiveToIndexedDB } from './extractor.mjs';
import { createAudioManager } from '../dgds/audio.mjs';
import { startProcess, stopProcess } from '../dgds/scripting/process.mjs';
import { createSoftwareSurface } from '../dgds/scripting/surface.mjs';
import { createEntryResourceProvider } from '../dgds/resource-provider.mjs';
import { createBrowserPresentationPolicy } from '../dgds/hosts/browser-presentation-policy.mjs';
import { createDebugRunCoordinator } from './debug-run-coordinator.mjs';
import { diagnostics } from '../dgds/scripting/diagnostics.mjs';
import { faithfulRandomFromArchive } from '../dgds/scripting/faithful-rng.mjs';

// OPT IN: the engine's RANDOM (ADS weighted scene pick) can be driven by a
// bit-faithful reproduction of the original binary's baked lagged-Fibonacci
// stream (see tools/faithfulness-oracle/rng-port.md). This reproduces the
// generator and ADS mapping, not a live boot's timing-dependent choices. Only the
// Confirmed host decisions and ADS RANDOM consume this one stream. Cosmetic
// randomness (cloud spawn/drift, the SET_TIMER
// sleep, day-ocean tint) stays on Math.random because their draw mappings or
// wall-clock interleave are not yet reproducibly traced. `?faithfulRng=on` enables
// this experimental path.
const faithfulRngEnabled = () => {
    try {
        return new URLSearchParams(globalThis.location?.search ?? '').get('faithfulRng') === 'on';
    } catch {
        return false;
    }
};

/**
 * Run one packaged, non-interactive DGDS presentation in a browser.
 *
 * The game package supplies title/version resource knowledge. UI factories are
 * injected because settings and enhancements belong to the title/application,
 * not to the faithful DGDS machine.
 */
export const runBrowserPresentation = async ({
    game,
    setupDebugUI = () => {},
    setupEnhancedUI = () => null,
    setupSettingsUI,
    setupSceneFlowUI = () => null,
    soundSettingKey,
    createBackgroundDecorator = () => null,
    selectScene = null,
    runSequenceTransition = null,
    runInterlude = null,
    runPose = null,
    createSelectionPresenter = null,
    configureStoryRandom = () => {},
    debugThemes = null,
    debugSequence = null,
}) => {
    if (!game) throw new TypeError('Bottle browser host requires a game package');
    if (typeof setupSettingsUI !== 'function') {
        throw new TypeError('Bottle browser host requires a settings UI factory');
    }
    requireBrowserPresentationPackage(game, soundSettingKey);

    const mainContext = document.getElementById('mainCanvas').getContext('2d');
    mainContext.clearRect(0, 0, 640, 480);

    const base = import.meta.env.BASE_URL;

    // 1. Try to load from IndexedDB first
    let mapBuf, arcBuf, sndBuf;
    try {
        mapBuf = await loadFile(game.resources.map);
        arcBuf = await loadFile(game.resources.archive);
        sndBuf = await loadFile(game.audio.archive);
    } catch (e) {
        console.warn('IndexedDB read failed:', e);
    }

    // 2. Fallback to network fetch if not in IDB
    if (!mapBuf || !arcBuf || !sndBuf) {
        let resMapResp, resFileResp, resSndResp;
        try {
            [resMapResp, resFileResp, resSndResp] = await Promise.all([
                fetch(`${base}data/${game.resources.map}`),
                fetch(`${base}data/${game.resources.archive}`),
                fetch(`${base}data/${game.audio.archive}`),
            ]);
        } catch {
            showDataError(game, [game.resources.map, game.resources.archive, game.audio.archive]);
            return;
        }

        const isMissing = (r) => !r.ok || r.headers.get('content-type')?.startsWith('text/html');
        const missing = [
            isMissing(resMapResp) && game.resources.map,
            isMissing(resFileResp) && game.resources.archive,
            isMissing(resSndResp) && game.audio.archive,
        ].filter(Boolean);

        if (missing.length) {
            showDataError(game, missing);
            return;
        }

        mapBuf = await resMapResp.arrayBuffer();
        arcBuf = await resFileResp.arrayBuffer();
        sndBuf = await resSndResp.arrayBuffer();
    }

    let res;
    try {
        res = loadResources(mapBuf, arcBuf);
    } catch (err) {
        showDataError(game, [game.resources.map, game.resources.archive], `Could not parse game data: ${err.message}`);
        return;
    }

    const resource = res.getResource(game.resources.archive);
    const resourceProvider = createEntryResourceProvider(resource.entries);

    // One faithful stream shared across the whole session (matches the binary's
    // single generator). Opt-in: its pick() drives ADS RANDOM choices. We
    // Expose pick() to DGDS as faithfulPick, and the typed raw source to Johnny's
    // controller/walker. It is deliberately not state.random, so cosmetic and
    // unconfirmed timer draws cannot perturb the authored stream.
    let faithfulRandom = null;
    let faithfulPick = null;
    if (faithfulRngEnabled()) {
        try {
            faithfulRandom = faithfulRandomFromArchive(new Uint8Array(arcBuf));
            faithfulPick = faithfulRandom.pick;
            configureStoryRandom(faithfulRandom);
            console.log('[DGDS] Experimental faithful RNG enabled for confirmed authored choices');
        } catch (err) {
            faithfulRandom = null;
            faithfulPick = null;
            console.warn('[DGDS] Faithful RNG unavailable, using default random sources', err);
        }
    }
    const presentationPolicy = createBrowserPresentationPolicy();
    const backgroundDecorator = createBackgroundDecorator({ resourceProvider });
    const selectionPresenter =
        createSelectionPresenter?.({ resourceProvider, game, presentationPolicy }) || null;
    const introRes = resource.loadEntry(game.resources.intro);
    let audioManager = null;
    let enhancedUI = null;
    const debugRuns = createDebugRunCoordinator({
        sequenceTools: debugSequence,
        stopRuntime: stopProcess,
        stopAudio: () => audioManager?.stopAll?.(),
    });
    const sequenceTools = debugRuns
        ? {
              ...debugSequence,
              startRun: (request) => debugRuns.request(request),
              status: () => debugRuns.status(),
              subscribeStatus: (listener) => debugRuns.subscribeStatus(listener),
          }
        : debugSequence;
    setupDebugUI({ themes: debugThemes, sequenceTools });
    // "How it works": a live view of the CURRENT gag's authored scene flow.
    // Uses the same resourceProvider the runtime itself resolves ADS/TTM
    // entries through, and the same sequenceTools (story controller) the
    // debug panel tracks the running gag with.
    setupSceneFlowUI({
        resolveEntry: (name) => resourceProvider.resolve(name),
        sequenceTools,
    });
    const settings = setupSettingsUI({
        getAudioManager: () => audioManager,
        onRestart: () => {
            audioManager?.stopAll?.();
            stopProcess('restart');
        },
        storyController: debugSequence,
    });

    const context = document.getElementById('canvas').getContext('2d');
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
            archiveBuffer: sndBuf,
        });
        audioManager = start.audioManager;
        enhancedUI?.destroy();
        enhancedUI = start.experience === 'enhanced' ? setupEnhancedUI() : null;

        // One host-owned raster per sequence (story day), persisting across
        // the per-event DgdsRuntime instances created below (faithful to the
        // original's once-allocated buffer). Recreated below whenever a
        // sequence boundary is crossed, so each story day gets its own
        // raster instead of sharing one across an entire title-to-title
        // session.
        let sharedRaster = createSoftwareSurface();

        let outcome;
        do {
            const attempt = debugRuns?.beginAttempt() ?? null;
            const override = debugRuns?.takeOverride() || window.__NEXT_SCRIPT_OVERRIDE__;
            window.__NEXT_SCRIPT_OVERRIDE__ = null;
            const selection = override || selectScene?.({ resourceProvider }) || {};
            debugRuns?.activate(selection);
            const script = selection.script || game.resources.activity;
            const tagId = selection.tagId ?? null;
            diagnostics.record('host-event', {
                phase: 'selected',
                script,
                tagId,
                storyDay: selection.titleState?.storyDay ?? null,
                hasWalk: Boolean(selection.walk),
                sequenceEnd: Boolean(selection.sequenceEnd),
            });

            const presentSelectionBackground = () => {
                mainContext.clearRect(0, 0, 640, 480);
                const presentationState = selectionPresenter?.(selection, mainContext);
                if (presentationState) backgroundDecorator?.(presentationState, mainContext);
                return Boolean(presentationState);
            };
            const hasPersistentBackground = presentSelectionBackground();

            if (selection.walk && runInterlude) {
                diagnostics.record('host-interlude', { phase: 'start', interlude: 'walk', ...selection.walk });
                await runInterlude({
                    ...selection,
                    archiveBuffer: sndBuf,
                    resourceProvider,
                    context,
                    mainContext,
                    presentBackground: presentSelectionBackground,
                    signal: attempt?.signal ?? null,
                    record: (type, data) => diagnostics.record(type, data),
                    storyRandom: faithfulRandom,
                });
                diagnostics.record('host-interlude', {
                    phase: attempt?.signal?.aborted ? 'aborted' : 'complete',
                    interlude: 'walk',
                });
            }

            if (attempt && debugRuns.interrupted(attempt)) {
                outcome = { reason: 'script_override' };
                debugRuns.endAttempt(attempt);
                continue;
            }

            if (hasPersistentBackground) presentSelectionBackground();
            else mainContext.clearRect(0, 0, 640, 480);

            // A pure-pose scene (binary adsId 0xFF) has no ADS runtime: stand Johnny
            // at the spot/heading from the walk sheet for an idle, then continue.
            if (selection.pose && runPose) {
                diagnostics.record('host-event', { phase: 'pose', ...selection.pose });
                const done = await runPose({
                    ...selection,
                    archiveBuffer: sndBuf,
                    resourceProvider,
                    context,
                    mainContext,
                    presentBackground: presentSelectionBackground,
                    signal: attempt?.signal ?? null,
                    record: (type, data) => diagnostics.record(type, data),
                });
                outcome = { reason: done ? 'completed' : 'aborted' };
                diagnostics.record('host-event', { phase: 'pose-stop', ...selection.pose, reason: outcome.reason });
            } else {
                const data = resourceProvider.resolve(script);

                outcome = await new Promise((resolve) => {
                    startProcess({
                        type: 'ADS',
                        context,
                        mainContext,
                        data,
                        ...(faithfulPick ? { faithfulPick } : {}),
                        resourceProvider,
                        backgroundDecorator,
                        game,
                        audioManager,
                        adsSceneTag: tagId,
                        singleAdsScene: tagId !== null,
                        titleState: selection.titleState ?? null,
                        hostManagedTransitions: Boolean(selectScene),
                        presentationPolicy,
                        surface: sharedRaster,
                        onComplete: resolve,
                    });
                });
                diagnostics.record('host-event', { phase: 'runtime-stop', script, tagId, reason: outcome?.reason });
            }
            if (
                outcome?.reason === 'completed' &&
                selection.sequenceEnd &&
                runSequenceTransition &&
                !(attempt && debugRuns.interrupted(attempt))
            ) {
                diagnostics.record('host-interlude', { phase: 'start', interlude: 'transition' });
                await runSequenceTransition({
                    type: selection.transition,
                    context,
                    mainContext,
                    signal: attempt?.signal ?? null,
                });
                diagnostics.record('host-interlude', {
                    phase: attempt?.signal?.aborted ? 'aborted' : 'complete',
                    interlude: 'transition',
                });
            }
            if (outcome?.reason === 'completed' && selection.sequenceEnd) {
                // The sequence just ended: the next do-while iteration (if
                // any) starts a new, unrelated story day via
                // story-controller's buildSequence(). Give it a fresh raster
                // so no pixels from this sequence can leak into the next,
                // whether or not a wipe transition actually ran above.
                sharedRaster = createSoftwareSurface();
            }
            if (attempt && debugRuns.interrupted(attempt)) outcome = { reason: 'script_override' };
            debugRuns?.endAttempt(attempt);
        } while (outcome?.reason === 'completed' || outcome?.reason === 'script_override');

        enhancedUI?.destroy();
        enhancedUI = null;
    }
};

const requireBrowserPresentationPackage = (game, soundSettingKey) => {
    const requireString = (value, path) => {
        if (typeof value !== 'string' || value.length === 0) {
            throw new TypeError(`Bottle browser presentation requires ${path}`);
        }
    };
    requireString(game.resources?.intro, 'resources.intro');
    requireString(game.resources?.activity, 'resources.activity');
    requireString(game.audio?.archive, 'audio.archive');
    requireString(soundSettingKey, 'soundSettingKey');
    if (!Array.isArray(game.audio?.sampleOffsets)) {
        throw new TypeError('Bottle browser presentation requires audio.sampleOffsets');
    }
    if (!game.background || typeof game.background !== 'object') {
        throw new TypeError('Bottle browser presentation requires background metadata');
    }
};

/**
 * Show the start overlay and resolve with a fresh AudioManager once the user
 * clicks. AudioContext must be constructed synchronously inside the click
 * handler — creating it after an await loses the user-activation context.
 */
function waitForStart({ settings, existingAudioManager = null, game, soundSettingKey, archiveBuffer }) {
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
        const start = (experience) => {
            classicBtn.removeEventListener('click', startClassic);
            enhancedBtn.removeEventListener('click', startEnhanced);
            settingsBtn.removeEventListener('click', openSettings);
            helpBtn.removeEventListener('click', toggleHelp);
            settings.applyExperience(experience);
            overlay.classList.remove('visible');
            const nextAudioManager =
                existingAudioManager ||
                createAudioManager({
                    soundFxVolume: 0.5,
                    enabled: localStorage.getItem(soundSettingKey) !== 'off',
                    sampleCatalog: game.audio,
                    archiveBuffer,
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
    if (!overlay) return;

    if (detail) {
        const detailEl = overlay.querySelector('.detail');
        if (detailEl) detailEl.textContent = detail;
    }

    overlay.classList.add('visible');
    console.error(`[bottle-dgds:${game.id}]`, missing.join(', '), detail ?? '');

    // Setup drag and drop on the entire window to prevent accidental navigation
    const card = document.getElementById('data-error-card');
    if (!card) return;

    if (window.__bottleDropWired) return;
    window.__bottleDropWired = true;

    window.addEventListener('dragenter', (e) => e.preventDefault());
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('dragover');
    });
    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (e.target === overlay || e.target === document.body) {
            card.classList.remove('dragover');
        }
    });
    const processFile = async (file, url) => {
        if (card.dataset.isExtracting) return;
        card.dataset.isExtracting = 'true';

        const inst = overlay.querySelector('.instruction');
        let buffer;
        let filename = '';

        const isSupportedExt = (name) => {
            const low = name.toLowerCase();
            return low.endsWith('.zip') || low.endsWith('.ima') || low.endsWith('.img');
        };

        if (file && isSupportedExt(file.name)) {
            buffer = await file.arrayBuffer();
            filename = file.name;
        } else if (url && isSupportedExt(url)) {
            inst.innerHTML = 'Downloading from Internet Archive...<br/><small>Please wait</small>';
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('Download failed');
                buffer = await response.arrayBuffer();
                filename = url;
            } catch (err) {
                inst.textContent = `Could not download: ${err.message}`;
                inst.style.color = '#e07070';
                card.dataset.isExtracting = '';
                return;
            }
        } else {
            card.dataset.isExtracting = '';
            return;
        }

        try {
            await extractArchiveToIndexedDB(buffer, filename, (msg) => {
                inst.innerHTML = `<strong>Extracting...</strong><br/>${msg}`;
            });
            inst.innerHTML = '<strong>All set!</strong><br/>Reloading...';
            setTimeout(() => window.location.reload(), 500);
        } catch (err) {
            inst.textContent = `Error: ${err.message}`;
            inst.style.color = '#e07070';
            card.dataset.isExtracting = '';
        }
    };

    window.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('dragover');

        const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        const file = e.dataTransfer.files[0];

        await processFile(file, url);
    });

    const filePicker = document.getElementById('file-picker');
    const instructionBox = document.getElementById('upload-instruction');

    if (instructionBox && filePicker) {
        instructionBox.addEventListener('click', (e) => {
            // Prevent clicking the anchor tag from opening the file picker
            if (e.target.tagName.toLowerCase() !== 'a') {
                filePicker.click();
            }
        });
        filePicker.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await processFile(file, null);
            }
        });
    }
}

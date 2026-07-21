import { __DEBUG__, stopProcess } from '../dgds/scripting/process.mjs';
import { diagnostics } from '../dgds/scripting/diagnostics.mjs';

export function setupDebugUI({ themes = null, sequenceTools = null } = {}) {
    // Stable automation hook for Playwright/headless browser diagnostics.
    window.__DGDS__ = __DEBUG__;
    const container = document.createElement('div');
    container.id = 'debug-menu';
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.zIndex = '1000';
    container.style.background = '#d4c4a8';
    container.style.backgroundImage =
        'url(\'data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noise)" opacity="0.1"/></svg>\')';
    container.style.color = '#4a3520';
    container.style.padding = '15px';
    container.style.borderRadius = '8px';
    container.style.border = '4px solid #8b5a2b';
    container.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5), inset 0 0 10px rgba(139, 90, 43, 0.3)';
    container.style.fontFamily = "'VT323', monospace";
    container.style.fontSize = '16px';
    container.style.display = 'none'; // Hidden by default
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.width = '400px';
    container.style.maxHeight = '80vh';
    container.style.resize = 'both';
    container.style.overflow = 'hidden';

    // Drag capability
    let isDragging = false;
    let dragStartX, dragStartY, initialX, initialY;

    const title = document.createElement('div');
    title.innerHTML = '⎈ Developer Tools';
    title.style.fontFamily = "'Caveat', cursive";
    title.style.fontSize = '24px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '4px';
    title.style.color = '#4a3520';
    title.style.borderBottom = '2px dashed #8b5a2b';
    title.style.paddingBottom = '5px';
    title.style.cursor = 'move';
    title.style.userSelect = 'none';

    title.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = container.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        // Disable transition during drag
        container.style.transition = 'none';

        // Remove right constraint since we are positioning by left/top
        container.style.right = 'auto';
        container.style.left = initialX + 'px';
        container.style.top = initialY + 'px';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        container.style.left = initialX + dx + 'px';
        container.style.top = initialY + dy + 'px';
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    container.appendChild(title);

    // Toggle on "D" keypress
    window.addEventListener('keydown', (e) => {
        if (e.key === 'd' || e.key === 'D') {
            if (!diagnostics.enabled) diagnostics.setMode('on');
            if (container.style.display === 'none') {
                container.style.display = 'flex';
                originalPopulateSelect(); // Load actual scenes from engine
            } else {
                container.style.display = 'none';
            }
        }
    });

    const controlStyle = `
        background: #f4e4c8;
        border: 2px solid #8b5a2b;
        color: #4a3520;
        font-family: 'VT323', monospace;
        font-size: 16px;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
    `;

    const scriptsRow = document.createElement('div');
    scriptsRow.style.display = 'flex';
    scriptsRow.style.flexDirection = 'column';
    scriptsRow.style.gap = '3px';
    scriptsRow.style.alignItems = 'stretch';

    const makeSectionLabel = (text) => {
        const label = document.createElement('div');
        label.innerText = text;
        label.style.fontSize = '14px';
        label.style.fontWeight = 'bold';
        label.style.letterSpacing = '0.04em';
        label.style.textTransform = 'uppercase';
        label.style.opacity = '0.78';
        label.style.textWrap = 'balance';
        return label;
    };

    const targetLabel = makeSectionLabel('Start a debug run');
    targetLabel.dataset.debugSection = 'target';

    const targetHelp = document.createElement('div');
    targetHelp.innerText = 'Following the host event now playing. Change a selector to choose a different target.';
    targetHelp.style.fontSize = '14px';
    targetHelp.style.opacity = '0.78';
    targetHelp.style.textWrap = 'pretty';

    const followPlaybackRow = document.createElement('label');
    followPlaybackRow.style.display = sequenceTools ? 'flex' : 'none';
    followPlaybackRow.style.alignItems = 'center';
    followPlaybackRow.style.gap = '8px';
    followPlaybackRow.style.minHeight = '40px';
    followPlaybackRow.style.cursor = 'pointer';
    followPlaybackRow.title = 'Keep the debug target synchronized with the event currently playing.';
    const followPlaybackCheckbox = document.createElement('input');
    followPlaybackCheckbox.type = 'checkbox';
    followPlaybackCheckbox.checked = true;
    followPlaybackCheckbox.dataset.debugControl = 'follow-playback';
    const followPlaybackText = document.createElement('span');
    followPlaybackText.innerText = 'Follow host event';
    followPlaybackRow.appendChild(followPlaybackCheckbox);
    followPlaybackRow.appendChild(followPlaybackText);

    const sceneRow = document.createElement('div');
    sceneRow.style.display = 'flex';
    sceneRow.style.flexDirection = 'column';
    sceneRow.style.gap = '3px';
    sceneRow.style.alignItems = 'stretch';

    const storyRow = document.createElement('label');
    storyRow.dataset.debugRow = 'story-day';
    storyRow.style.display = sequenceTools ? 'flex' : 'none';
    storyRow.style.flexDirection = 'column';
    storyRow.style.gap = '3px';
    storyRow.style.alignItems = 'stretch';
    const storyDayLabel = document.createElement('span');
    storyDayLabel.innerText = 'Story chapter to simulate';
    storyDayLabel.title = 'The original 11-day story counter; it gates special finales and advances the raft.';
    storyRow.appendChild(storyDayLabel);
    const storyDayHelp = document.createElement('span');
    storyDayHelp.dataset.debugStatus = 'fixed-chapter';
    storyDayHelp.style.display = 'none';
    storyDayHelp.style.fontSize = '13px';
    storyDayHelp.style.opacity = '0.72';
    storyDayHelp.innerText = 'Fixed by this scene.';

    const sceneContext = document.createElement('div');
    sceneContext.dataset.debugStatus = 'scene-context';
    sceneContext.style.display = sequenceTools ? 'block' : 'none';
    sceneContext.style.padding = '7px 9px';
    sceneContext.style.borderRadius = '6px';
    sceneContext.style.background = 'rgba(244, 228, 200, 0.5)';
    sceneContext.style.boxShadow = 'inset 0 0 0 1px rgba(74, 53, 32, 0.12)';
    sceneContext.style.textWrap = 'pretty';

    const actionRow = document.createElement('div');
    actionRow.style.display = 'grid';
    actionRow.style.gridTemplateColumns = '1fr';
    actionRow.style.gap = '8px';

    const scriptSelect = document.createElement('select');
    scriptSelect.style.cssText = controlStyle;
    scriptSelect.style.flex = '1';
    const scriptLabel = document.createElement('span');
    scriptLabel.innerText = 'Script';

    const adsFiles = [
        'ACTIVITY.ADS',
        'BUILDING.ADS',
        'FISHING.ADS',
        'JOHNNY.ADS',
        'MARY.ADS',
        'MISCGAG.ADS',
        'STAND.ADS',
        'SUZY.ADS',
        'VISITOR.ADS',
        'WALKSTUF.ADS',
    ];
    adsFiles.forEach(file => {
        const opt = document.createElement('option');
        opt.value = file;
        opt.innerText = file;
        scriptSelect.appendChild(opt);
    });

    const sceneSelect = document.createElement('select');
    sceneSelect.style.cssText = controlStyle;
    sceneSelect.style.flex = '1';
    const sceneLabel = document.createElement('span');
    sceneLabel.innerText = 'Scene';

    const populateScenes = () => {
        const previousTag = sceneSelect.value;
        sceneSelect.innerHTML = ''; // clear
        const state = __DEBUG__.getState();
        if (!state || !state.resourceProvider) return;

        const scriptName = scriptSelect.value;
        const scriptData = state.resourceProvider.resolve(scriptName);
        if (!scriptData || !scriptData.scenes) return;

        const sortedScenes = [...scriptData.scenes].sort((a, b) => {
            const idA = a.tagId && a.tagId.id ? a.tagId.id : 0;
            const idB = b.tagId && b.tagId.id ? b.tagId.id : 0;
            return idA - idB;
        });

        let prevId = 0;
        sortedScenes.forEach((scene) => {
            if (scene.tagId && scene.tagId.id) {
                const currentId = scene.tagId.id;
                for (let i = prevId + 1; i < currentId; i++) {
                    const stub = document.createElement('option');
                    stub.value = i;
                    stub.innerText = `${i}: [MISSING IN ORIGINAL GAME]`;
                    stub.disabled = true;
                    sceneSelect.appendChild(stub);
                }
                const option = document.createElement('option');
                option.value = currentId;
                option.innerText = `${currentId}: ${scene.tagId.description}`;
                sceneSelect.appendChild(option);
                prevId = currentId;
            }
        });
        if ([...sceneSelect.options].some((option) => option.value === previousTag && !option.disabled)) {
            sceneSelect.value = previousTag;
        }
    };

    scriptSelect.addEventListener('change', populateScenes);

    const storyDaySelect = document.createElement('select');
    storyDaySelect.dataset.debugControl = 'story-day';
    storyDaySelect.style.cssText = controlStyle;
    storyDaySelect.style.flex = '1';
    for (let day = 1; day <= 11; day++) {
        const option = document.createElement('option');
        option.value = String(day);
        option.innerText = `Day ${day}`;
        storyDaySelect.appendChild(option);
    }
    try {
        storyDaySelect.value = localStorage.getItem('jc-debug-story-day') || '1';
    } catch {
        storyDaySelect.value = '1';
    }
    let preferredStoryDay = storyDaySelect.value;
    storyDaySelect.addEventListener('change', () => {
        preferredStoryDay = storyDaySelect.value;
        try {
            localStorage.setItem('jc-debug-story-day', storyDaySelect.value);
        } catch {
            // The selected value still applies for this page session.
        }
        syncSelectedSceneContext();
    });
    storyRow.appendChild(storyDaySelect);
    storyRow.appendChild(storyDayHelp);

    const playbackModeRow = document.createElement('label');
    playbackModeRow.style.display = sequenceTools ? 'flex' : 'none';
    playbackModeRow.style.flexDirection = 'column';
    playbackModeRow.style.gap = '3px';
    const playbackModeLabel = document.createElement('span');
    playbackModeLabel.innerText = 'Playback mode';
    const playbackModeSelect = document.createElement('select');
    playbackModeSelect.dataset.debugControl = 'playback-mode';
    playbackModeSelect.style.cssText = controlStyle;
    for (const [value, label] of [
        ['sequence', 'Complete chapter sequence'],
        ['preview', 'Selected scene only'],
    ]) {
        const option = document.createElement('option');
        option.value = value;
        option.innerText = label;
        playbackModeSelect.appendChild(option);
    }
    playbackModeRow.appendChild(playbackModeLabel);
    playbackModeRow.appendChild(playbackModeSelect);

    const selectedSceneName = () =>
        sceneSelect.selectedOptions?.[0]?.innerText?.replace(/^\d+:\s*/, '') ||
        `${scriptSelect.value} #${sceneSelect.value}`;

    const syncSelectedSceneContext = () => {
        if (!sequenceTools) return;
        const metadata = sequenceTools.describe?.(scriptSelect.value, Number(sceneSelect.value));
        if (!metadata) {
            storyRow.style.display = 'flex';
            storyDaySelect.disabled = false;
            storyDaySelect.value = preferredStoryDay;
            storyDayHelp.style.display = 'none';
            sceneContext.innerText = `Run plan: Play ${selectedSceneName()} using decoded resource data; host-catalogue metadata is unavailable.`;
            return;
        }

        if (metadata.fixedDay) {
            storyDaySelect.value = String(metadata.fixedDay);
            storyDaySelect.disabled = true;
            storyRow.style.display = 'none';
            storyDayHelp.style.display = 'none';
        } else {
            storyRow.style.display = 'flex';
            storyDaySelect.disabled = false;
            storyDaySelect.value = preferredStoryDay;
            storyDayHelp.style.display = 'none';
        }

        const chapter = Number(storyDaySelect.value);
        const sceneName = selectedSceneName();
        if (playbackModeSelect.value === 'preview') {
            sceneContext.innerText = `Run plan: Play ${sceneName} once, then resume the current chapter.`;
        } else if (metadata.action === 'solo-finale') {
            sceneContext.innerText = `Run plan: Chapter ${chapter} — ${sceneName} only.`;
        } else if (metadata.action === 'ending-finale') {
            sceneContext.innerText = `Run plan: Chapter ${chapter} — compatible island events → ${sceneName} finale.`;
        } else {
            sceneContext.innerText = `Run plan: Chapter ${chapter} — ${sceneName} → compatible events → finale.`;
        }
    };
    scriptSelect.addEventListener('change', syncSelectedSceneContext);
    sceneSelect.addEventListener('change', syncSelectedSceneContext);
    playbackModeSelect.addEventListener('change', syncSelectedSceneContext);

    let syncingPlaybackTarget = false;
    const updateFollowPlaybackHelp = () => {
        targetHelp.innerText = followPlaybackCheckbox.checked
            ? 'Following the host event now playing. Change a selector to choose a different target.'
            : 'Debug target paused. Turn on Follow host event to track active playback.';
    };
    const stopFollowingPlayback = () => {
        if (syncingPlaybackTarget || !followPlaybackCheckbox.checked) return;
        followPlaybackCheckbox.checked = false;
        updateFollowPlaybackHelp();
    };
    for (const control of [scriptSelect, sceneSelect, storyDaySelect]) {
        control.addEventListener('pointerdown', stopFollowingPlayback);
        control.addEventListener('keydown', (event) => {
            if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
                stopFollowingPlayback();
            }
        });
    }

    const syncTargetToPlayback = (status) => {
        if (!followPlaybackCheckbox.checked || !status?.active) return;
        const { script, tagId } = status.active;
        if (![...scriptSelect.options].some((option) => option.value === script)) return;

        syncingPlaybackTarget = true;
        if (scriptSelect.value !== script) {
            scriptSelect.value = script;
            populateScenes();
        }
        if ([...sceneSelect.options].some((option) => Number(option.value) === Number(tagId))) {
            sceneSelect.value = String(tagId);
        }
        preferredStoryDay = String(status.storyDay);
        storyDaySelect.value = preferredStoryDay;
        syncSelectedSceneContext();
        syncingPlaybackTarget = false;
    };

    followPlaybackCheckbox.addEventListener('change', () => {
        updateFollowPlaybackHelp();
        if (followPlaybackCheckbox.checked) syncTargetToPlayback(sequenceTools?.status?.());
    });

    const selectedScene = () => ({
        script: scriptSelect.value,
        tagId: Number(sceneSelect.value),
        storyDay: Number(storyDaySelect.value),
    });

    const makeActionButton = (label, action) => {
        const button = document.createElement('button');
        button.innerText = label;
        button.style.cssText = `${controlStyle}
            min-height: 40px;
            box-shadow: 0 2px 0 rgba(74, 53, 32, 0.28);
            transition-property: transform, box-shadow;
            transition-duration: 120ms;
            transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
        `;
        button.addEventListener('pointerdown', () => {
            button.style.transform = 'scale(0.96)';
            button.style.boxShadow = '0 1px 0 rgba(74, 53, 32, 0.22)';
        });
        const release = () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 2px 0 rgba(74, 53, 32, 0.28)';
        };
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('pointerleave', release);
        button.addEventListener('click', action);
        return button;
    };

    const legacyJump = () => {
        const script = scriptSelect.value;
        const tagId = Number(sceneSelect.value);
        const state = __DEBUG__.getState();
        if (state && state.data && state.data.name === script) {
            __DEBUG__.jumpToScene(tagId);
        } else {
            window.__NEXT_SCRIPT_OVERRIDE__ = { script, tagId };
            stopProcess('script_override');
        }
    };

    const actionFeedback = document.createElement('div');
    actionFeedback.dataset.debugStatus = 'action-feedback';
    actionFeedback.setAttribute('aria-live', 'polite');
    actionFeedback.style.position = 'absolute';
    actionFeedback.style.width = '1px';
    actionFeedback.style.height = '1px';
    actionFeedback.style.overflow = 'hidden';
    actionFeedback.style.clipPath = 'inset(50%)';

    const showActionFeedback = (message) => {
        actionFeedback.innerText = message;
    };

    const startBtn = makeActionButton(sequenceTools ? 'Start Debug Run' : 'Jump to Script/Gag', () => {
        if (!sequenceTools) return legacyJump();
        const { script, tagId, storyDay } = selectedScene();
        if (sequenceTools.startRun) {
            sequenceTools.startRun({ mode: playbackModeSelect.value, script, tagId, storyDay });
            showActionFeedback(
                playbackModeSelect.value === 'preview'
                    ? 'Selected-scene run started; the current chapter will resume afterward.'
                    : 'Complete-chapter run started.',
            );
            return;
        }
        if (playbackModeSelect.value === 'preview') {
            window.__NEXT_SCRIPT_OVERRIDE__ = sequenceTools.preview(script, tagId, { storyDay });
            showActionFeedback('Selected-scene run started; the current chapter will resume afterward.');
        } else {
            window.__NEXT_SCRIPT_OVERRIDE__ = null;
            sequenceTools.planFrom(script, tagId, { storyDay });
            showActionFeedback('Complete-chapter run started.');
        }
        stopProcess('script_override');
    });

    scriptsRow.appendChild(scriptLabel);
    scriptsRow.appendChild(scriptSelect);
    sceneRow.appendChild(sceneLabel);
    sceneRow.appendChild(sceneSelect);
    container.appendChild(targetLabel);
    container.appendChild(targetHelp);
    container.appendChild(followPlaybackRow);
    container.appendChild(scriptsRow);
    container.appendChild(sceneRow);
    container.appendChild(storyRow);
    container.appendChild(playbackModeRow);
    container.appendChild(sceneContext);
    actionRow.appendChild(startBtn);
    container.appendChild(actionRow);
    container.appendChild(actionFeedback);

    const playbackLabel = makeSectionLabel('Now playing — host event');
    playbackLabel.dataset.debugSection = 'playback';
    playbackLabel.style.display = sequenceTools ? 'block' : 'none';
    container.appendChild(playbackLabel);

    const sequenceStatus = document.createElement('div');
    sequenceStatus.dataset.debugStatus = 'sequence';
    sequenceStatus.style.display = sequenceTools ? 'block' : 'none';
    sequenceStatus.style.padding = '8px 10px';
    sequenceStatus.style.borderRadius = '6px';
    sequenceStatus.style.background = 'rgba(244, 228, 200, 0.72)';
    sequenceStatus.style.boxShadow = 'inset 0 0 0 1px rgba(74, 53, 32, 0.16)';
    sequenceStatus.style.fontVariantNumeric = 'tabular-nums';
    sequenceStatus.style.textWrap = 'pretty';
    const renderSequenceStatus = () => {
        if (!sequenceTools) return;
        const status = sequenceTools.status?.();
        if (!status) {
            sequenceStatus.innerText = 'No sequence is queued yet.';
            return;
        }
        syncTargetToPlayback(status);
        if (status.preview) {
            const resume = status.resume;
            const resumeText = resume?.next
                ? `Resume: Chapter ${resume.storyDay} · Next ${resume.next.script} #${resume.next.tagId}`
                : 'Resume: normal story playback';
            sequenceStatus.innerText = `Selected-scene preview\nHost event: ${status.active.script} #${status.active.tagId}\n${resumeText}`;
            return;
        }
        const tide = status.lowTide ? 'Low tide' : 'High tide';
        if (status.current === 0) {
            sequenceStatus.innerText = `Chapter ${status.storyDay} · ${status.total} event${status.total === 1 ? '' : 's'} queued\nFirst: ${status.next.script} #${status.next.tagId}\nFinale: ${status.final.script} #${status.final.tagId} · ${tide}`;
            return;
        }
        const active = status.active ? `${status.active.script} #${status.active.tagId}` : 'loading';
        const next = status.next ? `${status.next.script} #${status.next.tagId}` : 'Finale in progress';
        sequenceStatus.innerText = `Chapter ${status.storyDay} · Event ${status.current} of ${status.total}\nHost event: ${active}\nNext: ${next} · ${status.remaining} remaining\nFinale: ${status.final.script} #${status.final.tagId} · ${tide}`;
    };
    container.appendChild(sequenceStatus);
    if (sequenceTools?.subscribeStatus) sequenceTools.subscribeStatus(renderSequenceStatus);
    // Reconcile as well as subscribe: host playback can cross runtime and
    // interlude boundaries where a title-specific notification may be missed.
    if (sequenceTools) window.setInterval(() => renderSequenceStatus(), 250);

    // Patch original populateSelect call
    const originalPopulateSelect = () => {
        populateScenes();
        syncSelectedSceneContext();
        renderSequenceStatus();
        syncNightCheckbox();
    };

    const traceBtn = document.createElement('button');
    traceBtn.innerText = 'Download JSONL Trace';
    traceBtn.style.cssText = controlStyle;
    traceBtn.addEventListener('click', async () => {
        try {
            const result = await __DEBUG__.saveTrace();
            console.log(`DGDS trace downloaded as ${result.filename}`);
        } catch (error) {
            console.error(error.message);
        }
    });
    container.appendChild(traceBtn);

    // Day/Night Toggle
    const timeRow = document.createElement('div');
    timeRow.style.display = 'flex';
    timeRow.style.gap = '8px';
    timeRow.style.alignItems = 'center';

    const timeLabel = document.createElement('label');
    timeLabel.innerText = 'Night Mode: ';
    timeLabel.style.cursor = 'pointer';
    timeLabel.style.display = 'flex';
    timeLabel.style.alignItems = 'center';
    timeLabel.style.gap = '5px';

    const timeCheckbox = document.createElement('input');
    timeCheckbox.type = 'checkbox';
    timeCheckbox.dataset.debugControl = 'night-mode';
    timeCheckbox.style.cursor = 'pointer';
    timeCheckbox.addEventListener('change', (e) => {
        __DEBUG__.setNightMode(e.target.checked);
    });

    const syncNightCheckbox = () => {
        const state = __DEBUG__.getState();
        if (state) timeCheckbox.checked = state.titleState?.night ?? state.isNightMode === true;
    };

    timeLabel.prepend(timeCheckbox);
    timeLabel.title = 'Override day/night for the currently playing sequence.';
    timeRow.appendChild(timeLabel);
    container.appendChild(timeRow);

    if (themes?.storageKey && Array.isArray(themes.options)) {
        const themeRow = document.createElement('label');
        themeRow.style.display = 'flex';
        themeRow.style.gap = '8px';
        themeRow.style.alignItems = 'center';
        themeRow.innerText = `${themes.label || 'Theme'}: `;

        const themeSelect = document.createElement('select');
        themeSelect.style.cssText = controlStyle;
        themeSelect.style.flex = '1';
        for (const theme of themes.options) {
            const option = document.createElement('option');
            option.value = theme.value;
            option.innerText = theme.label;
            themeSelect.appendChild(option);
        }
        themeSelect.value = localStorage.getItem(themes.storageKey) || themes.options[0]?.value || '';
        themeSelect.addEventListener('change', () => {
            localStorage.setItem(themes.storageKey, themeSelect.value);
            __DEBUG__.refreshBackground();
        });
        themeRow.appendChild(themeSelect);
        container.appendChild(themeRow);
    }

    // Console Log Area
    const consoleArea = document.createElement('div');
    consoleArea.style.flex = '1';
    consoleArea.style.background = '#2b2118';
    consoleArea.style.color = '#a8ccd4';
    consoleArea.style.border = '2px solid #8b5a2b';
    consoleArea.style.padding = '8px';
    consoleArea.style.borderRadius = '4px';
    consoleArea.style.overflowY = 'auto';
    consoleArea.style.minHeight = '150px';
    consoleArea.style.fontSize = '12px';
    consoleArea.style.fontFamily = 'monospace';
    consoleArea.style.userSelect = 'text';

    container.appendChild(consoleArea);

    // Hook console
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    function appendLog(color, args) {
        if (!diagnostics.console) return;
        const line = document.createElement('div');
        line.style.color = color;
        line.style.borderBottom = '1px solid #4a3520';
        line.style.paddingBottom = '2px';
        line.style.marginBottom = '2px';
        line.style.whiteSpace = 'pre-wrap';
        line.innerText = Array.from(args)
            .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
            .join(' ');
        consoleArea.appendChild(line);
        consoleArea.scrollTop = consoleArea.scrollHeight;
    }

    console.log = function (...args) {
        origLog.apply(console, args);
        appendLog('#a8ccd4', args);
    };
    console.warn = function (...args) {
        origWarn.apply(console, args);
        appendLog('#e6d5a7', args);
    };
    console.error = function (...args) {
        origError.apply(console, args);
        appendLog('#e69a9a', args);
    };

    document.body.appendChild(container);
}

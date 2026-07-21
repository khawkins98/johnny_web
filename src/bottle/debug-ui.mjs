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
    scriptsRow.style.gap = '8px';
    scriptsRow.style.alignItems = 'center';

    const targetLabel = document.createElement('div');
    targetLabel.innerText = 'Debug target (not current playback)';
    targetLabel.style.fontSize = '14px';
    targetLabel.style.opacity = '0.78';
    targetLabel.style.textWrap = 'balance';

    const sceneRow = document.createElement('div');
    sceneRow.style.display = 'flex';
    sceneRow.style.gap = '8px';
    sceneRow.style.alignItems = 'center';

    const storyRow = document.createElement('label');
    storyRow.style.display = sequenceTools ? 'flex' : 'none';
    storyRow.style.gap = '8px';
    storyRow.style.alignItems = 'center';
    const storyDayLabel = document.createElement('span');
    storyDayLabel.innerText = 'Story Day:';
    storyRow.appendChild(storyDayLabel);

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
    actionRow.style.gridTemplateColumns = sequenceTools ? '1fr 1fr' : '1fr';
    actionRow.style.gap = '8px';

    const scriptSelect = document.createElement('select');
    scriptSelect.style.cssText = controlStyle;
    scriptSelect.style.flex = '1';

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
    });
    storyRow.appendChild(storyDaySelect);

    const syncSelectedSceneContext = () => {
        if (!sequenceTools) return;
        const metadata = sequenceTools.describe?.(scriptSelect.value, Number(sceneSelect.value));
        if (!metadata) {
            storyDaySelect.disabled = false;
            storyDaySelect.value = preferredStoryDay;
            sceneContext.innerText = 'This decoded tag has no recovered host-catalogue metadata.';
            sequenceBtn.innerText = 'Run Faithful Sequence';
            return;
        }

        if (metadata.fixedDay) {
            storyDaySelect.value = String(metadata.fixedDay);
            storyDaySelect.disabled = true;
            storyDayLabel.innerText = 'Story Day (fixed):';
        } else {
            storyDaySelect.disabled = false;
            storyDaySelect.value = preferredStoryDay;
            storyDayLabel.innerText = 'Story Day:';
        }

        if (metadata.action === 'solo-finale') {
            const dayContext = metadata.fixedDay ? `Fixed Day ${metadata.fixedDay}` : 'Uses the selected story day';
            sceneContext.innerText = `${dayContext} · Start-immediately finale · A faithful plan contains this one event.`;
            sequenceBtn.innerText = 'Run This Finale (1 Event)';
        } else if (metadata.action === 'ending-finale') {
            sceneContext.innerText = `${metadata.fixedDay ? `Fixed Day ${metadata.fixedDay} · ` : ''}Finale · Compatible island events play first; this selected event ends the sequence.`;
            sequenceBtn.innerText = 'Run Sequence Ending Here';
        } else {
            sceneContext.innerText = `${metadata.fixedDay ? `Fixed Day ${metadata.fixedDay} · ` : 'Uses the selected story day · '}This event starts the sequence; compatible events and a finale follow.`;
            sequenceBtn.innerText = 'Start Sequence With This Scene';
        }
    };
    scriptSelect.addEventListener('change', syncSelectedSceneContext);
    sceneSelect.addEventListener('change', syncSelectedSceneContext);

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

    const previewBtn = makeActionButton(sequenceTools ? 'Preview Once' : 'Jump to Script/Gag', () => {
        if (!sequenceTools) return legacyJump();
        const { script, tagId, storyDay } = selectedScene();
        window.__NEXT_SCRIPT_OVERRIDE__ = sequenceTools.preview(script, tagId, { storyDay });
        stopProcess('script_override');
        renderSequenceStatus('One-scene preview queued');
    });

    const sequenceBtn = makeActionButton('Run Sequence From Here', () => {
        if (!sequenceTools) return legacyJump();
        const { script, tagId, storyDay } = selectedScene();
        window.__NEXT_SCRIPT_OVERRIDE__ = null;
        sequenceTools.planFrom(script, tagId, { storyDay });
        stopProcess('script_override');
        renderSequenceStatus('Faithful sequence planned');
    });
    sequenceBtn.style.display = sequenceTools ? 'block' : 'none';

    scriptsRow.appendChild(scriptSelect);
    sceneRow.appendChild(sceneSelect);
    container.appendChild(targetLabel);
    container.appendChild(scriptsRow);
    container.appendChild(sceneRow);
    container.appendChild(storyRow);
    container.appendChild(sceneContext);
    actionRow.appendChild(previewBtn);
    actionRow.appendChild(sequenceBtn);
    container.appendChild(actionRow);

    const sequenceStatus = document.createElement('div');
    sequenceStatus.dataset.debugStatus = 'sequence';
    sequenceStatus.style.display = sequenceTools ? 'block' : 'none';
    sequenceStatus.style.padding = '8px 10px';
    sequenceStatus.style.borderRadius = '6px';
    sequenceStatus.style.background = 'rgba(244, 228, 200, 0.72)';
    sequenceStatus.style.boxShadow = 'inset 0 0 0 1px rgba(74, 53, 32, 0.16)';
    sequenceStatus.style.fontVariantNumeric = 'tabular-nums';
    sequenceStatus.style.textWrap = 'pretty';
    const renderSequenceStatus = (prefix = '') => {
        if (!sequenceTools) return;
        const status = sequenceTools.status?.();
        const progress = !status
            ? ''
            : status.current === 0
              ? `Queued · ${status.total} event${status.total === 1 ? '' : 's'}`
              : `Playing ${status.current}/${status.total}`;
        const next = status?.next ? ` · Next ${status.next.script} #${status.next.tagId}` : '';
        const active = status?.active ? ` · Active ${status.active.script} #${status.active.tagId}` : '';
        const detail = status
            ? `Day ${status.storyDay} · ${progress}${active} · ${status.remaining} remaining${next} · Final ${status.final.script} #${status.final.tagId}${status.lowTide ? ' · Low tide' : ' · High tide'}`
            : 'Normal scheduler has not planned a sequence yet.';
        sequenceStatus.innerText = prefix ? `${prefix}. ${detail}` : detail;
    };
    container.appendChild(sequenceStatus);
    if (sequenceTools) window.setInterval(() => renderSequenceStatus(), 500);

    // Patch original populateSelect call
    const originalPopulateSelect = () => {
        populateScenes();
        syncSelectedSceneContext();
        renderSequenceStatus();
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
    timeCheckbox.style.cursor = 'pointer';
    timeCheckbox.addEventListener('change', (e) => {
        __DEBUG__.setNightMode(e.target.checked);
    });

    timeLabel.prepend(timeCheckbox);
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

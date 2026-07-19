import { __DEBUG__, stopProcess } from '../dgds/scripting/process.mjs';
import { diagnostics } from '../dgds/scripting/diagnostics.mjs';

export function setupDebugUI({ themes = null } = {}) {
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

    const sceneRow = document.createElement('div');
    sceneRow.style.display = 'flex';
    sceneRow.style.gap = '8px';
    sceneRow.style.alignItems = 'center';

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
    };

    scriptSelect.addEventListener('change', populateScenes);

    const jumpBtn = document.createElement('button');
    jumpBtn.innerText = 'Jump to Script/Gag';
    jumpBtn.style.cssText = controlStyle;

    jumpBtn.addEventListener('click', () => {
        const script = scriptSelect.value;
        const tagId = Number(sceneSelect.value);
        const state = __DEBUG__.getState();
        if (state && state.data && state.data.name === script) {
            __DEBUG__.jumpToScene(tagId);
        } else {
            window.__NEXT_SCRIPT_OVERRIDE__ = { script, tagId };
            stopProcess('script_override');
        }
    });

    scriptsRow.appendChild(scriptSelect);
    sceneRow.appendChild(sceneSelect);
    sceneRow.appendChild(jumpBtn);
    container.appendChild(scriptsRow);
    container.appendChild(sceneRow);

    // Patch original populateSelect call
    const originalPopulateSelect = () => {
        const state = __DEBUG__.getState();
        if (state && state.data && state.data.name) {
            scriptSelect.value = state.data.name;
        }
        populateScenes();
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

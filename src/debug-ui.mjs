import { __DEBUG__ } from './dgds/scripting/process.mjs';
import { diagnostics } from './dgds/scripting/diagnostics.mjs';

export function setupDebugUI() {
    // Stable automation hook for Playwright/headless browser diagnostics.
    window.__DGDS__ = __DEBUG__;
    const container = document.createElement('div');
    container.id = 'debug-menu';
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.zIndex = '1000';
    container.style.background = '#d4c4a8';
    container.style.backgroundImage = 'url(\'data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noise)" opacity="0.1"/></svg>\')';
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
        container.style.left = (initialX + dx) + 'px';
        container.style.top = (initialY + dy) + 'px';
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
                populateSelect(); // Load actual scenes from engine
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

    // Scene Selection
    const sceneRow = document.createElement('div');
    sceneRow.style.display = 'flex';
    sceneRow.style.gap = '8px';
    sceneRow.style.alignItems = 'center';

    const select = document.createElement('select');
    select.style.cssText = controlStyle;
    select.style.flex = '1';

    const populateSelect = () => {
        select.innerHTML = ''; // clear
        const state = __DEBUG__.getState();
        if (state && state.data && state.data.scenes) {
            // Sort scenes numerically by tag ID
            const sortedScenes = [...state.data.scenes].sort((a, b) => {
                const idA = a.tagId && a.tagId.id ? a.tagId.id : 0;
                const idB = b.tagId && b.tagId.id ? b.tagId.id : 0;
                return idA - idB;
            });

            let prevId = 0;
            sortedScenes.forEach(scene => {
                if (scene.tagId && scene.tagId.id) {
                    const currentId = scene.tagId.id;

                    // Add stubs for missing IDs in the sequence
                    for (let i = prevId + 1; i < currentId; i++) {
                        const stub = document.createElement('option');
                        stub.value = i;
                        stub.innerText = `${i}: [MISSING IN ORIGINAL GAME]`;
                        stub.disabled = true;
                        select.appendChild(stub);
                    }

                    const option = document.createElement('option');
                    option.value = currentId;
                    option.innerText = `${currentId}: ${scene.tagId.description}`;
                    select.appendChild(option);

                    prevId = currentId;
                }
            });
        }
    };

    const jumpBtn = document.createElement('button');
    jumpBtn.innerText = 'Jump to Gag';
    jumpBtn.style.cssText = controlStyle;

    jumpBtn.addEventListener('click', () => {
        const tagId = Number(select.value);
        __DEBUG__.jumpToScene(tagId);
    });

    sceneRow.appendChild(select);
    sceneRow.appendChild(jumpBtn);
    container.appendChild(sceneRow);

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
        line.innerText = Array.from(args).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        consoleArea.appendChild(line);
        consoleArea.scrollTop = consoleArea.scrollHeight;
    }

    console.log = function(...args) {
        origLog.apply(console, args);
        appendLog('#a8ccd4', args);
    };
    console.warn = function(...args) {
        origWarn.apply(console, args);
        appendLog('#e6d5a7', args);
    };
    console.error = function(...args) {
        origError.apply(console, args);
        appendLog('#e69a9a', args);
    };

    document.body.appendChild(container);
}

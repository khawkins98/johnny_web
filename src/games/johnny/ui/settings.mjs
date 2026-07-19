import { diagnostics } from '../../../dgds/scripting/diagnostics.mjs';

export const SOUND_SETTING_KEY = 'jc-sound';
export const EXPERIENCE_SETTING_KEY = 'jc-experience';

const isTyping = (target) => target?.matches?.('input, select, textarea, button, a, [contenteditable="true"]');

export function setupSettingsUI({ getAudioManager = () => null, onRestart = () => {} } = {}) {
    // Inject some whimsical CSS
    const style = document.createElement('style');
    style.innerHTML = `
        html {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        #settings-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 2000;
            background: rgba(0, 6, 12, 0.48);
            backdrop-filter: blur(1px);
            justify-content: center;
            align-items: center;
        }

        #settings-modal {
            background: #d4c4a8;
            background-image: url('data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noise)" opacity="0.1"/></svg>');
            border: 3px solid #8b5a2b;
            border-radius: 8px;
            box-shadow: 0 18px 44px rgba(0,0,0,0.52), 0 3px 8px rgba(0,0,0,0.32), inset 0 0 20px rgba(139, 90, 43, 0.25);
            width: 540px;
            max-width: calc(100vw - 40px);
            max-height: calc(100vh - 40px);
            box-sizing: border-box;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 30px 34px 26px;
            font-family: 'Caveat', cursive;
            color: #4a3520;
            position: relative;
            transform: rotate(-0.35deg);
        }

        #settings-modal::before {
            content: '';
            position: absolute;
            top: -15px;
            left: 50%;
            transform: translateX(-50%);
            width: 80px;
            height: 30px;
            background: rgba(255,255,255,0.4);
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            transform: translateX(-50%) rotate(2deg);
        }

        #settings-title {
            font-size: 40px;
            margin: 0 0 22px 0;
            text-align: center;
            text-shadow: 1px 1px 0px rgba(255,255,255,0.5);
            border-bottom: 2px dashed #8b5a2b;
            padding-bottom: 10px;
            text-wrap: balance;
        }

        .settings-row {
            display: grid;
            grid-template-columns: minmax(150px, 0.85fr) minmax(230px, 1.15fr);
            gap: 18px;
            align-items: center;
            margin-bottom: 13px;
            font-size: 24px;
        }

        .settings-row select, .settings-row button {
            font-family: 'VT323', monospace;
            font-size: 18px;
            padding: 5px 10px;
            background: #f4e4c8;
            border: 2px solid #8b5a2b;
            color: #4a3520;
            cursor: pointer;
            border-radius: 4px;
            min-height: 40px;
            width: 100%;
            box-sizing: border-box;
            box-shadow: 0 2px 4px rgba(74,53,32,0.16), inset 0 1px rgba(255,255,255,0.5);
            transition-property: transform, background-color;
            transition-duration: 140ms;
            transition-timing-function: ease-out;
        }

        .settings-row select:hover, .settings-row button:hover {
            background: #fff;
        }

        .settings-row button:active {
            transform: scale(0.96);
        }

        .settings-row select:focus-visible, .settings-row button:focus-visible,
        .close-btn:focus-visible, .settings-done:focus-visible,
        .settings-return:focus-visible {
            outline: 3px solid rgba(74, 53, 32, 0.35);
            outline-offset: 2px;
        }

        .settings-inline {
            display: flex;
            gap: 6px;
            min-width: 0;
        }

        .settings-inline > * {
            min-width: 0;
        }

        #diagnostics-status {
            font-variant-numeric: tabular-nums;
            text-wrap: pretty;
        }

        .settings-link {
            font-size: 20px;
            color: #2c5e8b;
            text-decoration: underline;
            text-decoration-style: wavy;
        }

        .settings-link:hover {
            color: #1a3c5c;
        }

        #settings-cog {
            position: fixed;
            top: 14px;
            left: 14px;
            z-index: 1800;
            width: 44px;
            height: 44px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: #d4c4a8;
            color: #4a3520;
            box-shadow:
                0 0 0 2px rgba(139, 90, 43, 0.72),
                0 5px 14px rgba(0, 0, 0, 0.34),
                inset 0 1px rgba(255, 255, 255, 0.48);
            cursor: pointer;
            font-family: sans-serif;
            font-size: 22px;
            line-height: 44px;
            opacity: 0;
            scale: 0.25;
            filter: blur(4px);
            pointer-events: none;
            transition-property: opacity, scale, filter, background-color;
            transition-duration: 180ms;
            transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
        }

        #settings-cog.is-visible {
            opacity: 1;
            scale: 1;
            filter: blur(0);
            pointer-events: auto;
        }

        #settings-cog:hover {
            background: #f4e4c8;
        }

        #settings-cog.is-visible:active {
            scale: 0.96;
        }

        #settings-cog:focus-visible {
            outline: 3px solid rgba(244, 228, 200, 0.86);
            outline-offset: 3px;
        }

        .close-btn {
            position: absolute;
            top: 12px;
            right: 14px;
            background: rgba(244, 228, 200, 0.72);
            color: #4a3520;
            border: 2px solid #8b5a2b;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            font-family: 'VT323', monospace;
            display: flex;
            justify-content: center;
            align-items: center;
            box-shadow: 0 3px 7px rgba(0,0,0,0.22), inset 0 1px rgba(255,255,255,0.5);
            transition-property: transform, background-color;
            transition-duration: 140ms;
        }

        .close-btn:hover {
            background: #fff4dc;
        }

        .close-btn:active, .settings-done:active, .settings-return:active {
            transform: scale(0.96);
        }

        .settings-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            margin-top: 24px;
            padding-top: 18px;
            border-top: 2px dashed rgba(139, 90, 43, 0.72);
        }

        .settings-shortcuts {
            margin-top: 18px;
            padding-top: 14px;
            border-top: 2px dashed rgba(139, 90, 43, 0.58);
        }

        .settings-shortcuts h3 {
            margin: 0 0 10px;
            font-family: 'Caveat', cursive;
            font-size: 23px;
            text-wrap: balance;
        }

        .settings-shortcut-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 7px 18px;
            font-family: 'VT323', monospace;
            font-size: 16px;
        }

        .settings-shortcut {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }

        .settings-shortcut-keys {
            display: flex;
            flex: 0 0 58px;
            gap: 3px;
        }

        .settings-shortcut kbd {
            min-width: 24px;
            height: 24px;
            padding: 0 4px;
            box-sizing: border-box;
            border-radius: 3px;
            background: #f4e4c8;
            box-shadow:
                0 0 0 1px rgba(139, 90, 43, 0.62),
                0 2px 0 rgba(139, 90, 43, 0.42);
            color: #4a3520;
            font-family: 'VT323', monospace;
            font-size: 15px;
            line-height: 24px;
            text-align: center;
        }

        .settings-footer-actions {
            display: flex;
            gap: 8px;
        }

        .settings-done, .settings-return {
            min-width: 112px;
            min-height: 42px;
            padding: 6px 16px;
            border: 2px solid #8b5a2b;
            border-radius: 4px;
            background: #f4e4c8;
            color: #4a3520;
            box-shadow: 0 2px 4px rgba(74,53,32,0.18), inset 0 1px rgba(255,255,255,0.5);
            font-family: 'VT323', monospace;
            font-size: 20px;
            cursor: pointer;
            transition-property: transform, background-color;
            transition-duration: 140ms;
        }

        .settings-done:hover, .settings-return:hover {
            background: #fff4dc;
        }

        .settings-return {
            min-width: 142px;
            background: rgba(244, 228, 200, 0.58);
        }

        @media (max-width: 560px) {
            #settings-modal {
                padding: 26px 22px 22px;
            }
            .settings-row {
                grid-template-columns: 1fr;
                gap: 4px;
            }
            .settings-footer {
                align-items: stretch;
                flex-direction: column-reverse;
            }
            .settings-footer-actions {
                flex-direction: column-reverse;
            }
            .settings-shortcut-grid {
                grid-template-columns: 1fr;
            }
            .settings-link {
                text-align: center;
            }
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';

    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'settings-title');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.innerText = '×';
    closeBtn.setAttribute('aria-label', 'Close settings');
    let previousFocus = null;
    const close = () => {
        overlay.style.display = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        document.getElementById('root').inert = false;
        previousFocus?.focus?.();
    };
    const open = () => {
        previousFocus = document.activeElement === cog ? null : document.activeElement;
        overlay.style.display = 'flex';
        overlay.setAttribute('aria-hidden', 'false');
        document.getElementById('root').inert = true;
        hideCog();
        closeBtn.focus();
    };
    closeBtn.onclick = close;
    modal.appendChild(closeBtn);

    const cog = document.createElement('button');
    cog.id = 'settings-cog';
    cog.type = 'button';
    cog.innerText = '⚙';
    cog.tabIndex = -1;
    cog.setAttribute('aria-label', 'Open Island Options');
    cog.setAttribute('aria-hidden', 'true');
    let cogTimer = null;
    const hideCog = () => {
        if (cogTimer !== null) window.clearTimeout(cogTimer);
        cogTimer = null;
        cog.classList.remove('is-visible');
        cog.tabIndex = -1;
        cog.setAttribute('aria-hidden', 'true');
    };
    const scheduleCogHide = () => {
        if (cogTimer !== null) window.clearTimeout(cogTimer);
        cogTimer = window.setTimeout(() => {
            if (document.activeElement === cog) scheduleCogHide();
            else hideCog();
        }, 2400);
    };
    const showCog = () => {
        if (overlay.getAttribute('aria-hidden') === 'false') return;
        cog.classList.add('is-visible');
        cog.tabIndex = 0;
        cog.setAttribute('aria-hidden', 'false');
        scheduleCogHide();
    };
    cog.addEventListener('click', open);
    cog.addEventListener('blur', scheduleCogHide);
    window.addEventListener('mousemove', showCog, { passive: true });
    document.body.appendChild(cog);

    const title = document.createElement('h2');
    title.id = 'settings-title';
    title.innerText = 'Island Options';
    modal.appendChild(title);

    const experienceRow = document.createElement('div');
    experienceRow.className = 'settings-row';
    const experienceLabel = document.createElement('span');
    experienceLabel.innerText = 'Experience:';
    const experienceSelect = document.createElement('select');
    experienceSelect.dataset.setting = 'experience';
    [
        { val: 'classic', text: 'Classic' },
        { val: 'enhanced', text: 'Enhanced' },
        { val: 'custom', text: 'Custom' },
    ].forEach(({ val, text }) => {
        const option = document.createElement('option');
        option.value = val;
        option.innerText = text;
        experienceSelect.appendChild(option);
    });
    experienceSelect.value = localStorage.getItem(EXPERIENCE_SETTING_KEY) || 'classic';
    experienceRow.appendChild(experienceLabel);
    experienceRow.appendChild(experienceSelect);
    modal.appendChild(experienceRow);

    // Scaling
    const scaleRow = document.createElement('div');
    scaleRow.className = 'settings-row';
    const scaleLabel = document.createElement('span');
    scaleLabel.innerText = 'View Glass:';
    const scaleSelect = document.createElement('select');
    scaleSelect.dataset.setting = 'scale';
    const scaleOpts = [
        { val: 'native', text: 'Spyglass (Native)' },
        { val: 'integer', text: 'Porthole (Integer)' },
        { val: 'freeform', text: 'Ocean View (Freeform)' },
        { val: 'stretch', text: 'Horizon (Stretch)' },
    ];
    scaleOpts.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.innerText = o.text;
        scaleSelect.appendChild(opt);
    });

    // Load saved scale
    const savedScale = localStorage.getItem('jc-scale-mode') || 'native';
    scaleSelect.value = savedScale;

    scaleSelect.onchange = (e) => {
        const mode = e.target.value;
        localStorage.setItem('jc-scale-mode', mode);
        applyScaling(mode);
        markCustomExperience();
    };
    scaleRow.appendChild(scaleLabel);
    scaleRow.appendChild(scaleSelect);
    modal.appendChild(scaleRow);

    const fullscreenRow = document.createElement('div');
    fullscreenRow.className = 'settings-row';
    const fullscreenLabel = document.createElement('span');
    fullscreenLabel.innerText = 'Full Screen:';
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.dataset.setting = 'fullscreen';
    const renderFullscreen = () => {
        fullscreenBtn.innerText = document.fullscreenElement ? 'Leave Full Screen' : 'Enter Full Screen';
    };
    fullscreenBtn.onclick = async () => {
        if (document.fullscreenElement) await document.exitFullscreen?.();
        else await document.documentElement.requestFullscreen?.();
        renderFullscreen();
    };
    document.addEventListener('fullscreenchange', renderFullscreen);
    renderFullscreen();
    fullscreenRow.appendChild(fullscreenLabel);
    fullscreenRow.appendChild(fullscreenBtn);
    modal.appendChild(fullscreenRow);

    // Persistent sound compatibility setting. The AudioManager may not exist
    // yet when Settings opens on the intro screen.
    const audioRow = document.createElement('div');
    audioRow.className = 'settings-row';
    const audioLabel = document.createElement('span');
    audioLabel.innerText = 'Sound:';
    const audioSelect = document.createElement('select');
    audioSelect.dataset.setting = 'sound';
    [
        { val: 'on', text: 'On' },
        { val: 'off', text: 'Off' },
    ].forEach(({ val, text }) => {
        const option = document.createElement('option');
        option.value = val;
        option.innerText = text;
        audioSelect.appendChild(option);
    });
    audioSelect.value = localStorage.getItem(SOUND_SETTING_KEY) || 'on';
    audioSelect.onchange = (event) => {
        const value = event.target.value;
        localStorage.setItem(SOUND_SETTING_KEY, value);
        getAudioManager()?.setEnabled(value === 'on');
    };
    audioRow.appendChild(audioLabel);
    audioRow.appendChild(audioSelect);
    modal.appendChild(audioRow);

    // Moving Clouds Toggle
    const cloudsRow = document.createElement('div');
    cloudsRow.className = 'settings-row';
    const cloudsLabel = document.createElement('span');
    cloudsLabel.innerText = 'Moving Clouds:';
    const cloudsSelect = document.createElement('select');
    cloudsSelect.dataset.setting = 'clouds';
    [
        { val: 'on', text: 'Drifting' },
        { val: 'off', text: 'Static (Original)' },
    ].forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.innerText = o.text;
        cloudsSelect.appendChild(opt);
    });
    cloudsSelect.value = localStorage.getItem('jc-clouds') || 'off';
    cloudsSelect.onchange = (e) => {
        localStorage.setItem('jc-clouds', e.target.value);
        markCustomExperience();
    };
    cloudsRow.appendChild(cloudsLabel);
    cloudsRow.appendChild(cloudsSelect);
    modal.appendChild(cloudsRow);

    // Animated Waves Toggle
    const wavesRow = document.createElement('div');
    wavesRow.className = 'settings-row';
    const wavesLabel = document.createElement('span');
    wavesLabel.innerText = 'Animated Waves:';
    const wavesSelect = document.createElement('select');
    wavesSelect.dataset.setting = 'waves';
    [
        { val: 'on', text: 'Rolling' },
        { val: 'off', text: 'Static (Original)' },
    ].forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.innerText = o.text;
        wavesSelect.appendChild(opt);
    });
    wavesSelect.value = localStorage.getItem('jc-waves') || 'off';
    wavesSelect.onchange = (e) => {
        localStorage.setItem('jc-waves', e.target.value);
        markCustomExperience();
    };
    wavesRow.appendChild(wavesLabel);
    wavesRow.appendChild(wavesSelect);
    modal.appendChild(wavesRow);

    // Time of Day
    const timeRow = document.createElement('div');
    timeRow.className = 'settings-row';
    const timeLabel = document.createElement('span');
    timeLabel.innerText = 'Time of Day:';
    const timeSelect = document.createElement('select');
    timeSelect.dataset.setting = 'time';
    [
        { val: 'original', text: 'Always Day (Original)' },
        { val: 'local', text: 'Match Local Time' },
    ].forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.innerText = o.text;
        timeSelect.appendChild(opt);
    });
    timeSelect.value = localStorage.getItem('jc-time') || 'original';
    timeSelect.onchange = (e) => {
        localStorage.setItem('jc-time', e.target.value);
        markCustomExperience();
    };
    timeRow.appendChild(timeLabel);
    timeRow.appendChild(timeSelect);
    modal.appendChild(timeRow);

    const debugRow = document.createElement('div');
    debugRow.className = 'settings-row';
    const debugLabel = document.createElement('span');
    debugLabel.innerText = 'Diagnostics:';
    const debugControls = document.createElement('span');
    debugControls.className = 'settings-inline';
    const debugSelect = document.createElement('select');
    [
        { val: 'off', text: 'Off' },
        { val: 'on', text: 'On' },
    ].forEach(({ val, text }) => {
        const option = document.createElement('option');
        option.value = val;
        option.innerText = text;
        debugSelect.appendChild(option);
    });
    debugSelect.value = diagnostics.enabled ? 'on' : 'off';
    debugSelect.onchange = (event) => diagnostics.setMode(event.target.value);
    const debugBtn = document.createElement('button');
    debugBtn.innerText = 'Panel (D)';
    debugBtn.onclick = () => {
        if (!diagnostics.enabled) diagnostics.setMode('on');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    };
    debugControls.appendChild(debugSelect);
    debugControls.appendChild(debugBtn);
    debugRow.appendChild(debugLabel);
    debugRow.appendChild(debugControls);
    modal.appendChild(debugRow);

    const debugStatus = document.createElement('div');
    debugStatus.id = 'diagnostics-status';
    debugStatus.style.fontFamily = "'VT323', monospace";
    debugStatus.style.fontSize = '14px';
    debugStatus.style.textAlign = 'right';
    debugStatus.style.marginTop = '-10px';
    debugStatus.style.marginBottom = '15px';
    let enabledAt = diagnostics.enabled ? new Date() : null;
    const renderDebugStatus = () => {
        debugStatus.innerText = enabledAt
            ? `Enabled ${enabledAt.toLocaleTimeString()}${diagnostics.verbose ? ' · verbose console' : ''}`
            : 'Diagnostics disabled';
    };
    diagnostics.subscribe((current, previous) => {
        debugSelect.value = current.enabled ? 'on' : 'off';
        if (current.enabled && !previous.enabled) enabledAt = new Date();
        if (!current.enabled) enabledAt = null;
        renderDebugStatus();
    });
    renderDebugStatus();
    modal.appendChild(debugStatus);

    const markCustomExperience = () => {
        experienceSelect.value = 'custom';
        localStorage.setItem(EXPERIENCE_SETTING_KEY, 'custom');
    };

    const applyExperience = (mode) => {
        const values =
            mode === 'enhanced'
                ? { scale: 'freeform', clouds: 'on', waves: 'on', time: 'original' }
                : { scale: 'native', clouds: 'off', waves: 'off', time: 'original' };
        experienceSelect.value = mode;
        scaleSelect.value = values.scale;
        cloudsSelect.value = values.clouds;
        wavesSelect.value = values.waves;
        timeSelect.value = values.time;
        localStorage.setItem(EXPERIENCE_SETTING_KEY, mode);
        localStorage.setItem('jc-scale-mode', values.scale);
        localStorage.setItem('jc-clouds', values.clouds);
        localStorage.setItem('jc-waves', values.waves);
        localStorage.setItem('jc-time', values.time);
        applyScaling(values.scale);
    };
    experienceSelect.onchange = (event) => {
        if (event.target.value !== 'custom') applyExperience(event.target.value);
    };

    const shortcuts = document.createElement('section');
    shortcuts.className = 'settings-shortcuts';
    shortcuts.setAttribute('aria-labelledby', 'settings-shortcuts-title');
    const shortcutsTitle = document.createElement('h3');
    shortcutsTitle.id = 'settings-shortcuts-title';
    shortcutsTitle.innerText = 'Deck Shortcuts';
    const shortcutGrid = document.createElement('div');
    shortcutGrid.className = 'settings-shortcut-grid';
    [
        [['←', '→'], 'Enhanced · previous / next scene'],
        [['↑', '↓'], 'Enhanced · slower / faster'],
        [['H'], 'Enhanced · show / hide HUD'],
        [['S'], 'Island Options'],
        [['D'], 'Developer panel'],
        [['F'], 'Enhanced · full screen'],
        [['R'], 'Return to title'],
        [['Esc'], 'Close this panel'],
    ].forEach(([keys, description]) => {
        const item = document.createElement('div');
        item.className = 'settings-shortcut';
        const keyGroup = document.createElement('span');
        keyGroup.className = 'settings-shortcut-keys';
        keys.forEach((key) => {
            const keycap = document.createElement('kbd');
            keycap.innerText = key;
            keyGroup.appendChild(keycap);
        });
        const label = document.createElement('span');
        label.innerText = description;
        item.append(keyGroup, label);
        shortcutGrid.appendChild(item);
    });
    shortcuts.append(shortcutsTitle, shortcutGrid);
    modal.appendChild(shortcuts);

    const footer = document.createElement('div');
    footer.className = 'settings-footer';

    const githubLink = document.createElement('a');
    githubLink.className = 'settings-link';
    githubLink.href = 'https://github.com/khawkins98/johnny_web';
    githubLink.target = '_blank';
    githubLink.rel = 'noopener';
    githubLink.innerText = 'Message in a Bottle (GitHub)';
    footer.appendChild(githubLink);

    const footerActions = document.createElement('div');
    footerActions.className = 'settings-footer-actions';
    const restart = () => {
        close();
        onRestart();
    };
    const returnBtn = document.createElement('button');
    returnBtn.className = 'settings-return';
    returnBtn.dataset.setting = 'restart';
    returnBtn.innerText = '↶ Return to Title';
    returnBtn.onclick = restart;
    footerActions.appendChild(returnBtn);

    const doneBtn = document.createElement('button');
    doneBtn.className = 'settings-done';
    doneBtn.innerText = 'Done';
    doneBtn.onclick = close;
    footerActions.appendChild(doneBtn);
    footer.appendChild(footerActions);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close();
    });

    // Keyboard shortcut 'S'
    window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (isTyping(e.target) && e.key !== 'Escape') return;
        
        if (e.key === 'Tab' && overlay.style.display === 'flex') {
            const focusable = Array.from(modal.querySelectorAll('button, select, [href], input, textarea, [tabindex]:not([tabindex="-1"])'));
            if (focusable.length > 0) {
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    last.focus();
                    e.preventDefault();
                } else if (!e.shiftKey && document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
        }

        if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            if (overlay.style.display === 'flex') close();
            else open();
        }
        if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            restart();
        }
        if (e.key === 'Escape' && overlay.style.display === 'flex') {
            close();
        }
    });

    // Handle Resize
    window.addEventListener('resize', () => {
        const mode = localStorage.getItem('jc-scale-mode') || 'native';
        if (mode === 'integer' || mode === 'freeform') {
            applyScaling(mode);
        }
    });

    // Apply initial
    applyScaling(savedScale);

    return { open, close, applyExperience, restart };
}

function applyScaling(mode) {
    const root = document.getElementById('root');
    if (!root) return;

    const width = 640;
    const height = 480;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Reset basics
    root.style.transform = 'none';
    root.style.width = '640px';
    root.style.height = '480px';
    root.style.top = '50%';
    root.style.left = '50%';
    root.style.marginTop = '-240px';
    root.style.marginLeft = '-320px';
    root.style.imageRendering = 'auto';

    Array.from(root.getElementsByTagName('canvas')).forEach((c) => {
        c.style.width = '640px';
        c.style.height = '480px';
    });

    if (mode === 'native') {
        // defaults are fine
    } else if (mode === 'integer') {
        const scale = Math.max(1, Math.floor(Math.min(vw / width, vh / height)));
        root.style.transform = `scale(${scale})`;
        root.style.imageRendering = 'pixelated';
        Array.from(root.getElementsByTagName('canvas')).forEach((c) => {
            c.style.imageRendering = 'pixelated';
        });
    } else if (mode === 'freeform') {
        const scale = Math.min(vw / width, vh / height);
        root.style.transform = `scale(${scale})`;
    } else if (mode === 'stretch') {
        root.style.width = '100vw';
        root.style.height = '100vh';
        root.style.top = '0';
        root.style.left = '0';
        root.style.marginTop = '0';
        root.style.marginLeft = '0';
        Array.from(root.getElementsByTagName('canvas')).forEach((c) => {
            c.style.width = '100%';
            c.style.height = '100%';
        });
    }
}

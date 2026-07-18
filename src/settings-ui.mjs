import { diagnostics } from './dgds/scripting/diagnostics.mjs';

export function setupSettingsUI(audioManager) {
    // Inject some whimsical CSS
    const style = document.createElement('style');
    style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=VT323&display=swap');

        html {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        #settings-overlay {
            display: none;
            position: fixed;
            inset: 0;
            z-index: 2000;
            background: rgba(0, 10, 20, 0.75);
            backdrop-filter: blur(4px);
            justify-content: center;
            align-items: center;
        }

        #settings-modal {
            background: #d4c4a8;
            background-image: url('data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noise)" opacity="0.1"/></svg>');
            border: 4px solid #8b5a2b;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 20px rgba(139, 90, 43, 0.3);
            width: 400px;
            padding: 30px;
            font-family: 'Caveat', cursive;
            color: #4a3520;
            position: relative;
            transform: rotate(-1deg);
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
            font-size: 42px;
            margin: 0 0 20px 0;
            text-align: center;
            text-shadow: 1px 1px 0px rgba(255,255,255,0.5);
            border-bottom: 2px dashed #8b5a2b;
            padding-bottom: 10px;
            text-wrap: balance;
        }

        .settings-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
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

        #diagnostics-status {
            font-variant-numeric: tabular-nums;
            text-wrap: pretty;
        }

        .settings-link {
            display: block;
            text-align: center;
            margin-top: 30px;
            font-size: 22px;
            color: #2c5e8b;
            text-decoration: underline;
            text-decoration-style: wavy;
        }

        .settings-link:hover {
            color: #1a3c5c;
        }
        
        .close-btn {
            position: absolute;
            top: -10px;
            right: -10px;
            background: #e74c3c;
            color: white;
            border: 3px solid #c0392b;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            font-family: sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        
        .close-btn:hover {
            background: #c0392b;
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.innerText = 'X';
    closeBtn.onclick = () => overlay.style.display = 'none';
    modal.appendChild(closeBtn);

    const title = document.createElement('h2');
    title.id = 'settings-title';
    title.innerText = 'Island Options';
    modal.appendChild(title);

    // Scaling
    const scaleRow = document.createElement('div');
    scaleRow.className = 'settings-row';
    const scaleLabel = document.createElement('span');
    scaleLabel.innerText = 'View Glass:';
    const scaleSelect = document.createElement('select');
    const scaleOpts = [
        {val: 'native', text: 'Spyglass (Native)'},
        {val: 'integer', text: 'Porthole (Integer)'},
        {val: 'freeform', text: 'Ocean View (Freeform)'},
        {val: 'stretch', text: 'Horizon (Stretch)'}
    ];
    scaleOpts.forEach(o => {
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
    };
    scaleRow.appendChild(scaleLabel);
    scaleRow.appendChild(scaleSelect);
    modal.appendChild(scaleRow);

    // Audio Toggle
    const audioRow = document.createElement('div');
    audioRow.className = 'settings-row';
    const audioLabel = document.createElement('span');
    audioLabel.innerText = 'Seagull Noise:';
    const audioBtn = document.createElement('button');
    let isMuted = false;
    audioBtn.innerText = 'Mute';
    audioBtn.onclick = () => {
        if (audioManager && audioManager.context) {
            if (isMuted) {
                audioManager.context.resume();
                audioBtn.innerText = 'Mute';
                isMuted = false;
            } else {
                audioManager.context.suspend();
                audioBtn.innerText = 'Unmute';
                isMuted = true;
            }
        }
    };
    audioRow.appendChild(audioLabel);
    audioRow.appendChild(audioBtn);
    modal.appendChild(audioRow);

    // Moving Clouds Toggle
    const cloudsRow = document.createElement('div');
    cloudsRow.className = 'settings-row';
    const cloudsLabel = document.createElement('span');
    cloudsLabel.innerText = 'Moving Clouds:';
    const cloudsSelect = document.createElement('select');
    [{val: 'on', text: 'Drifting'}, {val: 'off', text: 'Static (Original)'}].forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.innerText = o.text;
        cloudsSelect.appendChild(opt);
    });
    cloudsSelect.value = localStorage.getItem('jc-clouds') || 'off';
    cloudsSelect.onchange = (e) => localStorage.setItem('jc-clouds', e.target.value);
    cloudsRow.appendChild(cloudsLabel);
    cloudsRow.appendChild(cloudsSelect);
    modal.appendChild(cloudsRow);

    // Animated Waves Toggle
    const wavesRow = document.createElement('div');
    wavesRow.className = 'settings-row';
    const wavesLabel = document.createElement('span');
    wavesLabel.innerText = 'Animated Waves:';
    const wavesSelect = document.createElement('select');
    [{val: 'on', text: 'Rolling'}, {val: 'off', text: 'Static (Original)'}].forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.innerText = o.text;
        wavesSelect.appendChild(opt);
    });
    wavesSelect.value = localStorage.getItem('jc-waves') || 'off';
    wavesSelect.onchange = (e) => localStorage.setItem('jc-waves', e.target.value);
    wavesRow.appendChild(wavesLabel);
    wavesRow.appendChild(wavesSelect);
    modal.appendChild(wavesRow);

    // Time of Day
    const timeRow = document.createElement('div');
    timeRow.className = 'settings-row';
    const timeLabel = document.createElement('span');
    timeLabel.innerText = 'Time of Day:';
    const timeSelect = document.createElement('select');
    [{val: 'original', text: 'Always Day (Original)'}, {val: 'local', text: 'Match Local Time'}].forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.innerText = o.text;
        timeSelect.appendChild(opt);
    });
    timeSelect.value = localStorage.getItem('jc-time') || 'original';
    timeSelect.onchange = (e) => localStorage.setItem('jc-time', e.target.value);
    timeRow.appendChild(timeLabel);
    timeRow.appendChild(timeSelect);
    modal.appendChild(timeRow);


    const debugRow = document.createElement('div');
    debugRow.className = 'settings-row';
    const debugLabel = document.createElement('span');
    debugLabel.innerText = 'Diagnostics:';
    const debugControls = document.createElement('span');
    debugControls.style.display = 'flex';
    debugControls.style.gap = '6px';
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
    debugSelect.onchange = event => diagnostics.setMode(event.target.value);
    const debugBtn = document.createElement('button');
    debugBtn.innerText = 'Panel (D)';
    debugBtn.onclick = () => {
        if (!diagnostics.enabled) diagnostics.setMode('on');
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'd'}));
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

    // GitHub Link
    const githubLink = document.createElement('a');
    githubLink.className = 'settings-link';
    githubLink.href = 'https://github.com/khawkins98/johnny_web';
    githubLink.target = '_blank';
    githubLink.innerText = 'Message in a Bottle (GitHub)';
    modal.appendChild(githubLink);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Keyboard shortcut 'S'
    window.addEventListener('keydown', (e) => {
        if (e.key === 's' || e.key === 'S') {
            overlay.style.display = overlay.style.display === 'flex' ? 'none' : 'flex';
        }
        if (e.key === 'Escape' && overlay.style.display === 'flex') {
            overlay.style.display = 'none';
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

    Array.from(root.getElementsByTagName('canvas')).forEach(c => {
        c.style.width = '640px';
        c.style.height = '480px';
    });

    if (mode === 'native') {
        // defaults are fine
    } else if (mode === 'integer') {
        const scale = Math.max(1, Math.floor(Math.min(vw / width, vh / height)));
        root.style.transform = `scale(${scale})`;
        root.style.imageRendering = 'pixelated';
        Array.from(root.getElementsByTagName('canvas')).forEach(c => {
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
        Array.from(root.getElementsByTagName('canvas')).forEach(c => {
            c.style.width = '100%';
            c.style.height = '100%';
        });
    }
}

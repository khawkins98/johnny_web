import { __DEBUG__ } from './dgds/scripting/process.mjs';

const PLAYBACK_RATES = [0.5, 1, 2, 4];

const isTyping = target => target?.matches?.('input, select, textarea, button, a, [contenteditable="true"]');

export function setupEnhancedUI() {
    const style = document.createElement('style');
    style.innerHTML = `
        #enhanced-hud {
            position: fixed;
            left: 16px;
            bottom: 16px;
            z-index: 900;
            width: min(330px, calc(100vw - 32px));
            padding: 10px 48px 9px 14px;
            box-sizing: border-box;
            border-radius: 5px;
            background: #d4c4a8;
            background-image: url('data:image/svg+xml;utf8,<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23noise)" opacity="0.08"/></svg>');
            color: #4a3520;
            box-shadow:
                0 0 0 2px rgba(139, 90, 43, 0.72),
                0 7px 18px rgba(0, 0, 0, 0.32),
                inset 0 1px rgba(255, 255, 255, 0.42);
            font-family: 'VT323', monospace;
            line-height: 1.1;
            transform: rotate(-0.25deg);
            transform-origin: left bottom;
            pointer-events: auto;
            transition-property: opacity, transform;
            transition-duration: 160ms;
            transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
        }
        #enhanced-hud.is-hidden {
            opacity: 0;
            transform: translateY(8px) rotate(-0.25deg);
            pointer-events: none;
        }
        #enhanced-hud-status {
            display: flex;
            align-items: baseline;
            gap: 8px;
            overflow: hidden;
            font-variant-numeric: tabular-nums;
        }
        #enhanced-hud-stage {
            flex: 0 0 auto;
            color: #6b4323;
            font-family: 'Caveat', cursive;
            font-size: 21px;
            font-weight: 700;
        }
        #enhanced-hud-name {
            min-width: 0;
            overflow: hidden;
            color: #382719;
            font-size: 17px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        #enhanced-hud-rate {
            flex: 0 0 auto;
            color: #6b4323;
            font-size: 16px;
        }
        #enhanced-hud-help {
            margin-top: 4px;
            color: rgba(74, 53, 32, 0.72);
            font-size: 13px;
            white-space: nowrap;
        }
        #enhanced-hud-dismiss {
            position: absolute;
            top: 50%;
            right: 5px;
            width: 40px;
            height: 40px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: rgba(74, 53, 32, 0.68);
            cursor: pointer;
            font-family: 'VT323', monospace;
            font-size: 22px;
            line-height: 40px;
            transform: translateY(-50%);
            transition-property: color, background-color, scale;
            transition-duration: 140ms;
            transition-timing-function: ease-out;
        }
        #enhanced-hud-dismiss:hover {
            background: rgba(244, 228, 200, 0.62);
            color: #382719;
        }
        #enhanced-hud-dismiss:active {
            scale: 0.96;
        }
        #enhanced-hud-dismiss:focus-visible {
            outline: 3px solid rgba(74, 53, 32, 0.35);
            outline-offset: -3px;
        }
    `;
    document.head.appendChild(style);

    const hud = document.createElement('aside');
    hud.id = 'enhanced-hud';
    hud.setAttribute('aria-label', 'Enhanced playback controls');
    hud.setAttribute('aria-keyshortcuts', 'H');
    const status = document.createElement('div');
    status.id = 'enhanced-hud-status';
    status.setAttribute('aria-live', 'polite');
    const stage = document.createElement('span');
    stage.id = 'enhanced-hud-stage';
    const name = document.createElement('span');
    name.id = 'enhanced-hud-name';
    const rate = document.createElement('span');
    rate.id = 'enhanced-hud-rate';
    status.append(stage, name, rate);
    const help = document.createElement('div');
    help.id = 'enhanced-hud-help';
    help.innerText = '←→ scene · ↑↓ speed · F full · H hide';
    const dismiss = document.createElement('button');
    dismiss.id = 'enhanced-hud-dismiss';
    dismiss.type = 'button';
    dismiss.innerText = '×';
    dismiss.setAttribute('aria-label', 'Hide enhanced playback status; press H to restore');
    hud.appendChild(status);
    hud.appendChild(help);
    hud.appendChild(dismiss);
    document.body.appendChild(hud);

    let hudVisible = true;
    const setHudVisible = visible => {
        hudVisible = visible;
        hud.classList.toggle('is-hidden', !visible);
        hud.setAttribute('aria-hidden', String(!visible));
    };
    dismiss.addEventListener('click', () => setHudVisible(false));

    let lastStatus = '';
    const render = () => {
        const presentation = __DEBUG__.getPresentation();
        const nextStatus = `${presentation.scene}|${presentation.name}|${presentation.playbackRate}`;
        if (nextStatus !== lastStatus) {
            lastStatus = nextStatus;
            stage.innerText = presentation.scene === null ? 'Starting' : `Stage ${presentation.scene}`;
            name.innerText = presentation.name || '';
            rate.innerText = `${presentation.playbackRate}×`;
        }
        requestAnimationFrame(render);
    };
    requestAnimationFrame(render);

    window.addEventListener('keydown', async event => {
        if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
        if (document.getElementById('settings-overlay')?.getAttribute('aria-hidden') === 'false') return;

        const presentation = __DEBUG__.getPresentation();
        const rateIndex = Math.max(0, PLAYBACK_RATES.indexOf(presentation.playbackRate));
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            __DEBUG__.stepScene(event.key === 'ArrowRight' ? 1 : -1);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const delta = event.key === 'ArrowUp' ? 1 : -1;
            const next = Math.max(0, Math.min(PLAYBACK_RATES.length - 1, rateIndex + delta));
            __DEBUG__.setPlaybackRate(PLAYBACK_RATES[next]);
        } else if (event.key === 'f' || event.key === 'F') {
            event.preventDefault();
            if (document.fullscreenElement) await document.exitFullscreen?.();
            else await document.documentElement.requestFullscreen?.();
        } else if (event.key === 'h' || event.key === 'H') {
            event.preventDefault();
            setHudVisible(!hudVisible);
        }
    });

    return { hud, setHudVisible };
}

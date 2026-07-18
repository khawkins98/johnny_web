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
            max-width: min(430px, calc(100vw - 32px));
            padding: 8px 12px;
            box-sizing: border-box;
            border-radius: 6px;
            background: rgba(43, 33, 24, 0.88);
            color: #f4e4c8;
            box-shadow: 0 7px 18px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(255,255,255,0.1);
            font-family: 'VT323', monospace;
            font-size: 17px;
            line-height: 1.15;
            pointer-events: none;
        }
        #enhanced-hud-status {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        #enhanced-hud-help {
            margin-top: 2px;
            color: rgba(244, 228, 200, 0.68);
            font-size: 14px;
        }
    `;
    document.head.appendChild(style);

    const hud = document.createElement('aside');
    hud.id = 'enhanced-hud';
    hud.setAttribute('aria-label', 'Enhanced playback controls');
    const status = document.createElement('div');
    status.id = 'enhanced-hud-status';
    status.setAttribute('aria-live', 'polite');
    const help = document.createElement('div');
    help.id = 'enhanced-hud-help';
    help.innerText = '←/→ scene · ↑/↓ speed · F full screen';
    hud.appendChild(status);
    hud.appendChild(help);
    document.body.appendChild(hud);

    const render = () => {
        const presentation = __DEBUG__.getPresentation();
        const scene = presentation.scene === null ? 'Starting' : `Stage ${presentation.scene}`;
        const name = presentation.name ? ` · ${presentation.name}` : '';
        status.innerText = `${scene}${name}  |  ${presentation.playbackRate}×`;
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
        }
    });
}

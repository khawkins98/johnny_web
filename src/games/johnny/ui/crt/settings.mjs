import { setupCrtControls } from './controls.mjs';
import { createCrtPresentation } from './presentation.mjs';
import { presets, sanitizeSettings, readStored, writeStored } from './presets.mjs';

export function setupCrtSettings(container) {
    let storage;
    try { storage = window.localStorage; } catch { /* Controls remain usable without persistence. */ }
    const key = 'jc-crt-v1';
    const saved = readStored(storage, key, {});
    const details = document.createElement('details'); details.className = 'johnny-crt';
    const summary = document.createElement('summary'); summary.textContent = 'CRT picture · optional';
    const label = document.createElement('label');
    const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.id = 'jc-crt-enabled';
    enabled.checked = saved?.enabled === true; label.append(enabled, ' Enable CRT picture');
    const help = document.createElement('p'); help.textContent = 'Tune the picture below, then save a name to keep your own preset in this browser. Saving the same name updates it.';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    details.append(summary, label, help); container.append(details);
    let lastStatus = '';
    const presentation = createCrtPresentation({ root: document.getElementById('root'), onStatus: text => {
        if (text !== lastStatus) { status.textContent = text; lastStatus = text; }
    } });
    const update = () => {
        const settings = controls.getSettings();
        presentation.update(enabled.checked, settings);
        if (!writeStored(storage, key, { enabled: enabled.checked, settings })) {
            status.textContent += ' Changes could not be saved in this browser.';
        }
    };
    const controls = setupCrtControls(details, update, { storage, initial: sanitizeSettings(saved?.settings ?? presets.balanced) });
    details.append(status);
    enabled.addEventListener('change', update);
    presentation.update(enabled.checked, controls.getSettings());
    return presentation;
}

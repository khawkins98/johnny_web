import { afterEach, expect, it, vi } from 'vitest';
import { setupCrtSettings } from './settings.mjs';

const renderer = vi.hoisted(() => ({ notify: null }));
vi.mock('./presentation.mjs', () => ({
    createCrtPresentation: ({ onStatus }) => {
        renderer.notify = onStatus;
        return { update: vi.fn(), dispose: vi.fn() };
    },
}));
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); document.body.replaceChildren(); });

it('keeps a failed-save warning through asynchronous renderer status, then clears it after a successful save', () => {
    document.body.innerHTML = '<div id="root"></div><section id="settings"></section>';
    localStorage.clear();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
    setupCrtSettings(document.getElementById('settings'));
    renderer.notify('CRT off.');
    const enabled = document.getElementById('jc-crt-enabled');
    enabled.checked = true; enabled.dispatchEvent(new Event('change'));
    renderer.notify('CRT enabled.');
    const warning = document.querySelector('[data-crt-save-status]');
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain('could not be saved');
    expect(document.querySelector('.johnny-crt').textContent).toContain('CRT enabled.');
    write.mockRestore();
    enabled.checked = false; enabled.dispatchEvent(new Event('change'));
    expect(warning.hidden).toBe(true);
    expect(warning.textContent).toBe('');
    expect(JSON.parse(localStorage.getItem('jc-crt-v1')).enabled).toBe(false);
});

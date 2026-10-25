import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupCrtControls } from './controls.mjs';
import { presets, PRESET_KEY } from './presets.mjs';

describe('named CRT presets', () => {
    beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
    it('saves, updates, reloads and deletes a named preset without inserting name markup', () => {
        let controls = setupCrtControls(document.body, vi.fn(), { initial: presets.balanced });
        const name = document.querySelector('input[type=text]');
        name.value = '<b>My CRT</b>'; button('Save preset').click();
        expect(document.querySelector('select').selectedOptions[0].textContent).toBe(name.value);
        expect(document.querySelector('b')).toBeNull();
        document.querySelector('#crt-preset-soft').click(); button('Save preset').click();
        expect(JSON.parse(localStorage.getItem(PRESET_KEY))).toHaveLength(1);
        document.body.replaceChildren();
        controls = setupCrtControls(document.body, vi.fn());
        const select = document.querySelector('select'); select.value = '0'; select.dispatchEvent(new Event('change'));
        expect(controls.getSettings()).toEqual({ ...presets.soft, bypass: false });
        button('Delete preset').click();
        expect(JSON.parse(localStorage.getItem(PRESET_KEY))).toEqual([]);
        expect(button('Delete preset').disabled).toBe(true);
    });
    it('keeps current edits usable when saving fails', () => {
        const controls = setupCrtControls(document.body, vi.fn(), { initial: presets.balanced, storage: {
            getItem: () => null, setItem: () => { throw Error('quota'); },
        } });
        document.querySelector('input[type=text]').value = 'Mine'; button('Save preset').click();
        expect(document.querySelector('[role=status]').textContent).toMatch(/not saved/);
        expect(controls.getSettings()).toEqual({ ...presets.balanced, bypass: false });
    });
});

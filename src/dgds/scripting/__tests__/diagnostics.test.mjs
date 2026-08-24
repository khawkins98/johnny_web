import { describe, expect, it } from 'vitest';
import { createDiagnosticsController, parseDiagnostics } from '../diagnostics.mjs';

describe('diagnostics modes', () => {
    it.each([
        ['', { mode: 'off', enabled: false, console: false, verbose: false, trace: false }],
        ['?debug', { mode: 'on', enabled: true, console: true, verbose: false, trace: true }],
        ['?debug=trace', { mode: 'on', enabled: true, console: true, verbose: false, trace: true }],
        ['?debug=verbose', { mode: 'verbose', enabled: true, console: true, verbose: true, trace: true }],
        ['?debug=all', { mode: 'verbose', enabled: true, console: true, verbose: true, trace: true }],
        ['?trace=1', { mode: 'on', enabled: true, console: true, verbose: false, trace: true }],
    ])('parses %s', (search, expected) => {
        expect(parseDiagnostics(search)).toMatchObject(expected);
    });

    it('can change mode at runtime and notify subscribers', () => {
        const controller = createDiagnosticsController(parseDiagnostics(''));
        const changes = [];
        controller.subscribe((current, previous) => changes.push([previous.mode, current.mode]));

        controller.setMode('on');
        controller.setMode('off');

        expect(changes).toEqual([
            ['off', 'on'],
            ['on', 'off'],
        ]);
    });

    it('publishes diagnostic events only while tracing is enabled', () => {
        const controller = createDiagnosticsController(parseDiagnostics(''));
        const events = [];
        controller.subscribeEvents((type, data) => events.push({ type, data }));

        controller.record('user-control', { setting: 'clouds', value: 'off' });
        controller.setMode('on');
        controller.record('user-control', { setting: 'clouds', value: 'on' });

        expect(events).toEqual([{ type: 'user-control', data: { setting: 'clouds', value: 'on' } }]);
    });
});

import { describe, expect, it } from 'vitest';
import { parseDiagnostics } from '../diagnostics.mjs';

describe('diagnostics modes', () => {
    it.each([
        ['', { mode: 'off', enabled: false, console: false, verbose: false, trace: false }],
        ['?debug', { mode: 'basic', enabled: true, console: true, verbose: false, trace: false }],
        ['?debug=verbose', { mode: 'verbose', enabled: true, console: true, verbose: true, trace: false }],
        ['?debug=trace', { mode: 'trace', enabled: true, console: true, verbose: false, trace: true }],
        ['?debug=all', { mode: 'all', enabled: true, console: true, verbose: true, trace: true }],
        ['?trace=1', { mode: 'off', enabled: true, console: false, verbose: false, trace: true }],
    ])('parses %s', (search, expected) => {
        expect(parseDiagnostics(search)).toMatchObject(expected);
    });
});

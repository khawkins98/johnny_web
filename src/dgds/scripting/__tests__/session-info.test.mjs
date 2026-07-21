import { describe, expect, it } from 'vitest';
import { applicationInfo, createSessionInfo } from '../session-info.mjs';

describe('diagnostic session information', () => {
    it('describes the application, activation, browser, and display', () => {
        const info = createSessionInfo({ mode: 'trace', tick: 42 });

        expect(info).toMatchObject({
            mode: 'trace',
            tick: 42,
            application: {
                name: 'Bottle DGDS',
                version: expect.any(String),
            },
            browser: { userAgent: expect.any(String) },
            display: {
                viewport: {
                    width: expect.any(Number),
                    height: expect.any(Number),
                },
            },
        });
        expect(Number.isNaN(Date.parse(info.enabledAt))).toBe(false);
        expect(typeof info.timezone).toBe('string');
        expect(info.application).toBe(applicationInfo);
        expect(applicationInfo.build).toEqual(expect.any(String));
    });
});

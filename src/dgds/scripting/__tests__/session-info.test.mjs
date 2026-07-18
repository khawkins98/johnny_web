import { describe, expect, it } from 'vitest';
import { createSessionInfo } from '../session-info.mjs';

describe('diagnostic session information', () => {
    it('describes the application, activation, browser, and display', () => {
        const info = createSessionInfo({ mode: 'trace', tick: 42 });

        expect(info).toMatchObject({
            mode: 'trace',
            tick: 42,
            application: { name: 'johnny_web' },
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
    });
});

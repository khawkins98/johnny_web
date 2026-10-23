// Shared Playwright loader for the scripts in this folder. Playwright is not a repo
// dependency; install it anywhere (e.g. `npm i playwright` in a scratch dir) and point
// PLAYWRIGHT_FROM at that dir, or install it so Node can resolve it from here.
// CHROME optionally sets the browser executable (default: Playwright's own Chromium).
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(
    process.env.PLAYWRIGHT_FROM ? path.join(path.resolve(process.env.PLAYWRIGHT_FROM), 'node_modules', 'x.js') : import.meta.url,
);
let pw = null;
for (const name of ['playwright', 'playwright-core']) {
    try {
        pw = require(name);
        break;
    } catch {}
}
if (!pw) {
    console.error('playwright not found: npm i playwright in some dir and set PLAYWRIGHT_FROM=<that dir>');
    process.exit(2);
}

export const launch = (options = {}) =>
    pw.chromium.launch({
        ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        ...options,
    });

export const appUrl = (arg) => arg || process.env.JC_URL || 'http://localhost:5173/';

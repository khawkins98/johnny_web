// Play our build in a browser and save, every few seconds, a page screenshot plus each
// 640x480 canvas as its own PNG (<prefix>_<i>.png, <prefix>_<i>_c<k>.png), and log
// the host's title state (night, tide, island position, waves). The canvas PNGs are
// what ../measure/match.py, trunkcheck.py and composite-canvases.py read (#53).
//
// usage: node browse-canvases.mjs <outPrefix> [classic|enhanced] [shots=3] [everyMs=4000] [startTime]
//   startTime is stored as the jc-start-time setting before playback (e.g. 21:30).
//   JC_URL sets the app URL (default http://localhost:5173/, i.e. `pnpm dev`).
import { writeFileSync } from 'node:fs';
import { appUrl, launch } from './playwright.mjs';

const [prefix, mode = 'classic', shots = '3', every = '4000', startTime = ''] = process.argv.slice(2);
if (!prefix) {
    console.error('usage: node browse-canvases.mjs <outPrefix> [classic|enhanced] [shots] [everyMs] [startTime]');
    process.exit(2);
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(appUrl());
if (startTime) await page.evaluate((v) => localStorage.setItem('jc-start-time', v), startTime);
await page.click(mode === 'enhanced' ? '#start-enhanced-btn' : '#start-classic-btn');
for (let i = 0; i < Number(shots); i++) {
    await page.waitForTimeout(Number(every));
    await page.screenshot({ path: `${prefix}_${i}.png` });
    const canvases = await page.evaluate(() =>
        [...document.querySelectorAll('canvas')].map((c) => (c.width === 640 ? c.toDataURL() : null)),
    );
    canvases.forEach((url, k) => {
        if (url) writeFileSync(`${prefix}_${i}_c${k}.png`, Buffer.from(url.split(',')[1], 'base64'));
    });
    const ts = await page.evaluate(() => {
        const t = window.__DGDS__?.getState?.()?.titleState;
        if (!t) return 'no titleState';
        const { night, lowTide, tidePhase, waves, oceanIndex, island, x, y, raft } = t;
        return JSON.stringify({ night, lowTide, tidePhase, waves, oceanIndex, island, x, y, raft });
    });
    console.log(mode, i, ts);
}
await browser.close();

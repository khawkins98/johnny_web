// Start one gag through the story timeline (day -> time of day -> gag card -> Play this
// gag) and take screenshots 2, 6 and 12 s in, as <outDir>/<tag>-<s>s.png. Handy for
// eyeballing a fix against a capture of the original.
//
// usage: node play-gag.mjs <outDir> <day 1-11> <band 0-2> <cardLabelRegex> [tag=gag]
//   e.g. node play-gag.mjs scratchpad/shots 3 0 'suzy' suzy
//   JC_URL sets the app URL (default http://localhost:5173/).
import { appUrl, launch } from './playwright.mjs';

const [out, day, band, pattern, tag = 'gag'] = process.argv.slice(2);
if (!out || !day || band === undefined || !pattern) {
    console.error('usage: node play-gag.mjs <outDir> <day> <band> <cardLabelRegex> [tag]');
    process.exit(2);
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror: ' + e.message));
page.on('console', (m) => {
    if (m.type() === 'error') console.log('error: ' + m.text());
});
await page.goto(appUrl(), { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByText('Play Classic').click();
await page.waitForTimeout(6000);
await page.keyboard.press('t');
await page.waitForSelector('.story-steps', { timeout: 15000 });
await page.locator('.story-steps-crumbs button').first().click();
await page.waitForTimeout(300);
await page.locator('.story-steps-grid .story-steps-card').nth(Number(day) - 1).click();
await page.locator('.story-steps-tide').nth(Number(band)).click();
await page.waitForTimeout(300);
const cards = page.locator('.story-steps-grid .story-steps-card');
const labels = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
console.log(labels.join(' | '));
const idx = labels.findIndex((l) => new RegExp(pattern, 'i').test(l));
if (idx < 0) {
    console.log('no card matches', pattern);
    await browser.close();
    process.exit(1);
}
await cards.nth(idx).click();
await page.waitForTimeout(500);
await page.locator('.story-steps-play', { hasText: /Play this gag/ }).click();
await page.keyboard.press('Escape');
let elapsed = 0;
for (const s of [2, 6, 12]) {
    await page.waitForTimeout((s - elapsed) * 1000);
    elapsed = s;
    await page.screenshot({ path: `${out}/${tag}-${s}s.png` });
}
await browser.close();

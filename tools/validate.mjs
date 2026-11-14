import { chromium } from 'playwright-core';
import path from 'node:path';

const exe = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe');
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.waitForTimeout(3000);

// exercise every camera mode and the quality switch
for (const mode of ['dock', 'free', 'cinematic']) {
  await page.evaluate((m) => window.__camera.setMode(m), mode);
  await page.waitForTimeout(700);
}
for (const q of ['low', 'medium', 'high']) {
  await page.evaluate((n) => window.__renderer.setQuality(n), q);
  await page.waitForTimeout(700);
}
// move the free camera around
await page.evaluate(() => {
  window.__camera.setMode('free');
  window.__camera.keys.add('KeyW');
});
await page.waitForTimeout(1200);
await page.evaluate(() => {
  window.__camera.keys.clear();
  window.__camera.setMode('cinematic');
});
await page.waitForTimeout(1200);

const stats = await page.evaluate(() => ({ ...window.__stats, drops: window.__renderer.adaptive }));
console.log(JSON.stringify(stats));
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'no errors');
await page.screenshot({ path: 'shots/validate.png' });
await browser.close();
process.exit(errors.length ? 1 : 0);

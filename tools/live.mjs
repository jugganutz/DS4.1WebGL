// Verify the live GitHub Pages deployment end to end.
import { chromium } from 'playwright-core';
import path from 'node:path';

const exe = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe');
const url = process.argv[2] || 'https://jugganutz.github.io/DS4.1WebGL/';
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const loadMs = Date.now() - t0;
await page.waitForTimeout(3500);
await page.addStyleTag({ content: '.loader{display:none!important}' });
const info = await page.evaluate(() => ({
  stats: window.__stats,
  moduleCount: performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).length,
  fatal: document.getElementById('fatal').hidden ? null : document.getElementById('fatalMsg').textContent,
}));
await page.screenshot({ path: 'shots/live.png' });
console.log(JSON.stringify({ url, loadMs, ...info }, null, 1));
const bad = logs.filter((l) => /error|404|Failed/i.test(l));
console.log(bad.length ? bad.slice(0, 8).join('\n') : 'no errors');
await browser.close();

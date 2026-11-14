import { chromium } from 'playwright-core';
import path from 'node:path';

const exe = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe');
const base = process.env.BASE || 'https://jugganutz.github.io/DS4.1WebGL/';
const queries = process.argv.slice(2);

const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });

for (const q of queries) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
  await page.goto(base + (q ? '?' + q : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.waitForTimeout(4500);
  const r = await page.evaluate(async () => {
    let frames = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
    const dt = (performance.now() - t0) / 1000;
    return {
      fps: +(frames / dt).toFixed(1),
      scale: +(window.__renderer.q.scale * window.__renderer.adaptive).toFixed(2),
      px: window.__renderer.width * window.__renderer.height,
    };
  });
  console.log((q || 'baseline').padEnd(22), JSON.stringify(r));
  await page.close();
}
await browser.close();

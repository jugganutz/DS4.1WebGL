// Headless screenshot harness. Expects `npm run serve` on :8080.
// usage: node tools/shot.mjs <namePrefix> [query] [shotIndexes e.g. 0,2,3]

import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1248', 'chrome-win64', 'chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!exe) {
  console.error('No chromium binary found');
  process.exit(1);
}

const prefix = process.argv[2] || 'frame';
const query = process.argv[3] || 'paused=1&t=6';
const shotList = (process.argv[4] || '0').split(',').map((s) => parseInt(s, 10));
const url = `http://localhost:8080/?${query}`;

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: [
    
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--force-device-scale-factor=1',
  ],
});

const W = parseInt(process.env.SHOT_W || '1440', 10);
const H = parseInt(process.env.SHOT_H || '810', 10);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.stack || err.message}`));

let ok = true;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.addStyleTag({ content: process.env.SHOW_UI ? '.loader{display:none!important}' : '.loader{display:none!important} .hud{opacity:0!important}' });
  await page.evaluate(() => {
    const l = document.getElementById('loader');
    if (l) l.classList.add('is-done');
  });
  await page.waitForTimeout(1400);

  mkdirSync('shots', { recursive: true });
  for (const idx of shotList) {
    if (shotList.length > 1 || idx !== 0) {
      await page.evaluate((i) => {
        const c = window.__camera;
        c.setMode('cinematic');
        c.shot = i;
        c.shotT = 4;
        c.update(0);
      }, idx);
      await page.waitForTimeout(1200);
    }
    const name = shotList.length > 1 ? `${prefix}-${idx}` : prefix;
    await page.screenshot({ path: `shots/${name}.png` });
    console.log(`saved shots/${name}.png`);
  }

  const info = await page.evaluate(() => ({
    renderer: (() => {
      const gl = document.getElementById('scene').getContext('webgl2');
      if (!gl) return 'no-gl';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    })(),
    stats: window.__stats,
  }));
  console.log(JSON.stringify(info));
} catch (err) {
  ok = false;
  console.error('FAILED:', err.message);
}

const interesting = logs.filter((l) => !/404|Download the React|DevTools/i.test(l));
if (interesting.length) console.log('--- console ---\n' + interesting.slice(0, 40).join('\n'));
await browser.close();
process.exit(ok ? 0 : 1);

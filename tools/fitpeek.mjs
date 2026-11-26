// Visual check: how the game and the rules page fit on the devices they
// have to run on.
//
//   node tools/fitpeek.mjs [baseUrl]
//
// It opens the game on a desktop, a tablet and a phone, in both orientations,
// and writes a screenshot of each to shots/fit/. The numbers it prints say
// how big the game ended up and whether anything overflows.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8770';
const OUT = new URL('../shots/fit/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

const browser = await launch();

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 2, touch: false },
  { name: 'ipad-portrait', width: 768, height: 1024, dpr: 2, touch: true },
  { name: 'ipad-landscape', width: 1024, height: 768, dpr: 2, touch: true },
  { name: 'phone-portrait', width: 390, height: 844, dpr: 3, touch: true },
  { name: 'phone-landscape', width: 844, height: 390, dpr: 3, touch: true },
];

/** The measurements that say whether the layout fits. */
const MEASURE = () => {
  const c = document.getElementById('game');
  const r = c.getBoundingClientRect();
  return {
    scale: Math.round(window.game.scale * 1000) / 1000,
    css: `${Math.round(r.width)}x${Math.round(r.height)}`,
    backing: `${c.width}x${c.height}`,
    dpr: window.devicePixelRatio,
    hint: document.getElementById('hint').textContent.slice(0, 44),
    rotate: getComputedStyle(document.getElementById('rotate')).display,
    overflow: document.documentElement.scrollWidth > window.innerWidth
      || document.documentElement.scrollHeight > window.innerHeight,
  };
};

// --- the game ---------------------------------------------------------------

for (const v of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.dpr,
    hasTouch: v.touch,
    isMobile: v.touch,
  });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('balatro-pixel-lang', 'zh'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}${v.name}.png` });
  console.log(v.name.padEnd(17), JSON.stringify(await page.evaluate(MEASURE)));

  // The table is the busiest screen, so it is worth a look too.
  await page.evaluate(() => {
    window.game.startRun();
  });
  await page.waitForTimeout(400);
  // Pick the small blind, so the hand itself is on screen.
  await page.evaluate(() => {
    const b = window.game.buttons.find((x) => x.label === '选择');
    if (b) window.game.onClick(b.x + b.w / 2, b.y + b.h / 2);
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}${v.name}-play.png` });
  await page.close();
}

// --- the rules page ---------------------------------------------------------

for (const v of [
  { name: 'rules-desktop', width: 1440, height: 900, dpr: 2 },
  { name: 'rules-ipad', width: 768, height: 1024, dpr: 2 },
  { name: 'rules-phone', width: 390, height: 844, dpr: 3 },
]) {
  const page = await browser.newPage({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.dpr,
    hasTouch: true,
    isMobile: true,
  });
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(`${BASE}/rules.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('balatro-pixel-lang', 'zh'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}${v.name}.png` });
  const info = await page.evaluate(() => ({
    sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    columns: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length,
    search: Math.round(document.getElementById('search').getBoundingClientRect().height),
  }));
  console.log(v.name.padEnd(17), JSON.stringify(info));
  await page.close();
}

await browser.close();

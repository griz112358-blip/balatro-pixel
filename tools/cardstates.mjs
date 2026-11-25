// Visual check: one card for every state a playing card can be in, so the
// overlays (stone, seal, edition, enhancement, debuffed, face down) can be
// compared side by side.
//
//   node tools/cardstates.mjs [baseUrl]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8770';
const OUT = new URL('../shots/peek/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

async function launch() {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('balatro-pixel-lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

await page.evaluate(() => {
  const g = window.game;
  g.seed = 4;
  g.startRun();
  g.run.selectBlind('small');
  g.startBlind();
  const run = g.run;
  const hand = run.hand.slice(0, 8);
  // Plain, stone, wild, bonus, glass, seal, edition, debuffed.
  hand[0].enhancement = null;
  hand[1].enhancement = 'stone';
  hand[2].enhancement = 'wild';
  hand[3].enhancement = 'bonus';
  hand[4].enhancement = 'glass';
  hand[5].seal = 'red';
  hand[6].edition = 'foil';
  hand[7].debuffed = true;
  run.hand = hand;
});
await page.waitForTimeout(300);
await page.locator('#game').screenshot({ path: `${OUT}zh-card-states.png` });
console.log('shot: zh-card-states.png');

// The same hand with one card face down.
await page.evaluate(() => {
  const g = window.game;
  g.run.hand[0].faceDown = true;
});
await page.waitForTimeout(250);
await page.locator('#game').screenshot({ path: `${OUT}zh-card-states-back.png` });
console.log('shot: zh-card-states-back.png');

await browser.close();

// Capture the remaining screens (game over, win, pause, pack) as screenshots.
//
//   node tools/screenshots.mjs [baseUrl]

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8770';
const OUT = new URL('../shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' });
  }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const shot = async (name) => {
  await page.locator('#game').screenshot({ path: `${OUT}${name}.png` });
  console.log(`shot: ${name}.png`);
};

// Game over
await page.evaluate(() => {
  const g = window.game;
  g.startRun();
  g.run.selectBlind('small');
  g.startBlind();
  g.run.handsLeft = 0;
  g.run.discardsLeft = 0;
  g.checkEndConditions();
});
await page.waitForTimeout(200);
await shot('10-gameover');

// Win
await page.evaluate(() => {
  const g = window.game;
  g.screen = 'win';
  g.run.won = true;
  g.run.score = 1234567;
  g.run.roundsPlayed = 24;
  g.run.handsPlayed = 63;
});
await page.waitForTimeout(200);
await shot('11-win');

// Pause
await page.evaluate(() => {
  const g = window.game;
  g.screen = 'play';
  g.paused = true;
});
await page.waitForTimeout(200);
await shot('12-pause');

// Booster pack
await page.evaluate(() => {
  const g = window.game;
  g.paused = false;
  const shop = window.__shop.createShop(g.run);
  g.run.shop = shop;
  const res = window.__shop.buyPack(g.run, shop.packs[0]);
  g.pack = { pack: shop.packs[0], options: res.options };
  g.packSelection = [];
  g.screen = 'pack';
});
await page.waitForTimeout(250);
await shot('13-pack');

console.log('\nerrors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
